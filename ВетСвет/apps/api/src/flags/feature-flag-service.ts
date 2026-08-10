import { DomainError } from '../core/errors';
import type { CommandMeta } from '../core/types';
import { AccessService } from '../identity/access-service';

const protectedPrefixes = ['emergency.', 'clinical.', 'payment.', 'consent.', 'privacy.'];
export class FeatureFlagService {
  private readonly flags = new Map<string, boolean>();
  constructor(private readonly access: AccessService) {}
  set(name: string, enabled: boolean, meta: CommandMeta): void {
    this.access.require(meta.actor, 'organization:manage'); if (!/^[a-z0-9_.-]{3,100}$/i.test(name)) throw new DomainError('VALIDATION', 'Feature flag name is invalid.');
    if (protectedPrefixes.some((prefix) => name.startsWith(prefix))) throw new DomainError('FORBIDDEN', 'Safety-critical behavior cannot be changed by an experiment flag.'); this.flags.set(`${meta.actor.organizationId}:${name}`, enabled);
  }
  enabled(organizationId: string, name: string): boolean { return this.flags.get(`${organizationId}:${name}`) ?? false; }
}
