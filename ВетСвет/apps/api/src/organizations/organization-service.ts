import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AuditOutbox } from '../platform/audit-outbox';
import { AccessService } from '../identity/access-service';

export type Organization = { id: UUID; legalName: string; displayName: string; createdAt: ISODateTime };
export type Location = { id: UUID; organizationId: UUID; name: string; timezone: string; isActive: boolean; createdAt: ISODateTime };

export class OrganizationService {
  readonly organizations = new Map<UUID, Organization>();
  readonly locations = new Map<UUID, Location>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  createOrganization(input: { legalName: string; displayName: string }, meta: CommandMeta): Organization {
    if (this.journal.alreadyProcessed(meta.actor.organizationId, meta.idempotencyKey)) throw new DomainError('CONFLICT', 'This command was already processed.');
    if (!input.legalName.trim() || !input.displayName.trim()) throw new DomainError('VALIDATION', 'Organization names are required.');
    const now = meta.now ?? new Date();
    const organization = { id: meta.actor.organizationId, legalName: input.legalName.trim(), displayName: input.displayName.trim(), createdAt: iso(now) };
    if (this.organizations.has(organization.id)) throw new DomainError('CONFLICT', 'Organization already exists.');
    this.organizations.set(organization.id, organization);
    this.access.bootstrapOwner(meta.actor, now);
    this.journal.record(meta, { action: 'organization.created', aggregateType: 'Organization', aggregateId: organization.id, metadata: { displayName: organization.displayName } }, { eventName: 'organization.created', aggregateType: 'Organization', aggregateId: organization.id, payload: { displayName: organization.displayName } }, now);
    return organization;
  }

  createLocation(input: { name: string; timezone: string }, meta: CommandMeta): Location {
    this.access.require(meta.actor, 'location:manage');
    if (!this.organizations.has(meta.actor.organizationId)) throw new DomainError('NOT_FOUND', 'Organization not found.');
    if (!input.name.trim() || !input.timezone.trim()) throw new DomainError('VALIDATION', 'Location name and timezone are required.');
    const now = meta.now ?? new Date();
    const location: Location = { id: randomUUID(), organizationId: meta.actor.organizationId, name: input.name.trim(), timezone: input.timezone.trim(), isActive: true, createdAt: iso(now) };
    this.locations.set(location.id, location);
    this.journal.record(meta, { action: 'location.created', aggregateType: 'Location', aggregateId: location.id, metadata: { name: location.name } }, { eventName: 'location.created', aggregateType: 'Location', aggregateId: location.id, payload: { name: location.name } }, now);
    return location;
  }
}
