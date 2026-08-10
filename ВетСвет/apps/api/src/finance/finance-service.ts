import { randomUUID } from 'node:crypto';
import type { Money } from '../../../../packages/contracts/src/money';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { CatalogService } from '../catalog/catalog-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type InvoiceState = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOID' | 'REFUNDED';
export type PaymentState = 'SUCCEEDED' | 'REFUNDED' | 'FAILED';
export type InvoiceLine = { id: UUID; title: string; quantity: number; unitPrice: Money; total: Money; sourceType: 'SERVICE_VARIANT' | 'MANUAL'; sourceId?: UUID };
export type Invoice = { id: UUID; organizationId: UUID; ownerId: UUID; appointmentId?: UUID; state: InvoiceState; lines: readonly InvoiceLine[]; total: Money; paidAmount: Money; createdAt: ISODateTime };
export type Payment = { id: UUID; organizationId: UUID; invoiceId: UUID; provider: string; providerTransactionId: string; amount: Money; state: PaymentState; createdAt: ISODateTime };

export interface PaymentProviderAdapter {
  readonly name: string;
  createPaymentIntent(input: { invoiceId: UUID; amount: Money; idempotencyKey: string }): Promise<{ providerTransactionId: string; paymentUrl?: string }>;
  verifyWebhook(input: { rawBody: string; signature?: string }): Promise<{ providerTransactionId: string; amount: Money; state: 'SUCCEEDED' | 'FAILED' }>;
}

function addMoney(left: Money, right: Money): Money {
  if (left.currency !== right.currency) throw new DomainError('VALIDATION', 'Currency mismatch.');
  return { amountMinor: left.amountMinor + right.amountMinor, currency: left.currency };
}

export class FinanceService {
  readonly invoices = new Map<UUID, Invoice>();
  readonly payments = new Map<UUID, Payment>();
  private readonly invoiceByAppointment = new Map<UUID, UUID>();
  private readonly providerTransactions = new Set<string>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService, private readonly catalog: CatalogService) {}

  issueServiceInvoice(appointmentId: UUID, meta: CommandMeta): Invoice {
    this.access.require(meta.actor, 'finance:write');
    const appointment = this.booking.appointments.get(appointmentId);
    if (!appointment || appointment.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Appointment is not available in this organization.');
    const existing = this.invoiceByAppointment.get(appointment.id);
    if (existing) return this.invoices.get(existing)!;
    const variant = this.catalog.getVariant(appointment.variantId, meta.actor.organizationId);
    const now = meta.now ?? new Date();
    const line: InvoiceLine = { id: randomUUID(), title: variant.name, quantity: 1, unitPrice: variant.price, total: variant.price, sourceType: 'SERVICE_VARIANT', sourceId: variant.id };
    const invoice: Invoice = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: appointment.ownerId, appointmentId: appointment.id, state: 'ISSUED', lines: [line], total: line.total, paidAmount: { amountMinor: 0, currency: line.total.currency }, createdAt: iso(now) };
    this.invoices.set(invoice.id, invoice); this.invoiceByAppointment.set(appointment.id, invoice.id);
    this.journal.record(meta, { action: 'invoice.issued', aggregateType: 'Invoice', aggregateId: invoice.id, metadata: { appointmentId: appointment.id, totalMinor: invoice.total.amountMinor } }, { eventName: 'invoice.issued', aggregateType: 'Invoice', aggregateId: invoice.id, payload: { appointmentId: appointment.id, totalMinor: invoice.total.amountMinor } }, now);
    return invoice;
  }

  recordPayment(input: { invoiceId: UUID; provider: string; providerTransactionId: string; amount: Money; state: PaymentState }, meta: CommandMeta): Payment {
    this.access.require(meta.actor, 'finance:write');
    const invoice = this.invoices.get(input.invoiceId);
    if (!invoice || invoice.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Invoice is not available in this organization.');
    const providerKey = `${meta.actor.organizationId}:${input.provider}:${input.providerTransactionId}`;
    if (this.providerTransactions.has(providerKey)) throw new DomainError('CONFLICT', 'Provider transaction was already processed.');
    if (input.amount.currency !== invoice.total.currency || input.amount.amountMinor <= 0) throw new DomainError('VALIDATION', 'Payment amount is invalid.');
    if (input.state === 'SUCCEEDED' && input.amount.amountMinor > invoice.total.amountMinor - invoice.paidAmount.amountMinor) throw new DomainError('CONFLICT', 'Payment exceeds unpaid invoice balance.');
    const now = meta.now ?? new Date();
    const payment: Payment = { id: randomUUID(), organizationId: meta.actor.organizationId, invoiceId: invoice.id, provider: input.provider.trim(), providerTransactionId: input.providerTransactionId.trim(), amount: input.amount, state: input.state, createdAt: iso(now) };
    this.payments.set(payment.id, payment); this.providerTransactions.add(providerKey);
    if (payment.state === 'SUCCEEDED') { invoice.paidAmount = addMoney(invoice.paidAmount, payment.amount); invoice.state = invoice.paidAmount.amountMinor === invoice.total.amountMinor ? 'PAID' : 'PARTIALLY_PAID'; }
    this.journal.record(meta, { action: `payment.${payment.state.toLowerCase()}`, aggregateType: 'Payment', aggregateId: payment.id, metadata: { invoiceId: invoice.id, provider: payment.provider } }, { eventName: `payment.${payment.state.toLowerCase()}`, aggregateType: 'Payment', aggregateId: payment.id, payload: { invoiceId: invoice.id, amountMinor: payment.amount.amountMinor } }, now);
    return payment;
  }
}
