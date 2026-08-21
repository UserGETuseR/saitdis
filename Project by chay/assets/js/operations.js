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

  function seedGuides() {
    if (guides.count()) return;
    [
      { title: "Первое приветствие", tag: "контакт", text: "Поздоровайтесь глазами, дайте гостю освоиться и только затем предложите помощь. Не начинайте с продажи." },
      { title: "Гость не знает, чего хочет", tag: "подбор", text: "Спросите не о сорте, а о состоянии: хочется собраться, замедлиться, согреться или попробовать новое." },
      { title: "Сложный разговор", tag: "забота", text: "Сначала признайте чувство гостя, затем коротко повторите проблему своими словами и предложите один понятный следующий шаг." },
      { title: "Передача смены", tag: "команда", text: "Зафиксируйте незакрытые заказы, остатки ниже нормы, договорённости с гостями и любые происшествия." },
    ].forEach((item) => guides.insert(item));
  }

  function user() { return Auth.current(); }
  function sendMessage({ audience, text, subject }) {
    const u = user();
    if (!u || !String(text || "").trim()) return null;
    return messages.insert({ fromId: u.id, fromName: u.name, fromRole: u.role, audience, subject: subject || "Диалог", text: String(text).trim(), readBy: [u.id], status: "open" });
  }
  function inbox() {
    const u = user();
    if (!u) return [];
    return messages.all().filter((m) => m.fromId === u.id || m.audience === "team" || m.audience === u.role || (u.role === "admin" && m.audience === "management")).sort((a, b) => b.createdAt - a.createdAt);
  }
  function createRequest({ type, title, details, urgency }) {
    const u = user();
    if (!u) return null;
    const assignedRole = REQUEST_FLOW[u.role] || "admin";
    return requests.insert({ type, title: String(title || "").trim(), details: String(details || "").trim(), urgency: urgency || "normal", fromId: u.id, fromName: u.name, fromRole: u.role, assignedRole, assignedLabel: ROLE_LABEL[assignedRole], status: "new", history: [{ status: "new", at: Date.now(), by: u.name }] });
  }
  function visibleRequests() {
    const u = user();
    if (!u) return [];
    return requests.all().filter((r) => r.fromId === u.id || r.assignedRole === u.role || u.role === "admin").sort((a, b) => b.createdAt - a.createdAt);
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
    return reports.insert({ userId: u.id, userName: u.name, role: u.role, shift, note: String(note || "").trim(), checks, completed: completed.length, total: required.length, status: completed.length === required.length ? "complete" : "attention" });
  }
  function visibleReports() {
    const u = user();
    if (!u) return [];
    return reports.all().filter((r) => r.userId === u.id || u.role === "admin").sort((a, b) => b.createdAt - a.createdAt);
  }
  function createCertificate({ buyerName, recipientName, phone, amount, wish }) {
    const u = user();
    const rec = certificates.insert({ buyerId: u ? u.id : null, buyerName: String(buyerName || (u && u.name) || "Гость").trim(), recipientName: String(recipientName || "").trim(), phone: String(phone || "").trim(), amount: Number(amount), wish: String(wish || "").trim(), status: "new", code: "CHI-" + Math.random().toString(36).slice(2, 8).toUpperCase() });
    messages.insert({ fromId: rec.buyerId, fromName: rec.buyerName, fromRole: u ? u.role : "client", audience: "team", subject: "Новый сертификат", text: `Сертификат ${rec.code} на ${rec.amount} ₽ · телефон ${rec.phone}`, readBy: [], status: "open", entityId: rec.id });
    return rec;
  }
  function visibleCertificates() {
    const u = user();
    if (!u) return certificates.all().filter(() => false);
    return certificates.all().filter((c) => c.buyerId === u.id || u.role === "master" || u.role === "admin").sort((a, b) => b.createdAt - a.createdAt);
  }
  function setCertificateStatus(id, status) { return certificates.update(id, { status }); }

  seedGuides();
  return { inbox, sendMessage, guides: () => guides.all(), createRequest, visibleRequests, setRequestStatus, createReport, visibleReports, createCertificate, visibleCertificates, setCertificateStatus };
})();
