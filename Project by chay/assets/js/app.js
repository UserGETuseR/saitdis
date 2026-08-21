// ===== Ядро приложения: роутер, корзина, эликсиры =====

window.App = (function () {
  const routes = {
    "/": Views.home,
    "/alchemist": Views.alchemist,
    "/elixirs": Views.elixirs,
    "/menu": Views.menu,
    "/events": Views.events,
    "/mushrooms": Views.mushrooms,
    "/passport": Views.passport,
    "/meditate": Views.meditate,
    "/brew": Views.brew,
    "/certificate": Views.certificate,
    "/team": Views.team,
    "/auth": Views.auth,
    "/client": Views.client,
    "/master": Views.master,
    "/admin": Views.admin,
    "/profile": Views.profile,
  };

  // маршруты, требующие авторизации / роли
  const GUARD = {
    "/client": (u) => u && u.role === "client",
    "/master": (u) => u && u.role === "master",
    "/admin": (u) => u && (u.role === "admin" || u.role === "owner"),
    "/profile": (u) => !!u,
    "/passport": (u) => !!u,
    "/team": (u) => u && (u.role === "master" || u.role === "admin" || u.role === "owner"),
  };

  let root;

  function currentPath() {
    const h = window.location.hash.replace(/^#/, "");
    return h || "/";
  }

  function render() {
    let path = currentPath();
    // гвард доступа
    const guard = GUARD[path];
    if (guard && !guard(Auth.current())) {
      window.location.hash = "#/auth";
      path = "/auth";
    }
    const view = (routes[path] || Views.home)();
    root.innerHTML = view.html;
    if (view.mount) view.mount(root);
    root.scrollTop = 0;
    window.scrollTo(0, 0);
    renderChrome(path);
    updateCartBadge();
  }

  // ----- Навигация по ролям -----
  function navModel() {
    const u = Auth.current();
    const L = {
      home: { route: "/", icon: "bi-house-door", label: "Главная" },
      alch: { route: "/alchemist", icon: "bi-moon-stars", label: "Алхимик" },
      elx: { route: "/elixirs", icon: "bi-droplet-half", label: "Эликсиры" },
      menu: { route: "/menu", icon: "bi-cup-hot", label: "Меню" },
      events: { route: "/events", icon: "bi-calendar-event", label: "Афиша" },
      mush: { route: "/mushrooms", icon: "bi-flower1", label: "Грибы" },
      med: { route: "/meditate", icon: "bi-wind", label: "Практики" },
      brew: { route: "/brew", icon: "bi-hourglass-split", label: "Заварить" },
      cert: { route: "/certificate", icon: "bi-gift", label: "Сертификат" },
      team: { route: "/team", icon: "bi-chat-square-heart", label: "Команда" },
      pass: { route: "/passport", icon: "bi-patch-check", label: "Паспорт" },
      client: { route: "/client", icon: "bi-grid", label: "Кабинет" },
      master: { route: "/master", icon: "bi-grid", label: "Кабинет" },
      admin: { route: "/admin", icon: "bi-speedometer2", label: "Управление" },
    };
    if (!u) return { links: [L.home, L.brew, L.menu, L.events, L.cert], tab: [L.home, L.brew, L.menu, L.events, L.cert] };
    if (u.role === "admin" || u.role === "owner") return { links: [L.admin, L.team, L.menu, L.events, L.med], tab: [L.admin, L.team, L.menu, L.events, L.med] };
    if (u.role === "master") return { links: [L.master, L.team, L.brew, L.menu, L.med], tab: [L.master, L.team, L.brew, L.menu, L.med] };
    return { links: [L.client, L.brew, L.menu, L.events, L.cert, L.pass], tab: [L.client, L.brew, L.menu, L.cert, L.pass] };
  }

  function renderChrome(path) {
    const u = Auth.current();
    const model = navModel();
    const linkHTML = (a) => `<a data-route="${a.route}" href="#${a.route}" class="${a.route === path ? "active" : ""}"><i class="bi ${a.icon}"></i> ${a.label}</a>`;
    const tabHTML = (a) => `<a data-route="${a.route}" href="#${a.route}" class="${a.route === path ? "active" : ""}"><i class="bi ${a.icon}"></i>${a.label}</a>`;

    document.getElementById("navLinks").innerHTML = model.links.map(linkHTML).join("");

    const auth = document.getElementById("navAuth");
    if (u) {
      auth.innerHTML = `<a class="nav-user ${path === "/profile" ? "active" : ""}" data-route="/profile" href="#/profile" title="Профиль">${UI.avatar(u, 34)}<span class="nu-name">${u.name.split(" ")[0]}</span></a>`;
    } else {
      auth.innerHTML = `<a class="btn small login-btn" data-route="/auth" href="#/auth"><i class="bi bi-box-arrow-in-right"></i> Войти</a>`;
    }

    const tab = document.getElementById("tabLinks");
    const tabItems = model.tab.slice();
    tabItems.push(u
      ? { route: "/profile", icon: "bi-person", label: "Профиль" }
      : { route: "/auth", icon: "bi-box-arrow-in-right", label: "Войти" });
    tab.innerHTML = tabItems.map(tabHTML).join("");

    ["navLinks", "navAuth", "tabLinks"].forEach((id) => {
      document.getElementById(id).querySelectorAll("[data-route]").forEach((a) =>
        a.addEventListener("click", (e) => { e.preventDefault(); UI.navigate("#" + a.dataset.route); })
      );
    });
  }

  function afterAuth(user) {
    UI.toast(`Добро пожаловать, ${user.name.split(" ")[0]}`);
    const home = (user.role === "admin" || user.role === "owner") ? "admin" : user.role === "master" ? "master" : "client";
    UI.navigate("#/" + home);
  }

  function logout() {
    Auth.logout();
    UI.toast("Вы вышли");
    UI.navigate("#/");
  }

  /* ----- Корзина ----- */
  function updateCartBadge() {
    const n = window.Store.get().cart.length;
    document.querySelectorAll(".cart-count").forEach((b) => {
      b.textContent = n;
      b.classList.toggle("hidden", n === 0);
    });
  }

  function addElixir(teaId, mushroomId) {
    const tea = UI.teaById(teaId);
    const m = mushroomId ? UI.mushroomById(mushroomId) : null;
    const price = tea.price + (m ? m.price : 0);
    window.Store.addToCart(teaId, mushroomId, price);
    updateCartBadge();
    UI.toast(`${tea.name}${m ? ` × ${m.name}` : ""} — в чашке`);
    renderCart();
  }

  /* ----- Фирменный эликсир-состояние (концепт «меню Деда») ----- */
  function addElixirState(id) {
    const e = (window.ELIXIRS || []).find((x) => x.id === id);
    if (!e) return;
    window.Store.addCustomToCart(`Эликсир «${e.title}»`, e.price, `${e.subtitle} · ${e.ingredient.name}`);
    updateCartBadge();
    UI.toast(`Эликсир «${e.title}» — в чашке`);
    renderCart();
  }

  /* ----- Позиции меню: напитки, холодный чай, десерты ----- */
  function addMenuItem(id) {
    const pools = [window.SIGNATURE_DRINKS, window.MATCHA_DRINKS, window.COLD_DRINKS, window.DESSERTS];
    let item = null;
    for (const p of pools) { if (p) { const f = p.find((x) => x.id === id); if (f) { item = f; break; } } }
    if (!item) return;
    const sub = item.comp || item.addon || (item.fillings ? item.fillings.join(" · ") : null);
    window.Store.addCustomToCart(item.name, item.price, sub);
    updateCartBadge();
    UI.toast(`${item.name} — в чашке`);
    renderCart();
  }

  /* ----- Услуги и ритуалы ----- */
  function addService(id) {
    const s = (window.SERVICES || []).find((x) => x.id === id);
    if (!s) return;
    const sub = s.tiers ? `по категории чая · ${s.unit}` : (s.addon || s.unit);
    window.Store.addCustomToCart(s.name, s.price, sub);
    updateCartBadge();
    UI.toast(`${s.name} — добавлено`);
    renderCart();
  }

  /* ----- Выбор грибного усилителя при добавлении из меню ----- */
  function openElixirPicker(teaId) {
    const tea = UI.teaById(teaId);
    const modal = document.getElementById("modal");
    modal.innerHTML = `
      <div class="modal-card">
        <button class="modal-x" data-close><i class="bi bi-x-lg"></i></button>
        <div class="section-tag"><i class="bi bi-droplet-half"></i> Собери эликсир</div>
        <h3 class="modal-h">${tea.name}</h3>
        <p class="muted">Усилить функциональным грибом? (по желанию)</p>
        <div class="picker">
          <button class="pick-mush none" data-pick=""><i class="bi bi-cup-hot pm-glyph"></i><span class="pm-name">Без гриба</span><small>чистый чай · ${UI.rub(tea.price)}</small></button>
          ${window.MUSHROOMS.map((m) => `
            <button class="pick-mush" data-pick="${m.id}" style="--mc:${m.color}">
              <i class="bi ${m.icon} pm-glyph"></i>
              <span class="pm-name">${m.name}</span>
              <small>${window.EFFECTS[m.effectKey].label} · +${UI.rub(m.price)}</small>
            </button>`).join("")}
        </div>
      </div>`;
    modal.classList.add("open");
    modal.querySelector("[data-close]").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    modal.querySelectorAll("[data-pick]").forEach((b) =>
      b.addEventListener("click", () => {
        addElixir(teaId, b.dataset.pick || null);
        closeModal();
      })
    );
  }

  function closeModal() {
    const modal = document.getElementById("modal");
    modal.classList.remove("open");
    modal.innerHTML = "";
  }

  function renderCart() {
    const s = window.Store.get();
    const body = document.getElementById("cartBody");
    if (!body) return;
    if (!s.cart.length) {
      body.innerHTML = `<p class="muted center" style="padding:40px 0">Чашка пуста.<br/>Загляни в меню или к Алхимику.</p>`;
    } else {
      body.innerHTML = s.cart.map((item, i) => {
        const t = item.teaId ? UI.teaById(item.teaId) : null;
        const m = item.mushroomId ? UI.mushroomById(item.mushroomId) : null;
        const title = item.name || (t ? t.name : "—");
        const sub = item.sub
          ? `<div class="ci-mush"><i class="bi bi-droplet-half"></i> ${item.sub}</div>`
          : (m ? `<div class="ci-mush"><i class="bi ${m.icon}"></i> ${m.name}</div>` : "");
        return `<div class="cart-item">
          <div>
            <div class="ci-name">${title}</div>
            ${sub}
          </div>
          <div class="ci-right">
            <span class="ci-price">${UI.rub(item.price)}</span>
            <button class="ci-del" data-del="${i}">×</button>
          </div>
        </div>`;
      }).join("");
      body.querySelectorAll("[data-del]").forEach((b) =>
        b.addEventListener("click", () => { window.Store.removeFromCart(+b.dataset.del); renderCart(); updateCartBadge(); })
      );
    }
    const totalEl = document.getElementById("cartTotal");
    if (totalEl) totalEl.textContent = UI.rub(window.Store.cartTotal());
  }

  function openCart() {
    document.getElementById("cart").classList.add("open");
    document.getElementById("cartOverlay").classList.add("open");
    renderCart();
  }
  function closeCart() {
    document.getElementById("cart").classList.remove("open");
    document.getElementById("cartOverlay").classList.remove("open");
  }

  async function init() {
    root = document.getElementById("app");

    const syncState = document.getElementById("syncState");
    const paintSync = ({ state }) => {
      if (!syncState) return;
      const labels = { checking:"соединение", cloud:"в системе", degraded:"синхронизация", local:"локально" };
      syncState.dataset.state = state;
      syncState.querySelector("span").textContent = labels[state] || "локально";
    };
    if (window.ApiClient) { ApiClient.subscribe(paintSync); paintSync({ state:ApiClient.status() }); }

    // В production сначала восстанавливаем защищённую серверную сессию и
    // общие данные. При локальном запуске автоматически остаётся demo fallback.
    await Auth.initialize();
    Auth.seedIfEmpty();
    if (window.Inventory && (!Auth.isCloud() || Auth.isStaff())) Inventory.seedIfEmpty();
    const cur = Auth.current();
    Store.useUser(cur ? cur.id : null);
    Auth.subscribe((user) => {
      Store.useUser(user ? user.id : null);
      updateCartBadge();
    });

    // навигация по хэшу
    window.addEventListener("hashchange", render);

    // логотип
    document.querySelector(".logo").addEventListener("click", (e) => { e.preventDefault(); UI.navigate("#/"); });

    // корзина
    document.getElementById("cartBtn").addEventListener("click", openCart);
    document.getElementById("cartClose").addEventListener("click", closeCart);
    document.getElementById("cartOverlay").addEventListener("click", closeCart);
    document.getElementById("checkoutBtn").addEventListener("click", async () => {
      if (!window.Store.get().cart.length) return;
      const cart = window.Store.get().cart.slice();
      const total = UI.rub(window.Store.cartTotal());
      const u = Auth.current();
      // создаём реальный заказ в базе (списывает склад, копит аналитику)
      const order = window.Orders.create({
        userId: u ? u.id : null,
        userName: u ? u.name : "Гость",
        items: cart,
        channel: "self",
      });
      window.Store.clearCart();
      renderCart(); updateCartBadge();
      const synced = !window.ApiClient || !ApiClient.isReady() ? false : await ApiClient.whenSynced("orders", order.id);
      UI.toast(synced ? "Заказ передан мастеру · " + total : "Заказ сохранён на этом устройстве · " + total);
      closeCart();
    });

    render();
  }

  return { init, render, addElixir, addElixirState, addService, addMenuItem, openElixirPicker, openCart, afterAuth, logout };
})();

document.addEventListener("DOMContentLoaded", App.init);
