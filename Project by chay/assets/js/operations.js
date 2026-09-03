// Рабочие циклы чайной. Хранилище отделено от UI, чтобы позже заменить DB
// сетевым адаптером без переписывания кабинетов.
window.Operations = (function () {
  const messages = DB.collection("messages");
  const requests = DB.collection("staff_requests");
  const reports = DB.collection("shift_reports");
  const certificates = DB.collection("certificates");
  const guides = DB.collection("service_guides");

  const ROLE_LABEL = { master: "чайному мастеру", admin: "управляющей", owner: "директору" };
  const REQUEST_FLOW = { master: "admin", admin: "owner", owner: "owner" };
  const CERTIFICATE_STATUS = {
    new: "Заявка получена",
    contacted: "Команда связалась",
    awaiting_payment: "Ожидаем оплату",
    confirmed: "Оплата подтверждена",
    issued: "Сертификат выпущен",
    redeemed: "Сертификат использован",
    cancelled: "Заявка отменена",
  };

  // Памятки сервиса поставляются вместе со схемой БД (001_production.sql).
  // Локальная заготовка нужна только презентации без сервера: раньше она
  // выполнялась у любого посетителя и упиралась в отказ по правам.
  function seedGuides() {
    if (!(typeof window.CHA_DEMO_ALLOWED === "function" && window.CHA_DEMO_ALLOWED())) return;
    if (window.ApiClient?.isReady?.()) return;
    if (guides.count()) return;
    [
      { title: "Первое приветствие", tag: "контакт", text: "Поздоровайтесь глазами, дайте гостю освоиться и только затем предложите помощь. Не начинайте с продажи." },
      { title: "Гость не знает, чего хочет", tag: "подбор", text: "Спросите не о сорте, а о состоянии: хочется собраться, замедлиться, согреться или попробовать новое." },
      { title: "Сложный разговор", tag: "забота", text: "Сначала признайте чувство гостя, затем коротко повторите проблему своими словами и предложите один понятный следующий шаг." },
      { title: "Передача смены", tag: "команда", text: "Зафиксируйте незакрытые заказы, остатки ниже нормы, договорённости с гостями и любые происшествия." },
    ].forEach((item) => guides.insert(item));
  }

  function user() { return Auth.current(); }
  function branchId(){return window.Branches?.current?.().id||user()?.branchId||"sochi";}
  function sendMessage({ audience, targetId, text, subject }) {
    const u = user();
    if (!u || !String(text || "").trim()) return null;
    return messages.insert({ branchId:branchId(),fromId: u.id, targetId: targetId || null, fromName: u.name, fromRole: u.role, audience, subject: subject || "Диалог", text: String(text).trim(), readBy: [u.id], status: "open" });
  }
  function inbox() {
    const u = user();
    if (!u) return [];
    return messages.all().filter((m) => m.fromId === u.id || m.targetId === u.id || (m.branchId||"sochi")===branchId()&&((u.role !== "client" && m.audience === "team") || m.audience === u.role || (["admin","owner"].includes(u.role) && m.audience === "management"))).sort((a, b) => b.createdAt - a.createdAt);
  }
  function createRequest({ type, title, details, urgency }) {
    const u = user();
    if (!u) return null;
    const assignedRole = REQUEST_FLOW[u.role] || "admin";
    return requests.insert({ branchId:branchId(),type, title: String(title || "").trim(), details: String(details || "").trim(), urgency: urgency || "normal", fromId: u.id, fromName: u.name, fromRole: u.role, assignedRole, assignedLabel: ROLE_LABEL[assignedRole], status: "new", history: [{ status: "new", at: Date.now(), by: u.name }] });
  }
  function visibleRequests() {
    const u = user();
    if (!u) return [];
    return requests.all().filter((r) => r.fromId === u.id || (r.branchId||"sochi")===branchId()&&(r.assignedRole === u.role || ["admin","owner"].includes(u.role))).sort((a, b) => b.createdAt - a.createdAt);
  }
  function setRequestStatus(id, status) {
    const u = user();
    return requests.update(id, (r) => ({ status, history: [...(r.history || []), { status, at: Date.now(), by: u ? u.name : "Система" }] }));
  }
  function createReport({ shift, note, checks }) {
    const u = user();
    if (!u) return null;
    const required = Object.keys(checks || {});
    const completed = required.filter((key) => checks[key]);
    return reports.insert({ branchId:branchId(),userId: u.id, userName: u.name, role: u.role, shift, note: String(note || "").trim(), checks, completed: completed.length, total: required.length, status: completed.length === required.length ? "complete" : "attention" });
  }
  function visibleReports() {
    const u = user();
    if (!u) return [];
    return reports.all().filter((r) => r.userId === u.id || (r.branchId||"sochi")===branchId()&&["admin","owner"].includes(u.role)).sort((a, b) => b.createdAt - a.createdAt);
  }
  function createCertificate({ buyerName, recipientName, phone, amount, wish }) {
    const u = user();
    const now = Date.now();
    const rec = certificates.insert({ branchId:branchId(),buyerId: u ? u.id : null, buyerName: String(buyerName || (u && u.name) || "Гость").trim(), recipientName: String(recipientName || "").trim(), phone: String(phone || "").trim(), amount: Number(amount), wish: String(wish || "").trim(), status: "new", statusHistory: [{ status: "new", at: now, by: u ? u.name : "Гость" }], updatedAt: now, code: "CHI-" + Math.random().toString(36).slice(2, 8).toUpperCase() });
    if(!window.ApiClient?.isReady?.())messages.insert({ branchId:branchId(),fromId: rec.buyerId, fromName: rec.buyerName, fromRole: u ? u.role : "client", audience: "team", subject: "Новый сертификат", text: `Сертификат ${rec.code} на ${rec.amount} ₽ · телефон ${rec.phone}`, readBy: [], status: "open", entityId: rec.id });
    return rec;
  }
  function visibleCertificates() {
    const u = user();
    if (!u) return certificates.all().filter(() => false);
    return certificates.all().filter((c) => c.buyerId === u.id || (c.branchId||"sochi")===branchId()&&["master", "admin", "owner"].includes(u.role)).sort((a, b) => b.createdAt - a.createdAt);
  }
  function setCertificateStatus(id, status, contactNote) {
    const u = user(), current = certificates.byId(id);
    if (!u || !current || !CERTIFICATE_STATUS[status]) return null;
    // Маршрут сертификата ведёт команда. Без этой проверки покупатель менял
    // статус локально, видел «Сертификат выпущен», а сервер отвечал отказом.
    if (!["master", "admin", "owner"].includes(u.role)) return null;
    const at = Date.now(), changed = current.status !== status;
    const updated = certificates.update(id, {
      status,
      contactNote: String(contactNote || current.contactNote || "").trim(),
      updatedAt: at,
      statusHistory: changed ? [...(current.statusHistory || []), { status, at, by: u.name }] : (current.statusHistory || []),
    });
    if (changed && current.buyerId) messages.insert({
      branchId:current.branchId||branchId(),fromId: u.id, targetId: current.buyerId, fromName: u.name, fromRole: u.role,
      audience: "client", subject: `Сертификат ${current.code}`,
      text: `${CERTIFICATE_STATUS[status]}. ${status === "issued" ? `Код ${current.code} готов — сохраните его.` : "Статус обновлён в вашем кабинете."}`,
      readBy: [u.id], status: "open", entityId: current.id,
    });
    return updated;
  }

  seedGuides();
  return { inbox, sendMessage, guides: () => guides.all(), createRequest, visibleRequests, setRequestStatus, createReport, visibleReports, createCertificate, visibleCertificates, setCertificateStatus, certificateStatuses: CERTIFICATE_STATUS };
})();
