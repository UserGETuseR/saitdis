#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:4400}"

expect_status() {
  local expected="$1"
  local path="$2"
  local actual
  actual="$(curl --silent --output /dev/null --write-out '%{http_code}' "$BASE_URL$path")"
  test "$actual" = "$expected" || { printf 'FAIL %s expected=%s actual=%s\n' "$path" "$expected" "$actual"; exit 1; }
  printf 'PASS %s status=%s\n' "$path" "$actual"
}

expect_status 200 /healthz
expect_status 200 /staff/clinical-workspace.js
expect_status 200 /staff/inbox-workspace.js
expect_status 401 /api/v1/staff/clinical/workspace
expect_status 401 /api/v1/staff/inbox
expect_status 401 /api/v1/staff/platform/health
expect_status 401 /api/v1/client/inbox
