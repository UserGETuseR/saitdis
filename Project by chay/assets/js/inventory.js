// ===== Склад «Чайной истории» =====
// Остатки чая (в граммах) и грибных экстрактов (в порциях/граммах).
// Списывается при оформлении заказа, пополняется управляющим.
// Запись склада: { id (=teaId|mushId), kind:'tea'|'mushroom', name, unit, stock, par }
//   par — целевой запас (ниже par считается «мало»).

window.Inventory = (function () {
  const col = DB.collection("inventory");

  function seedIfEmpty() {
    const branchId=window.Branches?.current?.().id||"sochi";
    const existing=col.all();
    if(existing.some((record)=>(record.branchId||"sochi")===branchId))return;
    const records = [];
    (window.TEAS || []).forEach((t) => {
      records.push({
        id: `${branchId}_${t.id}`,branchId,catalogId:t.id, kind: "tea", name: t.name, unit: "г",
        stock: 250 + Math.round(Math.random() * 6) * 50, // 250–550 г стартово
        par: 150, cat: t.cat,
      });
    });
    (window.MUSHROOMS || []).forEach((m) => {
      records.push({
        id: `${branchId}_${m.id}`,branchId,catalogId:m.id, kind: "mushroom", name: m.name, unit: "порц.",
        stock: 30 + Math.round(Math.random() * 10) * 5, // 30–80 порций
        par: 25,
      });
    });
    col.replaceAll([...existing.map((record)=>({...record,branchId:record.branchId||"sochi",catalogId:record.catalogId||record.id})),...records.map((r) => Object.assign({ createdAt: Date.now() }, r))]);
  }

  return {
    seedIfEmpty,
    all: () => {const branchId=window.Branches?.current?.().id||"sochi";return col.all().filter((record)=>(record.branchId||"sochi")===branchId);},
    byId: (id) => {const branchId=window.Branches?.current?.().id||"sochi";return col.find((record)=>(record.branchId||"sochi")===branchId&&(record.catalogId===id||record.id===id));},

    // списание при заказе (чай — навеска порции ~7 г, гриб — 1 порция)
    consumeForItem(item) {
      if (item.teaId) {
        const rec = col.byId(item.teaId);
        if (rec) col.update(rec.id, { stock: Math.max(0, rec.stock - 7) });
      }
      if (item.mushroomId) {
        const rec = col.byId(item.mushroomId);
        if (rec) col.update(rec.id, { stock: Math.max(0, rec.stock - 1) });
      }
    },

    // ручная корректировка остатка (управляющий)
    adjust(id, delta) {
      const rec = col.byId(id)||this.byId(id);
      if (!rec) return;
      col.update(id, { stock: Math.max(0, rec.stock + delta) });
    },
    setStock(id, value) {
      col.update(id, { stock: Math.max(0, Number(value) || 0) });
    },

    lowStock() { return this.all().filter((r) => r.stock <= r.par); },
    subscribe(fn) { DB.subscribe("inventory", fn); },
  };
})();
