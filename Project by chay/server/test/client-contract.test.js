"use strict";

// Контракт клиентского слоя: правила, нарушение которых нельзя заметить
// на глаз, но которые ломают production — кэширование персональных данных,
// молчаливая потеря записей и расхождение отчётов с выбранным городом.

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("service worker не кэширует ответы API", () => {
  const sw = read("sw.js");
  // Сессия, лояльность и остатки не должны оставаться в Cache Storage:
  // иначе следующий пользователь устройства увидит данные предыдущего.
  assert.match(sw, /const BYPASS = \[\/\^\\\/api\\\/\/\]/);
  assert.match(sw, /if \(sameOrigin && BYPASS\.some\(\(rule\) => rule\.test\(url\.pathname\)\)\) return;/);
  // Защита продублирована в записи в кэш, а не только в обработчике fetch.
  assert.match(sw, /function cachePut[\s\S]{0,400}BYPASS\.some\(\(rule\) => rule\.test\(url\.pathname\)\)\) return;/);
  // Одна версия ресурсов на index.html и precache — иначе кэш не совпадёт.
  const html = read("index.html");
  const version = sw.match(/const ASSET_VERSION = "(\d+)"/);
  assert.ok(version, "в sw.js должна быть объявлена версия ресурсов");
  assert.ok(html.includes(`?v=${version[1]}`), "index.html должен использовать ту же версию ресурсов");
  const stale = html.match(/assets\/(js|css)\/[\w.-]+\?v=(?!20260903)[\w.]+/g);
  assert.equal(stale, null, `в index.html остались устаревшие версии: ${stale}`);
});

test("гидратация не удаляет записи, которые сервер ещё не принял", () => {
  const api = read("assets/js/api.js");
  // Раньше replaceAll(remote) стирал локальные записи после неудачной отправки.
  assert.match(api, /const unsent = local\.filter/);
  assert.match(api, /!isSynced\(name, record\.id\)/);
  assert.match(api, /replaceAll\(\[\.\.\.remote, \.\.\.unsent\]\)/);
  // Реестр подтверждений отличает «удалено сервером» от «не доехало».
  assert.match(api, /function rememberSynced/);
  assert.match(api, /function forgetSynced/);
  // Незапрошенная выгрузка локальных данных в боевую базу убрана.
  assert.doesNotMatch(api, /allow an authenticated employee to migrate/);
  assert.doesNotMatch(api, /hydrating = false;\s*\n\s*for \(const record of local\)/);
});

test("whenSynced не подтверждает то, что не проверял", () => {
  const api = read("assets/js/api.js");
  assert.match(api, /whenSynced\(name,id\) \{ return pending\.get\(`\$\{name\}:\$\{id\}`\) \|\| Promise\.resolve\(ready \? isSynced\(name,id\) : false\); \}/);
});

test("уведомление помечается прочитанным одним запросом", () => {
  const notifications = read("assets/js/notifications.js");
  // Локальное обновление уже уходит через db.js → pushRecord.
  assert.doesNotMatch(notifications, /ApiClient\.notifications\.read\(id\)/);
  assert.match(notifications, /markRead\(id\)\{return col\.update/);
});

test("коллекции, которые ведёт сервер, не отправляются через /records", () => {
  const api = read("assets/js/api.js");
  assert.match(api, /READ_ONLY_COLLECTIONS = new Set\(\["inventory_movements", "notifications"\]\)/);
  assert.match(api, /if \(name === "inventory_movements"\) return true;/);
});

test("публичный ответ сервера переносит идентификатор на локальную запись", () => {
  const api = read("assets/js/api.js");
  assert.match(api, /function adoptServerId/);
  assert.match(api, /if \(serverId !== record\.id\)/);
});

test("демо-склад не заливается в боевую базу", () => {
  const inventory = read("assets/js/inventory.js");
  const app = read("assets/js/app.js");
  // Случайные остатки уезжали в production при первом входе сотрудника.
  assert.doesNotMatch(inventory, /Math\.random\(\) \* 6/);
  assert.doesNotMatch(inventory, /Math\.random\(\) \* 10/);
  assert.match(inventory, /function seedIfEmpty\(\)[\s\S]{0,200}CHA_DEMO_ALLOWED/);
  assert.match(inventory, /if \(window\.ApiClient\?\.isReady\?\.\(\)\) return;/);
  assert.doesNotMatch(app, /!Auth\.isCloud\(\) \|\| Auth\.isStaff\(\)\) Inventory\.seedIfEmpty/);
  // Остатки заводятся нулями: за каждой цифрой стоит документ.
  assert.match(inventory, /kind: "tea", name: t\.name, unit: "г", stock: 0/);
});

test("локальное списание учитывает объём заказа", () => {
  const inventory = read("assets/js/inventory.js");
  // Прежняя версия списывала ровно 7 г с любого заказа.
  assert.doesNotMatch(inventory, /after=Math\.max\(0,before-7\)/);
  assert.match(inventory, /const grams = Number\(item\.grams\) \|\| \(item\.unit === "g" \? quantity : 0\)/);
  assert.match(inventory, /documentRef: orderId/);
});

test("инвентаризация без расхождения не считается ошибкой ввода", () => {
  const inventory = read("assets/js/inventory.js");
  assert.match(inventory, /if\(type==="stocktake"&&delta===0\)return/);
});

test("аналитика считается по выбранному городу и закрытым заказам", () => {
  const orders = read("assets/js/orders.js");
  // Раньше stats читал всю коллекцию, минуя фильтр по branchId.
  assert.doesNotMatch(orders, /const list = sinceTs \? col\.query/);
  assert.match(orders, /const scope = this\.all\(\)/);
  assert.match(orders, /const done = list\.filter\(\(o\) => o\.status === "done"\)/);
  assert.doesNotMatch(orders, /paid = list\.filter\(\(o\) => o\.status !== "cancelled"\)/);
  // Незакрытые заказы показываются отдельной цифрой.
  assert.match(orders, /activeCount: active\.length/);
});

test("отметки лояльности в локальном режиме считаются по правилу сервера", () => {
  const store = read("assets/js/store.js");
  // Начисление на клиенте допустимо только там, где нет сервера.
  assert.match(store, /const cloud = !!\(window\.Auth && Auth\.isCloud && Auth\.isCloud\(\)\)/);
  assert.match(store, /if \(!cloud\) \{/);
  assert.doesNotMatch(store, /items\.forEach\(\(it\) => \{\n\s+st\.stamps \+= 1;/);
});

test("даты смен берутся из локального времени чайной", () => {
  const shifts = read("assets/js/shifts.js");
  // toISOString() отдаёт UTC и ночью показывал вчерашний день.
  assert.doesNotMatch(shifts, /toISOString\(\)\.slice\(0, 10\)/);
  assert.match(shifts, /x\.getFullYear\(\)/);
  // Мастер отмечает только свою смену.
  assert.match(shifts, /user\.role === "master" && shift\.userId !== user\.id/);
});

test("экраны с таймерами останавливаются при уходе со страницы", () => {
  const app = read("assets/js/app.js");
  const views = read("assets/js/views.js");
  const next = read("assets/js/views.next.js");
  assert.match(app, /function onLeave\(fn\)/);
  assert.match(app, /function render\(\) \{\n\s+runCleanups\(\);/);
  assert.match(app, /return \{ init, render, onLeave/);
  assert.match(next, /App\.onLeave\?\.\(\(\) => \{ if \(timer\) \{ clearInterval\(timer\); timer = null; \} \}\)/);
  assert.match(views, /App\.onLeave\?\.\(stopBreath\)/);
  assert.match(views, /App\.onLeave\?\.\(\(\) => \{ clearTimeout\(gfTimer\); clearInterval\(gfTick\)/);
});

test("сбой одного экрана не оставляет приложение на предыдущем виде", () => {
  const app = read("assets/js/app.js");
  assert.match(app, /view = \(routes\[path\] \|\| Views\.home\)\(\);/);
  assert.match(app, /Не удалось построить экран/);
  assert.match(app, /Экран не открылся/);
});

test("грибная глава с одним чаем не роняет экран эликсиров", () => {
  const views = read("assets/js/views.js");
  // «Тишина» описана одним чаем, обращение к teas[1] выбрасывало TypeError.
  assert.doesNotMatch(views, /e\.teas\[1\]/);
  assert.match(views, /\$\{\(e\.teas \|\| \[\]\)\.map\(\(tea, index\) =>/);
});

test("журнал выдерживает публикацию без текста", () => {
  const content = read("assets/js/views.content.js");
  assert.doesNotMatch(content, /item\.body\.slice\(0,180\)/);
  assert.doesNotMatch(content, /item\.body\.slice\(0,140\)/);
  assert.match(content, /const summary=\(item,limit\)=>String\(item\.excerpt\|\|item\.body\|\|""\)/);
  // Асинхронное обновление не пишет в удалённый DOM.
  assert.match(content, /if\(left\|\|!root\.isConnected\)return;/);
});

test("цена без значения не роняет шаблон экрана", () => {
  const ui = read("assets/js/ui.js");
  assert.match(ui, /Number\.isFinite\(Number\(n\)\) \? Number\(n\) : 0/);
});

test("сообщения приложения доступны скринридеру", () => {
  const ui = read("assets/js/ui.js");
  const views = read("assets/js/views.js");
  assert.match(ui, /t\.setAttribute\("role", "status"\)/);
  assert.match(ui, /t\.setAttribute\("aria-live", "polite"\)/);
  assert.match(views, /id="authError" class="auth-error hidden" role="alert"/);
  // Поля формы входа связаны с подписями программно.
  for (const id of ["authName", "authLogin", "authPass", "authPass2", "authEmail", "authPhone", "authBranch"]) {
    assert.match(views, new RegExp(`for="${id}"`), `нет подписи для #${id}`);
    assert.match(views, new RegExp(`id="${id}"`), `нет поля #${id}`);
  }
  assert.match(views, /class="pass-eye" data-eye aria-label="Показать пароль" aria-pressed="false"/);
  assert.match(views, /id="gfCount" role="timer" aria-live="polite"/);
});

test("манифест пригоден для установки на телефон", () => {
  const manifest = JSON.parse(read("manifest.webmanifest"));
  const png = manifest.icons.filter((icon) => icon.type === "image/png");
  // Без растровых иконок Chrome не предлагает установку.
  assert.ok(png.some((icon) => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(png.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(png.some((icon) => icon.purpose === "maskable" && icon.sizes === "512x512"));
  assert.equal(manifest.start_url, "./");
  assert.ok(manifest.id);
  for (const icon of manifest.icons) {
    assert.ok(fs.statSync(path.join(root, icon.src)).size > 0, icon.src);
  }
});

test("роль директора подписана в списке персонала", () => {
  const views = read("assets/js/views.js");
  assert.match(views, /owner: \{ l: "Директор сети"/);
});

test("рабочие действия команды подтверждаются сервером", () => {
  const next = read("assets/js/views.next.js");
  const views = read("assets/js/views.js");
  assert.match(next, /const confirmSync = async \(collection, record, okText\)/);
  assert.match(next, /Сервер не подтвердил изменение/);
  // Отклонённый переход статуса сертификата больше не выглядит выполненным.
  assert.match(next, /confirmSync\("certificates", Operations\.setCertificateStatus/);
  // Позиция склада могла исчезнуть — обработчик это учитывает.
  assert.match(next, /if \(!item\) \{ UI\.toast\("Позиция склада больше не доступна"\)/);
  assert.match(views, /Сервер не подтвердил отметку/);
});

test("маршрут сертификата ведёт только команда", () => {
  const operations = read("assets/js/operations.js");
  assert.match(operations, /if \(!\["master", "admin", "owner"\]\.includes\(u\.role\)\) return null;/);
  // Локальные памятки не создаются в рабочем режиме.
  assert.match(operations, /function seedGuides\(\)[\s\S]{0,220}CHA_DEMO_ALLOWED/);
});
