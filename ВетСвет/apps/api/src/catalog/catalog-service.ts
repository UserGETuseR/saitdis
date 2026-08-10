import { randomUUID } from 'node:crypto';
import type { Money } from '../../../../packages/contracts/src/money';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type ServiceKind = 'GROOMING' | 'VETERINARY' | 'CONSULTATION' | 'RETAIL';
export type Resource = { id: UUID; organizationId: UUID; locationId: UUID; name: string; capacity: number; isActive: boolean; createdAt: ISODateTime };
export type Service = { id: UUID; organizationId: UUID; publicName: string; internalName: string; kind: ServiceKind; isOnlineBookable: boolean; createdAt: ISODateTime };
export type ServiceVariant = { id: UUID; organizationId: UUID; serviceId: UUID; name: string; durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number; price: Money; deposit: Money; allowedSpecies: readonly ('DOG' | 'CAT' | 'OTHER')[]; requiredResourceIds: readonly UUID[]; createdAt: ISODateTime };

export class CatalogService {
  readonly services = new Map<UUID, Service>();
  readonly variants = new Map<UUID, ServiceVariant>();
  readonly resources = new Map<UUID, Resource>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  createResource(input: { locationId: UUID; name: string; capacity: number }, meta: CommandMeta): Resource {
    this.access.require(meta.actor, 'location:manage');
    if (!input.name.trim() || !Number.isSafeInteger(input.capacity) || input.capacity < 1) throw new DomainError('VALIDATION', 'Resource name and positive capacity are required.');
    const now = meta.now ?? new Date();
    const resource = { id: randomUUID(), organizationId: meta.actor.organizationId, locationId: input.locationId, name: input.name.trim(), capacity: input.capacity, isActive: true, createdAt: iso(now) };
    this.resources.set(resource.id, resource);
    this.journal.record(meta, { action: 'resource.created', aggregateType: 'Resource', aggregateId: resource.id, metadata: { locationId: resource.locationId } }, { eventName: 'resource.created', aggregateType: 'Resource', aggregateId: resource.id, payload: { locationId: resource.locationId } }, now);
    return resource;
  }

  createService(input: { publicName: string; internalName: string; kind: ServiceKind; isOnlineBookable?: boolean }, meta: CommandMeta): Service {
    this.access.require(meta.actor, 'organization:manage');
    if (!input.publicName.trim() || !input.internalName.trim()) throw new DomainError('VALIDATION', 'Public and internal service names are required.');
    const now = meta.now ?? new Date();
    const service = { id: randomUUID(), organizationId: meta.actor.organizationId, publicName: input.publicName.trim(), internalName: input.internalName.trim(), kind: input.kind, isOnlineBookable: input.isOnlineBookable ?? true, createdAt: iso(now) };
    this.services.set(service.id, service);
    this.journal.record(meta, { action: 'service.created', aggregateType: 'Service', aggregateId: service.id, metadata: { kind: service.kind } }, { eventName: 'service.created', aggregateType: 'Service', aggregateId: service.id, payload: { kind: service.kind } }, now);
    return service;
  }

  createVariant(input: { serviceId: UUID; name: string; durationMinutes: number; bufferBeforeMinutes?: number; bufferAfterMinutes?: number; price: Money; deposit?: Money; allowedSpecies?: readonly ('DOG' | 'CAT' | 'OTHER')[]; requiredResourceIds?: readonly UUID[] }, meta: CommandMeta): ServiceVariant {
    this.access.require(meta.actor, 'organization:manage');
    const service = this.services.get(input.serviceId);
    if (!service || service.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Service is not available in this organization.');
    if (!input.name.trim() || !Number.isSafeInteger(input.durationMinutes) || input.durationMinutes < 5) throw new DomainError('VALIDATION', 'Variant name and duration of at least 5 minutes are required.');
    const resourceIds = input.requiredResourceIds ?? [];
    if (resourceIds.some((id) => this.resources.get(id)?.organizationId !== meta.actor.organizationId)) throw new DomainError('NOT_FOUND', 'A required resource is not available in this organization.');
    const now = meta.now ?? new Date();
    const variant: ServiceVariant = { id: randomUUID(), organizationId: meta.actor.organizationId, serviceId: service.id, name: input.name.trim(), durationMinutes: input.durationMinutes, bufferBeforeMinutes: input.bufferBeforeMinutes ?? 0, bufferAfterMinutes: input.bufferAfterMinutes ?? 0, price: input.price, deposit: input.deposit ?? { amountMinor: 0, currency: input.price.currency }, allowedSpecies: input.allowedSpecies ?? ['DOG', 'CAT', 'OTHER'], requiredResourceIds: resourceIds, createdAt: iso(now) };
    this.variants.set(variant.id, variant);
    this.journal.record(meta, { action: 'service_variant.created', aggregateType: 'ServiceVariant', aggregateId: variant.id, metadata: { serviceId: service.id } }, { eventName: 'service_variant.created', aggregateType: 'ServiceVariant', aggregateId: variant.id, payload: { serviceId: service.id } }, now);
    return variant;
  }

  getVariant(variantId: UUID, organizationId: UUID): ServiceVariant {
    const variant = this.variants.get(variantId);
    if (!variant || variant.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Service variant is not available in this organization.');
    return variant;
  }
}
