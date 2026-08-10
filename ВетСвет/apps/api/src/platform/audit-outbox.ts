import { randomUUID } from 'node:crypto';
import type { Actor, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';

export type AuditEvent = {
  id: UUID;
  organizationId: UUID;
  actor: Actor;
  action: string;
  aggregateType: string;
  aggregateId: UUID;
  correlationId: string;
  occurredAt: ISODateTime;
  metadata: Record<string, unknown>;
};

export type OutboxEvent = {
  id: UUID;
  organizationId: UUID;
  eventName: string;
  aggregateType: string;
  aggregateId: UUID;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  occurredAt: ISODateTime;
  publishedAt?: ISODateTime;
};

export class AuditOutbox {
  readonly audits: AuditEvent[] = [];
  readonly events: OutboxEvent[] = [];
  private readonly processedCommands = new Map<string, UUID>();

  alreadyProcessed(organizationId: UUID, key: string): UUID | undefined {
    return this.processedCommands.get(`${organizationId}:${key}`);
  }

  record(command: { idempotencyKey: string; actor: Actor; correlationId: string }, change: Omit<AuditEvent, 'id' | 'organizationId' | 'actor' | 'correlationId' | 'occurredAt'>, event: Omit<OutboxEvent, 'id' | 'organizationId' | 'idempotencyKey' | 'occurredAt'>, now = new Date()): UUID {
    const organizationId = command.actor.organizationId;
    const existing = this.alreadyProcessed(organizationId, command.idempotencyKey);
    if (existing) return existing;
    const eventId = randomUUID();
    this.audits.push({ id: randomUUID(), organizationId, actor: command.actor, correlationId: command.correlationId, occurredAt: iso(now), ...change });
    this.events.push({ id: eventId, organizationId, idempotencyKey: command.idempotencyKey, occurredAt: iso(now), ...event });
    this.processedCommands.set(`${organizationId}:${command.idempotencyKey}`, eventId);
    return eventId;
  }
}
