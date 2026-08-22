// Same-origin production API with automatic local fallback.
// It does not implement offline mode: localStorage is only a compatibility
// buffer for the current UI. The server remains the source of truth in cloud mode.
window.ApiClient = (function () {
  let ready = false;
  let hydrating = false;
  let state = "local";
  const listeners = [];
  const pending = new Map();
  const STAFF_COLLECTIONS = ["messages", "staff_requests", "shift_reports", "service_guides", "inventory", "orders", "shifts", "certificates"];
  const CLIENT_COLLECTIONS = ["orders", "certificates", "messages"];

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
    register: (data) => request(api("/auth/register"), { method:"POST", body:{ name:data.name, login:data.login, email:data.email, password:data.pass, password2:data.pass2 } }),
    logout: () => request(api("/auth/logout"), { method:"POST", body:{} }),
    update: (data) => request(api("/auth/me"), { method:"PATCH", body:data }),
    password: (currentPassword, newPassword) => request(api("/auth/password"), { method:"PATCH", body:{ currentPassword, newPassword } }),
    users: () => request(api("/users")),
    team: () => request(api("/team")),
    setRole: (id, role) => request(api(`/users/${encodeURIComponent(id)}/role`), { method:"PATCH", body:{ role } }),
  };
  const loyalty = {
    me: () => request(api("/loyalty")),
    adjust: (userId, delta, note) => request(api(`/loyalty/${encodeURIComponent(userId)}/adjust`), { method:"POST", body:{ delta, note } }),
  };
  const integrations = { oneCStatus:(probe=false)=>request(api(`/integrations/1c/status${probe?"?probe=1":""}`)) };

  async function list(name) { return (await request(api(`/records/${name}`))).items || []; }
  function pushRecord(name, record) {
    if (!ready || hydrating || !record) return Promise.resolve(false);
    const key = `${name}:${record.id}`;
    const previous = pending.get(key) || Promise.resolve();
    const task = previous.catch(() => false).then(async () => { try {
      if (name === "certificates" && !window.Auth?.isStaff?.()) await request(api("/public/certificates"), { method:"POST", body:record });
      else if (name === "orders" && !window.Auth?.isStaff?.()) await request(api("/public/orders"), { method:"POST", body:{ ...record, createdAt:record.ts || record.createdAt } });
      else await request(api(`/records/${name}`), { method:"PUT", body:record });
      setState("cloud", { synced:name }); return true;
    } catch (error) { setState("degraded", { error:error.message, collection:name }); return false; } });
    pending.set(key, task);
    task.finally(() => setTimeout(() => { if (pending.get(key) === task) pending.delete(key); }, 1000));
    return task;
  }

  async function removeRecord(name, id) {
    if (!ready || hydrating) return false;
    try { await request(api(`/records/${name}/${encodeURIComponent(id)}`), { method:"DELETE" }); return true; }
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
        // First production launch: allow an authenticated employee to migrate
        // a locally seeded catalogue, but never let a client upload demo data.
        if (!remote.length && local.length && ["master", "admin", "owner"].includes(user.role)) {
          hydrating = false;
          for (const record of local) await pushRecord(name, record);
          hydrating = true;
        } else DB.collection(name).replaceAll(remote);
      }
      setState("cloud", { hydrated:true });
    } finally { hydrating = false; }
  }

  return {
    init, auth, loyalty, integrations, hydrate, list, pushRecord, removeRecord,
    isReady: () => ready,
    isHydrating: () => hydrating,
    status: () => state,
    whenSynced(name,id) { return pending.get(`${name}:${id}`) || Promise.resolve(!ready ? false : true); },
    subscribe(fn) { listeners.push(fn); },
  };
})();
