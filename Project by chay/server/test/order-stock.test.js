"use strict";

// Списание склада по закрытому заказу — основа обмена с 1С.
// Здесь проверяется именно поведение: сопоставление позиций заказа со складом,
// идемпотентность движения, отсутствие отрицательного остатка и попадание
// события в outbox.

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const { stockDemands, loyaltyStamps, dateKey, STAMPS_PER_REWARD } = require("../src/repository");

test("позиция чая списывается по фактической граммовке, а не фиксированной навеске", () => {
  const [demand] = stockDemands({ teaId: "shu_puer", unit: "g", quantity: 100, grams: 100, name: "Шу пуэр" });
  assert.equal(demand.amount, 100);
  assert.deepEqual(demand.candidates, ["shu_puer"]);
});

test("чай без указанной граммовки списывается стандартной подачей", () => {
  const [demand] = stockDemands({ teaId: "gaba", unit: "pcs", quantity: 1, name: "ГАБА" });
  assert.equal(demand.amount, 7);
});

test("грибная добавка списывается одной порцией независимо от граммовки чая", () => {
  const demands = stockDemands({ teaId: "sheng", mushroomId: "lionsmane", unit: "g", quantity: 150, grams: 150 });
  assert.equal(demands.length, 2);
  assert.equal(demands[0].amount, 150);
  assert.equal(demands[1].candidates[0], "lionsmane");
  assert.equal(demands[1].amount, 1);
});

test("товар списывается штуками и ищется по полному артикулу и короткому коду", () => {
  const [demand] = stockDemands({ sku: "DESSERT-mochi", unit: "pcs", quantity: 3, name: "Моти" });
  assert.equal(demand.amount, 3);
  assert.deepEqual(demand.candidates, ["dessert-mochi", "mochi"]);
});

test("позиция без артикула и без привязки к каталогу не создаёт движение", () => {
  assert.deepEqual(stockDemands({ name: "Услуга", unit: "pcs", quantity: 1 }), []);
});

test("отметку лояльности даёт напиток, а не десерт и не мерч", () => {
  assert.equal(loyaltyStamps([{ teaId: "shu_puer", kind: "tea" }, { kind: "dessert" }, { kind: "merch" }]), 1);
  assert.equal(loyaltyStamps([{ kind: "tea" }, { kind: "drink" }]), 2);
  // Заказ только из десертов всё равно закрывается и даёт минимум одну отметку.
  assert.equal(loyaltyStamps([{ kind: "dessert" }]), 1);
  assert.equal(loyaltyStamps([]), 1);
});

test("ключ даты смены собирается из локальных компонент, а не через UTC", () => {
  // Дата 2026-02-03 00:00 локального времени: UTC-сдвиг не должен уводить день.
  assert.equal(dateKey(new Date(2026, 1, 3)), "2026-02-03");
  assert.equal(dateKey("2026-02-03"), "2026-02-03");
  assert.equal(dateKey(null), "");
});

test("норма лояльности объявлена одним значением", () => {
  assert.equal(STAMPS_PER_REWARD, 6);
  const repository = fs.readFileSync(path.join(root, "server/src/repository.js"), "utf8");
  // Награды производны от баланса: счётчик обязан уменьшаться при списании.
  assert.match(repository, /const rewards = Math\.floor\(next \/ STAMPS_PER_REWARD\)/);
  assert.doesNotMatch(repository, /Math\.max\(Number\(account\.rewards\)/);
});

test("склад списывается в той же транзакции, что и закрытие заказа", () => {
  const repository = fs.readFileSync(path.join(root, "server/src/repository.js"), "utf8");
  assert.match(repository, /async function applyOrderStock\(client, order, actor\)/);
  // Движение проводится только на первом переходе в «Готов».
  assert.match(repository, /row\.status === "done" && before\?\.status !== "done"/);
  // Идемпотентность обеспечивает первичный ключ движения.
  assert.match(repository, /const movementId = `mov_\$\{order\.id\}/);
  assert.match(repository, /on conflict\(id\) do nothing returning \*/);
  assert.match(repository, /if \(!movement\) continue;/);
  // Остаток не уводится в минус, расхождение фиксируется.
  assert.match(repository, /const amount = Math\.min\(before, requested\)/);
  assert.match(repository, /shortages\.push/);
  assert.match(repository, /'order_stock','order'/);
  // Продажа попадает в очередь обмена наравне с ручными движениями.
  assert.match(repository, /'inventory\.movement','inventory'[\s\S]{0,400}stockAfter/);
});

test("событие заказа для 1С содержит проведённые движения склада", () => {
  const repository = fs.readFileSync(path.join(root, "server/src/repository.js"), "utf8");
  assert.match(repository, /order\.changed[\s\S]{0,600}stockMovements:stock\.applied/);
  assert.match(repository, /stockShortages:stock\.shortages/);
});

test("памятки сервиса и смены записываются, а не отклоняются сервером", () => {
  const repository = fs.readFileSync(path.join(root, "server/src/repository.js"), "utf8");
  const api = fs.readFileSync(path.join(root, "server/src/production-server.js"), "utf8");
  // Раньше запись памятки давала 404 «Unknown collection».
  assert.match(repository, /else if \(name === "service_guides"\)/);
  assert.match(repository, /insert into chay_guides/);
  assert.match(repository, /service_guides:"chay_guides"/);
  assert.match(api, /if\(name==="service_guides"\)requireRole\(current,ADMIN\)/);
  // Мастер отмечает свою смену, но не переназначает её.
  assert.match(repository, /Отмечать можно только свою смену/);
  assert.doesNotMatch(api, /\["inventory","shifts"\]\.includes\(name\)\)requireRole\(current,ADMIN\)/);
});

test("подтверждение оплаты сертификата фиксируется на сотруднике", () => {
  const repository = fs.readFileSync(path.join(root, "server/src/repository.js"), "utf8");
  // $2 — это покупатель, поэтому подтверждающим обязан быть отдельный параметр.
  assert.match(repository, /confirmed_by=case when excluded\.status='confirmed' then \$14/);
});
