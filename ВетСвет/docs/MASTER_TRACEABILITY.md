# VetSvet Master traceability

This document is an honest delivery ledger, not a completion claim. “Foundation-tested” means the in-memory domain contract is covered by `apps/api/tests/foundation.spec.ts`; it does not mean a production adapter is live.

| Master area | Current evidence | Remaining gate |
| --- | --- | --- |
| Organization, RBAC, audit/outbox | Foundation tests; Prisma schema | PostgreSQL repositories and migrations |
| Public, client and staff surfaces | Local launcher routes; visual staff/client/public surfaces | production auth, SSR/app build and browser visual regression |
| Booking, waitlist, finance | Foundation contracts | provider adapters, fiscal/legal flows and persistence |
| Clinical, files, consent, care | Foundation contracts | clinical repository, migration and regulated document review |
| Surgery, anesthesia, dental, hospital | guarded workflows and schemas | real UI actions, persisted aggregates and clinical validation |
| Physical operations | inventory, procurement, equipment, opaque labels/specimens | label/print provider, live stock migration and integrations |
| Telegram | secret verification, dedupe and outbox-worker tests | webhook activation and provider approval |
| Persistence | Prisma schema/client, runtime mode checks and production health refusal when PostgreSQL is unreachable | reviewed migration, local restore rehearsal, transactional repositories |
| Client auth/privacy | OTP/session domain and client self-check guard | real identity-to-owner link, secure cookies, rate limits and production session middleware |

## Non-negotiable release gates

1. Apply and verify reviewed Prisma migrations against a non-production PostgreSQL instance.
2. Replace in-memory authoritative aggregates with tenant-scoped repositories, transactionally writing audit + outbox.
3. Add authenticated browser/API tests for owner and staff role boundaries.
4. Run visual checks on desktop and mobile for all three surfaces.
5. Configure approved external providers only with credentials, legal review, retry/observability and kill switches.
6. Perform backup/restore and incident drills before any real clinical or financial data is entered.
