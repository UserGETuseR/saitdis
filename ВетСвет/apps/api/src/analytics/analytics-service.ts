import { DomainError } from '../core/errors';
import type { ISODateTime } from '../core/types';

export type AnalyticsEvent = { name: string; occurredAt: ISODateTime; properties: Record<string, string | number | boolean> };
const forbiddenKeys = new Set(['name', 'fullName', 'phone', 'email', 'telegramUserId', 'ownerId', 'petId', 'message', 'medicalNotes']);
/** Analytics answers product questions, never becomes a second PII database. */
export class AnalyticsService {
  readonly events: AnalyticsEvent[] = [];
  track(name: string, properties: AnalyticsEvent['properties'], now = new Date()): AnalyticsEvent {
    if (!/^[a-z0-9_.-]{3,80}$/i.test(name) || Object.keys(properties).some((key) => forbiddenKeys.has(key))) throw new DomainError('VALIDATION', 'Analytics event is invalid or contains restricted personal data.');
    const event = { name, properties, occurredAt: now.toISOString() }; this.events.push(event); return event;
  }
}
