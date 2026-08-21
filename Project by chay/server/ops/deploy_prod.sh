#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="/var/www/chay-source"
WEB_ROOT="/var/www/chay"
API_ROOT="/var/www/chay-api"
NGINX_CONF="/etc/nginx/sites-available/chay.occochi.ru"
ENV_FILE="/etc/chay-api.env"
PROJECT_DIR="$SOURCE_DIR/Project by chay"
SHA="$(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
WEB_RELEASE="$WEB_ROOT/releases/$SHA"
API_RELEASE="$API_ROOT/releases/$SHA"
OLD_WEB=""
OLD_API=""
if [[ -L "$WEB_ROOT/current" ]]; then OLD_WEB="$(readlink -f "$WEB_ROOT/current" 2>/dev/null || true)"; fi
if [[ -L "$API_ROOT/current" ]]; then OLD_API="$(readlink -f "$API_ROOT/current" 2>/dev/null || true)"; fi
STAMP="$(date +%Y%m%d-%H%M%S)"
NGINX_BACKUP="$NGINX_CONF.before-chay-api-$STAMP"

rollback() {
  local code=$?
  if [[ -n "$OLD_WEB" && -d "$OLD_WEB" ]]; then ln -sfn "$OLD_WEB" "$WEB_ROOT/current"; fi
  if [[ -n "$OLD_API" && -d "$OLD_API" ]]; then
    ln -sfn "$OLD_API" "$API_ROOT/current"
    systemctl restart chay-api >/dev/null 2>&1 || true
  elif [[ -L "$API_ROOT/current" ]]; then
    unlink "$API_ROOT/current"
    systemctl stop chay-api >/dev/null 2>&1 || true
  fi
  if [[ -f "$NGINX_BACKUP" ]]; then cp -a "$NGINX_BACKUP" "$NGINX_CONF"; nginx -t >/dev/null 2>&1 && systemctl reload nginx || true; fi
  echo "DEPLOY=rolled-back"
  exit "$code"
}
trap rollback ERR

test "$SHA" = "$(git -C "$SOURCE_DIR" rev-parse --short HEAD)"
test -f "$PROJECT_DIR/server/src/production-server.js"
test -f "$PROJECT_DIR/index.html"

if ! id chay >/dev/null 2>&1; then useradd --system --home "$API_ROOT" --shell /usr/sbin/nologin chay; fi
install -d -o chay -g chay "$API_ROOT" "$API_ROOT/releases" "$API_ROOT/.npm"
install -d "$WEB_ROOT/releases"

if ! sudo -u postgres psql -Atqc "select 1 from pg_roles where rolname='chay_app'" | grep -qx 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "create role chay_app with login" >/dev/null
fi
DB_PASSWORD=""
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
  DB_PASSWORD="${DATABASE_URL#postgresql://chay_app:}"
  DB_PASSWORD="${DB_PASSWORD%%@*}"
  if ! PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U chay_app -d chay -Atqc 'select current_user' 2>/dev/null | grep -qx chay_app; then DB_PASSWORD=""; fi
fi
if [[ -z "$DB_PASSWORD" ]]; then
  DB_PASSWORD="$(openssl rand -hex 24)"
  sudo -u postgres psql -v ON_ERROR_STOP=1 -v role_password="$DB_PASSWORD" <<'SQL' >/dev/null
alter role chay_app with login password :'role_password';
SQL
fi
if ! sudo -u postgres psql -Atqc "select 1 from pg_database where datname='chay'" | grep -qx 1; then
  sudo -u postgres createdb -O chay_app chay
fi
printf 'PORT=4410\nDATABASE_URL=postgresql://chay_app:%s@127.0.0.1:5432/chay\nSESSION_DAYS=30\nTRUST_PROXY=1\n' "$DB_PASSWORD" > "$ENV_FILE"
chown root:chay "$ENV_FILE"
chmod 640 "$ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U chay_app -d chay -Atqc 'select current_user' | grep -qx chay_app
sudo -u postgres psql -d chay -v ON_ERROR_STOP=1 -f "$PROJECT_DIR/server/sql/001_production.sql" >/var/log/chay-migration.log

if [[ -d "$API_RELEASE" && ! -f "$API_RELEASE/node_modules/pg/package.json" ]]; then
  mv "$API_RELEASE" "$API_RELEASE.failed-$STAMP"
fi
if [[ ! -d "$API_RELEASE" ]]; then
  install -d -o chay -g chay "$API_RELEASE"
  cp -a "$PROJECT_DIR/server/package.json" "$PROJECT_DIR/server/package-lock.json" "$PROJECT_DIR/server/src" "$API_RELEASE/"
  chown -R chay:chay "$API_RELEASE"
  sudo -u chay npm --cache "$API_ROOT/.npm" --prefix "$API_RELEASE" ci --omit=dev --ignore-scripts >/var/log/chay-npm-install.log
fi
ln -sfn "$API_RELEASE" "$API_ROOT/current"

install -m 0644 "$PROJECT_DIR/server/ops/chay-api.service" /etc/systemd/system/chay-api.service
systemctl daemon-reload
systemctl enable chay-api >/dev/null
systemctl restart chay-api
for _ in {1..20}; do
  if curl -fsS http://127.0.0.1:4410/api/health >/dev/null; then break; fi
  sleep 1
done
curl -fsS http://127.0.0.1:4410/api/health | grep -q '"service":"chay-api"'

create_initial_user() {
  local login="$1" role="$2" name="$3" label="$4" password
  if sudo -u postgres psql -d chay -Atqc "select 1 from chay_users where login='$login'" | grep -qx 1; then return; fi
  password="$(openssl rand -hex 16)"
  sudo -u chay env DATABASE_URL="$DATABASE_URL" node "$API_RELEASE/src/create-user.js" "$login" "$password" "$role" "$name" >/dev/null
  echo "${label}_LOGIN=$login"
  echo "${label}_PASSWORD=$password"
}
create_initial_user owner owner "Владелец Чайной истории" OWNER
create_initial_user manager admin "Управляющая Чайной истории" MANAGER
create_initial_user teamaster master "Чайный мастер" MASTER

if [[ ! -d "$WEB_RELEASE" ]]; then
  install -d "$WEB_RELEASE"
  cp -a "$PROJECT_DIR/index.html" "$PROJECT_DIR/manifest.webmanifest" "$PROJECT_DIR/sw.js" "$PROJECT_DIR/assets" "$PROJECT_DIR/img" "$PROJECT_DIR/kp" "$WEB_RELEASE/"
fi

cp -a "$NGINX_CONF" "$NGINX_BACKUP"
if ! grep -q 'location /api/' "$NGINX_CONF"; then
  awk '
    { print }
    !inserted && /charset utf-8;/ {
      print ""
      print "    location /api/ {"
      print "        proxy_pass http://127.0.0.1:4410;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_read_timeout 30s;"
      print "        client_max_body_size 128k;"
      print "    }"
      inserted=1
    }
  ' "$NGINX_CONF" > "$NGINX_CONF.tmp"
  mv "$NGINX_CONF.tmp" "$NGINX_CONF"
fi
nginx -t
ln -sfn "$WEB_RELEASE" "$WEB_ROOT/current"
systemctl reload nginx
sleep 2

curl -fsS --noproxy '*' --resolve chay.occochi.ru:443:127.0.0.1 https://chay.occochi.ru/api/health | grep -q '"service":"chay-api"'
curl -fsS --noproxy '*' --resolve chay.occochi.ru:443:127.0.0.1 https://chay.occochi.ru/ | grep -q 'assets/js/api.js'
curl -fsS --noproxy '*' --resolve chay.occochi.ru:443:127.0.0.1 https://chay.occochi.ru/kp/ | grep -q '30 000'

trap - ERR
echo "DEPLOY=ok"
echo "SHA=$SHA"
echo "API=$(systemctl is-active chay-api)"
