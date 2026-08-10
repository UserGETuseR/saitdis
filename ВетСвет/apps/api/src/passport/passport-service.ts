import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type PassportShare = { id: UUID; organizationId: UUID; petId: UUID; ownerId: UUID; token: string; scope: 'EMERGENCY_IDENTITY' | 'REFERRAL_SELECTED_RECORDS'; state: 'ACTIVE' | 'REVOKED' | 'EXPIRED'; expiresAt: ISODateTime; createdAt: ISODateTime };
export class PassportService {
  readonly shares = new Map<UUID, PassportShare>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  createShare(input: { ownerId: UUID; petId: UUID; scope: PassportShare['scope']; expiresAt: ISODateTime }, meta: CommandMeta): PassportShare {
    this.access.require(meta.actor, 'pet:write'); const pet = this.booking.ownerPets.pets.get(input.petId); const owner = this.booking.ownerPets.owners.get(input.ownerId);
    if (!pet || !owner || pet.organizationId !== meta.actor.organizationId || owner.organizationId !== meta.actor.organizationId || new Date(input.expiresAt) <= new Date(meta.now ?? new Date())) throw new DomainError('VALIDATION', 'An available owner, pet and future expiry are required.');
    const now = meta.now ?? new Date(); const share: PassportShare = { id: randomUUID(), organizationId: meta.actor.organizationId, petId: input.petId, ownerId: input.ownerId, scope: input.scope, token: randomUUID(), state: 'ACTIVE', expiresAt: input.expiresAt, createdAt: iso(now) }; this.shares.set(share.id, share); this.journal.record(meta, { action: 'passport_share.created', aggregateType: 'PassportShare', aggregateId: share.id, metadata: { scope: share.scope } }, { eventName: 'passport_share.created', aggregateType: 'PassportShare', aggregateId: share.id, payload: { petId: share.petId } }, now); return share;
  }
  emergencyView(token: string, now = new Date()): { petId: UUID; ownerId: UUID; scope: PassportShare['scope'] } {
    const share = [...this.shares.values()].find((item) => item.token === token); if (!share || share.state !== 'ACTIVE' || share.scope !== 'EMERGENCY_IDENTITY' || new Date(share.expiresAt) <= now) throw new DomainError('NOT_FOUND', 'Emergency passport share is unavailable.'); return { petId: share.petId, ownerId: share.ownerId, scope: share.scope };
  }
  revoke(id: UUID, meta: CommandMeta): PassportShare { this.access.require(meta.actor, 'pet:write'); const share = this.shares.get(id); if (!share || share.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Passport share is not available in this organization.'); if (share.state !== 'ACTIVE') throw new DomainError('CONFLICT', 'Passport share was already closed.'); share.state = 'REVOKED'; return share; }
}
