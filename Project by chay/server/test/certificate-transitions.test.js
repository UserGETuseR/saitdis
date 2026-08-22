"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { CERTIFICATE_TRANSITIONS } = require("../src/repository");

test("certificate state machine prevents skips and reopening terminal states", () => {
  assert.equal(CERTIFICATE_TRANSITIONS.new.has("contacted"), true);
  assert.equal(CERTIFICATE_TRANSITIONS.new.has("confirmed"), false);
  assert.equal(CERTIFICATE_TRANSITIONS.awaiting_payment.has("confirmed"), true);
  assert.equal(CERTIFICATE_TRANSITIONS.issued.has("redeemed"), true);
  assert.equal(CERTIFICATE_TRANSITIONS.redeemed.size, 0);
  assert.equal(CERTIFICATE_TRANSITIONS.cancelled.size, 0);
});
