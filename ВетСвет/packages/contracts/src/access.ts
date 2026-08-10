/**
 * Shared authorization vocabulary. The server is the only authority that
 * evaluates these permissions; clients use them solely to shape affordances.
 */
export const staffRoles = [
  'ORGANIZATION_OWNER',
  'MANAGER',
  'RECEPTION',
  'GROOMER',
  'VETERINARIAN',
  'VET_ASSISTANT',
  'INVENTORY',
] as const;

export type StaffRole = (typeof staffRoles)[number];

export const permissions = [
  'organization:manage',
  'location:manage',
  'owner:read',
  'owner:write',
  'pet:read',
  'pet:write',
  'appointment:read',
  'appointment:write',
  'clinical:read',
  'clinical:write',
  'grooming:read',
  'grooming:write',
  'finance:read',
  'finance:write',
  'audit:read',
] as const;

export type Permission = (typeof permissions)[number];

const rolePermissionMap: Record<StaffRole, readonly Permission[]> = {
  ORGANIZATION_OWNER: permissions,
  MANAGER: ['location:manage', 'owner:read', 'owner:write', 'pet:read', 'pet:write', 'appointment:read', 'appointment:write', 'finance:read', 'audit:read'],
  RECEPTION: ['owner:read', 'owner:write', 'pet:read', 'pet:write', 'appointment:read', 'appointment:write', 'finance:read'],
  GROOMER: ['owner:read', 'pet:read', 'grooming:read', 'grooming:write', 'appointment:read'],
  VETERINARIAN: ['owner:read', 'pet:read', 'appointment:read', 'clinical:read', 'clinical:write'],
  VET_ASSISTANT: ['owner:read', 'pet:read', 'appointment:read', 'clinical:read', 'clinical:write'],
  INVENTORY: [],
};

export function permissionsForRole(role: StaffRole): readonly Permission[] {
  return rolePermissionMap[role];
}
