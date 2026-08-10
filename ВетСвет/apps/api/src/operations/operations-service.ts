import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type OperationalTask = { id: UUID; organizationId: UUID; title: string; assigneeId?: UUID; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'; state: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED'; relatedType?: string; relatedId?: UUID; createdAt: ISODateTime; completedAt?: ISODateTime };
export type Incident = { id: UUID; organizationId: UUID; petId?: UUID; type: 'GROOMING' | 'MEDICATION' | 'EQUIPMENT' | 'FALL_ESCAPE_BITE' | 'COMMUNICATION' | 'PAYMENT_DOCUMENT' | 'PRIVACY' | 'OTHER'; severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; description: string; state: 'OPEN' | 'UNDER_REVIEW' | 'CLOSED'; createdAt: ISODateTime };

export class OperationsService {
  readonly tasks = new Map<UUID, OperationalTask>();
  readonly incidents = new Map<UUID, Incident>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  createTask(input: { title: string; priority?: OperationalTask['priority']; assigneeId?: UUID; relatedType?: string; relatedId?: UUID }, meta: CommandMeta): OperationalTask {
    this.access.require(meta.actor, 'appointment:write');
    if (!input.title.trim()) throw new DomainError('VALIDATION', 'Task title is required.');
    const now = meta.now ?? new Date(); const task: OperationalTask = { id: randomUUID(), organizationId: meta.actor.organizationId, title: input.title.trim(), priority: input.priority ?? 'NORMAL', assigneeId: input.assigneeId, relatedType: input.relatedType, relatedId: input.relatedId, state: 'OPEN', createdAt: iso(now) };
    this.tasks.set(task.id, task);
    this.journal.record(meta, { action: 'task.created', aggregateType: 'OperationalTask', aggregateId: task.id, metadata: { priority: task.priority } }, { eventName: 'task.created', aggregateType: 'OperationalTask', aggregateId: task.id, payload: {} }, now);
    return task;
  }
  finishTask(taskId: UUID, meta: CommandMeta): OperationalTask {
    this.access.require(meta.actor, 'appointment:write');
    const task = this.tasks.get(taskId); if (!task || task.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Task is not available in this organization.');
    if (!['OPEN', 'IN_PROGRESS'].includes(task.state)) throw new DomainError('CONFLICT', 'Task cannot be completed from its current state.');
    task.state = 'DONE'; task.completedAt = iso(meta.now ?? new Date());
    this.journal.record(meta, { action: 'task.completed', aggregateType: 'OperationalTask', aggregateId: task.id, metadata: {} }, { eventName: 'task.completed', aggregateType: 'OperationalTask', aggregateId: task.id, payload: {} });
    return task;
  }
  reportIncident(input: { type: Incident['type']; severity: Incident['severity']; description: string; petId?: UUID }, meta: CommandMeta): Incident {
    this.access.require(meta.actor, 'appointment:write');
    if (!input.description.trim()) throw new DomainError('VALIDATION', 'Incident description is required.');
    const now = meta.now ?? new Date(); const incident: Incident = { id: randomUUID(), organizationId: meta.actor.organizationId, type: input.type, severity: input.severity, description: input.description.trim(), petId: input.petId, state: 'OPEN', createdAt: iso(now) };
    this.incidents.set(incident.id, incident);
    this.journal.record(meta, { action: 'incident.reported', aggregateType: 'Incident', aggregateId: incident.id, metadata: { type: incident.type, severity: incident.severity } }, { eventName: 'incident.reported', aggregateType: 'Incident', aggregateId: incident.id, payload: { petId: incident.petId } }, now);
    return incident;
  }
}
