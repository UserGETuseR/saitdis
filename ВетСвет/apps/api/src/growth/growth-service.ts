import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type ServicePackage = { id: UUID; organizationId: UUID; name: string; includedServiceVariantIds: readonly UUID[]; credits: number; state: 'ACTIVE' | 'ARCHIVED'; createdAt: ISODateTime };
export type PackageBalance = { id: UUID; organizationId: UUID; ownerId: UUID; petId?: UUID; packageId: UUID; remainingCredits: number; purchasedAt: ISODateTime; expiresAt?: ISODateTime };
export type LoyaltyLedgerEntry = { id: UUID; organizationId: UUID; ownerId: UUID; pointsDelta: number; reason: string; createdAt: ISODateTime };

export class GrowthService {
  readonly packages = new Map<UUID, ServicePackage>(); readonly balances = new Map<UUID, PackageBalance>(); readonly loyalty = new Map<UUID, LoyaltyLedgerEntry>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  createPackage(input: { name: string; includedServiceVariantIds: readonly UUID[]; credits: number }, meta: CommandMeta): ServicePackage {
    this.access.require(meta.actor, 'finance:write'); if (!input.name.trim() || input.includedServiceVariantIds.length === 0 || !Number.isSafeInteger(input.credits) || input.credits < 1) throw new DomainError('VALIDATION', 'Package name, covered services and positive credits are required.');
    const now = meta.now ?? new Date(); const packageItem: ServicePackage = { id: randomUUID(), organizationId: meta.actor.organizationId, name: input.name.trim(), includedServiceVariantIds: input.includedServiceVariantIds, credits: input.credits, state: 'ACTIVE', createdAt: iso(now) };
    this.packages.set(packageItem.id, packageItem); this.journal.record(meta, { action: 'package.created', aggregateType: 'ServicePackage', aggregateId: packageItem.id, metadata: {} }, { eventName: 'package.created', aggregateType: 'ServicePackage', aggregateId: packageItem.id, payload: {} }, now); return packageItem;
  }
  grantPackage(input: { packageId: UUID; ownerId: UUID; petId?: UUID; expiresAt?: ISODateTime }, meta: CommandMeta): PackageBalance {
    this.access.require(meta.actor, 'finance:write'); const packageItem = this.packages.get(input.packageId); if (!packageItem || packageItem.organizationId !== meta.actor.organizationId || packageItem.state !== 'ACTIVE') throw new DomainError('NOT_FOUND', 'Active package is not available in this organization.');
    const balance: PackageBalance = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, packageId: packageItem.id, remainingCredits: packageItem.credits, purchasedAt: iso(meta.now ?? new Date()), expiresAt: input.expiresAt }; this.balances.set(balance.id, balance); return balance;
  }
  consumeCredit(balanceId: UUID, meta: CommandMeta): PackageBalance {
    this.access.require(meta.actor, 'finance:write'); const balance = this.balances.get(balanceId); if (!balance || balance.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Package balance is not available in this organization.');
    if (balance.remainingCredits < 1 || (balance.expiresAt && new Date(balance.expiresAt) < (meta.now ?? new Date()))) throw new DomainError('CONFLICT', 'Package balance has no usable credits.'); balance.remainingCredits -= 1; return balance;
  }
  addLoyaltyPoints(input: { ownerId: UUID; pointsDelta: number; reason: string }, meta: CommandMeta): LoyaltyLedgerEntry {
    this.access.require(meta.actor, 'finance:write'); if (!Number.isSafeInteger(input.pointsDelta) || input.pointsDelta === 0 || !input.reason.trim()) throw new DomainError('VALIDATION', 'Points delta and reason are required.');
    const entry: LoyaltyLedgerEntry = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, pointsDelta: input.pointsDelta, reason: input.reason.trim(), createdAt: iso(meta.now ?? new Date()) }; this.loyalty.set(entry.id, entry); return entry;
  }
}
