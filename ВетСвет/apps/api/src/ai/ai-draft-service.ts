import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type AiDraft = { id: UUID; organizationId: UUID; targetType: 'CLINICAL_NOTE' | 'CLIENT_REPORT' | 'MESSAGE'; targetId: UUID; provider: string; model: string; content: string; state: 'DRAFT' | 'APPROVED' | 'REJECTED'; createdAt: ISODateTime; reviewedBy?: UUID; reviewedAt?: ISODateTime };
/** AI output is a disclosed draft. It never alters a clinical record by itself. */
export class AiDraftService {
  readonly drafts = new Map<UUID, AiDraft>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  saveDraft(input: { targetType: AiDraft['targetType']; targetId: UUID; provider: string; model: string; content: string }, meta: CommandMeta): AiDraft {
    this.access.require(meta.actor, 'clinical:write'); if (!input.targetId || !input.provider.trim() || !input.model.trim() || !input.content.trim()) throw new DomainError('VALIDATION', 'AI draft provenance and content are required.');
    const now = meta.now ?? new Date(); const draft: AiDraft = { id: randomUUID(), organizationId: meta.actor.organizationId, targetType: input.targetType, targetId: input.targetId, provider: input.provider.trim(), model: input.model.trim(), content: input.content.trim(), state: 'DRAFT', createdAt: iso(now) }; this.drafts.set(draft.id, draft); this.journal.record(meta, { action: 'ai_draft.saved', aggregateType: 'AiDraft', aggregateId: draft.id, metadata: { targetType: draft.targetType, provider: draft.provider } }, { eventName: 'ai_draft.saved', aggregateType: 'AiDraft', aggregateId: draft.id, payload: {} }, now); return draft;
  }
  review(id: UUID, decision: 'APPROVED' | 'REJECTED', meta: CommandMeta): AiDraft { this.access.require(meta.actor, 'clinical:write'); const draft = this.drafts.get(id); if (!draft || draft.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'AI draft is not available in this organization.'); if (draft.state !== 'DRAFT') throw new DomainError('CONFLICT', 'AI draft was already reviewed.'); draft.state = decision; draft.reviewedBy = meta.actor.userId; draft.reviewedAt = iso(meta.now ?? new Date()); return draft; }
}
