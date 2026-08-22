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
  assert.deepEqual(Array.from(sandbox.MUSHROOMS,(item)=>item.name),["Мухомор","Ежовик","Кордицепс"]);
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
