"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password, salt = crypto.randomBytes(18).toString("base64url")) {
  const derived = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt, hash: Buffer.from(derived).toString("base64url") };
}

async function verifyPassword(password, salt, storedHash) {
  const candidate = await hashPassword(password, salt);
  const left = Buffer.from(candidate.hash, "base64url");
  const right = Buffer.from(String(storedHash || ""), "base64url");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function newToken() { return crypto.randomBytes(32).toString("base64url"); }
function tokenHash(token) { return crypto.createHash("sha256").update(String(token)).digest("hex"); }
function privacyHash(value) { return crypto.createHash("sha256").update(String(value || "")).digest("hex"); }

function parseCookies(header) {
  return String(header || "").split(";").reduce((acc, part) => {
    const i = part.indexOf("=");
    if (i > 0) acc[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    return acc;
  }, {});
}

module.exports = { hashPassword, verifyPassword, newToken, tokenHash, privacyHash, parseCookies };
