"use strict";

function createOneCIntegration(env=process.env){
  const base=String(env.ONEC_BASE_URL||"").replace(/\/+$/,"");
  const username=String(env.ONEC_USERNAME||"");
  const password=String(env.ONEC_PASSWORD||"");
  const exchangePath=String(env.ONEC_EXCHANGE_PATH||"/hs/chay/exchange");
  const healthPath=String(env.ONEC_HEALTH_PATH||"/hs/chay/health");
  const configured=Boolean(base&&username&&password);
  const authorization=configured?`Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`:"";
  async function call(path,options={}){
    if(!configured)throw new Error("1С не настроена");
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
    try{const response=await fetch(base+path,{...options,headers:{Authorization:authorization,"Content-Type":"application/json","X-Integration-Source":"chay-web",...(options.headers||{})},signal:controller.signal});const text=await response.text();if(!response.ok)throw new Error(`1С ответила ${response.status}: ${text.slice(0,240)}`);return{text,status:response.status};}finally{clearTimeout(timer);}
  }
  return{
    configured,publicConfig:{configured,baseHost:base?new URL(base).host:null,exchangePath:configured?exchangePath:null},
    probe:()=>call(healthPath,{method:"GET"}),
    send:(item)=>call(exchangePath,{method:"POST",headers:{"Idempotency-Key":item.idempotency_key,"X-Event-Type":item.event_type},body:JSON.stringify({event:item.event_type,entity:{type:item.entity_type,id:item.entity_id},payload:item.payload,occurredAt:item.created_at})})
  };
}
module.exports={createOneCIntegration};
