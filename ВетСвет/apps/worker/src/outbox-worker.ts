export type PendingOutboxEvent = { id: string; eventName: string; aggregateType: string; aggregateId: string; payload: Record<string, unknown>; attempts: number };

export interface OutboxStore {
  claim(limit: number): Promise<PendingOutboxEvent[]>;
  markPublished(eventId: string): Promise<void>;
  markFailed(eventId: string, error: string): Promise<void>;
}

export interface DomainSubscriber {
  supports(eventName: string): boolean;
  handle(event: PendingOutboxEvent): Promise<void>;
}

/** A failed integration never rolls back the command that created the event.
 * It stays observable and retryable in the outbox. */
export class OutboxWorker {
  constructor(private readonly store: OutboxStore, private readonly subscribers: readonly DomainSubscriber[]) {}
  async process(limit = 25): Promise<{ published: number; failed: number; ignored: number }> {
    const events = await this.store.claim(limit); let published = 0; let failed = 0; let ignored = 0;
    for (const event of events) {
      const targets = this.subscribers.filter((subscriber) => subscriber.supports(event.eventName));
      if (targets.length === 0) { await this.store.markPublished(event.id); ignored += 1; continue; }
      try { for (const target of targets) await target.handle(event); await this.store.markPublished(event.id); published += 1; }
      catch (error) { await this.store.markFailed(event.id, error instanceof Error ? error.message : 'Unknown worker error'); failed += 1; }
    }
    return { published, failed, ignored };
  }
}
