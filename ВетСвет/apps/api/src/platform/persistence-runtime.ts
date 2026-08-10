import { PrismaClient } from '@prisma/client';
import type { ISODateTime, UUID } from '../core/types';

export type PersistenceMode = 'IN_MEMORY' | 'POSTGRES_PRISMA';
export type PersistenceRuntime = { mode: 'IN_MEMORY'; reason: string } | { mode: 'POSTGRES_PRISMA'; client: PrismaClient };

/** Runtime selection never silently falls back once DATABASE_URL is supplied. */
export function createPersistenceRuntime(env: NodeJS.ProcessEnv = process.env): PersistenceRuntime {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) return { mode: 'IN_MEMORY', reason: 'DATABASE_URL is not configured; development adapters are active.' };
  return { mode: 'POSTGRES_PRISMA', client: new PrismaClient({ datasources: { db: { url: databaseUrl } } }) };
}

export type PersistedOrganization = { id: UUID; legalName: string; displayName: string; createdAt: ISODateTime };
export type PersistedLocation = { id: UUID; organizationId: UUID; name: string; timezone: string; active: boolean };

/** First concrete Prisma repository. Further domain repositories must preserve this tenant-scoped shape. */
export class PrismaOrganizationRepository {
  constructor(private readonly client: PrismaClient) {}
  async createOrganization(input: { id: UUID; legalName: string; displayName: string }): Promise<PersistedOrganization> {
    const record = await this.client.organization.create({ data: { id: input.id, legalName: input.legalName, displayName: input.displayName } });
    return { id: record.id, legalName: record.legalName, displayName: record.displayName, createdAt: record.createdAt.toISOString() };
  }
  async createLocation(input: { organizationId: UUID; name: string; timezone: string }): Promise<PersistedLocation> {
    const record = await this.client.location.create({ data: { organizationId: input.organizationId, name: input.name, timezone: input.timezone } });
    return { id: record.id, organizationId: record.organizationId, name: record.name, timezone: record.timezone, active: record.active };
  }
  async findOrganization(id: UUID): Promise<PersistedOrganization | undefined> {
    const record = await this.client.organization.findUnique({ where: { id } });
    return record ? { id: record.id, legalName: record.legalName, displayName: record.displayName, createdAt: record.createdAt.toISOString() } : undefined;
  }
}

/** Tenant-scoped owner/pet persistence; callers must supply the organization context. */
export class PrismaOwnerPetRepository {
  constructor(private readonly client: PrismaClient) {}
  async createOwnerWithPet(input: { organizationId: UUID; owner: { fullName: string; phone?: string }; pet: { name: string; species: string } }): Promise<{ ownerId: UUID; petId: UUID }> {
    return this.client.$transaction(async (tx) => {
      const owner = await tx.owner.create({ data: { organizationId: input.organizationId, fullName: input.owner.fullName, phone: input.owner.phone } });
      const pet = await tx.pet.create({ data: { organizationId: input.organizationId, name: input.pet.name, species: input.pet.species } });
      await tx.ownerPetRelation.create({ data: { organizationId: input.organizationId, ownerId: owner.id, petId: pet.id, relation: 'OWNER', primary: true } });
      return { ownerId: owner.id, petId: pet.id };
    });
  }
  async petsForOwner(organizationId: UUID, ownerId: UUID) { return this.client.ownerPetRelation.findMany({ where: { organizationId, ownerId }, select: { pet: true } }).then((items) => items.map((item) => item.pet)); }
}
