import { randomUUID } from 'node:crypto';
import { DomainError } from '../core/errors';
import type { CommandMeta, ISODateTime, UUID } from '../core/types';
import { iso } from '../core/types';
import { AccessService } from '../identity/access-service';
import { AuditOutbox } from '../platform/audit-outbox';

export type KnowledgeArticle = { id: UUID; organizationId: UUID; title: string; slug: string; body: string; state: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; reviewedBy?: UUID; publishedAt?: ISODateTime; createdAt: ISODateTime };
export class KnowledgeService {
  readonly articles = new Map<UUID, KnowledgeArticle>();
  constructor(private readonly journal: AuditOutbox, private readonly access: AccessService) {}
  createDraft(input: { title: string; slug: string; body: string }, meta: CommandMeta): KnowledgeArticle {
    this.access.require(meta.actor, 'organization:manage'); if (!input.title.trim() || !/^[a-z0-9-]{3,100}$/i.test(input.slug) || !input.body.trim()) throw new DomainError('VALIDATION', 'Article title, URL slug and body are required.');
    const now = meta.now ?? new Date(); const article: KnowledgeArticle = { id: randomUUID(), organizationId: meta.actor.organizationId, title: input.title.trim(), slug: input.slug.toLowerCase(), body: input.body.trim(), state: 'DRAFT', createdAt: iso(now) }; this.articles.set(article.id, article); return article;
  }
  publish(id: UUID, meta: CommandMeta): KnowledgeArticle {
    this.access.require(meta.actor, 'organization:manage'); const article = this.articles.get(id); if (!article || article.organizationId !== meta.actor.organizationId) throw new DomainError('NOT_FOUND', 'Article is not available in this organization.'); if (article.state !== 'DRAFT') throw new DomainError('CONFLICT', 'Only a draft article can be published.');
    article.state = 'PUBLISHED'; article.reviewedBy = meta.actor.userId; article.publishedAt = iso(meta.now ?? new Date()); this.journal.record(meta, { action: 'knowledge_article.published', aggregateType: 'KnowledgeArticle', aggregateId: article.id, metadata: { slug: article.slug } }, { eventName: 'knowledge_article.published', aggregateType: 'KnowledgeArticle', aggregateId: article.id, payload: {} }); return article;
  }
  search(organizationId: UUID, query: string): readonly KnowledgeArticle[] { const q = query.trim().toLowerCase(); if (!q) return []; return [...this.articles.values()].filter((article) => article.organizationId === organizationId && article.state === 'PUBLISHED' && `${article.title} ${article.body}`.toLowerCase().includes(q)); }
}
