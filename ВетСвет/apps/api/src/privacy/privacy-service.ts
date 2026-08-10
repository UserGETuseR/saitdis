import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type PrivacyRequest = { id: UUID; organizationId: UUID; ownerId: UUID; type: 'EXPORT' | 'CORRECTION' | 'DELETION_REVIEW'; state: 'OPEN' | 'IN_REVIEW' | 'COMPLETED' | 'REJECTED'; requestedAt: ISODateTime; completedAt?: ISODateTime };
export class PrivacyService {
  readonly requests = new Map<UUID, PrivacyRequest>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  request(input: { ownerId: UUID; type: PrivacyRequest['type'] }, meta: CommandMeta): PrivacyRequest { this.access.require(meta.actor, 'owner:write'); const now = meta.now ?? new Date(); const item = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, type: input.type, state: 'OPEN' as const, requestedAt: iso(now) }; this.requests.set(item.id, item); this.journal.record(meta, { action: 'privacy_request.created', aggregateType: 'PrivacyRequest', aggregateId: item.id, metadata: { type: item.type } }, { eventName: 'privacy_request.created', aggregateType: 'PrivacyRequest', aggregateId: item.id, payload: { ownerId: item.ownerId } }, now); return item; }
  complete(id: UUID, meta: CommandMeta): PrivacyRequest { this.access.require(meta.actor, 'owner:write'); const item = this.requests.get(id); if (!item || item.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Privacy request is not available in this organization.'); if (!['OPEN', 'IN_REVIEW'].includes(item.state)) throw new DomainError('CONFLICT', 'Privacy request is already closed.'); item.state = 'COMPLETED'; item.completedAt = iso(meta.now ?? new Date()); return item; }
}
