// ===== Склад «Чайной истории» =====
// Остатки чая (в граммах) и грибных экстрактов (в порциях/граммах).
// Списывается при оформлении заказа, пополняется управляющим.
// Запись склада: { id (=teaId|mushId), kind:'tea'|'mushroom', name, unit, stock, par }
//   par — целевой запас (ниже par считается «мало»).

window.Inventory = (function () {
  const col = DB.collection("inventory");
  const movements = DB.collection("inventory_movements");
  const TYPE = {
    receipt: "Поступление", writeoff: "Списание", sale: "Продажа",
    stocktake: "Инвентаризация", correction: "Корректировка",
    transfer_in: "Перемещение · приход", transfer_out: "Перемещение · расход",
  };

  function branchId() { return window.Branches?.current?.().id || window.Auth?.current?.()?.branchId || "sochi"; }
  function round(value) { return Math.round(Number(value) * 1000) / 1000; }
  function movementDelta(type, quantity, before) {
    const raw = Number(quantity);
    if (type === "stocktake") return round(raw - before);
    if (["writeoff","sale","transfer_out"].includes(type)) return -Math.abs(raw);
    if (["receipt","transfer_in"].includes(type)) return Math.abs(raw);
    return round(raw);
  }

  // Стартовый справочник — только для локальной презентации без сервера.
  // Раньше эта функция вызывалась и в облаке для сотрудника: случайные остатки
  // уезжали в боевую базу и перезаписывали настоящий справочник.
  // Остатки заводятся нулями: реальное количество вводится поступлением или
  // инвентаризацией, чтобы у каждой цифры был документ.
  function seedIfEmpty() {
    if (!(typeof window.CHA_DEMO_ALLOWED === "function" && window.CHA_DEMO_ALLOWED())) return;
    if (window.ApiClient?.isReady?.()) return;
    const activeBranch=branchId();
    const existing=col.all();
    if(existing.some((record)=>(record.branchId||"sochi")===activeBranch))return;
    const records = [];
    (window.TEAS || []).forEach((t) => {
      records.push({ id: `${activeBranch}_${t.id}`,branchId:activeBranch,catalogId:t.id, kind: "tea", name: t.name, unit: "г", stock: 0, par: 150, cat: t.cat });
    });
    (window.MUSHROOMS || []).forEach((m) => {
      records.push({ id: `${activeBranch}_${m.id}`,branchId:activeBranch,catalogId:m.id, kind: "mushroom", name: m.name, unit: "порц.", stock: 0, par: 25 });
    });
    col.replaceAll([...existing.map((record)=>({...record,branchId:record.branchId||"sochi",catalogId:record.catalogId||record.id})),...records.map((r) => Object.assign({ createdAt: Date.now() }, r))]);
  }

  return {
    seedIfEmpty,
    TYPE,
    all: () => {const activeBranch=branchId();return col.all().filter((record)=>(record.branchId||"sochi")===activeBranch);},
    byId: (id) => {const activeBranch=branchId();return col.find((record)=>(record.branchId||"sochi")===activeBranch&&(record.catalogId===id||record.id===id));},
    history(limit=80) { const activeBranch=branchId(); return movements.all().filter((record)=>(record.branchId||"sochi")===activeBranch).sort((a,b)=>b.createdAt-a.createdAt).slice(0,limit); },

    createItem(data) {
      const name=String(data.name||"").trim(); if(!name)throw new Error("Укажите название позиции");
      const enteredCode=String(data.catalogId||"").trim().toLowerCase();
      const catalogId=(enteredCode.replace(/[^a-z0-9_-]+/g,"_").replace(/^_|_$/g,"").slice(0,70)||`sku_${Date.now().toString(36)}`);
      if(this.byId(catalogId))throw new Error("Позиция с таким кодом уже существует");
      return col.insert({id:`${branchId()}_${catalogId}`,branchId:branchId(),catalogId,kind:data.kind||"other",name,unit:String(data.unit||"шт").trim().slice(0,20),stock:0,par:Math.max(0,round(data.par||0)),cat:data.cat||null});
    },

    async move(data) {
      const item=this.byId(data.inventoryId); if(!item)throw new Error("Позиция склада не найдена");
      const type=TYPE[data.type]?data.type:"correction", before=Number(item.stock)||0;
      const delta=movementDelta(type,data.quantity,before), after=round(before+delta);
      // Инвентаризация «всё сошлось» — нормальный результат, а не ошибка ввода:
      // движение не создаётся, потому что остаток не изменился.
      if(type==="stocktake"&&delta===0)return {inventory:this.byId(item.catalogId||item.id),movement:null,unchanged:true};
      if(!Number.isFinite(delta)||delta===0)throw new Error("Укажите количество, которое меняет остаток");
      if(after<0)throw new Error("Нельзя списать больше текущего остатка");
      const payload={id:DB.uid("mov"),inventoryId:item.id,branchId:item.branchId||branchId(),catalogId:item.catalogId,type,quantity:type==="stocktake"?Number(data.quantity):delta,reason:String(data.reason||"").trim(),documentRef:String(data.documentRef||"").trim(),actorName:Auth.current()?.name||"Система",createdAt:Date.now()};
      if(window.ApiClient?.isReady?.())return ApiClient.inventory.move(payload);
      const updated=col.update(item.id,{stock:after});
      const movement=movements.insert({...payload,quantity:delta,stockBefore:before,stockAfter:after});
      return {inventory:updated,movement};
    },

    // Списание по позиции заказа. В облаке остатки ведёт сервер: он списывает
    // их одной транзакцией при переводе заказа в «Готов» (repository.js ·
    // applyOrderStock). Здесь остаётся только локальный контур презентации.
    // Раньше с любого заказа списывалось ровно 7 г независимо от навески.
    consumeForItem(item, orderId) {
      if (window.Auth?.isCloud?.()) return;
      const write = (rec, amount, unitLabel) => {
        if (!rec || !(amount > 0)) return;
        const before = Number(rec.stock) || 0;
        const taken = Math.min(before, round(amount));
        if (taken <= 0) return;
        const after = round(before - taken);
        col.update(rec.id, { stock: after });
        movements.insert({ id: DB.uid("mov"), inventoryId: rec.id, branchId: rec.branchId || branchId(), catalogId: rec.catalogId, type: "sale", quantity: -taken, stockBefore: before, stockAfter: after, reason: `Продажа по заказу ${orderId || "—"}${unitLabel ? ` · ${taken} ${unitLabel}` : ""}`, documentRef: orderId || "", actorName: Auth.current()?.name || "Система", createdAt: Date.now() });
      };
      const quantity = Math.max(1, Number(item.quantity) || 1);
      if (item.teaId) {
        // Навеска чая приходит в граммах: quantity при unit="g" либо grams.
        const grams = Number(item.grams) || (item.unit === "g" ? quantity : 0);
        write(this.byId(item.teaId), grams > 0 ? grams : 7, "г");
      }
      if (item.mushroomId) write(this.byId(item.mushroomId), 1, "порц.");
      if (!item.teaId && !item.mushroomId && item.sku) {
        const sku = String(item.sku).trim().toLowerCase();
        const short = sku.includes("-") ? sku.slice(sku.indexOf("-") + 1) : sku;
        write(this.byId(short) || this.byId(sku), quantity, item.unit || "шт");
      }
    },

    // ручная корректировка остатка (управляющий)
    adjust(id, delta, reason="Быстрая корректировка") {
      return this.move({inventoryId:id,type:"correction",quantity:delta,reason});
    },
    setStock(id, value) {
      return this.move({ inventoryId:id, type:"stocktake", quantity:value, reason:"Инвентаризация" });
    },

    lowStock() { return this.all().filter((r) => r.stock <= r.par); },
    subscribe(fn) { DB.subscribe("inventory", fn); },
  };
})();
