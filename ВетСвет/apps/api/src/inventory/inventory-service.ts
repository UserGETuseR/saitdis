import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type InventoryItem = { id: UUID; organizationId: UUID; sku: string; name: string; unit: string; createdAt: ISODateTime };
export type StockMovement = { id: UUID; organizationId: UUID; itemId: UUID; locationId: UUID; quantity: number; direction: 'RECEIPT' | 'CONSUMPTION' | 'ADJUSTMENT'; reason: string; createdAt: ISODateTime };

export class InventoryService {
  readonly items = new Map<UUID, InventoryItem>();
  readonly movements: StockMovement[] = [];
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  createItem(input: { sku: string; name: string; unit: string }, meta: CommandMeta): InventoryItem {
    this.access.require(meta.actor, 'finance:write');
    if (!input.sku.trim() || !input.name.trim() || !input.unit.trim()) throw new DomainError('VALIDATION', 'SKU, item name and unit are required.');
    const now = meta.now ?? new Date(); const item: InventoryItem = { id: randomUUID(), organizationId: meta.actor.organizationId, sku: input.sku.trim(), name: input.name.trim(), unit: input.unit.trim(), createdAt: iso(now) };
    this.items.set(item.id, item);
    this.journal.record(meta, { action: 'inventory_item.created', aggregateType: 'InventoryItem', aggregateId: item.id, metadata: { sku: item.sku } }, { eventName: 'inventory_item.created', aggregateType: 'InventoryItem', aggregateId: item.id, payload: {} }, now);
    return item;
  }
  move(input: { itemId: UUID; locationId: UUID; quantity: number; direction: StockMovement['direction']; reason: string }, meta: CommandMeta): StockMovement {
    this.access.require(meta.actor, 'finance:write');
    const item = this.items.get(input.itemId); if (!item || item.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Inventory item is not available in this organization.');
    if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || !input.reason.trim()) throw new DomainError('VALIDATION', 'Movement quantity and reason are required.');
    const available = this.balance(item.id, input.locationId, meta.actor.organizationId);
    if (input.direction === 'CONSUMPTION' && available < input.quantity) throw new DomainError('CONFLICT', 'Inventory consumption would create a negative balance.');
    const now = meta.now ?? new Date(); const movement: StockMovement = { id: randomUUID(), organizationId: meta.actor.organizationId, itemId: item.id, locationId: input.locationId, quantity: input.quantity, direction: input.direction, reason: input.reason.trim(), createdAt: iso(now) };
    this.movements.push(movement);
    this.journal.record(meta, { action: `stock.${movement.direction.toLowerCase()}`, aggregateType: 'StockMovement', aggregateId: movement.id, metadata: { itemId: item.id, quantity: movement.quantity } }, { eventName: `stock.${movement.direction.toLowerCase()}`, aggregateType: 'StockMovement', aggregateId: movement.id, payload: {} }, now);
    return movement;
  }
  balance(itemId: UUID, locationId: UUID, organizationId: UUID): number { return this.movements.filter((movement) => movement.organizationId === organizationId && movement.itemId === itemId && movement.locationId === locationId).reduce((total, movement) => total + (movement.direction === 'CONSUMPTION' ? -movement.quantity : movement.quantity), 0); }
}
