import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { OrganizationService } from '../organizations/organization-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type EquipmentState = 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'RETIRED';
export type Equipment = { id: UUID; organizationId: UUID; locationId: UUID; name: string; kind: 'OXYGEN' | 'INFUSION_PUMP' | 'DIAGNOSTIC' | 'DENTAL' | 'GROOMING' | 'OTHER'; serialNumber?: string; state: EquipmentState; lastMaintenanceAt?: ISODateTime; maintenanceNote?: string; createdAt: ISODateTime };

/** Physical resources use explicit state so scheduling/instructions can safely reject unavailable equipment. */
export class EquipmentService {
  readonly equipment = new Map<UUID, Equipment>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly organizations: OrganizationService) {}
  register(input: { locationId: UUID; name: string; kind: Equipment['kind']; serialNumber?: string }, meta: CommandMeta): Equipment {
    this.access.require(meta.actor, 'location:manage'); const location = this.organizations.locations.get(input.locationId);
    if (!location || location.organizationId !== meta.actor.organizationId || !location.isActive) throw new DomainError('NOT_FOUND', 'An active location is required for equipment.'); if (!input.name.trim()) throw new DomainError('VALIDATION', 'Equipment name is required.');
    if (input.serialNumber?.trim() && [...this.equipment.values()].some((item) => item.organizationId === meta.actor.organizationId && item.serialNumber === input.serialNumber.trim())) throw new DomainError('CONFLICT', 'Equipment serial number already exists in this organization.');
    const now = meta.now ?? new Date(); const item: Equipment = { id: randomUUID(), organizationId: meta.actor.organizationId, locationId: input.locationId, name: input.name.trim(), kind: input.kind, serialNumber: input.serialNumber?.trim() || undefined, state: 'ACTIVE', createdAt: iso(now) }; this.equipment.set(item.id, item); this.record(meta, item, 'equipment.registered', {}, now); return item;
  }
  startMaintenance(equipmentId: UUID, note: string, meta: CommandMeta): Equipment { this.access.require(meta.actor, 'location:manage'); const item = this.get(equipmentId, meta.actor.organizationId); if (!['ACTIVE', 'OUT_OF_SERVICE'].includes(item.state) || !note.trim()) throw new DomainError('CONFLICT', 'Only active or out-of-service equipment with a maintenance note can enter maintenance.'); item.state = 'MAINTENANCE'; item.maintenanceNote = note.trim(); this.record(meta, item, 'equipment.maintenance_started', {}); return item; }
  completeMaintenance(equipmentId: UUID, note: string, meta: CommandMeta): Equipment { this.access.require(meta.actor, 'location:manage'); const item = this.get(equipmentId, meta.actor.organizationId); if (item.state !== 'MAINTENANCE' || !note.trim()) throw new DomainError('CONFLICT', 'Only equipment in maintenance can be returned to service.'); const now = meta.now ?? new Date(); item.state = 'ACTIVE'; item.lastMaintenanceAt = iso(now); item.maintenanceNote = note.trim(); this.record(meta, item, 'equipment.maintenance_completed', {}, now); return item; }
  reportUnsafe(equipmentId: UUID, note: string, meta: CommandMeta): Equipment { this.access.require(meta.actor, 'clinical:write'); const item = this.get(equipmentId, meta.actor.organizationId); if (item.state === 'RETIRED' || !note.trim()) throw new DomainError('CONFLICT', 'A safety note is required for active equipment.'); item.state = 'OUT_OF_SERVICE'; item.maintenanceNote = note.trim(); this.record(meta, item, 'equipment.marked_out_of_service', {}); return item; }
  availableAt(locationId: UUID, organizationId: UUID): Equipment[] { return [...this.equipment.values()].filter((item) => item.organizationId === organizationId && item.locationId === locationId && item.state === 'ACTIVE'); }
  private get(equipmentId: UUID, organizationId: UUID): Equipment { const item = this.equipment.get(equipmentId); if (!item || item.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Equipment is not available in this organization.'); return item; }
  private record(meta: CommandMeta, item: Equipment, action: string, metadata: Record<string, unknown>, now = meta.now ?? new Date()): void { this.journal.record(meta, { action, aggregateType: 'Equipment', aggregateId: item.id, metadata }, { eventName: action, aggregateType: 'Equipment', aggregateId: item.id, payload: { locationId: item.locationId } }, now); }
}
