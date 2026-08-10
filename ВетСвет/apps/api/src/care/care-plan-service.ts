import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type CarePlan = { id: UUID; organizationId: UUID; petId: UUID; ownerId: UUID; title: string; status: 'ACTIVE' | 'PAUSED' | 'COMPLETED'; createdAt: ISODateTime };
export type CarePlanTask = { id: UUID; carePlanId: UUID; organizationId: UUID; title: string; dueAt?: ISODateTime; category: 'PREVENTIVE' | 'VACCINE' | 'GROOMING' | 'FOLLOW_UP' | 'MEDICATION'; status: 'OPEN' | 'DONE' | 'SKIPPED'; completedAt?: ISODateTime };

export class CarePlanService {
  readonly plans = new Map<UUID, CarePlan>();
  readonly tasks = new Map<UUID, CarePlanTask>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}

  createPlan(input: { ownerId: UUID; petId: UUID; title: string }, meta: CommandMeta): CarePlan {
    this.access.require(meta.actor, 'clinical:write');
    const pet = this.booking.ownerPets.pets.get(input.petId); const owner = this.booking.ownerPets.owners.get(input.ownerId);
    if (!pet || !owner || pet.organizationId !== meta.actor.organizationId || owner.organizationId !== meta.actor.organizationId || !input.title.trim()) throw new DomainError('VALIDATION', 'An available owner, pet and care plan title are required.');
    const now = meta.now ?? new Date();
    const plan: CarePlan = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, title: input.title.trim(), status: 'ACTIVE', createdAt: iso(now) };
    this.plans.set(plan.id, plan);
    this.journal.record(meta, { action: 'care_plan.created', aggregateType: 'CarePlan', aggregateId: plan.id, metadata: { petId: plan.petId } }, { eventName: 'care_plan.created', aggregateType: 'CarePlan', aggregateId: plan.id, payload: { petId: plan.petId } }, now);
    return plan;
  }

  addTask(input: { carePlanId: UUID; title: string; category: CarePlanTask['category']; dueAt?: ISODateTime }, meta: CommandMeta): CarePlanTask {
    this.access.require(meta.actor, 'clinical:write');
    const plan = this.getPlan(input.carePlanId, meta.actor.organizationId);
    if (plan.status !== 'ACTIVE' || !input.title.trim()) throw new DomainError('CONFLICT', 'Only active care plans can receive a complete task.');
    const task: CarePlanTask = { id: randomUUID(), carePlanId: plan.id, organizationId: plan.organizationId, title: input.title.trim(), category: input.category, dueAt: input.dueAt, status: 'OPEN' };
    this.tasks.set(task.id, task);
    this.journal.record(meta, { action: 'care_plan_task.created', aggregateType: 'CarePlanTask', aggregateId: task.id, metadata: { carePlanId: plan.id, category: task.category } }, { eventName: 'care_plan_task.created', aggregateType: 'CarePlanTask', aggregateId: task.id, payload: { petId: plan.petId } });
    return task;
  }

  finishTask(taskId: UUID, status: 'DONE' | 'SKIPPED', meta: CommandMeta): CarePlanTask {
    this.access.require(meta.actor, 'pet:write');
    const task = this.tasks.get(taskId);
    if (!task || task.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Care plan task is not available in this organization.');
    if (task.status !== 'OPEN') throw new DomainError('CONFLICT', 'Care plan task was already completed.');
    task.status = status; task.completedAt = iso(meta.now ?? new Date());
    this.journal.record(meta, { action: `care_plan_task.${status.toLowerCase()}`, aggregateType: 'CarePlanTask', aggregateId: task.id, metadata: {} }, { eventName: `care_plan_task.${status.toLowerCase()}`, aggregateType: 'CarePlanTask', aggregateId: task.id, payload: {} });
    return task;
  }

  private getPlan(id: UUID, organizationId: UUID): CarePlan { const plan = this.plans.get(id); if (!plan || plan.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Care plan is not available in this organization.'); return plan; }
}
