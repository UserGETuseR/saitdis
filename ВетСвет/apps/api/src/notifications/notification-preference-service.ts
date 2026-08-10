import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, UUID } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type NotificationPreference = { id: UUID; organizationId: UUID; ownerId: UUID; channel: 'TELEGRAM' | 'SMS' | 'EMAIL'; category: 'APPOINTMENT' | 'CARE_PLAN' | 'PAYMENT' | 'MARKETING'; enabled: boolean };

export class NotificationPreferenceService {
  readonly preferences = new Map<string, NotificationPreference>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  set(input: Omit<NotificationPreference, 'id' | 'organizationId'>, meta: CommandMeta): NotificationPreference {
    this.access.require(meta.actor, 'owner:write');
    const key = `${meta.actor.organizationId}:${input.ownerId}:${input.channel}:${input.category}`;
    const preference: NotificationPreference = { id: this.preferences.get(key)?.id ?? randomUUID(), organizationId: meta.actor.organizationId, ...input };
    this.preferences.set(key, preference);
    this.journal.record(meta, { action: 'notification_preference.saved', aggregateType: 'NotificationPreference', aggregateId: preference.id, metadata: { category: preference.category, enabled: preference.enabled } }, { eventName: 'notification_preference.saved', aggregateType: 'NotificationPreference', aggregateId: preference.id, payload: { ownerId: preference.ownerId } });
    return preference;
  }
}
