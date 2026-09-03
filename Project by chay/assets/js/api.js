// Same-origin production API with automatic local fallback.
// It does not implement offline mode: localStorage is only a compatibility
// buffer for the current UI. The server remains the source of truth in cloud mode.
window.ApiClient = (function () {
  let ready = false;
  let hydrating = false;
  let state = "local";
  const listeners = [];
  const pending = new Map();
  const STAFF_COLLECTIONS = ["messages", "staff_requests", "shift_reports", "service_guides", "inventory", "inventory_movements", "publications", "orders", "shifts", "certificates", "notifications"];
  const CLIENT_COLLECTIONS = ["orders", "certificates", "messages", "notifications"];
  const pendingRetry = [];
  // Журнал движений склада создаётся только через POST /inventory/movements,
  // а уведомления сервер выдаёт сам. Попытка записать их через /records
  // возвращала отказ и уводила индикатор синхронизации в «degraded».
  const READ_ONLY_COLLECTIONS = new Set(["inventory_movements", "notifications"]);

  // Реестр записей, приём которых сервер подтвердил. Он позволяет отличить
  // «сервер удалил запись» от «запись ещё не доехала до сервера».
  const SYNCED_KEY = "cha_synced_v1";
  function readSynced() {
    try { return new Set(JSON.parse(localStorage.getItem(SYNCED_KEY)) || []); } catch (_) { return new Set(); }
  }
  function writeSynced(set) {
    try { localStorage.setItem(SYNCED_KEY, JSON.stringify([...set].slice(-4000))); } catch (_) {}
  }
  function isSynced(name, id) { return readSynced().has(`${name}:${id}`); }
  function rememberSynced(name, id) { const set = readSynced(); set.add(`${name}:${id}`); writeSynced(set); }
  function forgetSynced(name, ids) {
    if (!ids || !ids.length) return;
    const set = readSynced();
    ids.forEach((id) => set.delete(`${name}:${id}`));
    writeSynced(set);
  }

  function emit(extra) { listeners.forEach((fn) => { try { fn({ state, ready, ...extra }); } catch (_) {} }); }
  function setState(next, extra) { state = next; emit(extra); }

  async function request(path, options) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(path, {
        method: (options && options.method) || "GET",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...((options && options.headers) || {}) },
        body: options && options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.error || "Сервис временно недоступен"), { status: response.status });
      return data;
    } finally { clearTimeout(timeout); }
  }

  async function init() {
    const cfg = window.CHA_CONFIG || {};
    if (cfg.backend === "local") return false;
    setState("checking");
    try {
      const health = await request((cfg.apiBase || "/api") + "/health");
      if (!health.ok || health.service !== "chay-api") throw new Error("Production API is not attached");
      ready = true; setState("cloud"); return true;
    } catch (error) {
      ready = false; setState("local", { error: error.message }); return false;
    }
  }

  function api(path) { return ((window.CHA_CONFIG && CHA_CONFIG.apiBase) || "/api") + path; }
  const auth = {
    me: () => request(api("/auth/me")),
    login: (login, password) => request(api("/auth/login"), { method:"POST", body:{ login, password } }),
    register: (data) => request(api("/auth/register"), { method:"POST", body:{ name:data.name, login:data.login, email:data.email, phone:data.phone, branchId:data.branchId, password:data.pass, password2:data.pass2 } }),
    logout: () => request(api("/auth/logout"), { method:"POST", body:{} }),
    update: (data) => request(api("/auth/me"), { method:"PATCH", body:data }),
    password: (currentPassword, newPassword) => request(api("/auth/password"), { method:"PATCH", body:{ currentPassword, newPassword } }),
    users: () => request(api("/users")),
    branches: () => request(api("/branches")),
    branchSummary: () => request(api("/branches/summary")),
    team: (branchId) => request(api(`/team${branchId?`?branch=${encodeURIComponent(branchId)}`:""}`)),
    setRole: (id, role) => request(api(`/users/${encodeURIComponent(id)}/role`), { method:"PATCH", body:{ role } }),
    setUserBranch: (id, branchId) => request(api(`/users/${encodeURIComponent(id)}/branch`), { method:"PATCH", body:{ branchId } }),
  };
  const loyalty = {
    me: () => request(api("/loyalty")),
    search: (phone) => request(api(`/loyalty/search?phone=${encodeURIComponent(phone)}`)),
    adjust: (userId, delta, note) => request(api(`/loyalty/${encodeURIComponent(userId)}/adjust`), { method:"POST", body:{ delta, note } }),
  };
  const notifications = { read:(id)=>request(api(`/notifications/${encodeURIComponent(id)}/read`),{method:"PATCH",body:{}}) };
  const integrations = { oneCStatus:(probe=false)=>request(api(`/integrations/1c/status${probe?"?probe=1":""}`)) };
  const publications = { publicList:(branchId="")=>request(api(`/public/publications${branchId?`?branch=${encodeURIComponent(branchId)}`:""}`)).then((result)=>result.items||[]) };
  const inventory = {
    async move(data) {
      const result = await request(api("/inventory/movements"), { method:"POST", body:data });
      hydrating = true;
      try {
        if (result.inventory) DB.collection("inventory").upsert(result.inventory);
        if (result.movement) DB.collection("inventory_movements").upsert(result.movement);
      } finally { hydrating = false; }
      setState("cloud", { synced:"inventory_movements" });
      return result;
    },
  };

  async function list(name) { return (await request(api(`/records/${name}`))).items || []; }

  // Публичные маршруты могут выдать свой идентификатор и всегда ставят статус
  // «новый». Без переноса id локальная запись осиротеет при следующей гидратации.
  function adoptServerId(name, record, result) {
    const serverId = result && result.id;
    if (!serverId) return;
    if (serverId !== record.id) {
      hydrating = true;
      try {
        DB.collection(name).remove(record.id);
        DB.collection(name).upsert({ ...record, id: serverId, status: result.status || record.status });
      } finally { hydrating = false; }
      rememberSynced(name, serverId);
    } else if (result.status && result.status !== record.status) {
      hydrating = true;
      try { DB.collection(name).update(record.id, { status: result.status }); } finally { hydrating = false; }
    }
  }
  function pushRecord(name, record) {
    if (!ready || hydrating || !record) return Promise.resolve(false);
    const key = `${name}:${record.id}`;
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.catch(() => false).then(async () => { try {
      if (name === "inventory_movements") return true; // журнал ведёт сервер
      else if (name === "notifications") await notifications.read(record.id);
      else if (name === "certificates" && !window.Auth?.isStaff?.()) {
        const result = await request(api("/public/certificates"), { method:"POST", body:{...record,branchId:record.branchId||window.Branches?.current?.().id||"sochi"} });
        adoptServerId(name, record, result);
      }
      else if (name === "orders" && !window.Auth?.isStaff?.()) {
        const result = await request(api("/public/orders"), { method:"POST", body:{ ...record, branchId:record.branchId||window.Branches?.current?.().id||"sochi", createdAt:record.ts || record.createdAt } });
        adoptServerId(name, record, result);
      }
      else await request(api(`/records/${name}`), { method:"PUT", body:record });
      rememberSynced(name, record.id);
      setState("cloud", { synced:name }); return true;
    } catch (error) { setState("degraded", { error:error.message, collection:name }); return false; } });
    pending.set(key, task);
    task.finally(() => setTimeout(() => { if (pending.get(key) === task) pending.delete(key); }, 1000));
    return task;
  }

  async function removeRecord(name, id) {
    if (!ready || hydrating) return false;
    if (READ_ONLY_COLLECTIONS.has(name)) return false;
    try { await request(api(`/records/${name}/${encodeURIComponent(id)}`), { method:"DELETE" }); forgetSynced(name, [id]); return true; }
    catch (error) { setState("degraded", { error:error.message, collection:name }); return false; }
  }

  async function hydrate(user) {
    if (!ready || !user) return;
    const collections = ["master", "admin", "owner"].includes(user.role) ? STAFF_COLLECTIONS : CLIENT_COLLECTIONS;
    hydrating = true;
    try {
      for (const name of collections) {
        const local = DB.collection(name).all();
        const remote = await list(name);
        const remoteIds = new Set(remote.map((record) => record && record.id));
        // Записи, которые сервер уже принял, при отсутствии в ответе считаются
        // удалёнными и уходят. Всё, что отправить не удалось, остаётся на
        // устройстве: раньше replaceAll стирал такие записи молча.
        const unsent = local.filter((record) => record && record.id && !remoteIds.has(record.id) && !isSynced(name, record.id));
        DB.collection(name).replaceAll([...remote, ...unsent]);
        forgetSynced(name, local.filter((record) => record && record.id && !remoteIds.has(record.id)).map((record) => record.id));
        if (unsent.length) pendingRetry.push(...unsent.map((record) => ({ name, record })));
      }
      setState("cloud", { hydrated:true });
    } finally { hydrating = false; }
    // Повторная отправка выполняется уже вне окна гидратации, иначе pushRecord
    // отбрасывает записи проверкой hydrating.
    if (pendingRetry.length) {
      const queue = pendingRetry.splice(0, pendingRetry.length);
      for (const item of queue) await pushRecord(item.name, item.record);
    }
  }

  return {
    init, auth, loyalty, notifications, integrations, publications, inventory, hydrate, list, pushRecord, removeRecord,
    isReady: () => ready,
    isHydrating: () => hydrating,
    status: () => state,
    // Раньше отсутствие задачи в очереди трактовалось как успех. Теперь ответ
    // «да» даётся только по факту подтверждения сервером.
    whenSynced(name,id) { return pending.get(`${name}:${id}`) || Promise.resolve(ready ? isSynced(name,id) : false); },
    subscribe(fn) { listeners.push(fn); },
  };
})();
