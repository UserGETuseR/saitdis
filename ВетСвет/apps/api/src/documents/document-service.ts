import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Consent = { id: UUID; organizationId: UUID; ownerId: UUID; petId?: UUID; documentVersion: string; purpose: string; state: 'SIGNED' | 'REVOKED'; signedAt: ISODateTime; revokedAt?: ISODateTime };

export class DocumentService {
  readonly consents = new Map<UUID, Consent>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  recordConsent(input: { ownerId: UUID; petId?: UUID; documentVersion: string; purpose: string }, meta: CommandMeta): Consent {
    this.access.require(meta.actor, 'owner:write');
    if (!input.documentVersion.trim() || !input.purpose.trim()) throw new DomainError('VALIDATION', 'Document version and purpose are required.');
    const now = meta.now ?? new Date();
    const consent: Consent = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, documentVersion: input.documentVersion.trim(), purpose: input.purpose.trim(), state: 'SIGNED', signedAt: iso(now) };
    this.consents.set(consent.id, consent);
    this.journal.record(meta, { action: 'consent.signed', aggregateType: 'Consent', aggregateId: consent.id, metadata: { documentVersion: consent.documentVersion } }, { eventName: 'consent.signed', aggregateType: 'Consent', aggregateId: consent.id, payload: { ownerId: consent.ownerId, petId: consent.petId } }, now);
    return consent;
  }

  revokeConsent(consentId: UUID, meta: CommandMeta): Consent {
    this.access.require(meta.actor, 'owner:write');
    const consent = this.consents.get(consentId);
    if (!consent || consent.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Consent is not available in this organization.');
    if (consent.state !== 'SIGNED') throw new DomainError('CONFLICT', 'Consent was already revoked.');
    consent.state = 'REVOKED'; consent.revokedAt = iso(meta.now ?? new Date());
    this.journal.record(meta, { action: 'consent.revoked', aggregateType: 'Consent', aggregateId: consent.id, metadata: {} }, { eventName: 'consent.revoked', aggregateType: 'Consent', aggregateId: consent.id, payload: { ownerId: consent.ownerId, petId: consent.petId } });
    return consent;
  }
}
