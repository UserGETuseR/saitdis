import { randomBytes, randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from './access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type PhysicalIdentityTarget = 'PATIENT' | 'CAGE' | 'SPECIMEN' | 'INVENTORY_ITEM' | 'MEDICATION_LOT' | 'EQUIPMENT' | 'DOCUMENT';
export type PhysicalIdentity = { id: UUID; organizationId: UUID; targetType: PhysicalIdentityTarget; targetId: UUID; opaqueToken: string; state: 'ACTIVE' | 'REVOKED'; createdAt: ISODateTime; revokedAt?: ISODateTime };

/** Printable/scannable codes are opaque: they never contain owner names, diagnoses, contacts or other PII. */
export class PhysicalIdentityService {
  readonly identities = new Map<UUID, PhysicalIdentity>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  issue(input: { targetType: PhysicalIdentityTarget; targetId: UUID }, meta: CommandMeta): PhysicalIdentity {
    this.access.require(meta.actor, 'clinical:read'); if (!input.targetId.trim()) throw new DomainError('VALIDATION', 'A physical identity target is required.');
    const existing = [...this.identities.values()].find((item) => item.organizationId === meta.actor.organizationId && item.targetType === input.targetType && item.targetId === input.targetId && item.state === 'ACTIVE'); if (existing) return existing;
    const now = meta.now ?? new Date(); const identity: PhysicalIdentity = { id: randomUUID(), organizationId: meta.actor.organizationId, targetType: input.targetType, targetId: input.targetId, opaqueToken: `vs_${randomBytes(18).toString('base64url')}`, state: 'ACTIVE', createdAt: iso(now) };
    this.identities.set(identity.id, identity); this.journal.record(meta, { action: 'physical_identity.issued', aggregateType: 'PhysicalIdentity', aggregateId: identity.id, metadata: { targetType: identity.targetType } }, { eventName: 'physical_identity.issued', aggregateType: 'PhysicalIdentity', aggregateId: identity.id, payload: { targetType: identity.targetType } }, now); return identity;
  }
  resolve(opaqueToken: string, organizationId: UUID): PhysicalIdentity { const identity = [...this.identities.values()].find((item) => item.organizationId === organizationId && item.opaqueToken === opaqueToken && item.state === 'ACTIVE'); if (!identity) throw new DomainError('NOT_FOUND', 'Scannable identity is not available.'); return identity; }
  revoke(identityId: UUID, meta: CommandMeta): PhysicalIdentity { this.access.require(meta.actor, 'clinical:write'); const identity = this.identities.get(identityId); if (!identity || identity.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Physical identity is not available.'); if (identity.state !== 'ACTIVE') throw new DomainError('CONFLICT', 'Physical identity is already inactive.'); const now = meta.now ?? new Date(); identity.state = 'REVOKED'; identity.revokedAt = iso(now); this.journal.record(meta, { action: 'physical_identity.revoked', aggregateType: 'PhysicalIdentity', aggregateId: identity.id, metadata: {} }, { eventName: 'physical_identity.revoked', aggregateType: 'PhysicalIdentity', aggregateId: identity.id, payload: {} }, now); return identity; }
}
