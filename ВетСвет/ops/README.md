# Production platform baseline

`docker-compose.yml` provides only local/infrastructure development dependencies: PostgreSQL 16, Redis 7 and MinIO-compatible private object storage. It does **not** expose them publicly and does not contain production secrets.

Before a production release:

1. Use managed or hardened services with encrypted backups, monitoring and tested restore procedures.
2. Set all credentials through the host secret manager, never through source control.
3. Run Prisma migrations against a reviewed target database and verify backup/restore.
4. Configure TLS, reverse proxy, webhook URLs and worker health monitoring.
5. Enable each payment, fiscal, Telegram, SMS/email or AI adapter only after provider credentials, legal review, signatures and failure handling are tested.
