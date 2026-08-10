import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type ClinicalCase = { id: UUID; organizationId: UUID; petId: UUID; ownerId: UUID; openedAt: ISODateTime; status: 'OPEN' | 'CLOSED'; reason: string };
export type Encounter = { id: UUID; organizationId: UUID; caseId: UUID; petId: UUID; appointmentId?: UUID; version: number; state: 'DRAFT' | 'FINALIZED' | 'AMENDED'; subjective?: string; objective?: string; assessment?: string; plan?: string; clinicianId: UUID; createdAt: ISODateTime; finalizedAt?: ISODateTime; amendmentOfId?: UUID };
export type Prescription = { id: UUID; organizationId: UUID; encounterId: UUID; medicationName: string; instructions: string; state: 'DRAFT' | 'ISSUED' | 'DISCONTINUED'; prescriberId: UUID; createdAt: ISODateTime };

/** Clinical data must be traceable. Final records are never silently overwritten. */
export class ClinicalService {
  readonly cases = new Map<UUID, ClinicalCase>();
  readonly encounters = new Map<UUID, Encounter>();
  readonly prescriptions = new Map<UUID, Prescription>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}

  openCase(input: { ownerId: UUID; petId: UUID; reason: string }, meta: CommandMeta): ClinicalCase {
    this.access.require(meta.actor, 'clinical:write');
    const pet = this.booking.ownerPets.pets.get(input.petId); const owner = this.booking.ownerPets.owners.get(input.ownerId);
    const relation = this.booking.ownerPets.relations.some((item) => item.organizationId === meta.actor.organizationId && item.ownerId === input.ownerId && item.petId === input.petId);
    if (!pet || !owner || !relation || pet.organizationId !== meta.actor.organizationId || owner.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Owner and pet relationship is not available in this organization.');
    if (!input.reason.trim()) throw new DomainError('VALIDATION', 'A reason for the clinical case is required.');
    const now = meta.now ?? new Date();
    const clinicalCase: ClinicalCase = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, ownerId: input.ownerId, openedAt: iso(now), status: 'OPEN', reason: input.reason.trim() };
    this.cases.set(clinicalCase.id, clinicalCase);
    this.journal.record(meta, { action: 'clinical_case.opened', aggregateType: 'ClinicalCase', aggregateId: clinicalCase.id, metadata: { petId: clinicalCase.petId } }, { eventName: 'clinical_case.opened', aggregateType: 'ClinicalCase', aggregateId: clinicalCase.id, payload: { petId: clinicalCase.petId } }, now);
    return clinicalCase;
  }

  startEncounter(input: { caseId: UUID; appointmentId?: UUID }, meta: CommandMeta): Encounter {
    this.access.require(meta.actor, 'clinical:write');
    const clinicalCase = this.getCase(input.caseId, meta.actor.organizationId);
    if (clinicalCase.status !== 'OPEN') throw new DomainError('CONFLICT', 'A closed clinical case cannot receive a new encounter.');
    if (input.appointmentId) { const appointment = this.booking.appointments.get(input.appointmentId); if (!appointment || appointment.organizationId !== meta.actor.organizationId || appointment.petId !== clinicalCase.petId) throw new DomainError('NOT_FOUND', 'Appointment is not available for this clinical case.'); }
    const now = meta.now ?? new Date();
    const encounter: Encounter = { id: randomUUID(), organizationId: meta.actor.organizationId, caseId: clinicalCase.id, petId: clinicalCase.petId, appointmentId: input.appointmentId, version: 1, state: 'DRAFT', clinicianId: meta.actor.userId, createdAt: iso(now) };
    this.encounters.set(encounter.id, encounter);
    this.journal.record(meta, { action: 'encounter.started', aggregateType: 'Encounter', aggregateId: encounter.id, metadata: { caseId: clinicalCase.id } }, { eventName: 'encounter.started', aggregateType: 'Encounter', aggregateId: encounter.id, payload: { petId: encounter.petId } }, now);
    return encounter;
  }

  updateDraft(encounterId: UUID, input: Pick<Encounter, 'subjective' | 'objective' | 'assessment' | 'plan'>, meta: CommandMeta): Encounter {
    this.access.require(meta.actor, 'clinical:write');
    const encounter = this.getEncounter(encounterId, meta.actor.organizationId);
    if (encounter.state !== 'DRAFT' || encounter.clinicianId !== meta.actor.userId) throw new DomainError('CONFLICT', 'Only the responsible clinician can edit an open draft.');
    Object.assign(encounter, input);
    this.journal.record(meta, { action: 'encounter.draft_saved', aggregateType: 'Encounter', aggregateId: encounter.id, metadata: {} }, { eventName: 'encounter.draft_saved', aggregateType: 'Encounter', aggregateId: encounter.id, payload: { petId: encounter.petId } });
    return encounter;
  }

  finalizeEncounter(encounterId: UUID, meta: CommandMeta): Encounter {
    this.access.require(meta.actor, 'clinical:write');
    const encounter = this.getEncounter(encounterId, meta.actor.organizationId);
    if (encounter.state !== 'DRAFT' || encounter.clinicianId !== meta.actor.userId) throw new DomainError('CONFLICT', 'Only the responsible clinician can finalize an open draft.');
    if (!encounter.assessment?.trim() || !encounter.plan?.trim()) throw new DomainError('VALIDATION', 'Assessment and plan are required before finalizing a clinical encounter.');
    const now = meta.now ?? new Date(); encounter.state = 'FINALIZED'; encounter.finalizedAt = iso(now);
    this.journal.record(meta, { action: 'encounter.finalized', aggregateType: 'Encounter', aggregateId: encounter.id, metadata: { version: encounter.version } }, { eventName: 'encounter.finalized', aggregateType: 'Encounter', aggregateId: encounter.id, payload: { petId: encounter.petId } }, now);
    return encounter;
  }

  amendEncounter(encounterId: UUID, meta: CommandMeta): Encounter {
    this.access.require(meta.actor, 'clinical:write');
    const original = this.getEncounter(encounterId, meta.actor.organizationId);
    if (original.state !== 'FINALIZED') throw new DomainError('CONFLICT', 'Only a finalized encounter can be amended.');
    const now = meta.now ?? new Date(); original.state = 'AMENDED';
    const amendment: Encounter = { ...original, id: randomUUID(), state: 'DRAFT', version: original.version + 1, clinicianId: meta.actor.userId, createdAt: iso(now), finalizedAt: undefined, amendmentOfId: original.id };
    this.encounters.set(amendment.id, amendment);
    this.journal.record(meta, { action: 'encounter.amendment_started', aggregateType: 'Encounter', aggregateId: amendment.id, metadata: { amendmentOfId: original.id, version: amendment.version } }, { eventName: 'encounter.amendment_started', aggregateType: 'Encounter', aggregateId: amendment.id, payload: { petId: amendment.petId } }, now);
    return amendment;
  }

  issuePrescription(input: { encounterId: UUID; medicationName: string; instructions: string }, meta: CommandMeta): Prescription {
    this.access.require(meta.actor, 'clinical:write');
    const encounter = this.getEncounter(input.encounterId, meta.actor.organizationId);
    if (encounter.state !== 'FINALIZED' || !input.medicationName.trim() || !input.instructions.trim()) throw new DomainError('CONFLICT', 'A finalized encounter and complete prescription instructions are required.');
    const now = meta.now ?? new Date();
    const prescription: Prescription = { id: randomUUID(), organizationId: meta.actor.organizationId, encounterId: encounter.id, medicationName: input.medicationName.trim(), instructions: input.instructions.trim(), state: 'ISSUED', prescriberId: meta.actor.userId, createdAt: iso(now) };
    this.prescriptions.set(prescription.id, prescription);
    this.journal.record(meta, { action: 'prescription.issued', aggregateType: 'Prescription', aggregateId: prescription.id, metadata: { encounterId: encounter.id } }, { eventName: 'prescription.issued', aggregateType: 'Prescription', aggregateId: prescription.id, payload: { petId: encounter.petId } }, now);
    return prescription;
  }

  private getCase(id: UUID, organizationId: UUID): ClinicalCase { const value = this.cases.get(id); if (!value || value.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Clinical case is not available in this organization.'); return value; }
  private getEncounter(id: UUID, organizationId: UUID): Encounter { const value = this.encounters.get(id); if (!value || value.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Clinical encounter is not available in this organization.'); return value; }
}
