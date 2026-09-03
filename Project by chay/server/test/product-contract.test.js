"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const test=require("node:test");
const vm=require("node:vm");

const root=path.resolve(__dirname,"../..");

test("public mushroom catalogue contains exactly the approved three products",()=>{
  const sandbox={window:{}};sandbox.window=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root,"assets/js/data.mushrooms.js"),"utf8"),sandbox);
  assert.deepEqual(Array.from(sandbox.MUSHROOMS,(item)=>item.name),["Красный мухомор","Ежовик","Кордицепс"]);
  for(const item of sandbox.MUSHROOMS){
    assert.ok(item.philosophy);
    assert.ok(item.story);
    assert.ok(item.safety);
    assert.ok(item.pairsWith.length);
    assert.ok(item.desserts.length);
  }
});

test("tea academy is absent from the working product surface",()=>{
  const files=["assets/js/data.events.js","assets/js/views.js","assets/js/views.next.js","kp/index.html"];
  const text=files.map((file)=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  assert.doesNotMatch(text,/чайная (академия|школа)|tea academy/i);
});

test("production schema persists loyalty and integration outbox",()=>{
  const schema=fs.readFileSync(path.join(root,"server/sql/001_production.sql"),"utf8");
  assert.match(schema,/create table if not exists chay_loyalty_accounts/i);
  assert.match(schema,/create table if not exists chay_loyalty_events/i);
  assert.match(schema,/create table if not exists chay_integration_outbox/i);
  assert.match(schema,/idempotency_key text not null unique/i);
});

test("inventory accounting keeps an immutable movement ledger prepared for 1C",()=>{
  const schema=fs.readFileSync(path.join(root,"server/sql/001_production.sql"),"utf8");
  const repository=fs.readFileSync(path.join(root,"server/src/repository.js"),"utf8");
  const api=fs.readFileSync(path.join(root,"server/src/production-server.js"),"utf8");
  assert.match(schema,/create table if not exists chay_inventory_movements/i);
  assert.match(schema,/stock_before numeric[\s\S]*stock_after numeric/i);
  assert.match(repository,/applyInventoryMovement/);
  assert.match(repository,/inventory\.movement/);
  assert.match(api,/\/api\/inventory\/movements/);
});

test("editorial workflow persists drafts and exposes only published public chapters",()=>{
  const schema=fs.readFileSync(path.join(root,"server/sql/001_production.sql"),"utf8");
  const repository=fs.readFileSync(path.join(root,"server/src/repository.js"),"utf8");
  const api=fs.readFileSync(path.join(root,"server/src/production-server.js"),"utf8");
  const app=fs.readFileSync(path.join(root,"assets/js/app.js"),"utf8");
  assert.match(schema,/create table if not exists chay_publications/i);
  assert.match(schema,/status text not null default 'draft'[\s\S]*draft'[\s\S]*review'[\s\S]*published'[\s\S]*archived'/i);
  assert.match(repository,/status='published' and audience='public'/);
  assert.match(repository,/Мастер может редактировать только свои материалы/);
  assert.match(api,/\/api\/public\/publications/);
  assert.match(app,/"\/journal": Views\.journal/);
});

test("network model starts with Sochi and persists all four city chapters",()=>{
  const schema=fs.readFileSync(path.join(root,"server/sql/001_production.sql"),"utf8");
  assert.match(schema,/create table if not exists chay_branches/i);
  const seeded=["sochi","rostov","krasnodar","moscow"].map((id)=>schema.includes(`('${id}'`));
  assert.deepEqual(seeded,[true,true,true,true]);
  assert.ok(schema.indexOf("('sochi'")<schema.indexOf("('rostov'"));
  for(const table of ["chay_users","chay_messages","chay_inventory","chay_orders","chay_shifts"])assert.match(schema,new RegExp(`${table}[\\s\\S]{0,900}branch_id`,`i`));
});

test("city choice is wired into registration, staff console and 1C payloads",()=>{
  const files=["assets/js/branches.js","assets/js/views.next.js","assets/js/views.js","server/src/repository.js"];
  const text=files.map((file)=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  assert.match(text,/первая рабочая глава/i);
  assert.match(text,/data-assign-branch/);
  assert.match(text,/branchId:data\.branchId/);
  assert.match(text,/inventory\.changed[\s\S]{0,300}branchId/);
  assert.match(text,/order\.changed[\s\S]{0,300}branchId/);
});

test("director menu connects recommendations, arbitrary grams, delivery and merch",()=>{
  const files=["assets/js/data.commerce.js","assets/js/commerce.js","assets/js/views.director.js","assets/js/store.js","assets/js/orders.js"];
  const text=files.map((file)=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  assert.match(text,/TEA_ADDONS/);
  assert.match(text,/DESSERTS/);
  assert.match(text,/MERCH/);
  assert.match(text,/Чай по настроению/);
  assert.match(text,/addConfigured/);
  assert.match(text,/fulfillment/);
  assert.match(text,/scheduledAt/);
  // Граммовка задаётся от 1 грамма с шагом 1: гость выставляет её сам.
  assert.match(text,/name="grams" type="number" min="1"[^>]*step="1"/);
  assert.match(text,/data-gram-step="1"/);
  assert.match(text,/Чай пей и добрей/);
});

test("public menu has one clear path and a complete mushroom chapter",()=>{
  const views=fs.readFileSync(path.join(root,"assets/js/views.director.js"),"utf8");
  const app=fs.readFileSync(path.join(root,"assets/js/app.js"),"utf8");
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  const sw=fs.readFileSync(path.join(root,"sw.js"),"utf8");
  const polish=fs.readFileSync(path.join(root,"assets/css/polish-2026.css"),"utf8");
  assert.match(app,/label: "Меню"/);
  assert.match(app,/label: "Мой чай"/);
  assert.match(views,/id="chapter-matcha"/);
  assert.match(views,/id="chapter-mushrooms"/);
  assert.match(views,/Ясность без спешки/);
  assert.match(views,/Только осознанный выбор/);
  assert.match(polish,/matcha-lineup-v2\.png/);
  assert.match(views,/mushroom-lineup-v1\.png/);
  assert.doesNotMatch(html,/>Оформить предзаказ</);
  assert.match(sw,/cold-lineup-v2\.png/);
});

test("every menu action refreshes the visible cart lifecycle",()=>{
  const app=fs.readFileSync(path.join(root,"assets/js/app.js"),"utf8");
  const commerce=fs.readFileSync(path.join(root,"assets/js/commerce.js"),"utf8");
  assert.match(app,/function refreshCart\(\)[\s\S]{0,120}updateCartBadge\(\)[\s\S]{0,120}renderCart\(\)/);
  assert.match(app,/return \{[^}]*refreshCart/);
  assert.match(commerce,/function addProduct\([^)]*\)[\s\S]{0,900}App\.refreshCart\?\.\(\)/);
  // Настройка чая и заказ услуги тоже обновляют видимую корзину.
  assert.match(commerce,/Store\.logPick\([^)]*\);\s*\n?\s*App\.refreshCart\?\.\(\)/);
  assert.match(commerce,/function addService\([^)]*\)[\s\S]{0,1400}App\.refreshCart\?\.\(\)/);
});

test("demo roles stay locked unless the local presentation mode is enabled",()=>{
  const auth=fs.readFileSync(path.join(root,"assets/js/auth.js"),"utf8");
  const cloudAuth=fs.readFileSync(path.join(root,"assets/js/auth.cloud.js"),"utf8");
  const views=fs.readFileSync(path.join(root,"assets/js/views.js"),"utf8");
  const config=fs.readFileSync(path.join(root,"assets/js/config.js"),"utf8");
  assert.match(auth,/demoLogin\(role\)/);
  assert.match(auth,/u_admin_demo/);
  assert.match(views,/Auth\.demoLogin\(b\.dataset\.demo/);
  assert.doesNotMatch(views,/const creds = \{ master:/);

  // Демо-контур закрыт двумя независимыми условиями и по умолчанию выключен.
  assert.match(config,/allowDemoAccounts: false/);
  assert.match(config,/backend === "local" && cfg\.allowDemoAccounts === true/);

  // Ни один демо-аккаунт не создаётся без явного разрешения.
  assert.match(auth,/if \(!demoAllowed\(\)\) \{ if \(changed\) persist\(db\); return; \}/);
  assert.match(auth,/if \(!demoAllowed\(\)\) return \{ ok: false/);
  assert.match(cloudAuth,/if \(cloud \|\| !demoAllowed\(\)\) return \{ ok:false/);

  // Недоступный API не должен превращать production в демо-стенд с админ-доступом.
  assert.match(cloudAuth,/if \(!cloud\) \{ if \(demoAllowed\(\)\) LocalAuth\.seedIfEmpty\(\)/);
  assert.match(cloudAuth,/return cloud \? currentUser : \(demoAllowed\(\) \? LocalAuth\.current\(\) : null\)/);

  // Демо-кнопки удаляются из DOM, а не скрываются классом.
  assert.match(views,/root\.querySelector\("#authDemo"\)\?\.remove\(\)/);

  // Требование к паролю совпадает с серверным.
  assert.doesNotMatch(auth,/Пароль минимум 4 символа/);
  assert.match(auth,/минимум 8 символов/);
});

test("public brand assets use stable ASCII URLs",()=>{
  const runtime=["index.html","sw.js","assets/css/brand-2026.css","assets/css/director-2026.css","assets/js/content.js","assets/js/ui.js","assets/js/views.js","assets/js/views.next.js","assets/js/views.content.js","assets/js/views.director.js","assets/js/commerce.js"];
  const text=runtime.map((file)=>fs.readFileSync(path.join(root,file),"utf8")).join("\n");
  assert.doesNotMatch(text,/БРЕНБУК\/assets\//);
  for(const name of ["logo-color.png","logo-cream-on-dark.png","logo-mark-color.png","mark-bowl-cream.svg","mark-bowl-terra.svg","mark-color.png","pattern-real-muted.png","pattern-real.png"]){
    assert.ok(fs.statSync(path.join(root,"img/brand",name)).size>0,name);
  }
  assert.match(text,/cha-cache-v\d+-teahouse/);
});

test("phone loyalty and order notifications survive a restart",()=>{
  const schema=fs.readFileSync(path.join(root,"server/sql/001_production.sql"),"utf8");
  const repository=fs.readFileSync(path.join(root,"server/src/repository.js"),"utf8");
  const api=fs.readFileSync(path.join(root,"server/src/production-server.js"),"utf8");
  assert.match(schema,/chay_users[\s\S]{0,500}phone text not null default ''/i);
  assert.match(schema,/create table if not exists chay_notifications/i);
  assert.match(schema,/fulfillment text not null default 'pickup'/i);
  assert.match(schema,/scheduled_at timestamptz/i);
  assert.match(repository,/userByPhone/);
  assert.match(repository,/Предзаказ принят/);
  assert.match(repository,/order\.created[\s\S]{0,500}fulfillment/);
  assert.match(api,/\/api\/loyalty\/search/);
  assert.match(api,/notificationMatch=path\.match/);
});
