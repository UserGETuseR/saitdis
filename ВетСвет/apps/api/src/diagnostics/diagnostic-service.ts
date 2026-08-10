import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type LabOrder = { id: UUID; organizationId: UUID; petId: UUID; testName: string; state: 'ORDERED' | 'SAMPLE_COLLECTED' | 'RESULT_READY' | 'CANCELLED'; orderedAt: ISODateTime; resultSummary?: string; createdBy: UUID };
export class DiagnosticService {
  readonly orders = new Map<UUID, LabOrder>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  order(input: { petId: UUID; testName: string }, meta: CommandMeta): LabOrder { this.access.require(meta.actor, 'clinical:write'); const pet = this.booking.ownerPets.pets.get(input.petId); if (!pet || pet.organizationId !== meta.actor.organizationId || !input.testName.trim()) throw new DomainError('VALIDATION', 'Pet and diagnostic test are required.'); const order = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, testName: input.testName.trim(), state: 'ORDERED' as const, orderedAt: iso(meta.now ?? new Date()), createdBy: meta.actor.userId }; this.orders.set(order.id, order); return order; }
  collect(id: UUID, meta: CommandMeta): LabOrder { return this.transition(id, 'ORDERED', 'SAMPLE_COLLECTED', meta); }
  result(id: UUID, summary: string, meta: CommandMeta): LabOrder { const order = this.transition(id, 'SAMPLE_COLLECTED', 'RESULT_READY', meta); if (!summary.trim()) throw new DomainError('VALIDATION', 'Result summary is required.'); order.resultSummary = summary.trim(); this.journal.record(meta, { action: 'lab_order.result_ready', aggregateType: 'LabOrder', aggregateId: order.id, metadata: {} }, { eventName: 'lab_order.result_ready', aggregateType: 'LabOrder', aggregateId: order.id, payload: { petId: order.petId } }); return order; }
  private transition(id: UUID, from: LabOrder['state'], to: LabOrder['state'], meta: CommandMeta): LabOrder { this.access.require(meta.actor, 'clinical:write'); const order = this.orders.get(id); if (!order || order.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Lab order is not available.'); if (order.state !== from) throw new DomainError('CONFLICT', 'Lab order transition is invalid.'); order.state = to; return order; }
}
