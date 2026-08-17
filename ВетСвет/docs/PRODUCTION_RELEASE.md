# Production release and recovery

## Release contract

A VetSvet release is complete only when the schema migration succeeds, the service restarts, `/healthz` answers from PostgreSQL, protected routes reject anonymous requests, and the backup made immediately before the migration is non-empty.

The normal release command on the server is:

```bash
cd /var/www/vetsvet
git pull --ff-only origin main
bash ВетСвет/ops/release_vetsvet.sh
bash ВетСвет/ops/verify_production.sh
```

`release_vetsvet.sh` reads secrets only from `/etc/vetsvet.env`, creates a custom-format PostgreSQL dump in `/var/backups/vetsvet`, applies reviewed Prisma migrations, regenerates the client, restarts `vetsvet`, and waits for database-backed health.

## One-time baseline for the existing database

The production database predates Prisma Migrate. On the first release containing `20260817000000_baseline` only:

1. Create and verify a custom-format `pg_dump` backup.
2. Apply the additive schema delta with `prisma db push --skip-generate` without `--accept-data-loss`.
3. Mark `20260817000000_baseline` applied with `prisma migrate resolve --applied 20260817000000_baseline`.
4. Run `prisma migrate status`, generate the client, restart the service, and execute `ops/verify_production.sh`.

All subsequent releases use only `prisma migrate deploy`.

## Recovery drill

Restoration is deliberately manual because it replaces database state. A privileged operator must stop the service, restore a selected verified dump into a separate recovery database first, validate organization, owner, patient, booking, encounter, inbox, invoice, document and audit counts, then approve a production cutover. The dump name and the resulting release revision belong in the incident log.

Never restore over the live database merely because `/healthz` failed; inspect the service journal and migration state first.
