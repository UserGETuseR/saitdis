# Project by Chay — production notes

Public URL: `https://chay.occochi.ru`

## Runtime

The current application is a static PWA. It does not need a Node.js process on
the server. Nginx serves `index.html`, `assets/`, `img/`, the manifest and the
service worker.

## Data boundary

`assets/js/config.js` currently selects `backend: "local"`. Accounts, orders,
inventory and shifts are therefore stored only in the current browser's
`localStorage`. This is suitable for a demonstration, but it is not a shared or
secure production database.

The repository contains a Supabase schema and bridge skeleton, but enabling it
requires a real Supabase project, Row Level Security verification and replacing
the local authentication path. No private or service-role key belongs in this
repository.

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

This keeps local launch scripts, tests and database notes outside the public
document root.
