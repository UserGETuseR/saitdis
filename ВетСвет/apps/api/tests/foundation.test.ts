import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/core/errors';
import type { CommandMeta } from '../src/core/types';
import { createFoundation } from '../src/foundation';

const at = new Date('2026-08-10T08:00:00.000Z');
function command(organizationId: string, key: string): CommandMeta {
  return { actor: { userId: 'owner-user', organizationId, source: 'STAFF_APP' }, idempotencyKey: key, correlationId: `trace-${key}`, now: at };
}

describe('VetSvet platform foundation', () => {
  it('creates organization/location, owner and pet with auditable events', () => {
    const app = createFoundation();
    app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
    const location = app.organizations.createLocation({ name: 'Главная клиника', timezone: 'Europe/Moscow' }, command('org-a', 'create-location'));
    const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова', phone: '+79990000000' }, command('org-a', 'create-owner'));
    const pet = app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-a', 'create-pet'));

    expect(location.organizationId).toBe('org-a');
    expect(app.ownerPets.petHistoryFor(owner.id, command('org-a', 'read-pets'))).toEqual([pet]);
    expect(app.journal.events.map((event) => event.eventName)).toEqual(['organization.created', 'location.created', 'owner.created', 'pet.created']);
    expect(app.journal.audits.every((audit) => audit.organizationId === 'org-a')).toBe(true);
  });

  it('does not create duplicate owner or duplicate outbox event on retry', () => {
    const app = createFoundation();
    app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org'));
    const initial = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'retry-owner'));
    const retry = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'retry-owner'));

    expect(retry).toBe(initial);
    expect(app.ownerPets.owners.size).toBe(1);
    expect(app.journal.events.filter((event) => event.eventName === 'owner.created')).toHaveLength(1);
  });

  it('prevents cross-organization access to an owner and pet', () => {
    const app = createFoundation();
    app.organizations.createOrganization({ legalName: 'ООО ВетСвет', displayName: 'Вет*Свет' }, command('org-a', 'create-org-a'));
    app.organizations.createOrganization({ legalName: 'ООО Другая клиника', displayName: 'Другая' }, command('org-b', 'create-org-b'));
    const owner = app.ownerPets.createOwner({ fullName: 'Анна Петрова' }, command('org-a', 'create-owner'));

    expect(() => app.ownerPets.createPet({ ownerId: owner.id, name: 'Мишка', species: 'DOG' }, command('org-b', 'steal-pet'))).toThrow(new DomainError('NOT_FOUND', 'Owner is not available in this organization.'));
    expect(() => app.ownerPets.petHistoryFor(owner.id, command('org-b', 'steal-read'))).toThrow(/Owner is not available/);
  });
});
