# Persistence boundary

The current local launcher intentionally starts the in-memory adapters when `DATABASE_URL` is absent. It is suitable for product exploration and contract tests, never for retaining clinical or financial records.

When `DATABASE_URL` is present, `persistence-runtime.ts` selects `POSTGRES_PRISMA`; it never silently falls back to memory. The first concrete repository covers organization and location writes. The next repositories must be introduced domain by domain with the same rules:

- tenant scoping on every lookup and write;
- one database transaction for aggregate write + audit/outbox event;
- idempotency key uniqueness at the persistence boundary;
- migration and restore rehearsal before the adapter is used for real data.

No real clinical, payment, Telegram or printer workload is pointed at PostgreSQL until those repositories and migrations are complete and independently verified.
