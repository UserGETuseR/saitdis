"use strict";

const { Pool } = require("pg");
const CERTIFICATE_TRANSITIONS = {
  new: new Set(["contacted", "cancelled"]),
  contacted: new Set(["awaiting_payment", "cancelled"]),
  awaiting_payment: new Set(["confirmed", "cancelled"]),
  confirmed: new Set(["issued", "cancelled"]),
  issued: new Set(["redeemed", "cancelled"]),
  redeemed: new Set(),
  cancelled: new Set(),
};

function createRepository(connectionString) {
  const pool = new Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;

  function user(row) {
    if (!row) return null;
    return { id: row.id, name: row.name, login: row.login, email: row.email || "", role: row.role, branchId:row.branch_id || null, createdAt: +new Date(row.created_at), avatarColor: row.avatar_color, profile: row.profile || {} };
  }

  function branch(row) {
    return row ? { id:row.id,city:row.city,chapter:row.chapter,subtitle:row.subtitle,accent:row.accent,position:Number(row.position),active:row.active } : null;
  }

  async function requireBranch(id) {
    const value=String(id||"sochi").toLowerCase();
    const row=await one("select * from chay_branches where id=$1 and active=true",[value]);
    if(!row) throw Object.assign(new Error("Город сети не найден"),{status:400});
    return row;
  }

  async function operationBranch(actor,requested) {
    const id=actor?.role==="owner"&&requested ? requested : actor?.branch_id || actor?.branchId || requested || "sochi";
    return (await requireBranch(id)).id;
  }

  async function audit(actorId, action, entityType, entityId, beforeData, afterData) {
    await q("insert into chay_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data) values($1,$2,$3,$4,$5,$6)", [actorId || null, action, entityType, entityId || null, beforeData || null, afterData || null]);
  }

  async function loyalty(userId) {
    await q("insert into chay_loyalty_accounts(user_id) values($1) on conflict(user_id) do nothing", [userId]);
    const account = await one("select user_id,stamps,rewards,updated_at from chay_loyalty_accounts where user_id=$1", [userId]);
    const events = (await q("select id,delta,balance_after,kind,source_key,note,actor_id,created_at from chay_loyalty_events where user_id=$1 order by created_at desc limit 100", [userId])).rows;
    return { userId, stamps:Number(account?.stamps)||0, rewards:Number(account?.rewards)||0, updatedAt:account?.updated_at ? +new Date(account.updated_at) : Date.now(), events:events.map((event)=>({ id:event.id,delta:event.delta,balanceAfter:event.balance_after,kind:event.kind,sourceKey:event.source_key,note:event.note,actorId:event.actor_id,createdAt:+new Date(event.created_at) })) };
  }

  async function adjustLoyalty({ userId, delta, kind="manual", sourceKey=null, note="", actorId=null }) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("insert into chay_loyalty_accounts(user_id) values($1) on conflict(user_id) do nothing", [userId]);
      if (sourceKey) {
        const duplicate = await client.query("select id from chay_loyalty_events where source_key=$1", [sourceKey]);
        if (duplicate.rowCount) { await client.query("rollback"); return loyalty(userId); }
      }
      const account = (await client.query("select stamps,rewards from chay_loyalty_accounts where user_id=$1 for update", [userId])).rows[0];
      const next = Number(account.stamps) + Number(delta);
      if (next < 0) throw Object.assign(new Error("На карте недостаточно отметок"), { status:409 });
      const rewards = Math.max(Number(account.rewards), Math.floor(next / 6));
      await client.query("update chay_loyalty_accounts set stamps=$2,rewards=$3,updated_at=now() where user_id=$1", [userId,next,rewards]);
      await client.query("insert into chay_loyalty_events(user_id,delta,balance_after,kind,source_key,note,actor_id) values($1,$2,$3,$4,$5,$6,$7)", [userId,delta,next,kind,sourceKey,String(note||"").slice(0,500),actorId]);
      await client.query("commit");
      return loyalty(userId);
    } catch (error) { await client.query("rollback").catch(()=>{}); throw error; }
    finally { client.release(); }
  }

  async function enqueueOneC(eventType,entityType,entityId,payload){
    const key=`${eventType}:${entityType}:${entityId}:${cryptoVersion(payload)}`;
    await q("insert into chay_integration_outbox(event_type,entity_type,entity_id,payload,idempotency_key) values($1,$2,$3,$4,$5) on conflict(idempotency_key) do nothing",[eventType,entityType,entityId,JSON.stringify(payload),key]);
  }
  function cryptoVersion(payload){const crypto=require("node:crypto");return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0,16);}
  async function oneCQueueStatus(){const rows=(await q("select status,count(*)::int as count,max(sent_at) as last_sent_at from chay_integration_outbox where integration='1c' group by status")).rows;return{counts:Object.fromEntries(rows.map((r)=>[r.status,Number(r.count)])),lastSentAt:rows.reduce((last,r)=>r.last_sent_at&&(!last||r.last_sent_at>last)?r.last_sent_at:last,null)};}
  async function nextOneCItems(limit=20){return (await q("update chay_integration_outbox set status='processing',attempts=attempts+1,updated_at=now() where id in (select id from chay_integration_outbox where integration='1c' and (status in ('pending','failed') or (status='processing' and updated_at<now()-interval '10 minutes')) and next_attempt_at<=now() order by id for update skip locked limit $1) returning *",[limit])).rows;}
  async function finishOneCItem(id,error){if(error)await q("update chay_integration_outbox set status='failed',last_error=$2,next_attempt_at=now()+(least(attempts,8)*interval '5 minutes'),updated_at=now() where id=$1",[id,String(error).slice(0,1000)]);else await q("update chay_integration_outbox set status='sent',last_error=null,sent_at=now(),updated_at=now() where id=$1",[id]);}

  function inventoryMovement(row) {
    return row ? { id:row.id,inventoryId:row.inventory_id,branchId:row.branch_id,catalogId:row.catalog_id,type:row.movement_type,quantity:Number(row.quantity),stockBefore:Number(row.stock_before),stockAfter:Number(row.stock_after),reason:row.reason||"",documentRef:row.document_ref||"",actorId:row.actor_id,actorName:row.actor_name,createdAt:+new Date(row.created_at) } : null;
  }

  function publication(row) {
    return row ? { id:row.id,branchId:row.branch_id,authorId:row.author_id,authorName:row.author_name,title:row.title,slug:row.slug,excerpt:row.excerpt||"",body:row.body,coverUrl:row.cover_url||"",kind:row.kind,audience:row.audience,status:row.status,featured:row.featured,publishedAt:row.published_at?+new Date(row.published_at):null,createdAt:+new Date(row.created_at),updatedAt:+new Date(row.updated_at) } : null;
  }

  async function applyInventoryMovement(actor, data) {
    const branchId = await operationBranch(actor, data.branchId);
    const type = String(data.type || "correction");
    const allowed = new Set(["receipt","writeoff","sale","stocktake","correction","transfer_in","transfer_out"]);
    if (!allowed.has(type)) throw Object.assign(new Error("Некорректный тип движения"), { status:400 });
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 1000000) throw Object.assign(new Error("Укажите ненулевое количество"), { status:400 });
    const client = await pool.connect();
    try {
      await client.query("begin");
      const item = (await client.query("select * from chay_inventory where id=$1 and branch_id=$2 for update", [data.inventoryId,branchId])).rows[0];
      if (!item) throw Object.assign(new Error("Позиция склада не найдена"), { status:404 });
      const before = Number(item.stock);
      const delta = type === "stocktake" ? quantity - before : ["writeoff","sale","transfer_out"].includes(type) ? -Math.abs(quantity) : ["receipt","transfer_in"].includes(type) ? Math.abs(quantity) : quantity;
      const after = Math.round((before + delta) * 1000) / 1000;
      if (after < 0) throw Object.assign(new Error("Остаток не может стать отрицательным"), { status:409 });
      const movement = (await client.query("insert into chay_inventory_movements(id,inventory_id,branch_id,catalog_id,movement_type,quantity,stock_before,stock_after,reason,document_ref,actor_id,actor_name,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13/1000.0)) returning *", [data.id,data.inventoryId,branchId,item.catalog_id,type,delta,before,after,String(data.reason||"").slice(0,500),String(data.documentRef||"").slice(0,120)||null,actor.id,actor.name,Number(data.createdAt)||Date.now()])).rows[0];
      const updated = (await client.query("update chay_inventory set stock=$2,updated_by=$3,updated_at=now() where id=$1 returning *", [item.id,after,actor.id])).rows[0];
      const payload = { movementId:movement.id,inventoryId:item.id,branchId,catalogId:item.catalog_id,type,quantity:delta,stockBefore:before,stockAfter:after,reason:movement.reason,documentRef:movement.document_ref,actorId:actor.id,createdAt:+new Date(movement.created_at) };
      const key = `inventory.movement:inventory:${movement.id}:${cryptoVersion(payload)}`;
      await client.query("insert into chay_integration_outbox(event_type,entity_type,entity_id,payload,idempotency_key) values('inventory.movement','inventory',$1,$2,$3) on conflict(idempotency_key) do nothing", [movement.id,JSON.stringify(payload),key]);
      await client.query("insert into chay_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data) values($1,'inventory_movement','inventory',$2,$3,$4)", [actor.id,item.id,JSON.stringify({stock:before}),JSON.stringify({stock:after,movementId:movement.id,type,quantity:delta})]);
      await client.query("commit");
      return { movement:inventoryMovement(movement), inventory:{ id:updated.id,branchId:updated.branch_id,catalogId:updated.catalog_id,kind:updated.kind,name:updated.name,unit:updated.unit,stock:Number(updated.stock),par:Number(updated.par),cat:updated.cat,createdAt:+new Date(updated.updated_at) } };
    } catch (error) { await client.query("rollback").catch(()=>{}); throw error; }
    finally { client.release(); }
  }

  const records = {
    async list(name, actor) {
      const branchId=actor.branch_id||actor.branchId||"sochi", owner=actor.role==="owner";
      if (name === "messages") return (await q("select * from chay_messages where from_id=$1 or target_id=$1 or ($3 and (audience='team' or audience='management' or audience=$2)) or (not $3 and branch_id=$4 and (($2<>'client' and audience='team') or audience=$2 or ($2='admin' and audience='management'))) order by created_at desc limit 300", [actor.id, actor.role,owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,fromId:r.from_id,targetId:r.target_id,fromName:r.from_name,fromRole:r.from_role,audience:r.audience,subject:r.subject,text:r.body,status:r.status,entityId:r.entity_id,readBy:r.read_by,createdAt:+new Date(r.created_at) }));
      if (name === "staff_requests") return (await q("select * from chay_staff_requests where from_id=$1 or ($3 or branch_id=$4) and (assigned_role=$2 or $2 in ('admin','owner')) order by created_at desc limit 300", [actor.id, actor.role,owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,type:r.type,title:r.title,details:r.details,urgency:r.urgency,fromId:r.from_id,fromName:r.from_name,fromRole:r.from_role,assignedRole:r.assigned_role,assignedLabel:r.assigned_label,status:r.status,history:r.history,createdAt:+new Date(r.created_at) }));
      if (name === "shift_reports") return (await q("select * from chay_shift_reports where user_id=$1 or $3 or ($2='admin' and branch_id=$4) order by created_at desc limit 300", [actor.id, actor.role,owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,userId:r.user_id,userName:r.user_name,role:r.role,shift:r.shift_label,note:r.note,checks:r.checks,completed:r.completed,total:r.total,status:r.status,createdAt:+new Date(r.created_at) }));
      if (name === "certificates") return (await q("select * from chay_certificates where buyer_id=$1 or ($2 in ('master','admin','owner') and ($3 or branch_id=$4)) order by created_at desc limit 300", [actor.id, actor.role,owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,buyerId:r.buyer_id,buyerName:r.buyer_name,recipientName:r.recipient_name,phone:r.phone,amount:Number(r.amount),wish:r.wish,code:r.code,status:r.status,contactNote:r.contact_note||"",statusHistory:r.status_history||[],confirmedAt:r.confirmed_at?+new Date(r.confirmed_at):null,createdAt:+new Date(r.created_at),updatedAt:+new Date(r.updated_at) }));
      if (name === "service_guides") return (await q("select * from chay_guides where active=true order by position,id")).rows.map((r) => ({ id:r.id,title:r.title,tag:r.tag,text:r.body,createdAt:+new Date(r.updated_at) }));
      if (name === "inventory") return (await q("select * from chay_inventory where $1 or branch_id=$2 order by branch_id,kind,name",[owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,catalogId:r.catalog_id,kind:r.kind,name:r.name,unit:r.unit,stock:Number(r.stock),par:Number(r.par),cat:r.cat,createdAt:+new Date(r.updated_at) }));
      if (name === "inventory_movements") return (await q("select * from chay_inventory_movements where $1 or branch_id=$2 order by created_at desc limit 800",[owner,branchId])).rows.map(inventoryMovement);
      if (name === "publications") return (await q("select * from chay_publications where $1 or branch_id=$2 or author_id=$3 order by updated_at desc limit 500",[owner,branchId,actor.id])).rows.map(publication);
      if (name === "orders") {
        const result = actor.role === "client" ? await q("select * from chay_orders where user_id=$1 order by created_at desc limit 500", [actor.id]) : await q("select * from chay_orders where $1 or branch_id=$2 order by created_at desc limit 500",[owner,branchId]);
        return result.rows.map((r) => ({ id:r.id,branchId:r.branch_id,userId:r.user_id,userName:r.user_name,masterId:r.master_id,channel:r.channel,status:r.status,items:r.items,total:Number(r.total),ts:+new Date(r.created_at),createdAt:+new Date(r.created_at) }));
      }
      if (name === "shifts") return (await q("select * from chay_shifts where $1 or branch_id=$2 order by branch_id,shift_date,slot",[owner,branchId])).rows.map((r) => ({ id:r.id,branchId:r.branch_id,date:String(r.shift_date).slice(0,10),slot:r.slot,userId:r.user_id,userName:r.user_name,status:r.status,createdAt:+new Date(r.created_at) }));
      throw Object.assign(new Error("Unknown collection"), { status: 404 });
    },

    async upsert(name, data, actor) {
      const id = String(data.id || "");
      if (!/^[a-zA-Z0-9_-]{5,100}$/.test(id)) throw Object.assign(new Error("Некорректный идентификатор"), { status: 400 });
      let row; const branchId=await operationBranch(actor,data.branchId);
      if (name === "messages") {
        let targetId=data.targetId||null,audience=data.audience||"team";
        if(actor.role==="client"){
          audience="management";
          if(targetId){const target=await one("select id,role,branch_id from chay_users where id=$1 and active=true",[targetId]);if(!target||!["master","admin","owner"].includes(target.role)||target.role!=="owner"&&target.branch_id!==branchId)throw Object.assign(new Error("Чайный мастер этого города не найден"),{status:400});audience=target.role;}
        }
        else if(targetId){const target=await one("select id,role,branch_id from chay_users where id=$1 and active=true",[targetId]);if(!target||target.role!=="owner"&&target.branch_id!==branchId)throw Object.assign(new Error("Получатель относится к другому городу"),{status:400});}
        row = await one("insert into chay_messages(id,from_id,target_id,branch_id,from_name,from_role,audience,subject,body,status,entity_id,read_by,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13/1000.0)) on conflict(id) do update set target_id=excluded.target_id,audience=excluded.audience,subject=excluded.subject,body=excluded.body,status=excluded.status,read_by=excluded.read_by,updated_at=now() returning *", [id,actor.id,targetId,branchId,actor.name,actor.role,audience,String(data.subject || "Диалог").slice(0,120),String(data.text || "").slice(0,5000),data.status || "open",data.entityId || null,JSON.stringify(data.readBy || [actor.id]),Number(data.createdAt)||Date.now()]);
      }
      else if (name === "staff_requests") row = await one("insert into chay_staff_requests(id,type,title,details,urgency,from_id,from_name,from_role,branch_id,assigned_role,assigned_label,status,history,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,to_timestamp($14/1000.0)) on conflict(id) do update set title=excluded.title,details=excluded.details,urgency=excluded.urgency,assigned_role=excluded.assigned_role,assigned_label=excluded.assigned_label,status=excluded.status,history=excluded.history,updated_at=now() returning *", [id,data.type || "other",String(data.title||"").slice(0,180),String(data.details||"").slice(0,5000),data.urgency||"normal",actor.id,actor.name,actor.role,branchId,data.assignedRole||"admin",data.assignedLabel||null,data.status||"new",JSON.stringify(data.history||[]),Number(data.createdAt)||Date.now()]);
      else if (name === "shift_reports") row = await one("insert into chay_shift_reports(id,user_id,user_name,role,branch_id,shift_label,note,checks,completed,total,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12/1000.0)) on conflict(id) do update set note=excluded.note,checks=excluded.checks,completed=excluded.completed,total=excluded.total,status=excluded.status,updated_at=now() returning *", [id,actor.id,actor.name,actor.role,branchId,String(data.shift||"Смена").slice(0,80),String(data.note||"").slice(0,5000),JSON.stringify(data.checks||{}),Number(data.completed)||0,Number(data.total)||0,data.status||"attention",Number(data.createdAt)||Date.now()]);
      else if (name === "certificates") {
        const before = await one("select status from chay_certificates where id=$1", [id]);
        const nextStatus = data.status || "new";
        if (before && before.status !== nextStatus && !CERTIFICATE_TRANSITIONS[before.status]?.has(nextStatus)) throw Object.assign(new Error("Недопустимый переход статуса сертификата"), { status: 409 });
        row = await one("insert into chay_certificates(id,buyer_id,branch_id,buyer_name,recipient_name,phone,amount,wish,code,status,contact_note,status_history,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$12,jsonb_build_array(jsonb_build_object('status',$10,'at',$11,'by',$13)),to_timestamp($11/1000.0)) on conflict(id) do update set status=excluded.status,contact_note=excluded.contact_note,status_history=case when chay_certificates.status<>excluded.status then chay_certificates.status_history || jsonb_build_array(jsonb_build_object('status',excluded.status,'at',$11,'by',$13)) else chay_certificates.status_history end,confirmed_by=case when excluded.status='confirmed' then $2 else chay_certificates.confirmed_by end,confirmed_at=case when excluded.status='confirmed' then now() else chay_certificates.confirmed_at end,updated_at=now() returning *", [id,data.buyerId||actor.id,branchId,String(data.buyerName||actor.name).slice(0,120),String(data.recipientName||"").slice(0,120),String(data.phone||"").slice(0,40),Number(data.amount),String(data.wish||"").slice(0,1000),String(data.code||"").slice(0,30),nextStatus,Number(data.updatedAt||data.createdAt)||Date.now(),String(data.contactNote||"").slice(0,1000),actor.name]);
      }
      else if (name === "inventory") {row = await one("insert into chay_inventory(id,branch_id,catalog_id,kind,name,unit,stock,par,cat,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict(id) do update set kind=excluded.kind,name=excluded.name,unit=excluded.unit,stock=excluded.stock,par=excluded.par,cat=excluded.cat,updated_by=excluded.updated_by,updated_at=now() returning *", [id,branchId,String(data.catalogId||id).slice(0,100),data.kind||"other",String(data.name||"").slice(0,180),String(data.unit||"шт").slice(0,30),Number(data.stock)||0,Number(data.par)||0,data.cat||null,actor.id]);await enqueueOneC("inventory.changed","inventory",id,{id,branchId,catalogId:row.catalog_id,kind:row.kind,name:row.name,unit:row.unit,stock:Number(row.stock),par:Number(row.par),updatedAt:Date.now()});}
      else if (name === "publications") {
        const before=await one("select * from chay_publications where id=$1",[id]);
        if(before&&actor.role==="master"&&before.author_id!==actor.id)throw Object.assign(new Error("Мастер может редактировать только свои материалы"),{status:403});
        const allowedStatus=new Set(["draft","review","published","archived"]),allowedKind=new Set(["news","story","tea","event"]),allowedAudience=new Set(["public","team"]);
        let status=allowedStatus.has(data.status)?data.status:"draft";
        if(actor.role==="master"&&["published","archived"].includes(status))status="review";
        const title=String(data.title||"").trim(),body=String(data.body||"").trim();
        if(title.length<3||body.length<20)throw Object.assign(new Error("Заполните заголовок и текст публикации"),{status:400});
        const slug=String(data.slug||"").trim().toLowerCase();
        if(!/^[a-z0-9][a-z0-9-]{2,90}$/.test(slug))throw Object.assign(new Error("Некорректный адрес публикации"),{status:400});
        const rawCover=String(data.coverUrl||"").trim(),coverUrl=/^(https:\/\/|assets\/|img\/|БРЕНБУК\/assets\/)/.test(rawCover)?rawCover.slice(0,1000):"";
        const publishedAt=status==="published"?(before?.published_at||new Date(Number(data.publishedAt)||Date.now())):before?.published_at||null;
        row=await one("insert into chay_publications(id,branch_id,author_id,author_name,title,slug,excerpt,body,cover_url,kind,audience,status,featured,published_at,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,to_timestamp($15/1000.0)) on conflict(id) do update set title=excluded.title,slug=excluded.slug,excerpt=excluded.excerpt,body=excluded.body,cover_url=excluded.cover_url,kind=excluded.kind,audience=excluded.audience,status=excluded.status,featured=excluded.featured,published_at=excluded.published_at,updated_at=now() returning *",[id,branchId,before?.author_id||actor.id,before?.author_name||actor.name,title.slice(0,180),slug,String(data.excerpt||"").slice(0,500),body.slice(0,20000),coverUrl,allowedKind.has(data.kind)?data.kind:"news",allowedAudience.has(data.audience)?data.audience:"public",status,actor.role==="master"?false:Boolean(data.featured),publishedAt,Number(data.createdAt)||Date.now()]);
      }
      else if (name === "orders") {
        const before=await one("select status,loyalty_credited_at from chay_orders where id=$1",[id]);
        row = await one("insert into chay_orders(id,user_id,branch_id,user_name,master_id,channel,status,items,total,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0)) on conflict(id) do update set master_id=excluded.master_id,status=excluded.status,items=excluded.items,total=excluded.total,updated_at=now() returning *", [id,data.userId||actor.id,branchId,String(data.userName||actor.name).slice(0,120),data.masterId||null,data.channel||"self",data.status||"new",JSON.stringify(data.items||[]),Number(data.total)||0,Number(data.ts||data.createdAt)||Date.now()]);
        if(row.user_id&&row.status==="done"&&!before?.loyalty_credited_at){const delta=Math.max(1,Array.isArray(row.items)?row.items.length:1);await adjustLoyalty({userId:row.user_id,delta,kind:"order",sourceKey:`order:${id}`,note:`Заказ ${id}`,actorId:actor.id});await q("update chay_orders set loyalty_credited_at=now() where id=$1 and loyalty_credited_at is null",[id]);}
        await enqueueOneC("order.changed","order",id,{id,branchId:row.branch_id,userId:row.user_id,userName:row.user_name,status:row.status,items:row.items,total:Number(row.total),channel:row.channel,updatedAt:Date.now()});
      }
      else if (name === "shifts") row = await one("insert into chay_shifts(id,branch_id,shift_date,slot,user_id,user_name,status) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do update set shift_date=excluded.shift_date,slot=excluded.slot,user_id=excluded.user_id,user_name=excluded.user_name,status=excluded.status,updated_at=now() returning *", [id,branchId,data.date,data.slot,data.userId,String(data.userName||"").slice(0,120),data.status||"planned"]);
      else throw Object.assign(new Error("Unknown collection"), { status: 404 });
      await audit(actor.id, "upsert", name, id, null, data);
      return row;
    },

    async remove(name, id, actor) {
      const table = { messages:"chay_messages",staff_requests:"chay_staff_requests",shift_reports:"chay_shift_reports",certificates:"chay_certificates",inventory:"chay_inventory",orders:"chay_orders",shifts:"chay_shifts",publications:"chay_publications" }[name];
      if (!table) throw Object.assign(new Error("Unknown collection"), { status: 404 });
      const before = await one(`select * from ${table} where id=$1`, [id]);
      if(before?.branch_id&&actor.role!=="owner"&&before.branch_id!==(actor.branch_id||actor.branchId||"sochi"))throw Object.assign(new Error("Запись относится к другому городу"),{status:403});
      if(name==="publications"&&(before?.status!=="draft"||actor.role==="master"&&before.author_id!==actor.id))throw Object.assign(new Error("Удалить можно только собственный черновик"),{status:409});
      await q(`delete from ${table} where id=$1`, [id]);
      await audit(actor.id, "delete", name, id, before, null);
    }
  };

  return {
    pool, q, one, user, branch, publication, audit, records, loyalty, adjustLoyalty, applyInventoryMovement, enqueueOneC, oneCQueueStatus, nextOneCItems, finishOneCItem,
    async health() { return one("select now() as now"); },
    async listBranches() { return (await q("select * from chay_branches where active=true order by position,id")).rows.map(branch); },
    async publicPublications(branchId) { const id=branchId?(await requireBranch(branchId)).id:null;return (await q("select * from chay_publications where status='published' and audience='public' and ($1::text is null or branch_id=$1) order by featured desc,published_at desc,created_at desc limit 100",[id])).rows.map(publication); },
    async branchById(id) { return branch(await requireBranch(id)); },
    async branchSummaries(actor) {
      const allowed=actor.role==="owner"?null:(actor.branch_id||actor.branchId||"sochi");
      return (await q("select b.*,count(distinct u.id) filter(where u.role in ('master','admin'))::int staff_count,count(distinct o.id) filter(where o.status in ('new','brewing'))::int active_orders,count(distinct i.id) filter(where i.stock<=i.par)::int low_stock from chay_branches b left join chay_users u on u.branch_id=b.id and u.active=true left join chay_orders o on o.branch_id=b.id left join chay_inventory i on i.branch_id=b.id where b.active=true and ($1::text is null or b.id=$1) group by b.id order by b.position",[allowed])).rows.map((r)=>({...branch(r),staffCount:Number(r.staff_count),activeOrders:Number(r.active_orders),lowStock:Number(r.low_stock)}));
    },
    async userByLogin(login) { return one("select * from chay_users where login=$1 and active=true", [login]); },
    async userById(id) { return one("select * from chay_users where id=$1 and active=true", [id]); },
    async createUser(data) { const branchId=(await requireBranch(data.branchId||"sochi")).id; return one("insert into chay_users(login,name,email,role,branch_id,password_salt,password_hash,avatar_color,profile) values($1,$2,$3,'client',$4,$5,$6,$7,$8) returning *", [data.login,data.name,data.email||null,branchId,data.salt,data.hash,data.avatarColor,JSON.stringify(data.profile||{})]); },
    async createSession(data) { return one("insert into chay_sessions(user_id,token_hash,user_agent,ip_hash,expires_at) values($1,$2,$3,$4,$5) returning *", [data.userId,data.tokenHash,data.userAgent,data.ipHash,data.expiresAt]); },
    async sessionByTokenHash(hash) { return one("select s.*,u.login,u.name,u.email,u.role,u.branch_id,u.avatar_color,u.profile,u.created_at from chay_sessions s join chay_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.active=true", [hash]); },
    async touchSession(id) { await q("update chay_sessions set last_seen_at=now() where id=$1 and last_seen_at < now() - interval '10 minutes'", [id]); },
    async deleteSession(hash) { await q("delete from chay_sessions where token_hash=$1", [hash]); },
    async listUsers(actor) { const all=actor.role==="owner",branchId=actor.branch_id||actor.branchId||"sochi";return (await q("select * from chay_users where active=true and ($1 or branch_id=$2 or id=$3) order by role,name",[all,branchId,actor.id])).rows.map(user); },
    async publicTeam(branchId) { const id=(await requireBranch(branchId||"sochi")).id;return (await q("select id,name,role,branch_id,avatar_color,profile from chay_users where active=true and role in ('master','admin','owner') and (branch_id=$1 or role='owner') order by case role when 'master' then 0 when 'admin' then 1 else 2 end,name",[id])).rows.map((row)=>({id:row.id,name:row.name,role:row.role,branchId:row.branch_id,avatarColor:row.avatar_color,title:row.profile?.title||({master:'Чайный мастер',admin:'Управляющая',owner:'Директор'}[row.role])})); },
    async createPublicCertificate(data) {
      const branchId=(await requireBranch(data.branchId||"sochi")).id;
      const row = await one("insert into chay_certificates(id,buyer_id,branch_id,buyer_name,recipient_name,phone,amount,wish,code,status,status_history,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',jsonb_build_array(jsonb_build_object('status','new','at',$10,'by',$4)),to_timestamp($10/1000.0)) returning *", [data.id,data.buyerId||null,branchId,data.buyerName,data.recipientName,data.phone,data.amount,data.wish||"",data.code,data.createdAt||Date.now()]);
      await q("insert into chay_messages(id,from_id,branch_id,from_name,from_role,audience,subject,body,status,entity_id,created_at) values($1,$2,$3,$4,'client','team','Новый сертификат',$5,'open',$6,to_timestamp($7/1000.0)) on conflict(id) do nothing",[`msg_${data.id}`,data.buyerId||null,branchId,data.buyerName,`Сертификат ${data.code} на ${data.amount} ₽ · телефон ${data.phone}`,data.id,data.createdAt||Date.now()]);
      await audit(data.buyerId||null,"create","certificates",data.id,null,{ code:data.code, amount:data.amount, phone:"***"+String(data.phone).slice(-4) });
      return row;
    },
    async createPublicOrder(data) {
      const branchId=(await requireBranch(data.branchId||"sochi")).id;
      const row = await one("insert into chay_orders(id,user_id,branch_id,user_name,channel,status,items,total,created_at) values($1,$2,$3,$4,'self','new',$5,$6,to_timestamp($7/1000.0)) returning *", [data.id,data.userId||null,branchId,data.userName||"Гость",JSON.stringify(data.items||[]),data.total||0,data.createdAt||Date.now()]);
      await q("insert into chay_messages(id,from_id,branch_id,from_name,from_role,audience,subject,body,status,entity_id,created_at) values($1,$2,$3,$4,'client','team','Новый заказ',$5,'open',$6,to_timestamp($7/1000.0)) on conflict(id) do nothing",[`msg_${data.id}`,data.userId||null,branchId,data.userName||"Гость",`Заказ на ${Number(data.total)||0} ₽ · ${(data.items||[]).length} поз.`,data.id,data.createdAt||Date.now()]);
      await audit(data.userId||null,"create","orders",data.id,null,{ total:data.total, itemCount:(data.items||[]).length });
      await enqueueOneC("order.created","order",data.id,{id:data.id,branchId,userId:data.userId||null,userName:data.userName||"Гость",status:"new",items:data.items||[],total:data.total||0,channel:"self",createdAt:data.createdAt||Date.now()});
      return row;
    },
    async updateOwn(id, data) { const branchId=data.branchId!==undefined?(await requireBranch(data.branchId)).id:null;return one("update chay_users set name=coalesce($2,name),login=coalesce($3,login),email=case when $4 then $5 else email end,avatar_color=coalesce($6,avatar_color),profile=profile || $7::jsonb,branch_id=case when $8 then $9 else branch_id end,updated_at=now() where id=$1 returning *", [id,data.name||null,data.login||null,data.email!==undefined,data.email||null,data.avatarColor||null,JSON.stringify(data.profile||{}),data.branchId!==undefined,branchId]); },
    async updatePassword(id, salt, hash, keepSessionId) { await q("update chay_users set password_salt=$2,password_hash=$3,updated_at=now() where id=$1", [id,salt,hash]); await q("delete from chay_sessions where user_id=$1 and id<>$2", [id,keepSessionId]); },
    async setRole(actorId, id, role) { const before=await this.userById(id); const row=await one("update chay_users set role=$2,branch_id=case when $2='owner' then null else coalesce(branch_id,'sochi') end,updated_at=now() where id=$1 returning *", [id,role]); await audit(actorId,"role_change","user",id,before,row); return row; },
    async setUserBranch(actor,id,branchId) { const next=(await requireBranch(branchId)).id;const before=await this.userById(id);const row=await one("update chay_users set branch_id=$2,updated_at=now() where id=$1 returning *",[id,next]);await audit(actor.id,"branch_change","user",id,before,{branchId:next});return row; },
    async close() { await pool.end(); }
  };
}

module.exports = { createRepository, CERTIFICATE_TRANSITIONS };
