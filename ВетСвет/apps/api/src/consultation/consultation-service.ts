import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { CatalogService } from '../catalog/catalog-service';
import { FinanceService } from '../finance/finance-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type Consultation = { id: UUID; organizationId: UUID; appointmentId: UUID; ownerId: UUID; petId: UUID; question: string; state: 'PENDING_PAYMENT' | 'READY_FOR_REVIEW' | 'IN_REVIEW' | 'ANSWERED' | 'CLOSED'; invoiceId: UUID; response?: string; clinicianId?: UUID; createdAt: ISODateTime; answeredAt?: ISODateTime };

export class ConsultationService {
  readonly consultations = new Map<UUID, Consultation>();
  private readonly byAppointment = new Map<UUID, UUID>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService, private readonly catalog: CatalogService, private readonly finance: FinanceService) {}

  requestPaidConsultation(input: { appointmentId: UUID; question: string }, meta: CommandMeta): Consultation {
    this.access.require(meta.actor, 'appointment:write');
    const appointment = this.booking.appointments.get(input.appointmentId);
    if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available in this organization.');
    if (this.byAppointment.has(appointment.id)) return this.consultations.get(this.byAppointment.get(appointment.id)!)!;
    const service = this.catalog.services.get(this.catalog.getVariant(appointment.variantId, meta.actor.organizationId).serviceId);
    if (service?.kind !== 'CONSULTATION') throw new DomainError('VALIDATION', 'Paid consultation requires a consultation appointment.');
    if (!input.question.trim()) throw new DomainError('VALIDATION', 'Describe the question for the specialist.');
    const invoice = this.finance.issueServiceInvoice(appointment.id, meta);
    const now = meta.now ?? new Date();
    const consultation: Consultation = { id: randomUUID(), organizationId: meta.actor.organizationId, appointmentId: appointment.id, ownerId: appointment.ownerId, petId: appointment.petId, question: input.question.trim(), state: 'PENDING_PAYMENT', invoiceId: invoice.id, createdAt: iso(now) };
    this.consultations.set(consultation.id, consultation); this.byAppointment.set(appointment.id, consultation.id);
    this.journal.record(meta, { action: 'consultation.requested', aggregateType: 'Consultation', aggregateId: consultation.id, metadata: { appointmentId: appointment.id } }, { eventName: 'consultation.requested', aggregateType: 'Consultation', aggregateId: consultation.id, payload: { invoiceId: invoice.id, petId: consultation.petId } }, now);
    return consultation;
  }

  makeReadyForReview(consultationId: UUID, meta: CommandMeta): Consultation {
    this.access.require(meta.actor, 'finance:read');
    const consultation = this.get(consultationId, meta.actor.organizationId);
    const invoice = this.finance.invoices.get(consultation.invoiceId)!;
    if (consultation.state !== 'PENDING_PAYMENT' || invoice.state !== 'PAID') throw new DomainError('CONFLICT', 'Consultation is available only after confirmed payment.');
    consultation.state = 'READY_FOR_REVIEW';
    this.journal.record(meta, { action: 'consultation.ready_for_review', aggregateType: 'Consultation', aggregateId: consultation.id, metadata: {} }, { eventName: 'consultation.ready_for_review', aggregateType: 'Consultation', aggregateId: consultation.id, payload: { petId: consultation.petId } });
    return consultation;
  }

  answer(consultationId: UUID, response: string, meta: CommandMeta): Consultation {
    this.access.require(meta.actor, 'clinical:write');
    const consultation = this.get(consultationId, meta.actor.organizationId);
    if (consultation.state !== 'READY_FOR_REVIEW' || !response.trim()) throw new DomainError('CONFLICT', 'Only a paid consultation ready for review can receive a response.');
    const now = meta.now ?? new Date(); consultation.state = 'ANSWERED'; consultation.response = response.trim(); consultation.clinicianId = meta.actor.userId; consultation.answeredAt = iso(now);
    this.journal.record(meta, { action: 'consultation.answered', aggregateType: 'Consultation', aggregateId: consultation.id, metadata: { clinicianId: meta.actor.userId } }, { eventName: 'consultation.answered', aggregateType: 'Consultation', aggregateId: consultation.id, payload: { petId: consultation.petId } }, now);
    return consultation;
  }

  private get(id: UUID, organizationId: UUID): Consultation { const value = this.consultations.get(id); if (!value || value.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Consultation is not available in this organization.'); return value; }
}
