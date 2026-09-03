"use strict";

// Дымовой тест интерфейса: каждый экран из таблицы маршрутов должен собираться
// без исключения. Именно так проявлялось падение экрана эликсиров — грибная
// глава «Тишина» описана одним чаем, а шаблон обращался ко второму.
// Здесь строится только разметка (view.html); монтирование требует живого DOM.

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "../..");

// Порядок совпадает с index.html: он определяет, какая реализация экрана победит.
const SCRIPTS = [
  "assets/js/config.js",
  "assets/js/data.teas.js",
  "assets/js/data.mushrooms.js",
  "assets/js/data.elixirs.js",
  "assets/js/data.services.js",
  "assets/js/data.drinks.js",
  "assets/js/data.commerce.js",
  "assets/js/data.events.js",
  "assets/js/data.practices.js",
  "assets/js/data.formats.js",
  "assets/js/data.wisdom.js",
  "assets/js/brewing.js",
  "assets/js/db.js",
  "assets/js/api.js",
  "assets/js/operations.js",
  "assets/js/content.js",
  "assets/js/inventory.js",
  "assets/js/orders.js",
  "assets/js/notifications.js",
  "assets/js/shifts.js",
  "assets/js/store.js",
  "assets/js/auth.js",
  "assets/js/auth.cloud.js",
  "assets/js/branches.js",
  "assets/js/ui.js",
  "assets/js/views.js",
  "assets/js/views.next.js",
  "assets/js/views.content.js",
  "assets/js/views.director.js",
  "assets/js/commerce.js",
];

function createElementStub() {
  const node = {
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    dataset: {},
    style: { setProperty() {} },
    children: [],
    innerHTML: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    isConnected: true,
    elements: {},
    setAttribute() {},
    getAttribute: () => null,
    removeAttribute() {},
    appendChild(child) { this.children.push(child); return child; },
    removeChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {},
    closest: () => null,
    scrollIntoView() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 100, height: 100 }),
    focus() {},
    querySelector: () => createElementStub(),
    querySelectorAll: () => [],
    insertAdjacentHTML() {},
  };
  return node;
}

function createSandbox() {
  const storage = new Map();
  const sandbox = {
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
    fetch: () => Promise.reject(new Error("сеть недоступна в тесте")),
    AbortController,
    structuredClone,
    URLSearchParams,
    URL,
    crypto: { randomUUID: () => "00000000-0000-4000-8000-000000000000" },
    localStorage: {
      getItem: (key) => (storage.has(key) ? storage.get(key) : null),
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    navigator: { serviceWorker: undefined, userAgent: "node-test" },
    location: { hash: "#/", protocol: "https:", href: "https://chay.local/" },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    cancelAnimationFrame: () => {},
    IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} },
    prompt: () => "",
    confirm: () => true,
    alert: () => {},
    document: {
      body: createElementStub(),
      documentElement: createElementStub(),
      fonts: { ready: Promise.resolve() },
      getElementById: () => createElementStub(),
      createElement: () => createElementStub(),
      querySelector: () => createElementStub(),
      querySelectorAll: () => [],
      addEventListener() {},
      dispatchEvent() {},
    },
    addEventListener() {},
    dispatchEvent() {},
    scrollTo() {},
    Event: class { constructor(type) { this.type = type; } },
    FormData: class { constructor() {} entries() { return [][Symbol.iterator](); } get() { return ""; } has() { return false; } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), sandbox, { filename: file });
  }
  // app.js навешивается на DOMContentLoaded, поэтому таблицу маршрутов
  // читаем прямо из его исходника — так тест не разойдётся с роутером.
  const appSource = fs.readFileSync(path.join(root, "assets/js/app.js"), "utf8");
  const table = appSource.slice(appSource.indexOf("const routes = {"), appSource.indexOf("};", appSource.indexOf("const routes = {")));
  const routes = [...table.matchAll(/"([^"]+)":\s*Views\.(\w+)/g)].map(([, route, view]) => ({ route, view }));
  // App нужен экранам, которые регистрируют остановку таймеров.
  sandbox.App = { onLeave() {}, render() {}, refreshCart() {}, renderCart() {}, openCart() {}, navigate() {} };
  return { sandbox, routes };
}

test("каждый маршрут роутера указывает на существующий экран", () => {
  const { sandbox, routes } = createSandbox();
  assert.ok(routes.length >= 19, `в таблице маршрутов найдено только ${routes.length} записей`);
  for (const { route, view } of routes) {
    assert.equal(typeof sandbox.Views[view], "function", `маршрут ${route} ссылается на несуществующий Views.${view}`);
  }
});

test("каждый экран собирается без исключения для гостя", () => {
  const { sandbox, routes } = createSandbox();
  for (const { route, view } of routes) {
    let result;
    assert.doesNotThrow(() => { result = sandbox.Views[view](); }, `экран ${route} (Views.${view}) упал при сборке`);
    assert.equal(typeof result.html, "string", `экран ${route} не вернул разметку`);
    assert.ok(result.html.length > 0, `экран ${route} вернул пустую разметку`);
  }
});

test("грибная глава с одним чаем присутствует в данных и не ломает экран эликсиров", () => {
  const { sandbox } = createSandbox();
  const single = sandbox.ELIXIRS.filter((item) => (item.teas || []).length === 1);
  // Если это условие однажды перестанет выполняться, тест выше потеряет смысл.
  assert.ok(single.length >= 1, "ожидается хотя бы одна глава с единственным чаем");
  const html = sandbox.Views.elixirs().html;
  for (const item of sandbox.ELIXIRS) assert.ok(html.includes(item.title), `в разметке нет главы ${item.title}`);
  // Разделитель «или» появляется только между чаями, а не после единственного.
  assert.equal((html.match(/class="ex-or"/g) || []).length, sandbox.ELIXIRS.reduce((sum, item) => sum + Math.max(0, (item.teas || []).length - 1), 0));
});

test("публичное меню и грибная глава остаются на месте", () => {
  const { sandbox } = createSandbox();
  const html = sandbox.Views.menu().html;
  assert.match(html, /id="chapter-matcha"/);
  assert.match(html, /id="chapter-mushrooms"/);
  for (const item of sandbox.MUSHROOMS) assert.ok(html.includes(item.name), `в меню нет позиции ${item.name}`);
});

test("демо-доступы не попадают в разметку входа в рабочем режиме", () => {
  const { sandbox } = createSandbox();
  // Конфигурация по умолчанию — production.
  assert.equal(sandbox.CHA_DEMO_ALLOWED(), false);
  const html = sandbox.Views.auth().html;
  // Кнопки присутствуют в шаблоне, но mount удаляет их из DOM; проверяем,
  // что сам режим закрыт и быстрый вход по роли отклоняется.
  assert.equal(sandbox.Auth.isDemoAllowed(), false);
  assert.match(html, /Роль чайного мастера или управляющей назначает директор/);
  assert.doesNotMatch(html, /name="role"/);
});

test("демо-аккаунты не создаются, пока режим презентации выключен", async () => {
  const { sandbox } = createSandbox();
  sandbox.Auth.seedIfEmpty();
  const stored = sandbox.localStorage.getItem("tea_stories_db_v1");
  const users = stored ? JSON.parse(stored).users : [];
  assert.deepEqual(users, [], "в рабочем режиме не должно создаваться ни одного аккаунта");
  const result = await sandbox.Auth.demoLogin("admin");
  assert.equal(result.ok, false);
});

test("в режиме презентации демо-вход работает", async () => {
  const { sandbox } = createSandbox();
  sandbox.CHA_CONFIG.backend = "local";
  sandbox.CHA_CONFIG.allowDemoAccounts = true;
  assert.equal(sandbox.CHA_DEMO_ALLOWED(), true);
  const result = await sandbox.Auth.demoLogin("admin");
  assert.equal(result.ok, true);
  assert.equal(result.user.role, "admin");
});

test("регистрация требует пароль не короче серверного минимума", async () => {
  const { sandbox } = createSandbox();
  // Без сервера фасад отдаёт регистрацию локальному слою только в демо-режиме.
  sandbox.CHA_CONFIG.backend = "local";
  sandbox.CHA_CONFIG.allowDemoAccounts = true;
  const short = await sandbox.Auth.register({ name: "Тест Тестов", login: "tester", pass: "1234", pass2: "1234", phone: "+79000000000" });
  assert.equal(short.ok, false);
  assert.match(short.error, /8 символов/);
  const ok = await sandbox.Auth.register({ name: "Тест Тестов", login: "tester", pass: "longenough1", pass2: "longenough1", phone: "+79000000000" });
  assert.equal(ok.ok, true);
  // Роль с формы получить нельзя, даже передав её напрямую.
  const sneaky = await sandbox.Auth.register({ name: "Взлом Взломов", login: "sneaky", pass: "longenough1", pass2: "longenough1", phone: "+79000000001", role: "admin" });
  assert.equal(sneaky.ok, true);
  assert.notEqual(sneaky.user.role, "admin");
});

test("без сервера и без демо-режима вход в кабинет недоступен", async () => {
  const { sandbox } = createSandbox();
  // Недоступный API не должен открывать локальный доступ с ролью сотрудника.
  const login = await sandbox.Auth.login("admin", "admin");
  assert.equal(login.ok, false);
  assert.match(login.error, /Нет связи с сервером/);
  const register = await sandbox.Auth.register({ name: "Гость Гостев", login: "guest1", pass: "longenough1", pass2: "longenough1", phone: "+79000000002" });
  assert.equal(register.ok, false);
  assert.equal(sandbox.Auth.current(), null);
});

test("корзина считает сумму по позициям", () => {
  const { sandbox } = createSandbox();
  sandbox.Store.addConfigured({ kind: "tea", name: "Шу пуэр", grams: 100, quantity: 100, unit: "g", price: 900 });
  sandbox.Store.addConfigured({ kind: "dessert", name: "Моти", quantity: 1, unit: "pcs", price: 550 });
  assert.equal(sandbox.Store.cartTotal(), 1450);
});

test("отметки лояльности в локальном режиме считаются по напиткам", () => {
  const { sandbox } = createSandbox();
  sandbox.Store.useUser("u_test");
  sandbox.Store.creditOrder("u_test", [
    { teaId: "shu_puer", kind: "tea" },
    { kind: "dessert" },
    { kind: "merch" },
  ]);
  assert.equal(sandbox.Store.get().stamps, 1, "десерт и мерч не должны давать отметку");
});

test("аналитика заказов не смешивает закрытые и незакрытые", () => {
  const { sandbox } = createSandbox();
  const branch = sandbox.Branches.current().id;
  const collection = sandbox.DB.collection("orders");
  collection.replaceAll([
    { id: "ord_done_1", branchId: branch, ts: Date.now(), status: "done", total: 1000, channel: "self", items: [{ name: "Шу пуэр", unit: "g", quantity: 100 }] },
    { id: "ord_new_1", branchId: branch, ts: Date.now(), status: "new", total: 700, channel: "pos", items: [{ name: "Моти", unit: "pcs", quantity: 2 }] },
    { id: "ord_other_city", branchId: "moscow", ts: Date.now(), status: "done", total: 5000, channel: "self", items: [] },
  ]);
  const stats = sandbox.Orders.stats();
  assert.equal(stats.revenue, 1000, "выручка считается только по закрытым заказам выбранного города");
  assert.equal(stats.count, 1);
  assert.equal(stats.activeCount, 1);
  assert.equal(stats.activeTotal, 700);
  // Объекты созданы в песочнице, поэтому сравниваются по значению, а не по прототипу.
  assert.deepEqual(JSON.parse(JSON.stringify(stats.top)), [{ name: "Шу пуэр", qty: 1 }]);
});

// Кабинеты — самые сложные экраны: аналитика, склад, смены, лояльность.
// Их проверяем под каждой рабочей ролью, включая директора.
for (const role of ["master", "admin", "client"]) {
  test(`экраны собираются под ролью ${role}`, async () => {
    const { sandbox, routes } = createSandbox();
    sandbox.CHA_CONFIG.backend = "local";
    sandbox.CHA_CONFIG.allowDemoAccounts = true;
    const login = await sandbox.Auth.demoLogin(role === "admin" ? "admin" : role);
    assert.equal(login.ok, true, `не удалось войти под ролью ${role}`);
    assert.equal(sandbox.Auth.current().role, role);
    for (const { route, view } of routes) {
      let result;
      assert.doesNotThrow(() => { result = sandbox.Views[view](); }, `экран ${route} упал под ролью ${role}`);
      assert.ok(result.html.length > 0, `экран ${route} пуст под ролью ${role}`);
    }
  });
}

test("директор видит кабинет мастера и подписан своей ролью", async () => {
  const { sandbox } = createSandbox();
  sandbox.CHA_CONFIG.backend = "local";
  sandbox.CHA_CONFIG.allowDemoAccounts = true;
  await sandbox.Auth.demoLogin("admin");
  // Управляющая и директор работают с заказами, поэтому касса им доступна.
  const html = sandbox.Views.master().html;
  assert.ok(html.length > 0);
  assert.doesNotMatch(html, /Вход в пространство/, "кабинет мастера не должен подменяться формой входа");
});

test("касса начисляет отметки гостю заказа, а не активному пользователю", () => {
  const { sandbox } = createSandbox();
  sandbox.Store.useUser("u_guest_1");
  sandbox.Orders.create({ userId: "u_guest_1", userName: "Первый", items: [{ teaId: "shu_puer", price: 900 }], channel: "self" });
  assert.equal(sandbox.Store.get().stamps, 1);

  // Мастер оформляет заказ за другого гостя: активный паспорт не меняется.
  sandbox.Orders.create({ userId: "u_guest_2", userName: "Второй", masterId: "u_master", items: [{ teaId: "gaba", price: 360 }], channel: "pos" });
  assert.equal(sandbox.Store.get().stamps, 1, "отметка не должна уходить активному пользователю");
  sandbox.Store.useUser("u_guest_2");
  assert.equal(sandbox.Store.get().stamps, 1, "отметку получает гость заказа");
});

test("заказ без аккаунта не начисляет отметки и не роняет кассу", () => {
  const { sandbox } = createSandbox();
  sandbox.Store.useUser("u_guest_1");
  const before = sandbox.Store.get().stamps;
  let order;
  assert.doesNotThrow(() => {
    order = sandbox.Orders.create({ userId: null, userName: "Гость", items: [{ teaId: "shu_puer", price: 900 }], channel: "pos" });
  });
  assert.ok(order.id);
  assert.equal(sandbox.Store.get().stamps, before);
});

test("добавление в корзину не начисляет отметки", () => {
  const { sandbox } = createSandbox();
  sandbox.Store.useUser("u_guest_1");
  sandbox.Store.addToCart("shu_puer", "lionsmane", 1100);
  assert.equal(sandbox.Store.get().stamps, 0, "отметка появляется только по заказу");
  // Открытия сорта фиксируются сразу — это чайный паспорт, а не лояльность.
  assert.ok(sandbox.Store.get().discoveredTeas.includes("shu_puer"));
});

test("ключ даты смены совпадает с локальной датой", () => {
  const { sandbox } = createSandbox();
  const now = new Date();
  const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.equal(sandbox.Shifts.todayKey(), expected);
});
