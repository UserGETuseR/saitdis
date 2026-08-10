import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type TriageDisposition = 'EMERGENCY_NOW' | 'URGENT_SAME_DAY' | 'SCHEDULED' | 'CONSULTATION' | 'NON_MEDICAL' | 'INFORMATION_ONLY' | 'OTHER';
export type TriageCase = { id: UUID; organizationId: UUID; ownerId?: UUID; petId?: UUID; source: 'PUBLIC_WEB' | 'CLIENT_WEB' | 'TELEGRAM' | 'RECEPTION' | 'WALK_IN'; complaint: string; state: 'OPEN' | 'ASSESSED' | 'ROUTED' | 'CLOSED'; disposition?: TriageDisposition; assignedStaffId?: UUID; assessedAt?: ISODateTime; createdAt: ISODateTime };

/** Triage routes a concern safely. It never diagnoses or auto-prescribes. */
export class TriageService {
  readonly cases = new Map<UUID, TriageCase>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}

  submit(input: { source: TriageCase['source']; complaint: string; ownerId?: UUID; petId?: UUID }, meta: CommandMeta): TriageCase {
    if (!input.complaint.trim()) throw new DomainError('VALIDATION', 'Describe what is happening before submitting triage.');
    const now = meta.now ?? new Date();
    const triage: TriageCase = { id: randomUUID(), organizationId: meta.actor.organizationId, ownerId: input.ownerId, petId: input.petId, source: input.source, complaint: input.complaint.trim(), state: 'OPEN', createdAt: iso(now) };
    this.cases.set(triage.id, triage);
    this.journal.record(meta, { action: 'triage.submitted', aggregateType: 'TriageCase', aggregateId: triage.id, metadata: { source: triage.source } }, { eventName: 'triage.submitted', aggregateType: 'TriageCase', aggregateId: triage.id, payload: { source: triage.source } }, now);
    return triage;
  }

  assess(caseId: UUID, input: { disposition: TriageDisposition; assignedStaffId?: UUID }, meta: CommandMeta): TriageCase {
    this.access.require(meta.actor, 'clinical:write');
    const triage = this.cases.get(caseId);
    if (!triage || triage.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Triage case is not available in this organization.');
    if (triage.state !== 'OPEN') throw new DomainError('CONFLICT', 'Triage case was already assessed.');
    const now = meta.now ?? new Date(); triage.disposition = input.disposition; triage.assignedStaffId = input.assignedStaffId; triage.assessedAt = iso(now); triage.state = 'ASSESSED';
    this.journal.record(meta, { action: 'triage.assessed', aggregateType: 'TriageCase', aggregateId: triage.id, metadata: { disposition: triage.disposition } }, { eventName: 'triage.assessed', aggregateType: 'TriageCase', aggregateId: triage.id, payload: { disposition: triage.disposition } }, now);
    return triage;
  }
}
