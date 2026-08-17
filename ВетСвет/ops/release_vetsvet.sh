#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${VETSVET_APP_DIR:-/var/www/vetsvet}"
ENV_FILE="${VETSVET_ENV_FILE:-/etc/vetsvet.env}"
SERVICE="${VETSVET_SERVICE:-vetsvet}"
BACKUP_DIR="${VETSVET_BACKUP_DIR:-/var/backups/vetsvet}"
HEALTH_URL="${VETSVET_HEALTH_URL:-http://127.0.0.1:4400/healthz}"

test -f "$ENV_FILE"
test -d "$APP_DIR/.git"
mkdir -p "$BACKUP_DIR"

set -a
. "$ENV_FILE"
set +a
test -n "${DATABASE_URL:-}"

revision="$(git -C "$APP_DIR" rev-parse --short HEAD)"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BACKUP_DIR/vetsvet-${timestamp}-${revision}.dump"
database_url="${DATABASE_URL%%\?*}"

pg_dump "$database_url" --format=custom --file="$backup"
test -s "$backup"

cd "$APP_DIR/ВетСвет"
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate
systemctl restart "$SERVICE"

for attempt in {1..12}; do
  if curl --fail --silent --show-error "$HEALTH_URL"; then
    printf '\nrelease=%s backup=%s service=%s\n' "$revision" "$backup" "$SERVICE"
    exit 0
  fi
  sleep 2
done

journalctl -u "$SERVICE" -n 100 --no-pager
exit 1
