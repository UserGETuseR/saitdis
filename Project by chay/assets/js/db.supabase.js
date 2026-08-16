// ===== Supabase-мост «Чайной истории» (СКЕЛЕТ, пока не подключён) =====
//
// Этот модуль НЕ подключён в index.html. Он — каркас для шага «реальный бэкенд».
// Подход: LOCAL-FIRST + CLOUD SYNC. Приложение продолжает работать с
// localStorage синхронно (как сейчас), а этот слой:
//   1) при входе подтягивает данные из Supabase в локальные ключи (гидрация);
//   2) подписывается на realtime-изменения и обновляет локальные данные;
//   3) при локальной записи зеркалит изменения наверх (upsert в Postgres).
// Так не нужно переписывать все экраны на async — переключение почти бесшовное.
//
// Перед использованием:
//   • выполнить supabase/schema.sql в проекте Supabase;
//   • подключить SDK: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//   • задать ключи в window.CHA_CONFIG (assets/js/config.js);
//   • подключить этот файл ПОСЛЕ db.js и включить флаг backend:'supabase'.

window.SupabaseBridge = (function () {
  let sb = null;
  let ready = false;

  function init() {
    const cfg = window.CHA_CONFIG || {};
    if (cfg.backend !== "supabase") return false;
    if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      console.warn("[SupabaseBridge] нет SDK или ключей — остаёмся на localStorage");
      return false;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    ready = true;
    return true;
  }

  // ——— АУТЕНТИФИКАЦИЯ (заменяет Auth.* при backend:'supabase') ———
  async function register({ name, login, pass, email, role }) {
    // login → служебный e-mail, если гость не дал свой (Supabase Auth требует email)
    const authEmail = email && email.trim() ? email.trim() : `${login}@cha.local`;
    const { data, error } = await sb.auth.signUp({
      email: authEmail,
      password: pass,
      options: { data: { login, name, role: role || "client" } },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, user: data.user };
    // профиль создаётся триггером handle_new_user() на стороне БД
  }

  async function login(loginOrEmail, pass) {
    // ищем e-mail по логину через таблицу profiles (RPC или select), затем signIn
    const { data: prof } = await sb.from("profiles").select("email,login").eq("login", loginOrEmail).maybeSingle();
    const email = prof ? (prof.email || `${prof.login}@cha.local`) : loginOrEmail;
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) return { ok: false, error: "Неверный логин или пароль" };
    return { ok: true, user: data.user };
  }

  async function logout() { await sb.auth.signOut(); }

  // ——— ГИДРАЦИЯ: Supabase → локальные коллекции (DB) ———
  async function hydrate() {
    if (!ready) return;
    const cols = ["inventory", "orders", "shifts"];
    for (const name of cols) {
      const { data, error } = await sb.from(name).select("*");
      if (!error && data) DB.collection(name).replaceAll(data);
    }
  }

  // ——— ЗЕРКАЛИРОВАНИЕ: локальная запись → Supabase ———
  // Подписываемся на изменения локальных коллекций и пушим upsert наверх.
  function mirrorUp() {
    ["orders", "inventory", "shifts"].forEach((name) => {
      DB.subscribe(name, async (arr) => {
        if (!ready) return;
        // в реальной версии — диф и точечный upsert; здесь — наивный полный upsert
        const last = arr[arr.length - 1];
        if (last) await sb.from(name).upsert(last);
      });
    });
  }

  // ——— REALTIME: чужие изменения → локально ———
  function subscribeRealtime() {
    if (!ready) return;
    sb.channel("cha-sync")
      .on("postgres_changes", { event: "*", schema: "public" }, () => hydrate())
      .subscribe();
  }

  return { init, register, login, logout, hydrate, mirrorUp, subscribeRealtime };
})();
