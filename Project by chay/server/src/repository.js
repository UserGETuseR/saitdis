"use strict";

const { Pool } = require("pg");

function createRepository(connectionString) {
  const pool = new Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => (await q(text, params)).rows[0] || null;

  function user(row) {
    if (!row) return null;
    return { id: row.id, name: row.name, login: row.login, email: row.email || "", role: row.role, createdAt: +new Date(row.created_at), avatarColor: row.avatar_color, profile: row.profile || {} };
  }

  async function audit(actorId, action, entityType, entityId, beforeData, afterData) {
    await q("insert into chay_audit_log(actor_id,action,entity_type,entity_id,before_data,after_data) values($1,$2,$3,$4,$5,$6)", [actorId || null, action, entityType, entityId || null, beforeData || null, afterData || null]);
  }

  const records = {
    async list(name, actor) {
      if (name === "messages") return (await q("select * from chay_messages where from_id=$1 or target_id=$1 or ($2<>'client' and audience='team') or audience=$2 or ($2 in ('admin','owner') and audience='management') order by created_at desc limit 300", [actor.id, actor.role])).rows.map((r) => ({ id:r.id,fromId:r.from_id,targetId:r.target_id,fromName:r.from_name,fromRole:r.from_role,audience:r.audience,subject:r.subject,text:r.body,status:r.status,entityId:r.entity_id,readBy:r.read_by,createdAt:+new Date(r.created_at) }));
      if (name === "staff_requests") return (await q("select * from chay_staff_requests where from_id=$1 or assigned_role=$2 or $2 in ('admin','owner') order by created_at desc limit 300", [actor.id, actor.role])).rows.map((r) => ({ id:r.id,type:r.type,title:r.title,details:r.details,urgency:r.urgency,fromId:r.from_id,fromName:r.from_name,fromRole:r.from_role,assignedRole:r.assigned_role,assignedLabel:r.assigned_label,status:r.status,history:r.history,createdAt:+new Date(r.created_at) }));
      if (name === "shift_reports") return (await q("select * from chay_shift_reports where user_id=$1 or $2 in ('admin','owner') order by created_at desc limit 300", [actor.id, actor.role])).rows.map((r) => ({ id:r.id,userId:r.user_id,userName:r.user_name,role:r.role,shift:r.shift_label,note:r.note,checks:r.checks,completed:r.completed,total:r.total,status:r.status,createdAt:+new Date(r.created_at) }));
      if (name === "certificates") return (await q("select * from chay_certificates where buyer_id=$1 or $2 in ('master','admin','owner') order by created_at desc limit 300", [actor.id, actor.role])).rows.map((r) => ({ id:r.id,buyerId:r.buyer_id,buyerName:r.buyer_name,recipientName:r.recipient_name,phone:r.phone,amount:Number(r.amount),wish:r.wish,code:r.code,status:r.status,createdAt:+new Date(r.created_at) }));
      if (name === "service_guides") return (await q("select * from chay_guides where active=true order by position,id")).rows.map((r) => ({ id:r.id,title:r.title,tag:r.tag,text:r.body,createdAt:+new Date(r.updated_at) }));
      if (name === "inventory") return (await q("select * from chay_inventory order by kind,name")).rows.map((r) => ({ id:r.id,kind:r.kind,name:r.name,unit:r.unit,stock:Number(r.stock),par:Number(r.par),cat:r.cat,createdAt:+new Date(r.updated_at) }));
      if (name === "orders") {
        const result = actor.role === "client" ? await q("select * from chay_orders where user_id=$1 order by created_at desc limit 500", [actor.id]) : await q("select * from chay_orders order by created_at desc limit 500");
        return result.rows.map((r) => ({ id:r.id,userId:r.user_id,userName:r.user_name,masterId:r.master_id,channel:r.channel,status:r.status,items:r.items,total:Number(r.total),ts:+new Date(r.created_at),createdAt:+new Date(r.created_at) }));
      }
      if (name === "shifts") return (await q("select * from chay_shifts order by shift_date,slot")).rows.map((r) => ({ id:r.id,date:String(r.shift_date).slice(0,10),slot:r.slot,userId:r.user_id,userName:r.user_name,status:r.status,createdAt:+new Date(r.created_at) }));
      throw Object.assign(new Error("Unknown collection"), { status: 404 });
    },

    async upsert(name, data, actor) {
      const id = String(data.id || "");
      if (!/^[a-zA-Z0-9_-]{5,100}$/.test(id)) throw Object.assign(new Error("Некорректный идентификатор"), { status: 400 });
      let row;
      if (name === "messages") { const audience=actor.role==="client"?"management":(data.audience||"team"); const targetId=actor.role==="client"?null:(data.targetId||null); row = await one("insert into chay_messages(id,from_id,target_id,from_name,from_role,audience,subject,body,status,entity_id,read_by,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,to_timestamp($12/1000.0)) on conflict(id) do update set target_id=excluded.target_id,audience=excluded.audience,subject=excluded.subject,body=excluded.body,status=excluded.status,read_by=excluded.read_by,updated_at=now() returning *", [id,actor.id,targetId,actor.name,actor.role,audience,String(data.subject || "Диалог").slice(0,120),String(data.text || "").slice(0,5000),data.status || "open",data.entityId || null,JSON.stringify(data.readBy || [actor.id]),Number(data.createdAt)||Date.now()]); }
      else if (name === "staff_requests") row = await one("insert into chay_staff_requests(id,type,title,details,urgency,from_id,from_name,from_role,assigned_role,assigned_label,status,history,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,to_timestamp($13/1000.0)) on conflict(id) do update set title=excluded.title,details=excluded.details,urgency=excluded.urgency,assigned_role=excluded.assigned_role,assigned_label=excluded.assigned_label,status=excluded.status,history=excluded.history,updated_at=now() returning *", [id,data.type || "other",String(data.title||"").slice(0,180),String(data.details||"").slice(0,5000),data.urgency||"normal",actor.id,actor.name,actor.role,data.assignedRole||"admin",data.assignedLabel||null,data.status||"new",JSON.stringify(data.history||[]),Number(data.createdAt)||Date.now()]);
      else if (name === "shift_reports") row = await one("insert into chay_shift_reports(id,user_id,user_name,role,shift_label,note,checks,completed,total,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0)) on conflict(id) do update set note=excluded.note,checks=excluded.checks,completed=excluded.completed,total=excluded.total,status=excluded.status,updated_at=now() returning *", [id,actor.id,actor.name,actor.role,String(data.shift||"Смена").slice(0,80),String(data.note||"").slice(0,5000),JSON.stringify(data.checks||{}),Number(data.completed)||0,Number(data.total)||0,data.status||"attention",Number(data.createdAt)||Date.now()]);
      else if (name === "certificates") row = await one("insert into chay_certificates(id,buyer_id,buyer_name,recipient_name,phone,amount,wish,code,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,to_timestamp($10/1000.0)) on conflict(id) do update set status=excluded.status,confirmed_by=case when excluded.status='confirmed' then $2 else chay_certificates.confirmed_by end,confirmed_at=case when excluded.status='confirmed' then now() else chay_certificates.confirmed_at end,updated_at=now() returning *", [id,data.buyerId||actor.id,String(data.buyerName||actor.name).slice(0,120),String(data.recipientName||"").slice(0,120),String(data.phone||"").slice(0,40),Number(data.amount),String(data.wish||"").slice(0,1000),String(data.code||"").slice(0,30),data.status||"new",Number(data.createdAt)||Date.now()]);
      else if (name === "inventory") row = await one("insert into chay_inventory(id,kind,name,unit,stock,par,cat,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(id) do update set kind=excluded.kind,name=excluded.name,unit=excluded.unit,stock=excluded.stock,par=excluded.par,cat=excluded.cat,updated_by=excluded.updated_by,updated_at=now() returning *", [id,data.kind||"other",String(data.name||"").slice(0,180),String(data.unit||"шт").slice(0,30),Number(data.stock)||0,Number(data.par)||0,data.cat||null,actor.id]);
      else if (name === "orders") row = await one("insert into chay_orders(id,user_id,user_name,master_id,channel,status,items,total,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0)) on conflict(id) do update set master_id=excluded.master_id,status=excluded.status,items=excluded.items,total=excluded.total,updated_at=now() returning *", [id,data.userId||actor.id,String(data.userName||actor.name).slice(0,120),data.masterId||null,data.channel||"self",data.status||"new",JSON.stringify(data.items||[]),Number(data.total)||0,Number(data.ts||data.createdAt)||Date.now()]);
      else if (name === "shifts") row = await one("insert into chay_shifts(id,shift_date,slot,user_id,user_name,status) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set shift_date=excluded.shift_date,slot=excluded.slot,user_id=excluded.user_id,user_name=excluded.user_name,status=excluded.status,updated_at=now() returning *", [id,data.date,data.slot,data.userId,String(data.userName||"").slice(0,120),data.status||"planned"]);
      else throw Object.assign(new Error("Unknown collection"), { status: 404 });
      await audit(actor.id, "upsert", name, id, null, data);
      return row;
    },

    async remove(name, id, actor) {
      const table = { messages:"chay_messages",staff_requests:"chay_staff_requests",shift_reports:"chay_shift_reports",certificates:"chay_certificates",inventory:"chay_inventory",orders:"chay_orders",shifts:"chay_shifts" }[name];
      if (!table) throw Object.assign(new Error("Unknown collection"), { status: 404 });
      const before = await one(`select * from ${table} where id=$1`, [id]);
      await q(`delete from ${table} where id=$1`, [id]);
      await audit(actor.id, "delete", name, id, before, null);
    }
  };

  return {
    pool, q, one, user, audit, records,
    async health() { return one("select now() as now"); },
    async userByLogin(login) { return one("select * from chay_users where login=$1 and active=true", [login]); },
    async userById(id) { return one("select * from chay_users where id=$1 and active=true", [id]); },
    async createUser(data) { return one("insert into chay_users(login,name,email,role,password_salt,password_hash,avatar_color,profile) values($1,$2,$3,'client',$4,$5,$6,$7) returning *", [data.login,data.name,data.email||null,data.salt,data.hash,data.avatarColor,JSON.stringify(data.profile||{})]); },
    async createSession(data) { return one("insert into chay_sessions(user_id,token_hash,user_agent,ip_hash,expires_at) values($1,$2,$3,$4,$5) returning *", [data.userId,data.tokenHash,data.userAgent,data.ipHash,data.expiresAt]); },
    async sessionByTokenHash(hash) { return one("select s.*,u.login,u.name,u.email,u.role,u.avatar_color,u.profile,u.created_at from chay_sessions s join chay_users u on u.id=s.user_id where s.token_hash=$1 and s.expires_at>now() and u.active=true", [hash]); },
    async touchSession(id) { await q("update chay_sessions set last_seen_at=now() where id=$1 and last_seen_at < now() - interval '10 minutes'", [id]); },
    async deleteSession(hash) { await q("delete from chay_sessions where token_hash=$1", [hash]); },
    async listUsers() { return (await q("select * from chay_users where active=true order by created_at desc")).rows.map(user); },
    async createPublicCertificate(data) {
      const row = await one("insert into chay_certificates(id,buyer_id,buyer_name,recipient_name,phone,amount,wish,code,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,'new',to_timestamp($9/1000.0)) returning *", [data.id,data.buyerId||null,data.buyerName,data.recipientName,data.phone,data.amount,data.wish||"",data.code,data.createdAt||Date.now()]);
      await audit(data.buyerId||null,"create","certificates",data.id,null,{ code:data.code, amount:data.amount, phone:"***"+String(data.phone).slice(-4) });
      return row;
    },
    async createPublicOrder(data) {
      const row = await one("insert into chay_orders(id,user_id,user_name,channel,status,items,total,created_at) values($1,$2,$3,'self','new',$4,$5,to_timestamp($6/1000.0)) returning *", [data.id,data.userId||null,data.userName||"Гость",JSON.stringify(data.items||[]),data.total||0,data.createdAt||Date.now()]);
      await audit(data.userId||null,"create","orders",data.id,null,{ total:data.total, itemCount:(data.items||[]).length });
      return row;
    },
    async updateOwn(id, data) { return one("update chay_users set name=coalesce($2,name),login=coalesce($3,login),email=case when $4 then $5 else email end,avatar_color=coalesce($6,avatar_color),profile=profile || $7::jsonb,updated_at=now() where id=$1 returning *", [id,data.name||null,data.login||null,data.email!==undefined,data.email||null,data.avatarColor||null,JSON.stringify(data.profile||{})]); },
    async updatePassword(id, salt, hash, keepSessionId) { await q("update chay_users set password_salt=$2,password_hash=$3,updated_at=now() where id=$1", [id,salt,hash]); await q("delete from chay_sessions where user_id=$1 and id<>$2", [id,keepSessionId]); },
    async setRole(actorId, id, role) { const before=await this.userById(id); const row=await one("update chay_users set role=$2,updated_at=now() where id=$1 returning *", [id,role]); await audit(actorId,"role_change","user",id,before,row); return row; },
    async close() { await pool.end(); }
  };
}

module.exports = { createRepository };
