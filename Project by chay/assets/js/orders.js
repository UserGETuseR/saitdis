// ===== Заказы «Чайной истории» =====
// Заказ создаётся при оформлении «чашки» (гостем онлайн) или мастером на кассе.
// Связывает гостя, позиции, сумму, статус и канал. Списывает склад, начисляет
// чайному паспорту прогресс. Основа аналитики управляющего.
//
// Запись: { id, ts, userId|null, userName, masterId|null, items:[snapshot], total,
//           channel:'self'|'pos', status:'new'|'brewing'|'done'|'cancelled' }

window.Orders = (function () {
  const col = DB.collection("orders");

  const STATUS = {
    new:       { label: "Принят",     icon: "bi-receipt",       color: "#c9a04e" },
    brewing:   { label: "Завариваем", icon: "bi-cup-hot",       color: "#e8783e" },
    done:      { label: "Готов",      icon: "bi-check2-circle", color: "#8aa06a" },
    cancelled: { label: "Отменён",    icon: "bi-x-circle",      color: "#a07b7b" },
  };
  const FLOW = ["new", "brewing", "done"];

  function snapshot(item) {
    // фиксируем название/цену на момент заказа (как в реальной кассе)
    let name = item.name;
    let sub = item.sub || null;
    if (!name && item.teaId) {
      const t = window.UI ? UI.teaById(item.teaId) : null;
      name = t ? t.name : "Чай";
      if (item.mushroomId) {
        const m = UI.mushroomById(item.mushroomId);
        if (m) sub = m.name;
      }
    }
    return {
      teaId: item.teaId || null,
      mushroomId: item.mushroomId || null,
      kind: item.kind || (item.teaId ? "tea" : "product"),
      sku: item.sku || null,
      name: name || "Позиция",
      sub,
      grams: item.grams ? Number(item.grams) : null,
      quantity: Math.max(1, Number(item.quantity) || 1),
      unit: item.unit || "шт",
      addons: Array.isArray(item.addons) ? item.addons.slice(0, 12) : [],
      price: Number(item.price) || 0,
    };
  }

  return {
    STATUS, FLOW,
    all: () => {const u=window.Auth?.current?.(),branchId=window.Branches?.current?.().id||u?.branchId||"sochi";return col.all().filter((order)=>u?.role==="client"?order.userId===u.id:(order.branchId||"sochi")===branchId).slice().sort((a, b) => b.ts - a.ts);},
    byId: (id) => col.byId(id),

    create({ userId, userName, masterId, items, channel, fulfillment, phone, address, scheduledAt, notification, note }) {
      const snap = (items || []).map(snapshot);
      const total = snap.reduce((s, x) => s + (x.price || 0), 0);
      const order = col.insert({
        branchId:window.Branches?.current?.().id||"sochi",
        ts: Date.now(),
        userId: userId || null,
        userName: userName || "Гость",
        masterId: masterId || null,
        items: snap,
        total,
        channel: channel || "self",
        status: "new",
        fulfillment: fulfillment === "delivery" ? "delivery" : "pickup",
        phone: String(phone || "").trim(),
        address: String(address || "").trim(),
        scheduledAt: scheduledAt || null,
        notification: ["in_app", "call", "telegram"].includes(notification) ? notification : "in_app",
        note: String(note || "").trim(),
      });
      // списываем склад
      if (window.Inventory) snap.forEach((it) => Inventory.consumeForItem(it));
      // начисляем лояльность гостю (штампы, открытия, история)
      // В production начисляет сервер только после статуса «Готов» — так одна
      // чашка не превращается в две отметки после синхронизации.
      if (window.Store && order.userId && !(window.Auth && Auth.isCloud && Auth.isCloud())) Store.creditOrder(order.userId, snap);
      return order;
    },

    setStatus(id, status) {
      if (!STATUS[status]) return;
      return col.update(id, { status });
    },
    advance(id) {
      const o = col.byId(id);
      if (!o) return;
      const i = FLOW.indexOf(o.status);
      if (i >= 0 && i < FLOW.length - 1) col.update(id, { status: FLOW[i + 1] });
    },

    forUser(userId) { return this.all().filter((o) => o.userId === userId); },
    active() { return this.all().filter((o) => o.status === "new" || o.status === "brewing"); },

    // ——— аналитика для управляющего ———
    stats(sinceTs) {
      const list = sinceTs ? col.query((o) => o.ts >= sinceTs) : col.all();
      const paid = list.filter((o) => o.status !== "cancelled");
      const revenue = paid.reduce((s, o) => s + o.total, 0);
      const count = paid.length;
      const avg = count ? Math.round(revenue / count) : 0;
      // топ позиций
      const tally = {};
      paid.forEach((o) => o.items.forEach((it) => {
        const k = it.name;
        tally[k] = (tally[k] || 0) + 1;
      }));
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([name, qty]) => ({ name, qty }));
      // выручка по каналам
      const byChannel = {
        self: paid.filter((o) => o.channel === "self").reduce((s, o) => s + o.total, 0),
        pos: paid.filter((o) => o.channel === "pos").reduce((s, o) => s + o.total, 0),
      };
      return { revenue, count, avg, top, byChannel };
    },

    subscribe(fn) { DB.subscribe("orders", fn); },
  };
})();
