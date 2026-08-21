"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { hashPassword, verifyPassword, newToken, tokenHash, parseCookies } = require("../src/security");

test("password hashes are salted and verifiable", async () => {
  const first = await hashPassword("long-safe-password");
  const second = await hashPassword("long-safe-password");
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(await verifyPassword("long-safe-password", first.salt, first.hash), true);
  assert.equal(await verifyPassword("wrong-password", first.salt, first.hash), false);
});

test("session tokens are opaque and hashed before storage", () => {
  const token = newToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(tokenHash(token), /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(token), token);
});

test("cookie parser reads the protected session cookie", () => {
  assert.deepEqual(parseCookies("theme=dark; chay_session=abc123; flag=1"), { theme:"dark", chay_session:"abc123", flag:"1" });
});
