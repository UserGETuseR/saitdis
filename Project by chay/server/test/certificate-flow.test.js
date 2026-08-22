"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadOperations() {
  const memory = new Map();
  const client = { id: "client-1", name: "Анна", role: "client" };
  const admin = { id: "admin-1", name: "Управляющая", role: "admin" };
  let actor = client;
  const sandbox = {
    console,
    crypto: { randomUUID: () => "12345678-1234-1234-1234-123456789012" },
    localStorage: {
      getItem: (key) => memory.get(key) || null,
      setItem: (key, value) => memory.set(key, value),
      removeItem: (key) => memory.delete(key),
    },
    Auth: { current: () => actor },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const assets = path.resolve(__dirname, "../../assets/js");
  vm.runInContext(fs.readFileSync(path.join(assets, "db.js"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(path.join(assets, "operations.js"), "utf8"), sandbox);
  return { sandbox, client, admin, setActor: (next) => { actor = next; } };
}

test("certificate completes the client-to-team lifecycle", () => {
  const { sandbox, client, admin, setActor } = loadOperations();
  const certificate = sandbox.Operations.createCertificate({
    buyerName: client.name,
    recipientName: "Мария",
    phone: "+7 900 000-00-00",
    amount: 3000,
    wish: "Тёплой церемонии",
  });

  assert.equal(certificate.status, "new");
  assert.equal(certificate.statusHistory.length, 1);

  setActor(admin);
  const route = ["contacted", "awaiting_payment", "confirmed", "issued", "redeemed"];
  route.forEach((status) => sandbox.Operations.setCertificateStatus(certificate.id, status, "Проверено командой"));

  const completed = sandbox.DB.collection("certificates").byId(certificate.id);
  assert.equal(completed.status, "redeemed");
  assert.equal(completed.statusHistory.length, 6);
  assert.equal(completed.contactNote, "Проверено командой");

  const directUpdates = sandbox.DB.collection("messages").all().filter((message) => message.targetId === client.id);
  assert.equal(directUpdates.length, 5);
  assert.match(directUpdates.find((message) => message.text.includes("Код"))?.text || "", /готов/);
});

test("client can address a message to a concrete tea master", () => {
  const { sandbox, client } = loadOperations();
  const message = sandbox.Operations.sendMessage({
    audience:"master",
    targetId:"master-7",
    subject:"Подбор чая",
    text:"Хочу уточнить вкус улуна",
  });
  assert.equal(message.fromId, client.id);
  assert.equal(message.targetId, "master-7");
  assert.equal(message.audience, "master");
  assert.equal(sandbox.Operations.inbox().length, 1);
});
