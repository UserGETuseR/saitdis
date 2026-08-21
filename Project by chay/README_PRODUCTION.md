# Project by Chay — production notes

Public URL: `https://chay.occochi.ru`

## Runtime

Nginx serves the public PWA and proxies `/api/` to a dedicated Node.js service
on `127.0.0.1:4410`. PostgreSQL stores accounts, protected sessions, orders,
inventory, shifts, messages, staff requests, reports, certificates and audit
events. The API service is described by `server/ops/chay-api.service`.

## Data boundary

`assets/js/config.js` selects `backend: "auto"`. On production the same-origin
API becomes the source of truth. A local static launch automatically falls back
to browser-only demo data; this fallback must not be confused with production.

No database password or private key belongs in Git. Production secrets live in
`/etc/chay-api.env` with mode `0600`.

## Production checks

- `GET /api/health` must return `{"ok":true,"service":"chay-api"}`.
- `systemctl is-active chay-api` must return `active`.
- Registration always creates a `client`; only an admin/owner can grant staff roles.
- Passwords use salted scrypt hashes. Browser sessions are `Secure`, `HttpOnly`
  and `SameSite=Lax`; every privileged mutation is written to the audit log.
- The local fallback is intentionally not an offline implementation. Offline
  behavior remains a separate product stage, as agreed.

## Release layout

The server keeps immutable releases under `/var/www/chay/releases/<git-sha>`.
`/var/www/chay/current` points to the active release. The Nginx source template
is `ops/chay.occochi.ru.nginx`.

Only public runtime files are copied into a release:

- `index.html`
- `manifest.webmanifest`
- `sw.js`
- `assets/`
- `img/`
- `kp/`

The API release is stored separately under `/var/www/chay-api/releases/<git-sha>`
and contains `server/src`, `server/package.json`, `server/package-lock.json` and
installed production dependencies.

This keeps local launch scripts, tests and database notes outside the public
document root.
