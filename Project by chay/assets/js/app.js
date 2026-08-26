// ===== Ядро приложения: роутер, корзина, эликсиры =====

window.App = (function () {
  const routes = {
    "/": Views.home,
    "/alchemist": Views.alchemist,
    "/elixirs": Views.elixirs,
    "/menu": Views.menu,
    "/preorder": Views.preorder,
    "/events": Views.events,
    "/journal": Views.journal,
    "/mushrooms": Views.mushrooms,
    "/passport": Views.passport,
    "/meditate": Views.meditate,
    "/brew": Views.brew,
    "/certificate": Views.certificate,
    "/messages": Views.messages,
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
    "/messages": (u) => !!u,
    "/passport": (u) => !!u,
    "/team": (u) => u && (u.role === "master" || u.role === "admin" || u.role === "owner"),
  };

  let root;
  let motionObserver;
  let motionController;

  function mountMotion() {
    if (!root) return;
    if (motionObserver) motionObserver.disconnect();
    if (motionController) motionController.abort();
    motionController = new AbortController();
    const signal = motionController.signal;
    root.classList.remove("view-mounted");
    const targets = root.querySelectorAll([
      ".story-ribbon > *", ".story-metrics > *", ".city-book-head", ".city-chapter",
      ".ritual-copy", ".ritual-path article", ".matcha-heading", ".matcha-visual", ".matcha-card", ".story-bridge > div",
      ".gift-call > *", ".grid > *", ".dash-grid > *",
      ".guide-grid > *", ".network-card", ".work-form", ".work-list", ".journal-card", ".editorial-command", ".publication-row"
    ].join(","));
    targets.forEach((node) => node.classList.add("motion-item"));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !("IntersectionObserver" in window)) {
      targets.forEach((node) => node.classList.add("motion-in"));
    } else {
      motionObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("motion-in");
          motionObserver.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      targets.forEach((node) => motionObserver.observe(node));
    }
    let frame = 0;
    const paintScroll = () => {
      frame = 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, window.scrollY / max));
      document.body.style.setProperty("--page-read", progress.toFixed(4));
      const hero = root.querySelector(".story-hero");
      if (hero) hero.style.setProperty("--hero-scroll", `${Math.min(window.scrollY, hero.offsetHeight)}px`);
    };
    const queueScroll = () => {
      if (!frame) frame = requestAnimationFrame(paintScroll);
    };
    window.addEventListener("scroll", queueScroll, { passive: true, signal });
    window.addEventListener("resize", queueScroll, { passive: true, signal });
    paintScroll();

    const photo = root.querySelector(".story-photo-frame");
    if (photo && !reduced && window.matchMedia("(pointer:fine)").matches) {
      photo.addEventListener("pointermove", (event) => {
        const box = photo.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - .5;
        const y = (event.clientY - box.top) / box.height - .5;
        photo.style.setProperty("--hero-ry", `${(x * 4.5).toFixed(2)}deg`);
        photo.style.setProperty("--hero-rx", `${(-y * 3.2).toFixed(2)}deg`);
      }, { passive: true, signal });
      photo.addEventListener("pointerleave", () => {
        photo.style.setProperty("--hero-ry", "0deg");
        photo.style.setProperty("--hero-rx", "0deg");
      }, { signal });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("view-mounted")));
  }

  function currentPath() {
    const h = window.location.hash.replace(/^#/, "");
    return (h || "/").split("?")[0];
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
    mountMotion();
  }

  // ----- Навигация по ролям -----
  function navModel() {
    const u = Auth.current();
    const L = {
      home: { route: "/", icon: "bi-house-door", label: "Главная" },
      alch: { route: "/alchemist", icon: "bi-moon-stars", label: "Подбор" },
      elx: { route: "/elixirs", icon: "bi-droplet-half", label: "Эликсиры" },
      menu: { route: "/menu", icon: "bi-cup-hot", label: "Меню" },
      preorder: { route: "/preorder", icon: "bi-bag-check", label: "Предзаказ" },
      events: { route: "/events", icon: "bi-calendar-event", label: "Афиша" },
      journal: { route: "/journal", icon: "bi-journal-text", label: "Журнал" },
      mush: { route: "/mushrooms", icon: "bi-flower1", label: "Грибы" },
      med: { route: "/meditate", icon: "bi-wind", label: "Практики" },
      brew: { route: "/brew", icon: "bi-hourglass-split", label: "Заварить" },
      cert: { route: "/certificate", icon: "bi-gift", label: "Сертификат" },
      messages: { route: "/messages", icon: "bi-chat-heart", label: "Связь" },
      team: { route: "/team", icon: "bi-chat-square-heart", label: "Команда" },
      pass: { route: "/passport", icon: "bi-patch-check", label: "Паспорт" },
      client: { route: "/client", icon: "bi-grid", label: "Кабинет" },
      master: { route: "/master", icon: "bi-grid", label: "Кабинет" },
      admin: { route: "/admin", icon: "bi-speedometer2", label: "Управление" },
    };
    if (!u) return { links: [L.home, L.preorder, L.alch, L.journal, L.events, L.cert], tab: [L.home, L.preorder, L.alch, L.events, L.cert] };
    if (u.role === "admin" || u.role === "owner") return { links: [L.admin, L.team, L.journal, L.preorder, L.events, L.med], tab: [L.admin, L.team, L.preorder, L.events, L.med] };
    if (u.role === "master") return { links: [L.master, L.team, L.journal, L.brew, L.preorder, L.med], tab: [L.master, L.team, L.brew, L.preorder, L.med] };
    return { links: [L.client, L.messages, L.preorder, L.alch, L.cert, L.pass], tab: [L.client, L.messages, L.preorder, L.cert, L.pass] };
  }

  function renderChrome(path) {
    const u = Auth.current();
    const model = navModel();
    const branch = window.Branches?.current?.() || { id:"sochi",city:"Сочи" };
    const linkHTML = (a) => `<a data-route="${a.route}" href="#${a.route}" class="${a.route === path ? "active" : ""}"><i class="bi ${a.icon}"></i> ${a.label}</a>`;
    const tabHTML = (a) => `<a data-route="${a.route}" href="#${a.route}" class="${a.route === path ? "active" : ""}"><i class="bi ${a.icon}"></i>${a.label}</a>`;

    document.getElementById("navLinks").innerHTML = model.links.map(linkHTML).join("");

    const auth = document.getElementById("navAuth");
    if (u) {
      auth.innerHTML = `<button class="city-chip" data-city-open aria-label="Выбрать город"><small>глава города</small><b>${branch.city}</b></button><a class="nav-user ${path === "/profile" ? "active" : ""}" data-route="/profile" href="#/profile" title="Профиль">${UI.avatar(u, 34)}<span class="nu-name">${u.name.split(" ")[0]}</span></a>`;
    } else {
      auth.innerHTML = `<button class="city-chip" data-city-open aria-label="Выбрать город"><small>${branch.id==="sochi"?"первая глава":"глава города"}</small><b>${branch.city}</b></button><a class="btn small login-btn" data-route="/auth" href="#/auth"><i class="bi bi-box-arrow-in-right"></i> Войти</a>`;
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
    auth.querySelector("[data-city-open]")?.addEventListener("click",openCityPicker);
  }

  function openCityPicker() {
    const modal=document.getElementById("modal"),current=Branches.current(),u=Auth.current();
    modal.innerHTML=`<div class="modal-card city-picker"><button class="modal-x" data-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button><span class="section-tag">Сеть как одна книга</span><h2>Выберите<br>свою главу.</h2><p>Меню и лояльность объединяют сеть. Команда, сообщения и заказы приходят именно в выбранный город.</p><div class="city-picker-grid">${Branches.all().map((b,i)=>`<button data-city-pick="${b.id}" class="${b.id===current.id?"active":""}"><span>0${i+1}</span><b>${b.city}</b><em>${b.chapter}</em><small>${b.subtitle}</small></button>`).join("")}</div>${u&&["master","admin"].includes(u.role)?`<p class="city-lock">Рабочая глава сотрудника назначается директором сети.</p>`:""}</div>`;
    modal.classList.add("open");
    modal.querySelector("[data-close]").onclick=closeModal;
    modal.addEventListener("click",(e)=>{if(e.target===modal)closeModal();},{once:true});
    modal.querySelectorAll("[data-city-pick]").forEach((button)=>button.onclick=async()=>{button.disabled=true;const result=await Branches.select(button.dataset.cityPick);if(!result.ok){UI.toast(result.error);button.disabled=false;return;}await Auth.refreshTeam?.(result.branch.id);closeModal();UI.toast(`${result.branch.city} · глава выбрана`);render();});
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
            <button class="pick-mush" data-pick="${m.id}" ${m.id === "amanita" ? 'data-consult="1"' : ""} style="--mc:${m.color}">
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
        if (b.dataset.consult) {
          closeModal();
          if (Auth.current()) UI.navigate("#/messages");
          else { UI.toast("Для консультации войдите в кабинет гостя"); UI.navigate("#/auth"); }
          return;
        }
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
      body.innerHTML = `<p class="muted center" style="padding:40px 0">Чашка пуста.<br/>Откройте меню или подбор.</p>`;
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
    if(window.Branches)await Branches.initialize();
    Auth.seedIfEmpty();
    if (window.Inventory && (!Auth.isCloud() || Auth.isStaff())) Inventory.seedIfEmpty();
    const cur = Auth.current();
    Store.useUser(cur ? cur.id : null);
    if(cur&&ApiClient.isReady())ApiClient.loyalty.me().then((result)=>Store.setLoyalty(result.loyalty)).catch(()=>{});
    Auth.subscribe((user) => {
      Store.useUser(user ? user.id : null);
      if(user&&ApiClient.isReady())ApiClient.loyalty.me().then((result)=>Store.setLoyalty(result.loyalty)).catch(()=>{});
      updateCartBadge();
    });
    if(window.Branches)Branches.subscribe(()=>{renderChrome(currentPath());});

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
      closeCart();
      if (window.Commerce) {
        Commerce.openCheckout();
        return;
      }
      UI.toast("Форма предзаказа временно недоступна");
    });

    render();
  }

  return { init, render, renderCart, addElixir, addElixirState, addService, addMenuItem, openElixirPicker, openCityPicker, openCart, closeCart, afterAuth, logout };
})();

document.addEventListener("DOMContentLoaded", App.init);
