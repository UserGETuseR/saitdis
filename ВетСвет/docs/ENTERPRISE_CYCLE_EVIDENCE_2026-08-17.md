# Enterprise cycle evidence — 2026-08-17

This document records the executable completion boundary for the six priority cycles. It does not treat a static card or a successful HTTP redirect as completion.

| Cycle | Interface and API | Persistent result | Restart-safe continuation |
| --- | --- | --- | --- |
| Owner and pet | Staff workspace and client cabinet create and edit owners, pets, caregivers, files and consents | Organization-scoped owner, pet, relation, file, consent and memory records with duplicate candidates | Dashboard and timeline are rebuilt from PostgreSQL |
| Smart booking | Site, client cabinet and Telegram select service/resource/window; staff confirms, moves, cancels and records no-show | Holds, appointments, reminders, waitlist offers, invoices and audit events | Expired holds and scheduled reminders are recovered by persisted state |
| Veterinary encounter | Clinical workspace captures complaint, anamnesis, vitals, SOAP, diagnoses, procedures and prescriptions | Versioned encounter with optimistic version, immutable signature, invoice, discharge document and follow-up | Signed records cannot be overwritten; amendments create a new version |
| Unified inbox | Client cabinet and Telegram feed the same staff queue; staff classifies, assigns, replies and resolves | Thread, messages, SLA, assignee, outcome, audit and follow-up task | Open conversations and SLA deadlines are selected from PostgreSQL |
| Client application | Pets, booking, live visit stage, invoices, documents, clinical results, recommendations and messages | Every screen reads organization-scoped production records | Reload and a service restart reconstruct the same state |
| Reliable platform | Role checks, request limits, security headers, health and audit endpoints, release and smoke scripts | Prisma baseline and audit/outbox records | Backup is mandatory before migration; service health and protected routes are verified after restart |

## Verification commands

```bash
npm run test:all
prisma validate
bash ops/verify_production.sh
```

The production-channel integration test requires an isolated PostgreSQL database. It explicitly reports `skipped` when `DATABASE_URL` is absent instead of presenting an environment failure as a product regression.

External acquiring, fiscal receipt providers, SMS delivery and remote object storage remain adapters that require signed provider contracts and production credentials. Their absence must not be presented as an automatically verified payment or fiscal operation.
