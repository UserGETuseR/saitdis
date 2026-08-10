import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Hospitalization = { id: UUID; organizationId: UUID; petId: UUID; ownerId: UUID; state: 'ADMITTED' | 'IN_TREATMENT' | 'DISCHARGE_READY' | 'DISCHARGED'; admittedAt: ISODateTime; dischargedAt?: ISODateTime };
export type TreatmentTask = { id: UUID; hospitalizationId: UUID; organizationId: UUID; title: string; scheduledAt: ISODateTime; state: 'DUE' | 'ADMINISTERED' | 'SKIPPED'; administeredBy?: UUID; administeredAt?: ISODateTime };

export class HospitalService {
  readonly admissions = new Map<UUID, Hospitalization>(); readonly treatmentTasks = new Map<UUID, TreatmentTask>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  admit(input: { ownerId: UUID; petId: UUID }, meta: CommandMeta): Hospitalization {
    this.access.require(meta.actor, 'clinical:write');
    const pet = this.booking.ownerPets.pets.get(input.petId); const owner = this.booking.ownerPets.owners.get(input.ownerId);
    if (!pet || !owner || pet.organizationId !== meta.actor.organizationId || owner.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Patient is not available in this organization.');
    const now = meta.now ?? new Date(); const admission: Hospitalization = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, ownerId: input.ownerId, state: 'ADMITTED', admittedAt: iso(now) };
    this.admissions.set(admission.id, admission);
    this.journal.record(meta, { action: 'hospitalization.admitted', aggregateType: 'Hospitalization', aggregateId: admission.id, metadata: {} }, { eventName: 'hospitalization.admitted', aggregateType: 'Hospitalization', aggregateId: admission.id, payload: { petId: admission.petId } }, now);
    return admission;
  }
  addTreatmentTask(input: { hospitalizationId: UUID; title: string; scheduledAt: ISODateTime }, meta: CommandMeta): TreatmentTask {
    this.access.require(meta.actor, 'clinical:write'); const admission = this.getAdmission(input.hospitalizationId, meta.actor.organizationId);
    if (!['ADMITTED', 'IN_TREATMENT'].includes(admission.state) || !input.title.trim() || Number.isNaN(new Date(input.scheduledAt).valueOf())) throw new DomainError('CONFLICT', 'An active admission and valid treatment task are required.');
    admission.state = 'IN_TREATMENT'; const task: TreatmentTask = { id: randomUUID(), hospitalizationId: admission.id, organizationId: admission.organizationId, title: input.title.trim(), scheduledAt: input.scheduledAt, state: 'DUE' };
    this.treatmentTasks.set(task.id, task);
    this.journal.record(meta, { action: 'treatment_task.created', aggregateType: 'TreatmentTask', aggregateId: task.id, metadata: { hospitalizationId: admission.id } }, { eventName: 'treatment_task.created', aggregateType: 'TreatmentTask', aggregateId: task.id, payload: { petId: admission.petId } }); return task;
  }
  administer(taskId: UUID, meta: CommandMeta): TreatmentTask {
    this.access.require(meta.actor, 'clinical:write'); const task = this.treatmentTasks.get(taskId);
    if (!task || task.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Treatment task is not available in this organization.');
    if (task.state !== 'DUE') throw new DomainError('CONFLICT', 'Treatment task was already handled.');
    task.state = 'ADMINISTERED'; task.administeredBy = meta.actor.userId; task.administeredAt = iso(meta.now ?? new Date());
    this.journal.record(meta, { action: 'treatment_task.administered', aggregateType: 'TreatmentTask', aggregateId: task.id, metadata: {} }, { eventName: 'treatment_task.administered', aggregateType: 'TreatmentTask', aggregateId: task.id, payload: {} }); return task;
  }
  discharge(admissionId: UUID, meta: CommandMeta): Hospitalization {
    this.access.require(meta.actor, 'clinical:write'); const admission = this.getAdmission(admissionId, meta.actor.organizationId);
    if (admission.state !== 'DISCHARGE_READY') throw new DomainError('CONFLICT', 'Admission must be explicitly marked discharge-ready.');
    admission.state = 'DISCHARGED'; admission.dischargedAt = iso(meta.now ?? new Date()); return admission;
  }
  markDischargeReady(admissionId: UUID, meta: CommandMeta): Hospitalization { this.access.require(meta.actor, 'clinical:write'); const admission = this.getAdmission(admissionId, meta.actor.organizationId); if (admission.state !== 'IN_TREATMENT') throw new DomainError('CONFLICT', 'Admission is not in treatment.'); admission.state = 'DISCHARGE_READY'; return admission; }
  private getAdmission(id: UUID, organizationId: UUID): Hospitalization { const admission = this.admissions.get(id); if (!admission || admission.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Hospitalization is not available in this organization.'); return admission; }
}
