import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';
import { CompetencyService } from '../staff/competency-service';

export type SurgeryState = 'PLANNED' | 'PREPARED' | 'READY' | 'IN_PROCEDURE' | 'RECOVERY' | 'DISCHARGE_READY' | 'DISCHARGED' | 'CANCELLED';
export type ChecklistItem = { key: string; label: string; required: boolean; completed: boolean; completedBy?: UUID; completedAt?: ISODateTime };
export type SurgicalCase = {
  id: UUID; organizationId: UUID; ownerId: UUID; petId: UUID; procedure: string; indication: string; surgeonId: UUID; teamIds: UUID[]; room: string; scheduledAt: ISODateTime; state: SurgeryState;
  consentRecorded: boolean; fastingConfirmed: boolean; checklist: ChecklistItem[]; operativeNote?: string; complicationNote?: string; recoveryNote?: string; dischargedAt?: ISODateTime; createdAt: ISODateTime;
};

/** Surgical workflow is intentionally explicit: high-risk state changes leave an audit trail. */
export class SurgeryService {
  readonly cases = new Map<UUID, SurgicalCase>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService, private readonly competencies: CompetencyService) {}

  schedule(input: { ownerId: UUID; petId: UUID; procedure: string; indication: string; surgeonId: UUID; teamIds?: UUID[]; room: string; scheduledAt: ISODateTime; requiredCompetency?: string; procedureCode?: string; locationId?: UUID }, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write');
    this.assertPatient(input.ownerId, input.petId, meta.actor.organizationId);
    if (input.requiredCompetency) this.competencies.assertEligible({ userId: input.surgeonId, competency: input.requiredCompetency, procedureCode: input.procedureCode, locationId: input.locationId, at: meta.now }, meta.actor.organizationId);
    if (!input.procedure.trim() || !input.indication.trim() || !input.room.trim() || Number.isNaN(new Date(input.scheduledAt).valueOf())) throw new DomainError('VALIDATION', 'Procedure, indication, room and a valid scheduled time are required.');
    const now = meta.now ?? new Date();
    const surgicalCase: SurgicalCase = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, procedure: input.procedure.trim(), indication: input.indication.trim(), surgeonId: input.surgeonId, teamIds: [...new Set(input.teamIds ?? [])], room: input.room.trim(), scheduledAt: input.scheduledAt, state: 'PLANNED', consentRecorded: false, fastingConfirmed: false, checklist: [], createdAt: iso(now) };
    this.cases.set(surgicalCase.id, surgicalCase);
    this.record(meta, surgicalCase, 'surgery.scheduled', { room: surgicalCase.room, scheduledAt: surgicalCase.scheduledAt }, now);
    return surgicalCase;
  }

  recordPreparation(caseId: UUID, input: { consentRecorded: boolean; fastingConfirmed: boolean; checklist: Array<Pick<ChecklistItem, 'key' | 'label' | 'required' | 'completed'>> }, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (!['PLANNED', 'PREPARED'].includes(surgicalCase.state)) throw new DomainError('CONFLICT', 'Preparation can only be recorded before the case is ready.');
    if (!input.checklist.length || input.checklist.some((item) => !item.key.trim() || !item.label.trim())) throw new DomainError('VALIDATION', 'A named pre-operative checklist is required.');
    const now = meta.now ?? new Date();
    surgicalCase.consentRecorded = input.consentRecorded; surgicalCase.fastingConfirmed = input.fastingConfirmed;
    surgicalCase.checklist = input.checklist.map((item) => ({ ...item, key: item.key.trim(), label: item.label.trim(), completedBy: item.completed ? meta.actor.userId : undefined, completedAt: item.completed ? iso(now) : undefined }));
    surgicalCase.state = 'PREPARED'; this.record(meta, surgicalCase, 'surgery.preparation_recorded', { checklistItems: surgicalCase.checklist.length }, now); return surgicalCase;
  }

  markReady(caseId: UUID, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'PREPARED') throw new DomainError('CONFLICT', 'Only a prepared case can be marked ready.');
    if (!surgicalCase.consentRecorded || !surgicalCase.fastingConfirmed || surgicalCase.checklist.some((item) => item.required && !item.completed)) throw new DomainError('CONFLICT', 'Consent, fasting confirmation and all required checklist steps are required before surgery.');
    surgicalCase.state = 'READY'; this.record(meta, surgicalCase, 'surgery.ready', {}); return surgicalCase;
  }

  beginProcedure(caseId: UUID, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'READY') throw new DomainError('CONFLICT', 'Only a ready surgical case can enter the procedure room.');
    surgicalCase.state = 'IN_PROCEDURE'; this.record(meta, surgicalCase, 'surgery.procedure_started', {}); return surgicalCase;
  }

  recordOperativeNote(caseId: UUID, input: { note: string; complicationNote?: string }, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'IN_PROCEDURE' || !input.note.trim()) throw new DomainError('CONFLICT', 'A complete operative note can only be recorded during the procedure.');
    surgicalCase.operativeNote = input.note.trim(); surgicalCase.complicationNote = input.complicationNote?.trim() || undefined;
    this.record(meta, surgicalCase, 'surgery.operative_note_recorded', { complicationRecorded: Boolean(surgicalCase.complicationNote) }); return surgicalCase;
  }

  enterRecovery(caseId: UUID, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'IN_PROCEDURE' || !surgicalCase.operativeNote) throw new DomainError('CONFLICT', 'An operative note is required before the patient enters recovery.');
    surgicalCase.state = 'RECOVERY'; this.record(meta, surgicalCase, 'surgery.recovery_started', {}); return surgicalCase;
  }

  recordRecovery(caseId: UUID, note: string, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'RECOVERY' || !note.trim()) throw new DomainError('CONFLICT', 'A recovery note is required while the case is in recovery.');
    surgicalCase.recoveryNote = note.trim(); this.record(meta, surgicalCase, 'surgery.recovery_note_recorded', {}); return surgicalCase;
  }

  markDischargeReady(caseId: UUID, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'RECOVERY' || !surgicalCase.recoveryNote) throw new DomainError('CONFLICT', 'A documented recovery is required before discharge readiness.');
    surgicalCase.state = 'DISCHARGE_READY'; this.record(meta, surgicalCase, 'surgery.discharge_ready', {}); return surgicalCase;
  }

  discharge(caseId: UUID, meta: CommandMeta): SurgicalCase {
    this.access.require(meta.actor, 'clinical:write'); const surgicalCase = this.get(caseId, meta.actor.organizationId);
    if (surgicalCase.state !== 'DISCHARGE_READY') throw new DomainError('CONFLICT', 'Only a discharge-ready surgical case may be discharged.');
    const now = meta.now ?? new Date(); surgicalCase.state = 'DISCHARGED'; surgicalCase.dischargedAt = iso(now); this.record(meta, surgicalCase, 'surgery.discharged', {}, now); return surgicalCase;
  }

  get(caseId: UUID, organizationId: UUID): SurgicalCase { const value = this.cases.get(caseId); if (!value || value.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Surgical case is not available in this organization.'); return value; }
  private assertPatient(ownerId: UUID, petId: UUID, organizationId: UUID): void { const owner = this.booking.ownerPets.owners.get(ownerId); const pet = this.booking.ownerPets.pets.get(petId); const relation = this.booking.ownerPets.relations.some((item) => item.organizationId === organizationId && item.ownerId === ownerId && item.petId === petId); if (!owner || !pet || !relation || owner.organizationId !== organizationId || pet.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Owner and patient are not available in this organization.'); }
  private record(meta: CommandMeta, surgicalCase: SurgicalCase, action: string, metadata: Record<string, unknown>, now = meta.now ?? new Date()): void { this.journal.record(meta, { action, aggregateType: 'SurgicalCase', aggregateId: surgicalCase.id, metadata }, { eventName: action, aggregateType: 'SurgicalCase', aggregateId: surgicalCase.id, payload: { petId: surgicalCase.petId } }, now); }
}
