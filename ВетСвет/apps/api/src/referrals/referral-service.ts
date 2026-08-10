import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Referral = { id: UUID; organizationId: UUID; petId: UUID; ownerId: UUID; recipientName: string; reason: string; consentId: UUID; state: 'DRAFT' | 'SENT' | 'CLOSED'; shareToken: string; expiresAt: ISODateTime; createdAt: ISODateTime };
export class ReferralService {
  readonly referrals = new Map<UUID, Referral>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  create(input: { ownerId: UUID; petId: UUID; recipientName: string; reason: string; consentId: UUID; expiresAt: ISODateTime }, meta: CommandMeta): Referral {
    this.access.require(meta.actor, 'clinical:write'); if (!input.recipientName.trim() || !input.reason.trim() || new Date(input.expiresAt) <= new Date(meta.now ?? new Date())) throw new DomainError('VALIDATION', 'Recipient, reason and future expiry are required.');
    const now = meta.now ?? new Date(); const referral: Referral = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, recipientName: input.recipientName.trim(), reason: input.reason.trim(), consentId: input.consentId, state: 'DRAFT', shareToken: randomUUID(), expiresAt: input.expiresAt, createdAt: iso(now) };
    this.referrals.set(referral.id, referral); this.journal.record(meta, { action: 'referral.created', aggregateType: 'Referral', aggregateId: referral.id, metadata: {} }, { eventName: 'referral.created', aggregateType: 'Referral', aggregateId: referral.id, payload: { petId: referral.petId } }, now); return referral;
  }
  send(id: UUID, meta: CommandMeta): Referral { this.access.require(meta.actor, 'clinical:write'); const referral = this.referrals.get(id); if (!referral || referral.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Referral is not available in this organization.'); if (referral.state !== 'DRAFT') throw new DomainError('CONFLICT', 'Referral was already sent.'); referral.state = 'SENT'; return referral; }
}
