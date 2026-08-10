import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type SupportCase = { id: UUID; organizationId: UUID; ownerId?: UUID; subject: string; state: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; assigneeId?: UUID; createdAt: ISODateTime; resolvedAt?: ISODateTime };
export class SupportService {
  readonly cases = new Map<UUID, SupportCase>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  create(input: { subject: string; ownerId?: UUID }, meta: CommandMeta): SupportCase { this.access.require(meta.actor, 'owner:write'); if (!input.subject.trim()) throw new DomainError('VALIDATION', 'Support case subject is required.'); const now = meta.now ?? new Date(); const support = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, subject: input.subject.trim(), state: 'OPEN' as const, createdAt: iso(now) }; this.cases.set(support.id, support); this.journal.record(meta, { action: 'support_case.created', aggregateType: 'SupportCase', aggregateId: support.id, metadata: {} }, { eventName: 'support_case.created', aggregateType: 'SupportCase', aggregateId: support.id, payload: {} }, now); return support; }
  resolve(id: UUID, meta: CommandMeta): SupportCase { this.access.require(meta.actor, 'owner:write'); const support = this.cases.get(id); if (!support || support.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Support case is not available in this organization.'); if (support.state === 'RESOLVED') throw new DomainError('CONFLICT', 'Support case was already resolved.'); support.state = 'RESOLVED'; support.resolvedAt = iso(meta.now ?? new Date()); return support; }
}
