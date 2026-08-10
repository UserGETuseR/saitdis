import type { UUID } from '../core/types';
import { AuditOutbox, type OutboxEvent } from '../platform/audit-outbox';

/** Read model only: source-of-truth stays in the owning domain. */
export class TimelineService {
  constructor(private readonly journal: AuditOutbox) {}
  forPet(organizationId: UUID, petId: UUID): readonly OutboxEvent[] {
    return this.journal.events.filter((event) => event.organizationId === organizationId && event.payload.petId === petId).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
}
