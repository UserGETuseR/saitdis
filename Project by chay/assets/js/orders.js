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

    create({ userId, userName, masterId, items, channel, fulfillment, phone, address, scheduledAt, notification, payment, note }) {
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
        // venue — оплата в чайной (терминал или наличные), sbp — перевод по СБП.
        payment: ["venue", "sbp"].includes(payment) ? payment : "venue",
        paymentStatus: "pending",
        note: String(note || "").trim(),
      });
      // Списание склада. В облаке этим управляет сервер при переводе заказа
      // в «Готов», локально — сразу, чтобы демо-стенд оставался связным.
      if (window.Inventory) snap.forEach((it) => Inventory.consumeForItem(it, order.id));
      // Чайный паспорт (открытия сортов и история) пополняется всегда.
      // Отметки лояльности Store начисляет только вне облака — в production их
      // выдаёт сервер после статуса «Готов», чтобы чашка не удвоилась.
      if (window.Store && order.userId) Store.creditOrder(order.userId, snap);
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

    claimByPhone(userId, phone) {
      const normalized = String(phone || "").replace(/\D/g, "");
      if (!userId || normalized.length < 10) return 0;
      let claimed = 0;
      col.all().forEach((order) => {
        if (!order.userId && String(order.phone || "").replace(/\D/g, "") === normalized) {
          col.update(order.id, { userId });
          claimed += 1;
        }
      });
      return claimed;
    },

    // ——— аналитика для управляющего ———
    // Считается по выбранному городу: this.all() уже фильтрует по branchId,
    // тогда как раньше здесь читалась вся коллекция и директор видел выручку
    // всей сети рядом со списком заказов одного города.
    // Выручка — только по завершённым заказам. Незакрытые показываются отдельно,
    // чтобы «Готов» и «Завариваем» не смешивались в одну цифру.
    stats(sinceTs) {
      const scope = this.all();
      const list = sinceTs ? scope.filter((o) => (o.ts || o.createdAt || 0) >= sinceTs) : scope;
      const done = list.filter((o) => o.status === "done");
      const active = list.filter((o) => o.status === "new" || o.status === "brewing");
      const revenue = done.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const count = done.length;
      const avg = count ? Math.round(revenue / count) : 0;
      // Топ позиций считается по количеству, а не по числу строк заказа.
      // Для чая единица измерения — граммы, поэтому в счёт идёт одна подача.
      const tally = {};
      done.forEach((o) => (o.items || []).forEach((it) => {
        if (!it || !it.name) return;
        const units = it.unit === "g" ? 1 : Math.max(1, Number(it.quantity) || 1);
        tally[it.name] = (tally[it.name] || 0) + units;
      }));
      const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([name, qty]) => ({ name, qty }));
      const byChannel = {
        self: done.filter((o) => o.channel === "self").reduce((s, o) => s + (Number(o.total) || 0), 0),
        pos: done.filter((o) => o.channel === "pos").reduce((s, o) => s + (Number(o.total) || 0), 0),
      };
      return { revenue, count, avg, top, byChannel, activeCount: active.length, activeTotal: active.reduce((s, o) => s + (Number(o.total) || 0), 0) };
    },

    subscribe(fn) { DB.subscribe("orders", fn); },
  };
})();
