import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { BookingService } from '../booking/booking-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type DentalChartState = 'DRAFT' | 'FINALIZED' | 'AMENDED';
export type ToothFinding = { toothCode: string; condition: 'HEALTHY' | 'PLAQUE' | 'GINGIVITIS' | 'FRACTURE' | 'MISSING' | 'OTHER'; note?: string; recordedBy: UUID; recordedAt: ISODateTime };
export type DentalProcedure = { id: UUID; toothCodes: string[]; name: string; status: 'PLANNED' | 'PERFORMED' | 'CANCELLED'; note?: string; performedBy?: UUID; performedAt?: ISODateTime };
export type DentalChart = { id: UUID; organizationId: UUID; ownerId: UUID; petId: UUID; version: number; state: DentalChartState; findings: ToothFinding[]; procedures: DentalProcedure[]; clinicianId: UUID; createdAt: ISODateTime; finalizedAt?: ISODateTime; amendmentOfId?: UUID };

/** A structured tooth chart prevents opaque free-text records and keeps amendments traceable. */
export class DentalService {
  readonly charts = new Map<UUID, DentalChart>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService, private readonly booking: BookingService) {}
  createChart(input: { ownerId: UUID; petId: UUID }, meta: CommandMeta): DentalChart {
    this.access.require(meta.actor, 'clinical:write'); this.assertPatient(input.ownerId, input.petId, meta.actor.organizationId);
    const now = meta.now ?? new Date(); const chart: DentalChart = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, version: 1, state: 'DRAFT', findings: [], procedures: [], clinicianId: meta.actor.userId, createdAt: iso(now) };
    this.charts.set(chart.id, chart); this.record(meta, chart, 'dental_chart.created', {}, now); return chart;
  }
  recordFinding(chartId: UUID, input: { toothCode: string; condition: ToothFinding['condition']; note?: string }, meta: CommandMeta): DentalChart {
    this.access.require(meta.actor, 'clinical:write'); const chart = this.editable(chartId, meta); const toothCode = this.toothCode(input.toothCode);
    const now = meta.now ?? new Date(); const finding: ToothFinding = { toothCode, condition: input.condition, note: input.note?.trim() || undefined, recordedBy: meta.actor.userId, recordedAt: iso(now) };
    const index = chart.findings.findIndex((item) => item.toothCode === toothCode); if (index >= 0) chart.findings[index] = finding; else chart.findings.push(finding);
    this.record(meta, chart, 'dental_chart.finding_recorded', { toothCode, condition: input.condition }, now); return chart;
  }
  planProcedure(chartId: UUID, input: { toothCodes: string[]; name: string }, meta: CommandMeta): DentalProcedure {
    this.access.require(meta.actor, 'clinical:write'); const chart = this.editable(chartId, meta); const toothCodes = [...new Set(input.toothCodes.map((code) => this.toothCode(code)))];
    if (!toothCodes.length || !input.name.trim()) throw new DomainError('VALIDATION', 'At least one tooth and a procedure name are required.');
    const procedure: DentalProcedure = { id: randomUUID(), toothCodes, name: input.name.trim(), status: 'PLANNED' }; chart.procedures.push(procedure); this.record(meta, chart, 'dental_procedure.planned', { procedureId: procedure.id, toothCodes }); return procedure;
  }
  performProcedure(chartId: UUID, procedureId: UUID, note: string, meta: CommandMeta): DentalProcedure {
    this.access.require(meta.actor, 'clinical:write'); const chart = this.editable(chartId, meta); const procedure = chart.procedures.find((item) => item.id === procedureId);
    if (!procedure) throw new DomainError('NOT_FOUND', 'Dental procedure is not available in this chart.'); if (procedure.status !== 'PLANNED' || !note.trim()) throw new DomainError('CONFLICT', 'Only a planned procedure with a complete note can be performed.');
    const now = meta.now ?? new Date(); procedure.status = 'PERFORMED'; procedure.note = note.trim(); procedure.performedBy = meta.actor.userId; procedure.performedAt = iso(now); this.record(meta, chart, 'dental_procedure.performed', { procedureId: procedure.id }, now); return procedure;
  }
  finalizeChart(chartId: UUID, meta: CommandMeta): DentalChart {
    this.access.require(meta.actor, 'clinical:write'); const chart = this.editable(chartId, meta);
    if (!chart.findings.length) throw new DomainError('VALIDATION', 'At least one documented tooth finding is required before finalizing a dental chart.'); if (chart.procedures.some((item) => item.status === 'PLANNED')) throw new DomainError('CONFLICT', 'Resolve planned dental procedures before finalizing the chart.');
    const now = meta.now ?? new Date(); chart.state = 'FINALIZED'; chart.finalizedAt = iso(now); this.record(meta, chart, 'dental_chart.finalized', { version: chart.version }, now); return chart;
  }
  amendChart(chartId: UUID, meta: CommandMeta): DentalChart {
    this.access.require(meta.actor, 'clinical:write'); const original = this.get(chartId, meta.actor.organizationId); if (original.state !== 'FINALIZED') throw new DomainError('CONFLICT', 'Only a finalized dental chart can be amended.');
    const now = meta.now ?? new Date(); original.state = 'AMENDED'; const amendment: DentalChart = { ...original, id: randomUUID(), version: original.version + 1, state: 'DRAFT', clinicianId: meta.actor.userId, findings: [...original.findings], procedures: original.procedures.map((item) => ({ ...item, toothCodes: [...item.toothCodes] })), createdAt: iso(now), finalizedAt: undefined, amendmentOfId: original.id };
    this.charts.set(amendment.id, amendment); this.record(meta, amendment, 'dental_chart.amendment_started', { amendmentOfId: original.id, version: amendment.version }, now); return amendment;
  }
  get(chartId: UUID, organizationId: UUID): DentalChart { const chart = this.charts.get(chartId); if (!chart || chart.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Dental chart is not available in this organization.'); return chart; }
  private editable(chartId: UUID, meta: CommandMeta): DentalChart { const chart = this.get(chartId, meta.actor.organizationId); if (chart.state !== 'DRAFT' || chart.clinicianId !== meta.actor.userId) throw new DomainError('CONFLICT', 'Only the responsible clinician can edit an open dental chart.'); return chart; }
  private toothCode(value: string): string { const code = value.trim().toUpperCase(); if (!/^[A-Z0-9-]{1,12}$/.test(code)) throw new DomainError('VALIDATION', 'A compact standardized tooth code is required.'); return code; }
  private assertPatient(ownerId: UUID, petId: UUID, organizationId: UUID): void { const owner = this.booking.ownerPets.owners.get(ownerId); const pet = this.booking.ownerPets.pets.get(petId); const relation = this.booking.ownerPets.relations.some((item) => item.organizationId === organizationId && item.ownerId === ownerId && item.petId === petId); if (!owner || !pet || !relation || owner.organizationId !== organizationId || pet.organizationId !== organizationId) throw new DomainError('NOT_FOUND', 'Owner and patient are not available in this organization.'); }
  private record(meta: CommandMeta, chart: DentalChart, action: string, metadata: Record<string, unknown>, now = meta.now ?? new Date()): void { this.journal.record(meta, { action, aggregateType: 'DentalChart', aggregateId: chart.id, metadata }, { eventName: action, aggregateType: 'DentalChart', aggregateId: chart.id, payload: { petId: chart.petId } }, now); }
}
