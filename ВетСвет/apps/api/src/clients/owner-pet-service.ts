import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AuditOutbox } from '../platform/audit-outbox';
import { AccessService } from '../identity/access-service';

export type Owner = { id: UUID; organizationId: UUID; fullName: string; phone?: string; createdAt: ISODateTime };
export type Pet = { id: UUID; organizationId: UUID; name: string; species: 'DOG' | 'CAT' | 'OTHER'; lifecycle: 'ACTIVE' | 'INACTIVE' | 'DECEASED'; createdAt: ISODateTime };
export type OwnerPetRelation = { id: UUID; organizationId: UUID; ownerId: UUID; petId: UUID; relationship: 'OWNER' | 'CAREGIVER'; isPrimary: boolean };

export class OwnerPetService {
  readonly owners = new Map<UUID, Owner>();
  readonly pets = new Map<UUID, Pet>();
  readonly relations: OwnerPetRelation[] = [];
  private readonly commandResults = new Map<string, Owner | Pet>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  createOwner(input: { fullName: string; phone?: string }, meta: CommandMeta): Owner {
    this.access.require(meta.actor, 'owner:write');
    const commandKey = `${meta.actor.organizationId}:${meta.idempotencyKey}`;
    const previous = this.commandResults.get(commandKey);
    if (previous && 'fullName' in previous) return previous;
    if (!input.fullName.trim()) throw new DomainError('VALIDATION', 'Owner name is required.');
    const now = meta.now ?? new Date();
    const owner: Owner = { id: randomUUID(), organizationId: meta.actor.organizationId, fullName: input.fullName.trim(), phone: input.phone?.trim() || undefined, createdAt: iso(now) };
    this.owners.set(owner.id, owner);
    this.journal.record(meta, { action: 'owner.created', aggregateType: 'Owner', aggregateId: owner.id, metadata: {} }, { eventName: 'owner.created', aggregateType: 'Owner', aggregateId: owner.id, payload: {} }, now);
    this.commandResults.set(commandKey, owner);
    return owner;
  }

  createPet(input: { ownerId: UUID; name: string; species: Pet['species'] }, meta: CommandMeta): Pet {
    this.access.require(meta.actor, 'pet:write');
    const commandKey = `${meta.actor.organizationId}:${meta.idempotencyKey}`;
    const previous = this.commandResults.get(commandKey);
    if (previous && 'species' in previous) return previous;
    const owner = this.owners.get(input.ownerId);
    if (!owner || owner.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Owner is not available in this organization.');
    if (!input.name.trim()) throw new DomainError('VALIDATION', 'Pet name is required.');
    const now = meta.now ?? new Date();
    const pet: Pet = { id: randomUUID(), organizationId: meta.actor.organizationId, name: input.name.trim(), species: input.species, lifecycle: 'ACTIVE', createdAt: iso(now) };
    this.pets.set(pet.id, pet);
    this.relations.push({ id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: owner.id, petId: pet.id, relationship: 'OWNER', isPrimary: true });
    this.journal.record(meta, { action: 'pet.created', aggregateType: 'Pet', aggregateId: pet.id, metadata: { species: pet.species } }, { eventName: 'pet.created', aggregateType: 'Pet', aggregateId: pet.id, payload: { ownerId: owner.id, species: pet.species } }, now);
    this.commandResults.set(commandKey, pet);
    return pet;
  }

  petHistoryFor(ownerId: UUID, meta: CommandMeta): Pet[] {
    this.access.require(meta.actor, 'pet:read');
    const owner = this.owners.get(ownerId);
    if (!owner || owner.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Owner is not available in this organization.');
    return this.relations.filter((relation) => relation.ownerId === ownerId && relation.organizationId === meta.actor.organizationId).map((relation) => this.pets.get(relation.petId)).filter((pet): pet is Pet => Boolean(pet));
  }
}
