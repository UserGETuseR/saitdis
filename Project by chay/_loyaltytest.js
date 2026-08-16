const fs = require("fs");
const store = {};
global.localStorage = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
};
global.window = global;
global.structuredClone = global.structuredClone || ((x) => JSON.parse(JSON.stringify(x)));

window.TEAS = [{ id: "t1", name: "ГАБА", price: 360, cat: "gaba", weights: [{ g: "10 г", price: 360 }] }];
window.MUSHROOMS = [{ id: "m1", name: "Рейши", effectKey: "calm", icon: "x", color: "#000", price: 200 }];
window.UI = { teaById: (id) => window.TEAS.find((t) => t.id === id), mushroomById: (id) => window.MUSHROOMS.find((m) => m.id === id) };

function load(f) { eval(fs.readFileSync("assets/js/" + f, "utf8")); }
load("db.js"); load("inventory.js"); load("store.js"); load("orders.js");
Inventory.seedIfEmpty();

let pass = 0, fail = 0;
const check = (n, c) => { if (c) pass++; else { fail++; console.log("  ✗ " + n); } };

// гость = текущий пользователь "u1"
Store.useUser("u1");
check("старт: 0 штампов", Store.get().stamps === 0);

// добавление в корзину НЕ начисляет штампы (лояльность только по заказу)
Store.addToCart("t1", "m1", 560);
check("корзина не даёт штампов", Store.get().stamps === 0);

// оформляем заказ через Orders для текущего пользователя
const o = Orders.create({ userId: "u1", userName: "Гость", items: [{ teaId: "t1", mushroomId: "m1", price: 560 }, { name: "Эликсир", price: 540 }], channel: "self" });
check("заказ создан", !!o.id);
check("2 позиции = +2 штампа текущему", Store.get().stamps === 2);
check("открыт чай t1", Store.get().discoveredTeas.includes("t1"));
check("открыт гриб m1", Store.get().discoveredMushrooms.includes("m1"));
check("в историю попал заказанный чай", Store.get().history.some((h) => h.tea === "t1"));

// заказ за ДРУГОГО пользователя (касса мастера) — кредитуется именно он, не текущий
Orders.create({ userId: "u2", userName: "Второй", masterId: "m", items: [{ teaId: "t1", price: 360 }], channel: "pos" });
check("текущий (u1) не изменился", Store.get().stamps === 2);
Store.useUser("u2");
check("u2 получил 1 штамп", Store.get().stamps === 1);

// гость без аккаунта — без начислений и без ошибок
const before = Store.get().stamps;
Orders.create({ userId: null, userName: "Аноним", items: [{ teaId: "t1", price: 360 }], channel: "pos" });
check("аноним не ломает и не начисляет", Store.get().stamps === before);

console.log(`\nИтог: ${pass} прошли, ${fail} упали.`);
process.exit(fail ? 1 : 0);
