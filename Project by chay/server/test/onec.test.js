"use strict";

const assert=require("node:assert/strict");
const http=require("node:http");
const test=require("node:test");
const {createOneCIntegration}=require("../src/onec");

test("1C adapter stays disabled without server-only credentials",()=>{
  const adapter=createOneCIntegration({});
  assert.equal(adapter.configured,false);
  assert.equal(adapter.publicConfig.baseHost,null);
});

test("1C adapter sends idempotent events and never exposes credentials",async()=>{
  let received=null;
  const server=http.createServer((req,res)=>{let raw="";req.on("data",(chunk)=>raw+=chunk);req.on("end",()=>{received={url:req.url,key:req.headers["idempotency-key"],auth:req.headers.authorization,body:JSON.parse(raw)};res.writeHead(200,{"content-type":"application/json"});res.end('{"ok":true}');});});
  await new Promise((resolve)=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const adapter=createOneCIntegration({ONEC_BASE_URL:`http://127.0.0.1:${port}`,ONEC_USERNAME:"service",ONEC_PASSWORD:"secret",ONEC_EXCHANGE_PATH:"/exchange"});
  await adapter.send({idempotency_key:"order:42",event_type:"order.changed",entity_type:"order",entity_id:"42",payload:{total:900},created_at:new Date().toISOString()});
  assert.equal(received.url,"/exchange");
  assert.equal(received.key,"order:42");
  assert.equal(received.body.entity.id,"42");
  assert.ok(received.auth.startsWith("Basic "));
  assert.equal(JSON.stringify(adapter.publicConfig).includes("secret"),false);
  await new Promise((resolve)=>server.close(resolve));
});
