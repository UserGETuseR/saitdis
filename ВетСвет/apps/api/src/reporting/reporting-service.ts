import { BookingService } from '../booking/booking-service';
import { FinanceService } from '../finance/finance-service';

export type RevenueSummary = { issuedMinor: number; paidMinor: number; invoicesIssued: number; invoicesPaid: number; currency: 'RUB' };
export type ScheduleSummary = { total: number; confirmed: number; completed: number; noShow: number; cancellationRate: number };

/** Aggregates only operational/financial facts; no owner or pet PII is emitted. */
export class ReportingService {
  constructor(private readonly booking: BookingService, private readonly finance: FinanceService) {}
  revenue(organizationId: string): RevenueSummary {
    const invoices = [...this.finance.invoices.values()].filter((invoice) => invoice.organizationId === organizationId);
    return { issuedMinor: invoices.reduce((sum, invoice) => sum + invoice.total.amountMinor, 0), paidMinor: invoices.reduce((sum, invoice) => sum + invoice.paidAmount.amountMinor, 0), invoicesIssued: invoices.length, invoicesPaid: invoices.filter((invoice) => invoice.state === 'PAID').length, currency: 'RUB' };
  }
  schedule(organizationId: string): ScheduleSummary {
    const appointments = [...this.booking.appointments.values()].filter((item) => item.organizationId === organizationId); const total = appointments.length; const cancelled = appointments.filter((item) => item.state === 'CANCELLED').length;
    return { total, confirmed: appointments.filter((item) => item.state === 'CONFIRMED').length, completed: appointments.filter((item) => item.state === 'COMPLETED').length, noShow: appointments.filter((item) => item.state === 'NO_SHOW').length, cancellationRate: total ? cancelled / total : 0 };
  }
}
