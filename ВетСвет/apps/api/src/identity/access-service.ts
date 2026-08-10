import { randomUUID } from 'node:crypto';
import { permissionsForRole, type Permission, type StaffRole } from '../../../../packages/contracts/src/access';
import { DomainError } from '../core/errors';
import type { Actor, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';

export type StaffMembership = {
  id: UUID;
  organizationId: UUID;
  userId: UUID;
  role: StaffRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  createdAt: ISODateTime;
};

/** Server-side authorization gate. UI visibility is never authorization. */
export class AccessService {
  readonly memberships = new Map<UUID, StaffMembership>();

  bootstrapOwner(actor: Actor, now = new Date()): StaffMembership {
    const existing = [...this.memberships.values()].find((membership) => membership.organizationId === actor.organizationId && membership.userId === actor.userId && membership.role === 'ORGANIZATION_OWNER');
    if (existing) return existing;
    const membership: StaffMembership = { id: randomUUID(), organizationId: actor.organizationId, userId: actor.userId, role: 'ORGANIZATION_OWNER', status: 'ACTIVE', createdAt: iso(now) };
    this.memberships.set(membership.id, membership);
    return membership;
  }

  grantMembership(input: { userId: UUID; role: StaffRole }, actor: Actor, now = new Date()): StaffMembership {
    this.require(actor, 'organization:manage');
    const membership: StaffMembership = { id: randomUUID(), organizationId: actor.organizationId, userId: input.userId, role: input.role, status: 'ACTIVE', createdAt: iso(now) };
    this.memberships.set(membership.id, membership);
    return membership;
  }

  require(actor: Actor, permission: Permission): void {
    const membership = [...this.memberships.values()].find((candidate) => candidate.organizationId === actor.organizationId && candidate.userId === actor.userId && candidate.status === 'ACTIVE');
    if (!membership || !permissionsForRole(membership.role).includes(permission)) throw new DomainError('FORBIDDEN', 'You do not have permission to perform this action.');
  }
}
