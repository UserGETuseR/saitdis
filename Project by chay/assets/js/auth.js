// ===== Аккаунты и «база данных» (localStorage) =====
// ВНИМАНИЕ: это клиентский прототип. Пароли хранятся в браузере с простым
// хэшированием — для демонстрации. Для продакшена нужен реальный бэкенд:
// хранение хэшей паролей на сервере, HTTPS, JWT/сессии, защита от перебора.

window.Auth = (function () {
  const DB_KEY = "tea_stories_db_v1";
  const SESSION_KEY = "tea_stories_session_v1";

  const PALETTE = ["#c4452f", "#c9a04e", "#7e9b6f", "#8a7b9c", "#2c6e7e", "#b5654a"];

  function load() {
    try { return JSON.parse(localStorage.getItem(DB_KEY)) || { users: [] }; }
    catch (e) { return { users: [] }; }
  }
  function persist(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

  // простой хэш (демо, НЕ для продакшена)
  function hash(str) {
    let h = 5381;
    const salt = "茶道";
    str = salt + str + salt;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  function avatarColor(seed) {
    let s = 0; for (const c of seed) s += c.charCodeAt(0);
    return PALETTE[s % PALETTE.length];
  }
  function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }

  const listeners = [];
  function emit() { listeners.forEach((fn) => fn(current())); }

  function current() {
    const id = localStorage.getItem(SESSION_KEY);
    if (!id) return null;
    return load().users.find((u) => u.id === id) || null;
  }

  function newProfile(role) {
    const base = {
      bio: "",
      meditationMinutes: 0,
      breathSessions: 0,
      practiceStreak: 0,
      lastPracticeDate: null,
    };
    if (role === "master") {
      return Object.assign(base, {
        title: "Чайный мастер",
        specialties: ["Улуны", "Пуэр", "Гунфу-ча"],
        favoriteTea: "Да Хун Пао",
        rating: 4.9,
        clientsServed: 0,
        philosophy: "Чай — это разговор без слов.",
      });
    }
    if (role === "admin") {
      return Object.assign(base, {
        title: "Управляющий чайной",
        favoriteTea: "Да Хун Пао",
        philosophy: "Порядок снаружи — тишина внутри.",
      });
    }
    return Object.assign(base, {
      favoriteTea: "",
      intention: "Замедлиться и слышать себя.",
    });
  }

  function seedIfEmpty() {
    const db = load();
    const has = (login) => db.users.some((u) => (u.login || "").toLowerCase() === login);
    let changed = false;

    // миграция: у старых аккаунтов не было логина — берём из e-mail (до @)
    db.users.forEach((u) => {
      if (!u.branchId && u.role !== "owner") { u.branchId = "sochi"; changed = true; }
      if (!u.login && u.email) {
        let base = u.email.split("@")[0].replace(/[^a-zA-Z0-9_.-]/g, "") || ("user" + u.id.slice(-4));
        let cand = base, n = 1;
        while (db.users.some((x) => x !== u && (x.login || "").toLowerCase() === cand.toLowerCase())) cand = base + (++n);
        u.login = cand;
        changed = true;
      }
    });

    if (!has("master")) {
      db.users.push({
        id: "u_master_demo", name: "Мастер Лин", login: "master", email: "master@cha.ru",
        pass: hash("master"), role: "master", createdAt: Date.now() - 86400000 * 120,
        avatarColor: "#c4452f", initials: "МЛ",
        profile: Object.assign(newProfile("master"), { clientsServed: 1280, meditationMinutes: 540, breathSessions: 96, practiceStreak: 14 }),
      });
      changed = true;
    }
    if (!has("anna")) {
      db.users.push({
        id: "u_client_demo", name: "Анна Чэнь", login: "anna", email: "anna@cha.ru",
        pass: hash("anna"), role: "client", createdAt: Date.now() - 86400000 * 30,
        avatarColor: "#7e9b6f", initials: "АЧ",
        profile: Object.assign(newProfile("client"), { favoriteTea: "Гёкуро", meditationMinutes: 85, breathSessions: 12, practiceStreak: 3 }),
      });
      changed = true;
    }
    if (!has("admin")) {
      db.users.push({
        id: "u_admin_demo", name: "Чжао Управляющий", login: "admin", email: "admin@cha.ru",
        pass: hash("admin"), role: "admin", createdAt: Date.now() - 86400000 * 200,
        avatarColor: "#c9a04e", initials: "ЧУ",
        profile: Object.assign(newProfile("admin"), { meditationMinutes: 300, breathSessions: 40, practiceStreak: 9 }),
      });
      changed = true;
    }
    if (changed) persist(db);
  }

  return {
    subscribe(fn) { listeners.push(fn); },
    current,
    isMaster: () => { const u = current(); return !!u && u.role === "master"; },
    isAdmin: () => { const u = current(); return !!u && (u.role === "admin" || u.role === "owner"); },
    isStaff: () => { const u = current(); return !!u && (u.role === "master" || u.role === "admin" || u.role === "owner"); },

    // проверка формата логина (латиница/цифры/._-, 3–20 символов)
    validateLogin(login) {
      login = (login || "").trim();
      if (login.length < 3) return { ok: false, error: "Логин минимум 3 символа" };
      if (login.length > 20) return { ok: false, error: "Логин до 20 символов" };
      if (!/^[a-zA-Z0-9_.-]+$/.test(login)) return { ok: false, error: "Логин: латиница, цифры и . _ -" };
      return { ok: true };
    },
    isLoginTaken(login, exceptId) {
      const key = (login || "").trim().toLowerCase();
      return load().users.some((u) => (u.login || "").toLowerCase() === key && u.id !== exceptId);
    },

    register({ name, login, pass, pass2, email, phone, role, branchId="sochi" }) {
      name = (name || "").trim();
      login = (login || "").trim();
      email = (email || "").trim().toLowerCase();
      phone = (phone || "").replace(/[^\d+]/g, "");
      if (name.length < 2) return { ok: false, error: "Введите имя" };
      const lv = this.validateLogin(login);
      if (!lv.ok) return lv;
      if ((pass || "").length < 4) return { ok: false, error: "Пароль минимум 4 символа" };
      if (pass2 !== undefined && pass !== pass2) return { ok: false, error: "Пароли не совпадают" };
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Некорректный e-mail" };
      if (phone.replace(/\D/g, "").length < 10) return { ok:false, error:"Укажите номер телефона для карты лояльности" };
      const db = load();
      if (db.users.some((u) => (u.login || "").toLowerCase() === login.toLowerCase()))
        return { ok: false, error: "Такой логин уже занят" };
      const id = "u_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const user = {
        id, name, login, email: email || "", phone, pass: hash(pass), branchId,
        role: role === "master" ? "master" : "client",
        createdAt: Date.now(), avatarColor: avatarColor(name + login), initials: initials(name),
        profile: newProfile(role),
      };
      db.users.push(user);
      persist(db);
      localStorage.setItem(SESSION_KEY, id);
      emit();
      return { ok: true, user };
    },

    login(login, pass) {
      login = (login || "").trim().toLowerCase();
      const db = load();
      const u = db.users.find((x) => (x.login || "").toLowerCase() === login);
      if (!u || u.pass !== hash(pass)) return { ok: false, error: "Неверный логин или пароль" };
      localStorage.setItem(SESSION_KEY, u.id);
      emit();
      return { ok: true, user: u };
    },

    changePassword(oldPass, newPass) {
      const u = current(); if (!u) return { ok: false, error: "Не выполнен вход" };
      if (u.pass !== hash(oldPass)) return { ok: false, error: "Текущий пароль неверный" };
      if ((newPass || "").length < 4) return { ok: false, error: "Новый пароль минимум 4 символа" };
      const db = load();
      const i = db.users.findIndex((x) => x.id === u.id);
      db.users[i].pass = hash(newPass);
      persist(db);
      emit();
      return { ok: true };
    },

    logout() { localStorage.removeItem(SESSION_KEY); emit(); },

    updateProfile(patch) {
      const u = current(); if (!u) return;
      const db = load();
      const idx = db.users.findIndex((x) => x.id === u.id);
      if (idx < 0) return;
      db.users[idx].profile = Object.assign({}, db.users[idx].profile, patch);
      if (patch.__name) { db.users[idx].name = patch.__name; db.users[idx].initials = initials(patch.__name); }
      persist(db);
      emit();
    },

    // обновление полей аккаунта (имя, логин, e-mail, цвет аватара)
    updateAccount({ name, login, email, phone, avatarColor: ac, branchId }) {
      const u = current(); if (!u) return { ok: false, error: "Не выполнен вход" };
      const db = load();
      const idx = db.users.findIndex((x) => x.id === u.id);
      if (idx < 0) return { ok: false, error: "Пользователь не найден" };
      if (name !== undefined) {
        name = name.trim();
        if (name.length < 2) return { ok: false, error: "Введите имя" };
      }
      if (login !== undefined) {
        login = login.trim();
        const lv = this.validateLogin(login);
        if (!lv.ok) return lv;
        if (this.isLoginTaken(login, u.id)) return { ok: false, error: "Такой логин уже занят" };
      }
      if (email) {
        email = email.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Некорректный e-mail" };
      }
      if (phone !== undefined) {
        phone = String(phone || "").replace(/[^\d+]/g, "");
        if (phone.replace(/\D/g, "").length < 10) return { ok:false, error:"Укажите корректный номер телефона" };
      }
      if (name !== undefined) { db.users[idx].name = name; db.users[idx].initials = initials(name); }
      if (login !== undefined) db.users[idx].login = login;
      if (email !== undefined) db.users[idx].email = email;
      if (phone !== undefined) db.users[idx].phone = phone;
      if (ac) db.users[idx].avatarColor = ac;
      if (branchId !== undefined) db.users[idx].branchId = branchId;
      persist(db);
      emit();
      return { ok: true, user: db.users[idx] };
    },

    // духовный прогресс
    addPractice({ minutes = 0, breath = false }) {
      const u = current(); if (!u) return;
      const db = load();
      const idx = db.users.findIndex((x) => x.id === u.id);
      if (idx < 0) return;
      const p = db.users[idx].profile;
      p.meditationMinutes += minutes;
      if (breath) p.breathSessions += 1;
      // стрик
      const today = new Date().toDateString();
      const last = p.lastPracticeDate ? new Date(p.lastPracticeDate).toDateString() : null;
      if (last !== today) {
        const yest = new Date(Date.now() - 86400000).toDateString();
        p.practiceStreak = last === yest ? (p.practiceStreak || 0) + 1 : 1;
        p.lastPracticeDate = Date.now();
      }
      persist(db);
      emit();
    },

    // «база данных» клиентов — для кабинета мастера
    listClients() { return load().users.filter((u) => u.role === "client"); },
    listAll() { return load().users; },
    listStaff() { return load().users.filter((u) => u.role === "master" || u.role === "admin"); },
    userById(id) { return load().users.find((u) => u.id === id) || null; },

    // ——— управление персоналом (для управляющего) ———
    updateUser(id, patch) {
      const db = load();
      const i = db.users.findIndex((u) => u.id === id);
      if (i < 0) return { ok: false, error: "Пользователь не найден" };
      db.users[i] = Object.assign({}, db.users[i], patch);
      if (patch.name) db.users[i].initials = initials(patch.name);
      persist(db);
      emit();
      return { ok: true, user: db.users[i] };
    },
    setRole(id, role) {
      if (!["client", "master", "admin"].includes(role)) return { ok: false, error: "Неизвестная роль" };
      const db = load();
      const i = db.users.findIndex((u) => u.id === id);
      if (i < 0) return { ok: false, error: "Пользователь не найден" };
      // при повышении до сотрудника добавляем недостающие поля профиля
      if (role !== db.users[i].role) {
        db.users[i].profile = Object.assign({}, newProfile(role), db.users[i].profile);
      }
      db.users[i].role = role;
      persist(db);
      emit();
      return { ok: true, user: db.users[i] };
    },

    seedIfEmpty,
  };
})();
