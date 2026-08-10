import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Precheck = { id: UUID; organizationId: UUID; appointmentId: UUID; ownerId: UUID; petId: UUID; state: 'DRAFT' | 'SUBMITTED' | 'REVIEWED'; ownerNote?: string; arrivalConfirmed: boolean; submittedAt?: ISODateTime; reviewedBy?: UUID; reviewedAt?: ISODateTime; createdAt: ISODateTime };
/** Pre-check is operational intake, never a substitute for a clinical encounter or diagnosis. */
export class PrecheckService {
  readonly checks = new Map<UUID, Precheck>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  open(appointmentId: UUID, meta: CommandMeta): Precheck { this.access.require(meta.actor, 'appointment:read'); const appointment = this.booking.appointments.get(appointmentId); if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available.'); const existing = [...this.checks.values()].find((item) => item.organizationId === meta.actor.organizationId && item.appointmentId === appointmentId); if (existing) return existing; const now = meta.now ?? new Date(); const check: Precheck = { id: randomUUID(), organizationId: meta.actor.organizationId, appointmentId, ownerId: appointment.ownerId, petId: appointment.petId, state: 'DRAFT', arrivalConfirmed: false, createdAt: iso(now) }; this.checks.set(check.id, check); return check; }
  submit(checkId: UUID, input: { arrivalConfirmed: boolean; ownerNote?: string }, meta: CommandMeta): Precheck { const check = this.get(checkId, meta.actor.organizationId); if (meta.actor.source === 'CLIENT_WEB' && meta.actor.userId !== check.ownerId) throw new DomainError('FORBIDDEN', 'A client may submit only their own pre-check.'); if (check.state !== 'DRAFT' || !input.arrivalConfirmed) throw new DomainError('CONFLICT', 'Only a draft pre-check with arrival confirmation can be submitted.'); const now = meta.now ?? new Date(); check.arrivalConfirmed = true; check.ownerNote = input.ownerNote?.trim() || undefined; check.state = 'SUBMITTED'; check.submittedAt = iso(now); this.journal.record(meta, { action: 'precheck.submitted', aggregateType: 'Precheck', aggregateId: check.id, metadata: {} }, { eventName: 'precheck.submitted', aggregateType: 'Precheck', aggregateId: check.id, payload: { petId: check.petId, appointmentId: check.appointmentId } }, now); return check; }
  review(checkId: UUID, meta: CommandMeta): Precheck { this.access.require(meta.actor, 'appointment:write'); const check = this.get(checkId, meta.actor.organizationId); if (check.state !== 'SUBMITTED') throw new DomainError('CONFLICT', 'Only a submitted pre-check can be reviewed.'); const now = meta.now ?? new Date(); check.state = 'REVIEWED'; check.reviewedBy = meta.actor.userId; check.reviewedAt = iso(now); return check; }
  private get(id: UUID, organizationId: UUID): Precheck { const item = this.checks.get(id); if (!item || item.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Pre-check is not available.'); return item; }
}
