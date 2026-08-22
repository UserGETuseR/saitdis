// ===== Экраны приложения =====
window.Views = {};

/* ---------------- ГЛАВНАЯ ---------------- */
Views.home = function () {
  const html = `
    <header class="hero hero-home">
      <div class="kanji-bg" aria-hidden="true">茶</div>
      <div class="steam"><span></span><span></span><span></span></div>
      <div class="brand-mark">Чайная история</div>
      <h1>Место, где<br/>время замедляется</h1>
      <p class="lead">
        Чайная нового поколения: премиальные сорта, функциональные грибы-адаптогены
        и личный Чайный Алхимик, который соберёт эликсир под твоё состояние.
      </p>
      <div class="hero-cta">
        <button class="btn primary" data-go="#/alchemist"><i class="bi bi-moon-stars"></i> Призвать Алхимика</button>
        <button class="btn ghost" data-go="#/elixirs"><i class="bi bi-droplet-half"></i> Меню эликсиров</button>
      </div>
      <div class="brush-divider" aria-hidden="true"></div>
    </header>

    <section class="wrap pillars">
      <div class="pillar"><div class="pg"><i class="bi bi-cup-hot"></i></div><h3>Чай как ритуал</h3><p>Премиум и классика — каждый сорт со своей историей и правильным завариванием.</p></div>
      <div class="pillar"><div class="pg"><i class="bi bi-flower1"></i></div><h3>Грибы с эффектом</h3><p>Легальные адаптогены: фокус, спокойствие, энергия, иммунитет — усилитель к твоей чашке.</p></div>
      <div class="pillar"><div class="pg"><i class="bi bi-yin-yang"></i></div><h3>Третье место</h3><p>Атмосфера для разговоров, работы и тишины. Ценность и в зале, и в телефоне.</p></div>
    </section>

    <section class="wrap">
      <div class="section-tag center">Меню эликсиров</div>
      <h2 class="h2c">Эликсиры <span class="cross-mark">состояний</span></h2>
      <p class="muted center" style="max-width:560px;margin:0 auto 24px">Чай плюс функциональный ингредиент — под твоё состояние. Дед уже всё подобрал.</p>
      <div class="sig-grid">
        ${window.ELIXIRS.map((e) => `
          <div class="sig-card">
            <div class="sig-glyph" style="--mc:var(--accent)"><i class="bi ${e.ingredient.icon}"></i></div>
            <h4>${e.title}</h4>
            <div class="sig-tag">${e.subtitle}</div>
            <div class="sig-eff">${UI.effectChip(e.effectKey)}</div>
            <div class="sig-actions">
              <button class="btn small" data-elixir-add="${e.id}"><i class="bi bi-cup-hot"></i> В чашку</button>
              <button class="btn small ghost" data-go="#/elixirs"><i class="bi bi-arrow-right"></i> Подробнее</button>
            </div>
          </div>`).join("")}
      </div>
    </section>

    <section class="wrap">
      <div class="section-tag center"><i class="bi bi-wind"></i> Практики</div>
      <h2 class="h2c">Дыхание перед чашкой</h2>
      <p class="muted center" style="max-width:560px;margin:0 auto 24px">Медитации и дыхательные ритуалы — чтобы чай стал не привычкой, а возвращением к себе.</p>
      <div class="center"><button class="btn ghost" data-go="#/meditate"><i class="bi bi-play-fill"></i> Открыть практики</button></div>
    </section>

    <section class="wrap final-cta">
      <div class="seal-mark" aria-hidden="true">茶道</div>
      <h2 class="h2c">${Auth.current() ? "Продолжи свой путь" : "Стань частью историй"}</h2>
      <p class="muted center">${Auth.current() ? "Твой чайный паспорт и практики ждут." : "Заведи аккаунт — храни паспорт, практики и духовный путь."}</p>
      <div class="center" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <button class="btn primary" data-go="#/alchemist"><i class="bi bi-stars"></i> Начать ритуал</button>
        ${Auth.current()
          ? `<button class="btn ghost" data-go="#/${Auth.isAdmin() ? "admin" : Auth.isMaster() ? "master" : "client"}"><i class="bi bi-grid"></i> В кабинет</button>`
          : `<button class="btn ghost" data-go="#/auth"><i class="bi bi-person-plus"></i> Создать аккаунт</button>`}
      </div>
    </section>
  `;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-go]").forEach((b) =>
        b.addEventListener("click", () => UI.navigate(b.dataset.go))
      );
      root.querySelectorAll("[data-elixir-add]").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          App.addElixirState(b.dataset.elixirAdd);
        })
      );
    },
  };
};

/* ---------------- АЛХИМИК ---------------- */
Views.alchemist = (function () {
  const QUESTIONS = [
    { key: "mood", title: "Какое настроение поймать?", sub: "Чай подстроится под состояние",
      options: [
        { value: "energy", icon: "bi-lightning-charge", label: "Заряд", desc: "проснуться, действовать" },
        { value: "focus", icon: "bi-bullseye", label: "Фокус", desc: "ясность для работы" },
        { value: "calm", icon: "bi-moon-stars", label: "Покой", desc: "замедлиться" },
        { value: "comfort", icon: "bi-cup-hot", label: "Уют", desc: "тепло и обнять себя" },
        { value: "discovery", icon: "bi-compass", label: "Открытие", desc: "распробовать новое" },
      ] },
    { key: "time", title: "Когда пьём?", sub: "Время дня меняет выбор",
      options: [
        { value: "morning", icon: "bi-sunrise", label: "Утро", desc: "проснуться" },
        { value: "day", icon: "bi-sun", label: "День", desc: "поток дел" },
        { value: "evening", icon: "bi-sunset", label: "Вечер", desc: "расслабиться" },
        { value: "any", icon: "bi-infinity", label: "Неважно", desc: "в любое время" },
      ] },
    { key: "strength", title: "Какой характер?", sub: "От нежного до насыщенного",
      options: [
        { value: 1, icon: "bi-droplet", label: "Нежный", desc: "лёгкий и тонкий" },
        { value: 2, icon: "bi-circle-half", label: "Баланс", desc: "золотая середина" },
        { value: 3, icon: "bi-fire", label: "Насыщенный", desc: "плотный и яркий" },
      ] },
    { key: "caffeine", title: "Бодрость или тишина?", sub: "Нужен ли кофеин",
      options: [
        { value: "yes", icon: "bi-cup-hot-fill", label: "Взбодри", desc: "с кофеином" },
        { value: "soft", icon: "bi-flower2", label: "Помягче", desc: "немного" },
        { value: "no", icon: "bi-moon", label: "Без кофеина", desc: "только покой" },
      ] },
    { key: "effect", title: "Какой эффект усилить грибом?", sub: "Функциональный адаптоген — сердце эликсира",
      options: [
        { value: "focus", icon: "bi-bullseye", label: "Фокус", desc: "Ежовик" },
        { value: "energy", icon: "bi-lightning-charge", label: "Энергия", desc: "Кордицепс" },
      ] },
  ];

  let step = 0;
  let answers = {};

  function scoreTea(tea) {
    let s = 0;
    if (tea.mood.includes(answers.mood)) s += 5;
    if (answers.time !== "any") {
      if (tea.time === answers.time) s += 3;
      else if (tea.time === "any") s += 1;
    } else s += 1;
    const diff = Math.abs(tea.strength - Number(answers.strength));
    s += diff === 0 ? 3 : diff === 1 ? 1 : 0;
    const hasCaf = tea.caffeine === "высокий" || tea.caffeine === "средний";
    const low = tea.caffeine === "низкий";
    const none = tea.caffeine === "без кофеина";
    if (answers.caffeine === "yes" && hasCaf) s += 3;
    if (answers.caffeine === "soft" && (low || tea.caffeine === "средний")) s += 3;
    if (answers.caffeine === "no" && none) s += 4;
    if (answers.caffeine === "no" && hasCaf) s -= 4;
    // бонус, если чай дружит с выбранным эффектом гриба
    if (tea.pairs && tea.pairs.includes(answers.effect)) s += 2;
    return s;
  }

  function pickTea() {
    const ranked = window.TEAS.map((t) => ({ tea: t, s: scoreTea(t) })).sort((a, b) => b.s - a.s);
    const top = ranked.filter((r) => r.s >= ranked[0].s - 1);
    return top[Math.floor(Math.random() * top.length)].tea;
  }

  function pickMushroom() {
    return window.MUSHROOMS.find((m) => m.effectKey === answers.effect) || window.MUSHROOMS[0];
  }

  function stepHTML() {
    const q = QUESTIONS[step];
    return `
      <div class="section-tag center">Подбор Чайного мастера</div>
      <div class="progress">${QUESTIONS.map((_, i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>
      <div class="step-title">${q.title}</div>
      <p class="step-sub">${q.sub}</p>
      <div class="options">
        ${q.options.map((o) => `
          <div class="option" data-value="${o.value}">
            <span class="emoji"><i class="bi ${o.icon}"></i></span>
            <span class="label">${o.label}</span>
            <span class="desc">${o.desc}</span>
          </div>`).join("")}
      </div>
      <div class="nav-row">
        <button class="btn ghost ${step === 0 ? "hidden" : ""}" id="backBtn"><i class="bi bi-arrow-left"></i> Назад</button>
        <span class="muted">${step + 1} / ${QUESTIONS.length}</span>
      </div>`;
  }

  function resultHTML(tea, m) {
    return `
      <div class="result">
        <div class="result-head">
          <span class="tier"><i class="bi bi-patch-check-fill"></i> ${tea.tier === "premium" ? "Премиальный эликсир" : "Авторский эликсир"}</span>
          <h2>${tea.name}</h2>
          <div class="cross"><i class="bi bi-plus-lg"></i> ${m.name} <i class="bi ${m.icon}"></i></div>
          <div class="meta">${tea.type} · ${tea.origin} · кофеин: ${tea.caffeine}</div>
        </div>

        <p class="story">«${tea.story}»</p>

        <div class="elixir-effect" style="--mc:${m.color}">
          <div class="ee-glyph"><i class="bi ${m.icon}"></i></div>
          <div>
            <div class="ee-title">${m.effect}</div>
            <div class="ee-sub">${m.name} — ${m.benefits.slice(0,3).join(" · ")}</div>
          </div>
          ${UI.effectChip(m.effectKey)}
        </div>

        <div class="notes">${tea.notes.map((n) => `<span class="note">${n}</span>`).join("")}</div>

        <div class="brew">
          <div class="brew-card"><div class="k"><i class="bi bi-thermometer-half"></i> Температура</div><div class="v">${tea.brew.temp}</div></div>
          <div class="brew-card"><div class="k"><i class="bi bi-hourglass-split"></i> Время</div><div class="v">${tea.brew.time}</div></div>
          <div class="brew-card"><div class="k"><i class="bi bi-droplet"></i> Заварка</div><div class="v">${tea.brew.amount}</div></div>
        </div>

        <div class="price-line">
          <span>${tea.name}</span><span>${UI.rub(tea.price)}</span>
        </div>
        <div class="price-line">
          <span>+ ${m.name}</span><span>${UI.rub(m.price)}</span>
        </div>
        <div class="price-line total">
          <span>Эликсир</span><span>${UI.rub(tea.price + m.price)}</span>
        </div>

        <div class="result-actions">
          <button class="btn ghost" id="againBtn"><i class="bi bi-arrow-repeat"></i> Заново</button>
          <button class="btn primary" id="addBtn"><i class="bi bi-cup-hot"></i> Добавить в чашку</button>
        </div>
        <p class="disclaimer"><i class="bi bi-info-circle"></i> ${window.MUSHROOM_DISCLAIMER}</p>
      </div>`;
  }

  function view() {
   return {
    html: `<section class="alchemist" id="alchBox"></section>`,
    mount(root) {
      step = 0; answers = {};
      const box = root.querySelector("#alchBox");

      function renderStep() {
        box.innerHTML = stepHTML();
        box.querySelectorAll(".option").forEach((node) =>
          node.addEventListener("click", () => {
            answers[QUESTIONS[step].key] = node.dataset.value;
            if (step < QUESTIONS.length - 1) { step++; renderStep(); }
            else renderResult();
          })
        );
        const back = box.querySelector("#backBtn");
        if (back) back.addEventListener("click", () => { if (step > 0) { step--; renderStep(); } });
      }

      function renderResult() {
        const tea = pickTea();
        const m = pickMushroom();
        window.Store.logPick(tea.id, m.id);
        box.innerHTML = resultHTML(tea, m);
        box.querySelector("#againBtn").addEventListener("click", () => { step = 0; answers = {}; renderStep(); });
        box.querySelector("#addBtn").addEventListener("click", () => App.addElixir(tea.id, m.id));
      }

      renderStep();
    },
   };
  }
  return view;
})();

/* ---------------- МЕНЮ ---------------- */
Views.menu = function () {
  const byCat = (key) => window.TEAS.filter((t) => t.cat === key);
  const html = `
    <section class="wrap">
      <div class="section-tag center">Меню</div>
      <h2 class="h2c">Наша коллекция</h2>
      <p class="muted center">Добавь чай в чашку и при желании усиль грибом-адаптогеном.</p>

      <h3 class="cat-h"><i class="bi bi-cup-hot-fill"></i> Чайные ритуалы и услуги <span class="addon">церемонии · варка · навынос</span></h3>
      <div class="grid services-grid">${window.SERVICES.map(UI.serviceCard).join("")}</div>

      <h3 class="cat-h"><i class="bi bi-stars"></i> Авторские напитки <span class="addon">согревающие, с характером</span></h3>
      <div class="grid author-grid">${window.SIGNATURE_DRINKS.map(UI.authorCard).join("")}</div>

      <h3 class="cat-h"><i class="bi bi-cup-straw"></i> Холодный чай <span class="addon">освежающие миксы навынос</span></h3>
      <div class="grid cold-grid">${window.COLD_DRINKS.map(UI.coldCard).join("")}</div>

      <div class="cat-nav">
        ${window.TEA_CATEGORIES.filter((c) => byCat(c.key).length).map((c) =>
          `<a href="#/menu" class="cat-pill" data-cat="${c.key}"><i class="bi ${c.icon}"></i> ${c.label}</a>`).join("")}
      </div>

      ${window.TEA_CATEGORIES.map((c) => {
        const list = byCat(c.key);
        if (!list.length) return "";
        return `
          <h3 class="cat-h" id="cat-${c.key}"><i class="bi ${c.icon}"></i> ${c.label} <span class="addon">${c.sub}</span></h3>
          <div class="grid">${list.map(UI.teaCard).join("")}</div>`;
      }).join("")}

      <h3 class="cat-h"><i class="bi bi-cake2"></i> Десерты к чаю <span class="addon">к любой чашке</span></h3>
      <div class="grid dessert-grid">${window.DESSERTS.map(UI.dessertCard).join("")}</div>

      <h3 class="cat-h"><i class="bi bi-flower1"></i> Грибные усилители <span class="addon">+ добавка к любому чаю</span></h3>
      <div class="grid mush">${window.MUSHROOMS.map(UI.mushroomCard).join("")}</div>
      <p class="disclaimer"><i class="bi bi-info-circle"></i> ${window.MUSHROOM_DISCLAIMER}</p>
    </section>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-cat]").forEach((a) =>
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const el = root.querySelector("#cat-" + a.dataset.cat);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }));
      root.querySelectorAll("[data-svc]").forEach((b) =>
        b.addEventListener("click", () => App.addService(b.dataset.svc)));
      root.querySelectorAll("button[data-item]").forEach((b) =>
        b.addEventListener("click", () => App.addMenuItem(b.dataset.item)));
      root.querySelectorAll("[data-add-tea]").forEach((b) =>
        b.addEventListener("click", () => App.openElixirPicker(b.dataset.addTea))
      );
      root.querySelectorAll("[data-fav]").forEach((b) =>
        b.addEventListener("click", () => {
          window.Store.toggleFavorite(b.dataset.fav);
          b.classList.toggle("on");
          UI.toast(b.classList.contains("on") ? "Добавлено в избранное" : "Убрано из избранного");
        })
      );
    },
  };
};

/* ---------------- ГРИБНАЯ ЛАБОРАТОРИЯ ---------------- */
Views.mushrooms = function () {
  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">菌</div>
      <div class="brand-mark">Грибная лаборатория</div>
      <h1>Грибы с эффектом</h1>
      <p class="lead">
        Функциональные адаптогены — легальный способ добавить чашке смысл:
        фокус, спокойствие, энергию или иммунитет. Наука и ритуал в одном глотке.
      </p>
      <div class="brush-divider" aria-hidden="true"></div>
    </header>
    <section class="wrap">
      <div class="effects-legend">
        ${Object.keys(window.EFFECTS).map((k) => UI.effectChip(k)).join("")}
      </div>
      <div class="grid mush">${window.MUSHROOMS.map(UI.mushroomCard).join("")}</div>
      <div class="lab-note">
        <h3><i class="bi bi-droplet-half"></i> Как это работает</h3>
        <p>Грибной экстракт добавляется в готовый настрой как «усилитель». Чай задаёт вкус и ритуал, гриб — эффект. Алхимик подбирает пару автоматически, но ты можешь собрать эликсир сам в меню.</p>
        <p class="disclaimer"><i class="bi bi-info-circle"></i> ${window.MUSHROOM_DISCLAIMER}</p>
      </div>
    </section>`;
  return { html, mount() {} };
};

/* ---------------- АФИША МЕРОПРИЯТИЙ ---------------- */
Views.events = function () {
  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">會</div>
      <div class="brand-mark">Афиша</div>
      <h1>Чайные вечера</h1>
      <p class="lead">Расписание ритуалов и встреч недели. Приходи послушать чай, замедлиться и побыть среди своих.</p>
      <div class="brush-divider" aria-hidden="true"></div>
    </header>
    <section class="wrap ev-wrap">
      ${window.EVENTS.map((d) => `
        <div class="ev-day">
          <div class="ev-daycol">
            <span class="ev-dayshort">${d.short}</span>
            <span class="ev-dayname">${d.day}</span>
          </div>
          <div class="ev-list">
            ${d.items.map((it) => `
              <div class="ev-item">
                <div class="ev-time"><i class="bi bi-clock"></i> ${it.time}</div>
                <div class="ev-ico"><i class="bi ${it.icon}"></i></div>
                <div class="ev-body">
                  <div class="ev-name">${it.name}</div>
                  ${it.desc ? `<div class="ev-desc">${it.desc}</div>` : ""}
                </div>
                <div class="ev-price">${it.price ? UI.rub(it.price) + "<span>с человека</span>" : `<span class="ev-free">по записи</span>`}</div>
              </div>`).join("")}
          </div>
        </div>`).join("")}

      <div class="ev-cta">
        <p class="muted">Запись на вечера и церемонии по телефону</p>
        <a class="btn primary" href="tel:+79628886880"><i class="bi bi-telephone-fill"></i> +7 962 888‑68‑80</a>
      </div>
    </section>`;
  return { html, mount() {} };
};

/* ---------------- ЭЛИКСИРЫ (концепция «меню Деда») ---------------- */
Views.elixirs = function () {
  const list = (sub) => sub.map((x) => `<li><span class="ex-bullet"></span>${x}</li>`).join("");

  function page(e, i) {
    return `
    <article class="elixir-page" id="elx-${e.id}">
      <div class="ex-grain" aria-hidden="true"></div>
      ${UI.inkScene(e.scene, i)}

      <header class="ex-top">
        <div class="ex-logo">${UI.dedMark("t" + i, "ex-logo-ded")}<span>Чайная<br/>история</span></div>
        <div class="ex-seal" lang="zh">${e.seal}</div>
      </header>

      <div class="ex-hero">
        <h2 class="ex-title">${e.title}</h2>
        <div class="ex-sub">${e.subtitle}</div>
        <p class="ex-desc">${e.desc}</p>
      </div>

      <section class="ex-rec">
        <div class="ex-banner">Рекомендация Деда</div>
        <div class="ex-rec-body">
          <div class="ex-ded-wrap">${UI.dedMark("r" + i, "ex-ded")}</div>
          <div class="ex-pair">
            <div class="ex-teas">
              <div class="ex-tea">
                <i class="bi ${e.teas[0].icon}"></i>
                <b>${e.teas[0].name}</b>
                <span>${e.teas[0].desc}</span>
              </div>
              <span class="ex-or">или</span>
              <div class="ex-tea">
                <i class="bi ${e.teas[1].icon}"></i>
                <b>${e.teas[1].name}</b>
                <span>${e.teas[1].desc}</span>
              </div>
            </div>
            <div class="ex-plus"><i class="bi bi-plus-lg"></i></div>
            <div class="ex-ingredient">
              <div class="ex-ing-glyph">${UI.ingredientArt(e.art, i)}</div>
              <div class="ex-ing-text">
                <h4>${e.ingredient.name}</h4>
                <div class="ex-ing-latin">${e.ingredient.latin}</div>
                <p>${e.ingredient.desc}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="ex-pairings">
        <div class="ex-banner sm">Рекомендуемые сочетания</div>
        <div class="ex-pcols">
          <div class="ex-pcol">
            <div class="ex-pc-h"><i class="bi bi-cup-hot"></i> Дополнительный чай</div>
            <ul>${list(e.pairings.tea)}</ul>
          </div>
          <div class="ex-pcol">
            <div class="ex-pc-h"><i class="bi bi-flower2"></i> Травы и добавки</div>
            <ul>${list(e.pairings.herbs)}</ul>
          </div>
          <div class="ex-pcol">
            <div class="ex-pc-h"><i class="bi bi-cake2"></i> Десерты к чаю</div>
            <ul>${list(e.pairings.desserts)}</ul>
          </div>
        </div>
      </section>

      <footer class="ex-foot">
        <div class="ex-quote">
          <div class="ex-quote-ded">${UI.dedMark("q" + i, "")}</div>
          <div>
            <div class="ex-q-h">Дед говорит:</div>
            <p class="ex-q-text">«${e.quote}»</p>
          </div>
        </div>
        <div class="ex-buy">
          <div class="ex-price">
            <span class="ex-rub">${UI.rub(e.price)}</span>
            <span class="ex-vol">объём ${e.volume}</span>
          </div>
          <button class="btn primary" data-elixir-add="${e.id}"><i class="bi bi-cup-hot"></i> В чашку</button>
        </div>
      </footer>
    </article>`;
  }

  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">茶</div>
      <div class="brand-mark">Меню эликсиров</div>
      <h1>Эликсиры состояний</h1>
      <p class="lead">Не просто чай, а состояние. Дед собирает каждый эликсир из правильного чая и функционального ингредиента — под то, что нужно тебе прямо сейчас.</p>
      <div class="brush-divider" aria-hidden="true"></div>
    </header>
    <section class="wrap ex-wrap">
      ${window.ELIXIRS.map(page).join("")}
      <p class="disclaimer"><i class="bi bi-info-circle"></i> ${window.MUSHROOM_DISCLAIMER}</p>
    </section>`;

  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-elixir-add]").forEach((b) =>
        b.addEventListener("click", () => App.addElixirState(b.dataset.elixirAdd)));
    },
  };
};


Views.passport = function () {
  const s = window.Store.get();
  const totalTeas = window.TEAS.length;
  const totalMush = window.MUSHROOMS.length;
  const nextReward = 6 - (s.stamps % 6);
  const favTeas = s.favorites.map(UI.teaById).filter(Boolean);

  const html = `
    <section class="wrap">
      <div class="section-tag center">Чайный паспорт</div>
      <h2 class="h2c">Твой путь во вкусе</h2>

      <div class="stat-row">
        <div class="stat"><div class="si"><i class="bi bi-cup-hot"></i></div><div class="sv">${s.stamps}</div><div class="sk">чашек собрано</div></div>
        <div class="stat"><div class="si"><i class="bi bi-collection"></i></div><div class="sv">${s.discoveredTeas.length}/${totalTeas}</div><div class="sk">сортов открыто</div></div>
        <div class="stat"><div class="si"><i class="bi bi-flower1"></i></div><div class="sv">${s.discoveredMushrooms.length}/${totalMush}</div><div class="sk">грибов изучено</div></div>
      </div>

      <div class="loyalty">
        <h3><i class="bi bi-patch-check"></i> Карта лояльности</h3>
        <p class="muted">Каждая 6-я чашка — в подарок. До награды: <b>${nextReward}</b></p>
        <div class="stamps">${Array.from({ length: 6 }, (_, i) =>
          `<span class="stamp ${i < (s.stamps % 6) ? "on" : ""}"><i class="bi ${i === 5 ? "bi-gift" : "bi-cup-hot"}"></i></span>`).join("")}</div>
      </div>

      <h3 class="cat-h"><i class="bi bi-heart-fill"></i> Избранное</h3>
      ${favTeas.length ? `<div class="grid">${favTeas.map(UI.teaCard).join("")}</div>`
        : `<p class="muted">Пока пусто. Жми <i class="bi bi-heart"></i> на чае в меню.</p>`}

      <h3 class="cat-h"><i class="bi bi-clock-history"></i> История подборов</h3>
      ${s.history.length ? `<div class="history">${s.history.map((h) => {
        const t = UI.teaById(h.tea), m = h.mushroom ? UI.mushroomById(h.mushroom) : null;
        const d = new Date(h.ts);
        return `<div class="hist-row">
          <span class="hist-tea">${t ? t.name : "—"}${m ? ` <span class="hist-x">×</span> ${m.name} <i class="bi ${m.icon}"></i>` : ""}</span>
          <span class="hist-date">${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>`;
      }).join("")}</div>` : `<p class="muted">Ещё нет подборов. Призови Алхимика.</p>`}

      <div class="center" style="margin-top:30px">
        <button class="btn ghost" id="resetBtn"><i class="bi bi-arrow-counterclockwise"></i> Сбросить паспорт</button>
      </div>
    </section>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-add-tea]").forEach((b) =>
        b.addEventListener("click", () => App.openElixirPicker(b.dataset.addTea)));
      root.querySelectorAll("[data-fav]").forEach((b) =>
        b.addEventListener("click", () => {
          window.Store.toggleFavorite(b.dataset.fav);
          App.render();
        }));
      const r = root.querySelector("#resetBtn");
      if (r) r.addEventListener("click", () => {
        if (confirm("Сбросить весь прогресс паспорта?")) { window.Store.reset(); App.render(); UI.toast("Паспорт сброшен"); }
      });
    },
  };
};


/* ============================================================
   ОБЩИЕ УТИЛИТЫ
   ============================================================ */
Views._util = {
  clientRank(store, profile) {
    const score = store.stamps * 2 + store.discoveredTeas.length + (profile.breathSessions || 0) + Math.floor((profile.meditationMinutes || 0) / 20);
    const ranks = [
      { min: 0, name: "Странник", icon: "bi-compass" },
      { min: 6, name: "Ученик чая", icon: "bi-cup-hot" },
      { min: 16, name: "Ценитель", icon: "bi-flower1" },
      { min: 32, name: "Знаток", icon: "bi-gem" },
      { min: 60, name: "Хранитель пути", icon: "bi-yin-yang" },
    ];
    let r = ranks[0];
    for (const x of ranks) if (score >= x.min) r = x;
    const next = ranks.find((x) => x.min > score);
    return { rank: r, score, next };
  },
  achievements(store, profile) {
    return [
      { id: "first", icon: "bi-cup-hot", name: "Первый глоток", done: store.stamps >= 1 },
      { id: "five", icon: "bi-cup-hot-fill", name: "5 чашек", done: store.stamps >= 5 },
      { id: "premium", icon: "bi-gem", name: "Премиум-сорт", done: store.history.some((h) => { const t = UI.teaById(h.tea); return t && t.tier === "premium"; }) },
      { id: "mushroom", icon: "bi-flower1", name: "Грибной алхимик", done: store.discoveredMushrooms.length >= 3 },
      { id: "collector", icon: "bi-collection", name: "Коллекционер (8 сортов)", done: store.discoveredTeas.length >= 8 },
      { id: "breath", icon: "bi-wind", name: "Дыхание мастера", done: (profile.breathSessions || 0) >= 5 },
      { id: "medit", icon: "bi-moon-stars", name: "Час тишины", done: (profile.meditationMinutes || 0) >= 60 },
      { id: "streak", icon: "bi-fire", name: "7 дней практики", done: (profile.practiceStreak || 0) >= 7 },
    ];
  },
};

/* ============================================================
   ВХОД / РЕГИСТРАЦИЯ
   ============================================================ */
Views.auth = function () {
  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">門</div>
      <div class="brand-mark">Вход в пространство</div>
      <h1 id="authTitle">С возвращением</h1>
      <p class="lead">Войди, чтобы хранить свой чайный паспорт, практики и духовный путь.</p>
    </header>
    <section class="wrap narrow">
      <div class="auth-card">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login"><i class="bi bi-box-arrow-in-right"></i> Вход</button>
          <button class="auth-tab" data-tab="register"><i class="bi bi-person-plus"></i> Регистрация</button>
        </div>

        <form id="authForm" class="auth-form">
          <div class="field reg-only hidden">
            <label><i class="bi bi-person"></i> Имя</label>
            <input type="text" name="name" autocomplete="name" placeholder="Как тебя называть" />
          </div>
          <div class="field">
            <label><i class="bi bi-at"></i> Логин</label>
            <input type="text" name="login" autocomplete="username" placeholder="придумай логин" />
            <small class="field-hint reg-only hidden">Латиница, цифры и . _ - · 3–20 символов</small>
          </div>
          <div class="field">
            <label><i class="bi bi-lock"></i> Пароль</label>
            <div class="pass-wrap">
              <input type="password" name="pass" autocomplete="current-password" placeholder="••••••" />
              <button type="button" class="pass-eye" data-eye><i class="bi bi-eye"></i></button>
            </div>
          </div>
          <div class="field reg-only hidden">
            <label><i class="bi bi-lock-fill"></i> Повтор пароля</label>
            <input type="password" name="pass2" autocomplete="new-password" placeholder="••••••" />
          </div>
          <div class="field reg-only hidden">
            <label><i class="bi bi-envelope"></i> E-mail <span class="muted">(необязательно)</span></label>
            <input type="email" name="email" autocomplete="email" placeholder="для восстановления, по желанию" />
          </div>
          <div class="field reg-only hidden">
            <label><i class="bi bi-people"></i> Кто ты в чайной</label>
            <div class="role-pick">
              <label class="role-opt"><input type="radio" name="role" value="client" checked /><span><i class="bi bi-cup-hot"></i> Гость / клиент</span></label>
              <label class="role-opt"><input type="radio" name="role" value="master" /><span><i class="bi bi-yin-yang"></i> Чайный мастер</span></label>
            </div>
          </div>

          <div id="authError" class="auth-error hidden"></div>
          <button type="submit" class="btn primary full" id="authSubmit"><i class="bi bi-box-arrow-in-right"></i> Войти</button>
        </form>

        <div class="auth-demo" id="authDemo">
          <span class="muted">Демо-доступы для презентации:</span>
          <button class="chip-btn" data-demo="client"><i class="bi bi-cup-hot"></i> Клиент</button>
          <button class="chip-btn" data-demo="master"><i class="bi bi-yin-yang"></i> Мастер</button>
          <button class="chip-btn" data-demo="admin"><i class="bi bi-speedometer2"></i> Управляющий</button>
        </div>
        <p class="disclaimer" id="authSecurity"><i class="bi bi-shield-lock"></i> Защищённая сессия, пароль хранится только в виде стойкого серверного хэша. Роль сотрудника назначает управляющая.</p>
      </div>
    </section>`;
  return {
    html,
    mount(root) {
      let mode = "login";
      const form = root.querySelector("#authForm");
      const err = root.querySelector("#authError");
      const title = root.querySelector("#authTitle");
      const submit = root.querySelector("#authSubmit");
      if (Auth.isCloud()) {
        root.querySelector("#authDemo").classList.add("hidden");
        const rolePick = root.querySelector(".role-pick")?.closest(".field");
        if (rolePick) rolePick.classList.add("cloud-role-field");
      } else {
        root.querySelector("#authSecurity").innerHTML = '<i class="bi bi-device-hdd"></i> Локальный режим разработки: данные хранятся только в этом браузере.';
      }

      function setMode(m) {
        mode = m;
        root.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === m));
        root.querySelectorAll(".reg-only").forEach((f) => f.classList.toggle("hidden", m !== "register"));
        title.textContent = m === "login" ? "С возвращением" : "Стань частью историй";
        submit.innerHTML = m === "login"
          ? '<i class="bi bi-box-arrow-in-right"></i> Войти'
          : '<i class="bi bi-person-plus"></i> Создать аккаунт';
        err.classList.add("hidden");
      }
      root.querySelectorAll(".auth-tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.tab)));

      function showErr(msg) { err.textContent = msg; err.classList.remove("hidden"); }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        submit.disabled = true;
        const data = Object.fromEntries(new FormData(form).entries());
        const res = await (mode === "login"
          ? Auth.login(data.login, data.pass)
          : Auth.register({ name: data.name, login: data.login, pass: data.pass, pass2: data.pass2, email: data.email, role: "client" }));
        submit.disabled = false;
        if (!res.ok) { showErr(res.error); return; }
        App.afterAuth(res.user);
      });

      // показать/скрыть пароль
      const eye = root.querySelector("[data-eye]");
      if (eye) eye.addEventListener("click", () => {
        const inp = form.querySelector('input[name="pass"]');
        const show = inp.type === "password";
        inp.type = show ? "text" : "password";
        eye.querySelector("i").className = show ? "bi bi-eye-slash" : "bi bi-eye";
      });

      root.querySelectorAll("[data-demo]").forEach((b) =>
        b.addEventListener("click", async () => {
          const creds = { master: ["master", "master"], admin: ["admin", "admin"], client: ["anna", "anna"] };
          const cred = creds[b.dataset.demo] || creds.client;
          const res = await Auth.login(cred[0], cred[1]);
          if (res.ok) App.afterAuth(res.user); else showErr(res.error);
        })
      );
    },
  };
};

/* ============================================================
   ПРАКТИКИ: дыхание + медитации
   ============================================================ */
Views.meditate = function () {
  const w = window.DED_WISDOM[Math.floor(Date.now() / 86400000) % window.DED_WISDOM.length];
  const period = (() => { const h = new Date().getHours(); return h < 11 ? "morning" : h < 17 ? "day" : "evening"; })();
  const teaOpts = window.TEAS.filter((t) => t.cat !== "mate").map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">禅</div>
      <div class="brand-mark">Практики</div>
      <h1>Дыхание и тишина</h1>
      <p class="lead">Чай начинается с дыхания. Замедлись здесь — и каждая чашка станет глубже.</p>
      <div class="brush-divider" aria-hidden="true"></div>
    </header>

    <section class="wrap">
      <div class="ded-wisdom">
        <div class="dw-ded">${UI.dedMark("wis", "")}</div>
        <div class="dw-body">
          <div class="dw-h">Совет Деда дня</div>
          <p class="dw-text">«${w.text}»</p>
          <div class="dw-tip"><i class="bi bi-lightbulb"></i> ${w.tip}</div>
        </div>
      </div>

      <div class="gongfu" id="gongfu">
        <div class="gf-head"><i class="bi bi-stopwatch"></i> Гунфу-таймер заваривания</div>
        <p class="muted">Выбери чай — Дед подскажет температуру, навеску и время проливов.</p>
        <div class="gf-controls">
          <select id="gfTea" class="gf-select">${teaOpts}</select>
          <button class="btn small ghost" id="gfReset"><i class="bi bi-arrow-counterclockwise"></i> Сброс</button>
        </div>
        <div class="gf-info" id="gfInfo"></div>
        <div class="gf-stage">
          <div class="gf-orb" id="gfOrb"><span class="gf-count" id="gfCount">—</span></div>
          <div class="gf-meta" id="gfMeta">Пролив 1</div>
          <button class="btn primary" id="gfStart"><i class="bi bi-play-fill"></i> Старт пролива</button>
        </div>
      </div>

      <div class="practice-tabs" id="practiceTabs">
        <button class="pt active" data-period="now"><i class="bi bi-stars"></i> Сейчас</button>
        <button class="pt" data-period="morning"><i class="bi bi-sunrise"></i> Утро</button>
        <button class="pt" data-period="day"><i class="bi bi-sun"></i> День</button>
        <button class="pt" data-period="evening"><i class="bi bi-sunset"></i> Вечер</button>
        <button class="pt" data-period="all"><i class="bi bi-infinity"></i> Все</button>
      </div>

      <h2 class="h2c">Дыхательные практики</h2>
      <div id="breathStage" class="breath-stage hidden"></div>
      <div class="grid practice-grid" id="breathGrid">
        ${window.BREATHING.map((b) => `
          <div class="card practice-card" data-ptime="${b.time}" style="--mc:${b.color}">
            <div class="pc-icon"><i class="bi bi-wind"></i></div>
            <h4>${b.name}</h4>
            <div class="pc-effect">${b.effect}</div>
            <p class="cstory">${b.desc}</p>
            <div class="card-foot">
              <span class="muted"><i class="bi bi-arrow-repeat"></i> ${b.cycles} циклов</span>
              <button class="btn small" data-breath="${b.id}"><i class="bi bi-play-fill"></i> Начать</button>
            </div>
          </div>`).join("")}
      </div>

      <h2 class="h2c" style="margin-top:50px">Чайные медитации</h2>
      <div class="grid practice-grid" id="meditGrid">
        ${window.MEDITATIONS.map((m) => `
          <div class="card practice-card" data-ptime="${m.time}" style="--mc:${m.color}">
            <div class="pc-icon"><i class="bi ${m.icon}"></i></div>
            <h4>${m.name}</h4>
            <div class="pc-effect">${m.effect} · ${m.minutes} мин</div>
            <p class="cstory">${m.intro}</p>
            <div class="card-foot">
              <span class="muted"><i class="bi bi-hourglass-split"></i> ${m.minutes} мин</span>
              <button class="btn small" data-medit="${m.id}"><i class="bi bi-journal-text"></i> Открыть</button>
            </div>
          </div>`).join("")}
      </div>

      <div class="journal" id="journal">
        <div class="jr-head"><i class="bi bi-journal-richtext"></i> Чайный дневник</div>
        <p class="muted">Отметь состояние и вкус — твой путь во вкусе будет копиться здесь.</p>
        <div class="jr-moods" id="jrMoods">
          ${["Спокойствие", "Радость", "Ясность", "Тепло", "Усталость", "Грусть"].map((m) => `<button class="jr-mood" data-mood="${m}">${m}</button>`).join("")}
        </div>
        <input type="text" id="jrNote" class="jr-note" maxlength="120" placeholder="Ноты вкуса, мысль, благодарность…" />
        <div class="jr-row">
          <select id="jrTea" class="gf-select"><option value="">Без чая</option>${teaOpts}</select>
          <button class="btn small" id="jrSave"><i class="bi bi-plus-lg"></i> Записать</button>
        </div>
        <div class="jr-list" id="jrList"></div>
      </div>
    </section>`;

  return {
    html,
    mount(root) {
      const stage = root.querySelector("#breathStage");
      let timer = null, tick = null;

      function stopBreath() {
        clearTimeout(timer); clearInterval(tick); timer = tick = null;
      }

      function startBreath(b) {
        stopBreath();
        stage.classList.remove("hidden");
        stage.innerHTML = `
          <div class="breath-inner" style="--mc:${b.color}">
            <div class="breath-orb"><div class="breath-core"></div><span class="breath-count">•</span></div>
            <div class="breath-phase">Приготовься…</div>
            <div class="breath-meta"><span class="bm-cycle">Цикл 1 / ${b.cycles}</span> · ${b.name}</div>
            <button class="btn ghost small" id="breathStop"><i class="bi bi-stop-fill"></i> Остановить</button>
          </div>`;
        stage.scrollIntoView({ behavior: "smooth", block: "center" });
        const orb = stage.querySelector(".breath-orb");
        const phaseEl = stage.querySelector(".breath-phase");
        const countEl = stage.querySelector(".breath-count");
        const cycleEl = stage.querySelector(".bm-cycle");
        stage.querySelector("#breathStop").addEventListener("click", () => { stopBreath(); stage.classList.add("hidden"); });

        let cycle = 0, pi = 0;
        const totalSecs = b.phases.reduce((s, p) => s + p.secs, 0) * b.cycles;

        function runPhase() {
          const ph = b.phases[pi];
          phaseEl.textContent = ph.label;
          cycleEl.textContent = `Цикл ${cycle + 1} / ${b.cycles}`;
          orb.style.transition = `transform ${ph.secs}s ease-in-out`;
          orb.style.transform = `scale(${ph.scale})`;
          let remain = ph.secs;
          countEl.textContent = remain;
          clearInterval(tick);
          tick = setInterval(() => { remain--; countEl.textContent = Math.max(remain, 0); if (remain <= 0) clearInterval(tick); }, 1000);
          timer = setTimeout(() => {
            pi++;
            if (pi >= b.phases.length) { pi = 0; cycle++; }
            if (cycle >= b.cycles) { finish(); return; }
            runPhase();
          }, ph.secs * 1000);
        }

        function finish() {
          stopBreath();
          orb.style.transform = "scale(1)";
          phaseEl.innerHTML = '<i class="bi bi-check2-circle"></i> Готово';
          const mins = Math.max(1, Math.round(totalSecs / 60));
          if (Auth.current()) {
            Auth.addPractice({ breath: true, minutes: mins });
            UI.toast(`Практика засчитана · +${mins} мин`);
          } else {
            UI.toast("Войди, чтобы сохранять прогресс практик");
          }
        }

        runPhase();
      }

      root.querySelectorAll("[data-breath]").forEach((btn) =>
        btn.addEventListener("click", () => startBreath(window.BREATHING.find((x) => x.id === btn.dataset.breath)))
      );

      root.querySelectorAll("[data-medit]").forEach((btn) =>
        btn.addEventListener("click", () => openMeditation(window.MEDITATIONS.find((x) => x.id === btn.dataset.medit)))
      );

      /* ——— Наборы по времени суток ——— */
      const tabs = root.querySelector("#practiceTabs");
      function applyFilter(p) {
        const real = p === "now" ? period : p;
        root.querySelectorAll(".practice-card").forEach((c) => {
          const t = c.dataset.ptime;
          const show = p === "all" || t === "any" || t === real;
          c.classList.toggle("hidden", !show);
        });
      }
      tabs.querySelectorAll("[data-period]").forEach((b) =>
        b.addEventListener("click", () => {
          tabs.querySelectorAll(".pt").forEach((x) => x.classList.toggle("active", x === b));
          applyFilter(b.dataset.period);
        }));
      applyFilter("now");

      /* ——— Гунфу-таймер заваривания ——— */
      (function gongfu() {
        const sel = root.querySelector("#gfTea");
        const info = root.querySelector("#gfInfo");
        const orb = root.querySelector("#gfOrb");
        const count = root.querySelector("#gfCount");
        const meta = root.querySelector("#gfMeta");
        const startBtn = root.querySelector("#gfStart");
        const resetBtn = root.querySelector("#gfReset");
        let infusion = 1, gfTimer = null, gfTick = null, running = false;

        function profile(tea) {
          const c = tea.cat;
          if (c === "shu" || c === "sheng") return { first: 10, step: 5 };
          if (c === "gaba" || c === "oolong_light" || c === "oolong_dark") return { first: 15, step: 7 };
          if (c === "green") return { first: 20, step: 12 };
          if (c === "yellow") return { first: 25, step: 12 };
          if (c === "white") return { first: 30, step: 15 };
          if (c === "red") return { first: 12, step: 8 };
          return { first: 20, step: 10 };
        }
        function secsFor(tea) { const p = profile(tea); return p.first + p.step * (infusion - 1); }
        function curTea() { return UI.teaById(sel.value); }
        function refresh() {
          const tea = curTea(); if (!tea) return;
          info.innerHTML = `<span><i class="bi bi-thermometer-half"></i> ${tea.brew.temp}</span><span><i class="bi bi-droplet"></i> ${tea.brew.amount}</span>`;
          meta.textContent = `Пролив ${infusion} · ${secsFor(tea)} сек`;
          count.textContent = secsFor(tea);
        }
        function stop() {
          clearTimeout(gfTimer); clearInterval(gfTick); running = false;
          orb.classList.remove("on");
          startBtn.innerHTML = '<i class="bi bi-play-fill"></i> Старт пролива';
        }
        function start() {
          const tea = curTea(); if (!tea || running) return;
          running = true; orb.classList.add("on");
          startBtn.innerHTML = '<i class="bi bi-stop-fill"></i> Стоп';
          let remain = secsFor(tea);
          count.textContent = remain;
          gfTick = setInterval(() => { remain--; count.textContent = Math.max(remain, 0); if (remain <= 0) clearInterval(gfTick); }, 1000);
          gfTimer = setTimeout(() => {
            stop(); chime();
            UI.toast(`Пролив ${infusion} готов`);
            infusion++; refresh();
          }, secsFor(tea) * 1000);
        }
        sel.addEventListener("change", () => { stop(); infusion = 1; refresh(); });
        startBtn.addEventListener("click", () => { running ? stop() : start(); });
        resetBtn.addEventListener("click", () => { stop(); infusion = 1; refresh(); });
        refresh();
      })();

      /* ——— Чайный дневник ——— */
      (function journal() {
        const moodsWrap = root.querySelector("#jrMoods");
        const noteEl = root.querySelector("#jrNote");
        const teaEl = root.querySelector("#jrTea");
        const saveBtn = root.querySelector("#jrSave");
        const listEl = root.querySelector("#jrList");
        let mood = null;
        moodsWrap.querySelectorAll("[data-mood]").forEach((b) =>
          b.addEventListener("click", () => {
            mood = b.dataset.mood === mood ? null : b.dataset.mood;
            moodsWrap.querySelectorAll(".jr-mood").forEach((x) => x.classList.toggle("on", x.dataset.mood === mood));
          }));
        function renderList() {
          const j = window.Store.get().journal;
          if (!j.length) { listEl.innerHTML = `<p class="muted" style="margin-top:14px">Пока пусто. Первая запись — за тобой.</p>`; return; }
          listEl.innerHTML = j.map((e, i) => {
            const t = e.teaId ? UI.teaById(e.teaId) : null;
            const d = new Date(e.ts);
            return `<div class="jr-item">
              <div class="jr-item-top">${e.mood ? `<span class="jr-tag">${e.mood}</span>` : ""}${t ? `<span class="jr-tea"><i class="bi bi-cup-hot"></i> ${t.name}</span>` : ""}<span class="jr-date">${d.toLocaleDateString("ru-RU")}</span></div>
              ${e.note ? `<div class="jr-item-note">${e.note}</div>` : ""}
              <button class="jr-del" data-jdel="${i}" title="Удалить">×</button>
            </div>`;
          }).join("");
          listEl.querySelectorAll("[data-jdel]").forEach((b) =>
            b.addEventListener("click", () => { window.Store.removeJournal(+b.dataset.jdel); renderList(); }));
        }
        saveBtn.addEventListener("click", () => {
          const note = noteEl.value.trim();
          if (!mood && !note) { UI.toast("Выбери состояние или добавь заметку"); return; }
          window.Store.addJournal({ mood, note, teaId: teaEl.value || null });
          noteEl.value = ""; mood = null;
          moodsWrap.querySelectorAll(".jr-mood").forEach((x) => x.classList.remove("on"));
          renderList(); UI.toast("Записано в дневник");
        });
        renderList();
      })();

      function chime() {
        try {
          const Ctx = window.AudioContext || window.webkitAudioContext;
          const ac = new Ctx();
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = "sine"; o.frequency.value = 432;
          o.connect(g); g.connect(ac.destination);
          g.gain.setValueAtTime(0.0001, ac.currentTime);
          g.gain.exponentialRampToValueAtTime(0.25, ac.currentTime + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1.6);
          o.start(); o.stop(ac.currentTime + 1.7);
        } catch (e) {}
      }

      function openMeditation(m) {
        const modal = document.getElementById("modal");
        let step = 0;
        function render() {
          modal.innerHTML = `
            <div class="modal-card" style="--mc:${m.color}">
              <button class="modal-x" data-close><i class="bi bi-x-lg"></i></button>
              <div class="section-tag"><i class="bi ${m.icon}"></i> Медитация · ${m.minutes} мин</div>
              <h3 class="modal-h">${m.name}</h3>
              <p class="muted">${m.intro}</p>
              <div class="medit-step">
                <div class="ms-num">${step + 1} / ${m.steps.length}</div>
                <p class="ms-text">${m.steps[step]}</p>
              </div>
              <div class="result-actions">
                <button class="btn ghost" id="msPrev" ${step === 0 ? "disabled" : ""}><i class="bi bi-arrow-left"></i></button>
                <button class="btn primary" id="msNext">${step < m.steps.length - 1 ? 'Дальше <i class="bi bi-arrow-right"></i>' : '<i class="bi bi-check2"></i> Завершить'}</button>
              </div>
            </div>`;
          modal.classList.add("open");
          modal.querySelector("[data-close]").addEventListener("click", close);
          modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
          const prev = modal.querySelector("#msPrev");
          if (prev) prev.addEventListener("click", () => { if (step > 0) { step--; render(); } });
          modal.querySelector("#msNext").addEventListener("click", () => {
            if (step < m.steps.length - 1) { step++; render(); }
            else { close(); if (Auth.current()) { Auth.addPractice({ minutes: m.minutes }); UI.toast(`Медитация завершена · +${m.minutes} мин`); } else UI.toast("Войди, чтобы сохранять прогресс"); }
          });
        }
        function close() { modal.classList.remove("open"); modal.innerHTML = ""; }
        render();
      }
    },
  };
};


/* ============================================================
   КАБИНЕТ КЛИЕНТА
   ============================================================ */
Views.client = function () {
  const u = Auth.current();
  if (!u) return Views.auth();
  const s = Store.get();
  const p = u.profile;
  const { rank, score, next } = Views._util.clientRank(s, p);
  const lastPick = s.history[0];
  const lastTea = lastPick ? UI.teaById(lastPick.tea) : null;
  const myOrders = (window.Orders ? Orders.forUser(u.id) : []).slice(0, 5);
  const myCertificates = (window.Operations ? Operations.visibleCertificates() : []).slice(0, 5);
  const certificateLabels = {new:"Заявка получена",contacted:"Команда связалась",awaiting_payment:"Ожидаем оплату",confirmed:"Оплата подтверждена",issued:"Сертификат выпущен",redeemed:"Использован",cancelled:"Отменён"};
  const certificateSteps = ["new","contacted","awaiting_payment","confirmed","issued","redeemed"];

  const html = `
    <header class="dash-hero client-hero">
      <div class="kanji-bg" aria-hidden="true">茶</div>
      <div class="dash-greet">
        ${UI.avatar(u, 64)}
        <div>
          <div class="brand-mark" style="margin:0 0 4px">Кабинет гостя</div>
          <h1 class="dash-name">Добро пожаловать, ${u.name}</h1>
          <div class="rank-line"><i class="bi ${rank.icon}"></i> ${rank.name}</div>
        </div>
      </div>
      <p class="dash-intent">«${p.intention || "Замедлиться и слышать себя."}»</p>
    </header>

    <section class="wrap">
      <div class="spirit-row">
        <div class="spirit"><div class="si"><i class="bi bi-moon-stars"></i></div><div class="sv">${p.meditationMinutes || 0}</div><div class="sk">минут тишины</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-wind"></i></div><div class="sv">${p.breathSessions || 0}</div><div class="sk">дыханий</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-fire"></i></div><div class="sv">${p.practiceStreak || 0}</div><div class="sk">дней подряд</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-cup-hot"></i></div><div class="sv">${s.stamps}</div><div class="sk">чашек</div></div>
      </div>

      <section class="client-loyalty-card">
        <div><span class="section-tag">Карта лояльности</span><h2>Каждая чашка<br>остаётся в истории.</h2><p>${s.stamps % 6 ? `До следующего подарка — ${6 - (s.stamps % 6)}.` : s.stamps ? "Подарок уже ждёт вас. Покажите карту чайному мастеру." : "Первая отметка появится после готового заказа."}</p></div>
        <div class="loyalty-seal"><span>${s.stamps}</span><small>всего отметок</small></div>
        <div class="loyalty-track">${Array.from({length:6},(_,i)=>`<i class="${i<(s.stamps%6)||s.stamps>0&&s.stamps%6===0?"on":""}">${i===5?"茶":i+1}</i>`).join("")}</div>
      </section>

      <div class="dash-grid">
        <div class="dash-card accent">
          <div class="dc-head"><i class="bi bi-moon-stars"></i> Твой эликсир дня</div>
          ${lastTea ? `<p>Предыдущая глава — <b>${lastTea.name}</b>. Откроем следующий вкус?</p>` : `<p>Начнём с первого спокойного подбора.</p>`}
          <button class="btn primary" data-go="#/alchemist"><i class="bi bi-stars"></i> Подобрать чай</button>
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi bi-wind"></i> Практика на сегодня</div>
          <p>Сделай паузу: 4 цикла дыхания-квадрата перед чашкой.</p>
          <button class="btn ghost" data-go="#/meditate"><i class="bi bi-play-fill"></i> К практикам</button>
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi ${rank.icon}"></i> Путь</div>
          <p>${next ? `До ранга «${next.name}» осталось ${next.min - score} шагов вкуса и практики.` : "Ты достиг вершины пути. Поздравляем, Хранитель."}</p>
          <button class="btn ghost" data-go="#/profile"><i class="bi bi-person"></i> Мой профиль</button>
        </div>
      </div>

      <h3 class="cat-h"><i class="bi bi-receipt"></i> Мои заказы</h3>
      ${myOrders.length ? `<div class="orders-grid">${myOrders.map((o) => {
        const st = Orders.STATUS[o.status];
        const items = o.items.map((it) => it.name).join(", ");
        return `<div class="order-card" style="--sc:${st.color}">
          <div class="oc-top"><span class="oc-status"><i class="bi ${st.icon}"></i> ${st.label}</span><span class="oc-time">${new Date(o.ts).toLocaleDateString("ru-RU")}</span></div>
          <div class="oc-items">${items}</div>
          <div class="oc-foot"><span class="price">${UI.rub(o.total)}</span></div>
        </div>`;
      }).join("")}</div>` : `<p class="muted">Заказов пока нет. Откройте чайную карту или подбор.</p>`}

      <h3 class="cat-h"><i class="bi bi-gift"></i> Мои сертификаты</h3>
      ${myCertificates.length ? `<div class="client-certificates">${myCertificates.map((c) => {
        const current = Math.max(0, certificateSteps.indexOf(c.status));
        return `<article class="client-certificate ${c.status}">
          <div class="client-cert-top"><span>${c.code}</span><b>${UI.rub(c.amount)}</b></div>
          <h4>${c.recipientName}</h4><p>${certificateLabels[c.status] || c.status}</p>
          <div class="certificate-track">${certificateSteps.map((step, i) => `<i class="${i < current ? "done" : i === current ? "current" : ""}" title="${certificateLabels[step]}"></i>`).join("")}</div>
          ${c.status === "issued" ? `<small>Сохраните код — он понадобится при посещении чайной.</small>` : c.contactNote ? `<small>${c.contactNote}</small>` : ""}
        </article>`;
      }).join("")}</div>` : `<div class="empty-action"><p class="muted">Заявок пока нет. Можно подарить чайную историю за пару минут.</p><button class="btn ghost" data-go="#/certificate"><i class="bi bi-gift"></i> Выбрать сертификат</button></div>`}

      <h3 class="cat-h"><i class="bi bi-clock-history"></i> Последние подборы</h3>
      ${s.history.length ? `<div class="history">${s.history.slice(0, 5).map((h) => {
        const t = UI.teaById(h.tea), m = h.mushroom ? UI.mushroomById(h.mushroom) : null;
        const d = new Date(h.ts);
        return `<div class="hist-row"><span class="hist-tea">${t ? t.name : "—"}${m ? ` <span class="hist-x">×</span> ${m.name} <i class="bi ${m.icon}"></i>` : ""}</span><span class="hist-date">${d.toLocaleDateString("ru-RU")}</span></div>`;
      }).join("")}</div>` : `<p class="muted">Пока пусто — начните с первого подбора.</p>`}
    </section>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => UI.navigate(b.dataset.go)));
    },
  };
};

/* ============================================================
   КАБИНЕТ МАСТЕРА
   ============================================================ */
Views.master = function () {
  const u = Auth.current();
  if (!u || u.role !== "master") return Views.auth();
  const p = u.profile;
  const clients = Auth.listClients();
  const featured = window.TEAS[Math.floor(Date.now() / 86400000) % window.TEAS.length];

  const html = `
    <header class="dash-hero master-hero">
      <div class="kanji-bg" aria-hidden="true">師</div>
      <div class="dash-greet">
        ${UI.avatar(u, 64)}
        <div>
          <div class="brand-mark" style="margin:0 0 4px">Кабинет мастера</div>
          <h1 class="dash-name">${u.name}</h1>
          <div class="rank-line"><i class="bi bi-yin-yang"></i> ${p.title || "Чайный мастер"} · ★ ${p.rating}</div>
        </div>
      </div>
      <p class="dash-intent">«${p.philosophy || "Чай — это разговор без слов."}»</p>
    </header>

    <section class="wrap">
      <div class="spirit-row">
        <div class="spirit"><div class="si"><i class="bi bi-people"></i></div><div class="sv">${p.clientsServed || 0}</div><div class="sk">гостей принято</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-star-fill"></i></div><div class="sv">${p.rating}</div><div class="sk">рейтинг</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-moon-stars"></i></div><div class="sv">${p.meditationMinutes || 0}</div><div class="sk">минут тишины</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-fire"></i></div><div class="sv">${p.practiceStreak || 0}</div><div class="sk">дней практики</div></div>
      </div>

      <div class="dash-grid">
        <div class="dash-card accent">
          <div class="dc-head"><i class="bi bi-cup-hot-fill"></i> Чай дня</div>
          <p><b>${featured.name}</b> — ${featured.type}, ${featured.origin}.</p>
          <p class="muted" style="font-size:13px">Завари: ${featured.brew.temp}, ${featured.brew.time}. Расскажи гостю историю сорта.</p>
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi bi-wind"></i> Ритуал смены</div>
          <p>Сделай центрирующее дыхание перед открытием — встреть гостей в тишине.</p>
          <button class="btn ghost" data-go="#/meditate"><i class="bi bi-play-fill"></i> Центрирование</button>
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi bi-gem"></i> Специализация</div>
          <div class="spec-tags">${(p.specialties || []).map((sp) => `<span class="note">${sp}</span>`).join("")}</div>
          <button class="btn ghost" data-go="#/profile"><i class="bi bi-pencil"></i> Редактировать</button>
        </div>
      </div>

      <h3 class="cat-h"><i class="bi bi-calendar-check"></i> Моя смена <span class="addon">сегодня</span></h3>
      <div id="myShift" class="my-shift"></div>

      <h3 class="cat-h"><i class="bi bi-shop"></i> Касса · собрать чашку <span class="addon">заказ в зале</span></h3>
      <div class="pos">
        <div class="pos-guest">
          <i class="bi bi-person"></i>
          <select id="posGuest" class="gf-select">
            <option value="">Гость без аккаунта</option>
            ${clients.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
        </div>
        <div class="pos-picker" id="posPicker"></div>
        <div class="pos-ticket">
          <div class="pt-head"><i class="bi bi-receipt"></i> Чек</div>
          <div id="posTicket" class="pt-list"></div>
          <div class="pt-foot">
            <span>Итого</span><span id="posTotal">0 ₽</span>
          </div>
          <button class="btn primary full" id="posSubmit"><i class="bi bi-check2-circle"></i> Провести заказ</button>
        </div>
      </div>

      <h3 class="cat-h"><i class="bi bi-hourglass-split"></i> Очередь <span class="addon">в работе</span></h3>
      <div id="masterQueue" class="orders-grid"></div>

      <h3 class="cat-h"><i class="bi bi-database"></i> База гостей <span class="addon">${clients.length} записей</span></h3>
      <div class="db-table">
        <div class="db-row db-head">
          <span>Гость</span><span>Любимый чай</span><span class="db-hide">С нами с</span><span>Тишина</span>
        </div>
        ${clients.length ? clients.map((c) => `
          <div class="db-row">
            <span class="db-name">${UI.avatar(c, 30)} ${c.name}</span>
            <span>${c.profile.favoriteTea || "—"}</span>
            <span class="db-hide">${new Date(c.createdAt).toLocaleDateString("ru-RU")}</span>
            <span><i class="bi bi-moon-stars"></i> ${c.profile.meditationMinutes || 0} мин</span>
          </div>`).join("") : `<div class="db-row"><span class="muted">Пока нет зарегистрированных гостей.</span></div>`}
      </div>
      <p class="disclaimer"><i class="bi bi-shield-lock"></i> Данные гостей — демо из локальной базы прототипа. В боевой версии — защищённое хранилище и согласие на обработку данных.</p>
    </section>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => UI.navigate(b.dataset.go)));

      /* ——— Моя смена сегодня ——— */
      (function myShift() {
        const box = root.querySelector("#myShift");
        const today = Shifts.todayKey();
        const mine = Shifts.forUser(u.id).filter((s) => s.date === today);
        if (!mine.length) { box.innerHTML = `<p class="muted">На сегодня смен не назначено. Хорошего отдыха.</p>`; return; }
        box.innerHTML = mine.map((s) => {
          const meta = Shifts.SLOTS[s.slot];
          const isOpen = s.status === "open";
          return `<div class="shift-card ${isOpen ? "open" : ""}">
            <div class="sc-info"><i class="bi ${meta.icon}"></i> <b>${meta.label}</b> · ${meta.time}</div>
            <button class="btn small ${isOpen ? "ghost" : "primary"}" data-shift-toggle="${s.id}|${s.status}">
              <i class="bi ${isOpen ? "bi-door-closed" : "bi-door-open"}"></i> ${isOpen ? "Закрыть смену" : "Открыть смену"}
            </button>
          </div>`;
        }).join("");
        box.querySelectorAll("[data-shift-toggle]").forEach((b) =>
          b.addEventListener("click", () => {
            const [id, status] = b.dataset.shiftToggle.split("|");
            const next = status === "open" ? "closed" : "open";
            Shifts.setStatus(id, next);
            UI.toast(next === "open" ? "Смена открыта · доброй работы" : "Смена закрыта");
            App.render();
          }));
      })();

      /* ——— Касса (POS) ——— */
      (function pos() {
        const picker = root.querySelector("#posPicker");
        const ticketEl = root.querySelector("#posTicket");
        const totalEl = root.querySelector("#posTotal");
        const guestSel = root.querySelector("#posGuest");
        const submitBtn = root.querySelector("#posSubmit");
        let ticket = [];

        // быстрые позиции: авторские напитки + популярные чаи + эликсиры
        const quick = [];
        (window.SIGNATURE_DRINKS || []).slice(0, 4).forEach((d) => quick.push({ name: d.name, price: d.price, icon: "bi-cup-hot" }));
        (window.TEAS || []).filter((t) => t.tier === "popular").slice(0, 6).forEach((t) =>
          quick.push({ name: t.name, price: t.price, icon: "bi-cup-hot-fill", teaId: t.id }));
        (window.ELIXIRS || []).slice(0, 3).forEach((e) => quick.push({ name: `Эликсир «${e.title}»`, price: e.price, icon: "bi-droplet-half" }));

        picker.innerHTML = quick.map((q, i) =>
          `<button class="pos-item" data-pos="${i}"><i class="bi ${q.icon}"></i><span>${q.name}</span><b>${UI.rub(q.price)}</b></button>`).join("");

        function renderTicket() {
          if (!ticket.length) { ticketEl.innerHTML = `<p class="muted" style="padding:10px 0">Чек пуст. Нажми на позицию слева.</p>`; }
          else {
            ticketEl.innerHTML = ticket.map((it, i) =>
              `<div class="pt-item"><span>${it.name}</span><span class="pt-r">${UI.rub(it.price)}<button class="ci-del" data-pt-del="${i}">×</button></span></div>`).join("");
            ticketEl.querySelectorAll("[data-pt-del]").forEach((b) =>
              b.addEventListener("click", () => { ticket.splice(+b.dataset.ptDel, 1); renderTicket(); }));
          }
          totalEl.textContent = UI.rub(ticket.reduce((s, x) => s + x.price, 0));
        }

        picker.querySelectorAll("[data-pos]").forEach((b) =>
          b.addEventListener("click", () => { ticket.push(Object.assign({}, quick[+b.dataset.pos])); renderTicket(); }));

        submitBtn.addEventListener("click", () => {
          if (!ticket.length) { UI.toast("Чек пуст"); return; }
          const guest = guestSel.value ? Auth.userById(guestSel.value) : null;
          Orders.create({
            userId: guest ? guest.id : null,
            userName: guest ? guest.name : "Гость в зале",
            masterId: u.id,
            items: ticket,
            channel: "pos",
          });
          UI.toast("Заказ проведён · " + UI.rub(ticket.reduce((s, x) => s + x.price, 0)));
          ticket = []; renderTicket(); renderQueue();
        });

        renderTicket();
      })();

      /* ——— Очередь активных заказов ——— */
      function renderQueue() {
        const box = root.querySelector("#masterQueue");
        const active = Orders.active();
        if (!active.length) { box.innerHTML = `<p class="muted">Очередь пуста.</p>`; return; }
        box.innerHTML = active.map((o) => {
          const st = Orders.STATUS[o.status];
          const items = o.items.map((it) => it.name).join(", ");
          return `<div class="order-card" style="--sc:${st.color}">
            <div class="oc-top"><span class="oc-status"><i class="bi ${st.icon}"></i> ${st.label}</span><span class="oc-time">${new Date(o.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span></div>
            <div class="oc-guest"><i class="bi bi-person"></i> ${o.userName}</div>
            <div class="oc-items">${items}</div>
            <div class="oc-foot"><span class="price">${UI.rub(o.total)}</span>
              <button class="btn small" data-mq="${o.id}"><i class="bi bi-arrow-right-circle"></i> ${o.status === "new" ? "В работу" : "Готов"}</button>
            </div>
          </div>`;
        }).join("");
        box.querySelectorAll("[data-mq]").forEach((b) =>
          b.addEventListener("click", () => { Orders.advance(b.dataset.mq); UI.toast("Статус обновлён"); renderQueue(); }));
      }
      renderQueue();
    },
  };
};

/* ============================================================
   ПРОФИЛЬ (для клиента и мастера)
   ============================================================ */
Views.profile = function () {
  const u = Auth.current();
  if (!u) return Views.auth();
  const s = Store.get();
  const p = u.profile;
  const isMaster = u.role === "master";
  const isAdmin = u.role === "admin";
  const ach = Views._util.achievements(s, p);
  const doneCount = ach.filter((a) => a.done).length;
  const homeRoute = isAdmin ? "admin" : isMaster ? "master" : "client";
  const roleLabel = isAdmin ? (p.title || "Управляющий чайной") : isMaster ? (p.title || "Чайный мастер") : "Гость чайной";
  const roleIcon = isAdmin ? "bi-speedometer2" : isMaster ? "bi-yin-yang" : "bi-person-badge";

  const PALETTE = ["#c4452f", "#e8783e", "#c9a04e", "#7e9b6f", "#2c6e7e", "#8a7b9c", "#b5654a", "#6e4a2f"];

  const html = `
    <header class="hero short">
      <div class="kanji-bg" aria-hidden="true">心</div>
      <div class="profile-top">
        <span id="avatarPreview">${UI.avatar(u, 88)}</span>
        <h1 class="dash-name">${u.name}</h1>
        <div class="rank-line"><i class="bi ${roleIcon}"></i> ${roleLabel} · <span class="prof-login"><i class="bi bi-at"></i>${u.login || "—"}</span></div>
        <div class="muted" style="font-size:13px">С нами с ${new Date(u.createdAt).toLocaleDateString("ru-RU")}</div>
      </div>
    </header>

    <section class="wrap narrow">
      <div class="spirit-row">
        <div class="spirit"><div class="si"><i class="bi bi-moon-stars"></i></div><div class="sv">${p.meditationMinutes || 0}</div><div class="sk">минут тишины</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-wind"></i></div><div class="sv">${p.breathSessions || 0}</div><div class="sk">дыханий</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-fire"></i></div><div class="sv">${p.practiceStreak || 0}</div><div class="sk">стрик</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-trophy"></i></div><div class="sv">${doneCount}/${ach.length}</div><div class="sk">достижений</div></div>
      </div>

      <div class="profile-card">
        <div class="dc-head"><i class="bi bi-person-vcard"></i> Аккаунт</div>
        <form id="acctForm" class="auth-form">
          <div class="field"><label><i class="bi bi-person"></i> Имя</label><input name="name" value="${u.name}" /></div>
          <div class="field"><label><i class="bi bi-at"></i> Логин</label><input name="login" value="${u.login || ""}" /><small class="field-hint">Латиница, цифры и . _ - · 3–20 символов</small></div>
          <div class="field"><label><i class="bi bi-envelope"></i> E-mail <span class="muted">(необязательно)</span></label><input name="email" value="${u.email || ""}" placeholder="для восстановления" /></div>
          <div class="field">
            <label><i class="bi bi-palette"></i> Цвет аватара</label>
            <div class="color-pick" id="colorPick">
              ${PALETTE.map((c) => `<button type="button" class="swatch ${c === u.avatarColor ? "on" : ""}" data-color="${c}" style="--sw:${c}" title="${c}"></button>`).join("")}
            </div>
            <input type="hidden" name="avatarColor" id="avatarColor" value="${u.avatarColor}" />
          </div>
          <div class="auth-error hidden" id="acctErr"></div>
          <button type="submit" class="btn primary full"><i class="bi bi-check2"></i> Сохранить аккаунт</button>
        </form>
      </div>

      <div class="profile-card">
        <div class="dc-head"><i class="bi bi-stars"></i> О себе</div>
        <form id="profForm" class="auth-form">
          <div class="field"><label><i class="bi bi-cup-hot"></i> Любимый чай</label><input name="favoriteTea" value="${p.favoriteTea || ""}" placeholder="например, Да Хун Пао" /></div>
          ${isMaster
            ? `<div class="field"><label><i class="bi bi-stars"></i> Философия</label><textarea name="philosophy" rows="2">${p.philosophy || ""}</textarea></div>
               <div class="field"><label><i class="bi bi-gem"></i> Специализация (через запятую)</label><input name="specialties" value="${(p.specialties || []).join(", ")}" /></div>`
            : isAdmin
            ? `<div class="field"><label><i class="bi bi-stars"></i> Философия управления</label><textarea name="philosophy" rows="2">${p.philosophy || ""}</textarea></div>`
            : `<div class="field"><label><i class="bi bi-flower1"></i> Намерение</label><textarea name="intention" rows="2">${p.intention || ""}</textarea></div>`}
          <button type="submit" class="btn primary full"><i class="bi bi-check2"></i> Сохранить</button>
        </form>
      </div>

      <div class="profile-card">
        <div class="dc-head"><i class="bi bi-shield-lock"></i> Безопасность</div>
        <form id="passForm" class="auth-form">
          <div class="field"><label><i class="bi bi-lock"></i> Текущий пароль</label><input type="password" name="oldPass" autocomplete="current-password" placeholder="••••••" /></div>
          <div class="field"><label><i class="bi bi-lock-fill"></i> Новый пароль</label><input type="password" name="newPass" autocomplete="new-password" placeholder="••••••" /></div>
          <div class="field"><label><i class="bi bi-lock-fill"></i> Повтор нового</label><input type="password" name="newPass2" autocomplete="new-password" placeholder="••••••" /></div>
          <div class="auth-error hidden" id="passErr"></div>
          <button type="submit" class="btn ghost full"><i class="bi bi-key"></i> Сменить пароль</button>
        </form>
      </div>

      <h3 class="cat-h"><i class="bi bi-trophy"></i> Достижения</h3>
      <div class="ach-grid">
        ${ach.map((a) => `<div class="ach ${a.done ? "done" : ""}"><i class="bi ${a.done ? a.icon : "bi-lock"}"></i><span>${a.name}</span></div>`).join("")}
      </div>

      <div class="center" style="margin:36px 0 10px; display:flex; gap:12px; justify-content:center; flex-wrap:wrap">
        <button class="btn ghost" data-go="#/${homeRoute}"><i class="bi bi-grid"></i> В кабинет</button>
        <button class="btn ghost" id="logoutBtn"><i class="bi bi-box-arrow-right"></i> Выйти</button>
      </div>
      <p class="disclaimer"><i class="bi bi-shield-lock"></i> Прототип: данные хранятся в браузере. В боевой версии — серверная авторизация и шифрование паролей.</p>
    </section>`;
  return {
    html,
    mount(root) {
      root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => UI.navigate(b.dataset.go)));
      root.querySelector("#logoutBtn").addEventListener("click", () => App.logout());

      const showErr = (el, msg) => { el.textContent = msg; el.classList.remove("hidden"); };
      const hideErr = (el) => el.classList.add("hidden");

      // ——— выбор цвета аватара + живой предпросмотр ———
      const colorInput = root.querySelector("#avatarColor");
      const preview = root.querySelector("#avatarPreview");
      root.querySelectorAll("#colorPick .swatch").forEach((b) =>
        b.addEventListener("click", () => {
          root.querySelectorAll("#colorPick .swatch").forEach((x) => x.classList.toggle("on", x === b));
          colorInput.value = b.dataset.color;
          const av = preview.querySelector(".avatar");
          if (av) av.style.setProperty("--av", b.dataset.color);
        }));

      // ——— аккаунт ———
      const acctForm = root.querySelector("#acctForm");
      const acctErr = root.querySelector("#acctErr");
      acctForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideErr(acctErr);
        const d = Object.fromEntries(new FormData(acctForm).entries());
        const res = await Auth.updateAccount({ name: d.name, login: d.login, email: d.email, avatarColor: d.avatarColor });
        if (!res.ok) { showErr(acctErr, res.error); return; }
        UI.toast("Аккаунт обновлён");
        App.render();
      });

      // ——— о себе ———
      root.querySelector("#profForm").addEventListener("submit", (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(e.target).entries());
        if (data.specialties !== undefined) data.specialties = data.specialties.split(",").map((x) => x.trim()).filter(Boolean);
        Auth.updateProfile(data);
        UI.toast("Профиль сохранён");
        App.render();
      });

      // ——— смена пароля ———
      const passForm = root.querySelector("#passForm");
      const passErr = root.querySelector("#passErr");
      passForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideErr(passErr);
        const d = Object.fromEntries(new FormData(passForm).entries());
        if (d.newPass !== d.newPass2) { showErr(passErr, "Новые пароли не совпадают"); return; }
        const res = await Auth.changePassword(d.oldPass, d.newPass);
        if (!res.ok) { showErr(passErr, res.error); return; }
        passForm.reset();
        UI.toast("Пароль изменён");
      });
    },
  };
};

/* ============================================================
   КАБИНЕТ УПРАВЛЯЮЩЕГО (операционная система чайной)
   ============================================================ */
Views.admin = function () {
  const u = Auth.current();
  if (!u || !["admin", "owner"].includes(u.role)) return Views.auth();

  const TABS = [
    { key: "overview", icon: "bi-speedometer2", label: "Обзор" },
    { key: "orders", icon: "bi-receipt-cutoff", label: "Заказы" },
    { key: "stock", icon: "bi-box-seam", label: "Склад" },
    { key: "staff", icon: "bi-people", label: "Персонал" },
    { key: "shifts", icon: "bi-calendar-week", label: "Смены" },
  ];

  const html = `
    <header class="dash-hero admin-hero">
      <div class="kanji-bg" aria-hidden="true">理</div>
      <div class="dash-greet">
        ${UI.avatar(u, 64)}
        <div>
          <div class="brand-mark" style="margin:0 0 4px">Управление</div>
          <h1 class="dash-name">${u.name}</h1>
          <div class="rank-line"><i class="bi bi-speedometer2"></i> ${u.profile.title || "Управляющий чайной"}</div>
        </div>
      </div>
      <p class="dash-intent">«${u.profile.philosophy || "Порядок снаружи — тишина внутри."}»</p>
    </header>

    <section class="wrap">
      <div class="admin-tabs" id="adminTabs">
        ${TABS.map((t, i) => `<button class="atab ${i === 0 ? "active" : ""}" data-atab="${t.key}"><i class="bi ${t.icon}"></i> ${t.label}</button>`).join("")}
      </div>
      <div id="adminPanel"></div>
    </section>`;

  /* ——— дни/периоды для аналитики ——— */
  const DAY = 86400000;
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

  /* ——— ОБЗОР ——— */
  function panelOverview() {
    const today = Orders.stats(startOfToday());
    const week = Orders.stats(Date.now() - 7 * DAY);
    const low = Inventory.lowStock();
    const active = Orders.active();
    const maxTop = Math.max(1, ...week.top.map((t) => t.qty));

    return `
      <div class="spirit-row">
        <div class="spirit"><div class="si"><i class="bi bi-cash-coin"></i></div><div class="sv">${UI.rub(today.revenue)}</div><div class="sk">выручка сегодня</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-receipt"></i></div><div class="sv">${today.count}</div><div class="sk">заказов сегодня</div></div>
        <div class="spirit"><div class="si"><i class="bi bi-graph-up"></i></div><div class="sv">${UI.rub(today.avg)}</div><div class="sk">средний чек</div></div>
        <div class="spirit ${low.length ? "spirit-warn" : ""}"><div class="si"><i class="bi bi-exclamation-triangle"></i></div><div class="sv">${low.length}</div><div class="sk">мало на складе</div></div>
      </div>

      <div class="dash-grid">
        <div class="dash-card accent">
          <div class="dc-head"><i class="bi bi-trophy"></i> Топ за 7 дней</div>
          ${week.top.length ? `<div class="bar-list">${week.top.map((t) => `
            <div class="bar-row"><span class="bar-name">${t.name}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.round(t.qty / maxTop * 100)}%"></span></span><span class="bar-val">${t.qty}</span></div>`).join("")}</div>`
            : `<p class="muted">Пока нет данных. Заказы появятся здесь.</p>`}
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi bi-pie-chart"></i> Каналы · неделя</div>
          <div class="chan-row"><span><i class="bi bi-phone"></i> Приложение</span><b>${UI.rub(week.byChannel.self)}</b></div>
          <div class="chan-row"><span><i class="bi bi-shop"></i> Касса в зале</span><b>${UI.rub(week.byChannel.pos)}</b></div>
          <div class="chan-row total"><span>Всего за неделю</span><b>${UI.rub(week.revenue)}</b></div>
        </div>
        <div class="dash-card">
          <div class="dc-head"><i class="bi bi-hourglass-split"></i> В работе сейчас</div>
          <p>Активных заказов: <b>${active.length}</b></p>
          <button class="btn ghost" data-jump="orders"><i class="bi bi-arrow-right"></i> К очереди</button>
        </div>
      </div>

      ${low.length ? `
        <h3 class="cat-h"><i class="bi bi-exclamation-triangle"></i> Требует закупки <span class="addon">${low.length} позиций</span></h3>
        <div class="chip-wrap">${low.map((r) => `<span class="low-chip"><i class="bi ${r.kind === "tea" ? "bi-cup-hot" : "bi-flower1"}"></i> ${r.name} · ${r.stock} ${r.unit}</span>`).join("")}</div>` : ""}
    `;
  }

  /* ——— ЗАКАЗЫ ——— */
  function orderRow(o) {
    const st = Orders.STATUS[o.status];
    const d = new Date(o.ts);
    const items = o.items.map((it) => it.name + (it.sub ? ` <span class="muted">(${it.sub})</span>` : "")).join(", ");
    const canAdvance = o.status === "new" || o.status === "brewing";
    return `
      <div class="order-card" style="--sc:${st.color}">
        <div class="oc-top">
          <span class="oc-status"><i class="bi ${st.icon}"></i> ${st.label}</span>
          <span class="oc-time">${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · ${o.channel === "pos" ? "касса" : "приложение"}</span>
        </div>
        <div class="oc-guest"><i class="bi bi-person"></i> ${o.userName}</div>
        <div class="oc-items">${items}</div>
        <div class="oc-foot">
          <span class="price">${UI.rub(o.total)}</span>
          <span class="oc-actions">
            ${canAdvance ? `<button class="btn small" data-advance="${o.id}"><i class="bi bi-arrow-right-circle"></i> ${o.status === "new" ? "В работу" : "Готов"}</button>` : ""}
            ${o.status !== "cancelled" && o.status !== "done" ? `<button class="btn small ghost" data-cancel="${o.id}"><i class="bi bi-x"></i></button>` : ""}
          </span>
        </div>
      </div>`;
  }
  function panelOrders() {
    const active = Orders.active();
    const recent = Orders.all().filter((o) => o.status === "done" || o.status === "cancelled").slice(0, 8);
    return `
      <h3 class="cat-h"><i class="bi bi-hourglass-split"></i> Очередь <span class="addon">${active.length} активных</span></h3>
      ${active.length ? `<div class="orders-grid">${active.map(orderRow).join("")}</div>`
        : `<p class="muted">Очередь пуста. Можно выдохнуть.</p>`}
      <h3 class="cat-h"><i class="bi bi-clock-history"></i> Недавние</h3>
      ${recent.length ? `<div class="orders-grid">${recent.map(orderRow).join("")}</div>`
        : `<p class="muted">Завершённых заказов пока нет.</p>`}
    `;
  }

  /* ——— СКЛАД ——— */
  function panelStock() {
    const all = Inventory.all();
    const teas = all.filter((r) => r.kind === "tea");
    const mush = all.filter((r) => r.kind === "mushroom");
    const stockRow = (r) => {
      const low = r.stock <= r.par;
      return `
        <div class="db-row stock-row ${low ? "low" : ""}">
          <span class="db-name"><i class="bi ${r.kind === "tea" ? "bi-cup-hot" : "bi-flower1"}"></i> ${r.name}</span>
          <span class="stock-val ${low ? "warn" : ""}">${r.stock} ${r.unit}${low ? ' <i class="bi bi-exclamation-triangle"></i>' : ""}</span>
          <span class="stock-ctl">
            <button class="ic-btn" data-stock-minus="${r.id}" title="−50">−</button>
            <button class="ic-btn" data-stock-plus="${r.id}" title="+100">+</button>
          </span>
        </div>`;
    };
    return `
      <p class="muted" style="margin-bottom:8px">Кнопки корректируют остаток: <b>−</b> списать 50, <b>+</b> пополнить 100. Красным — ниже целевого запаса.</p>
      <h3 class="cat-h"><i class="bi bi-cup-hot"></i> Чай <span class="addon">${teas.length} позиций</span></h3>
      <div class="db-table stock-table">${teas.map(stockRow).join("")}</div>
      <h3 class="cat-h"><i class="bi bi-flower1"></i> Грибные экстракты <span class="addon">${mush.length} позиций</span></h3>
      <div class="db-table stock-table">${mush.map(stockRow).join("")}</div>
    `;
  }

  /* ——— ПЕРСОНАЛ ——— */
  function roleBadge(role) {
    const map = { admin: { l: "Управляющий", i: "bi-speedometer2" }, master: { l: "Мастер", i: "bi-yin-yang" }, client: { l: "Гость", i: "bi-cup-hot" } };
    const m = map[role] || map.client;
    return `<span class="role-badge role-${role}"><i class="bi ${m.i}"></i> ${m.l}</span>`;
  }
  function panelStaff() {
    const staff = Auth.listStaff();
    const clients = Auth.listClients();
    const personRow = (c, showPromote) => `
      <div class="db-row staff-row">
        <span class="db-name">${UI.avatar(c, 32)} ${c.name}<small class="staff-email">@${c.login || "—"}</small></span>
        <span>${roleBadge(c.role)}</span>
        <span class="staff-ctl">
          ${c.role === "client" ? `<button class="btn small ghost" data-promote="${c.id}"><i class="bi bi-arrow-up-circle"></i> В мастера</button>` : ""}
          ${c.role === "master" ? `<button class="btn small ghost" data-demote="${c.id}"><i class="bi bi-arrow-down-circle"></i> В гости</button>` : ""}
          ${c.id === u.id ? `<span class="muted" style="font-size:12px">это вы</span>` : ""}
        </span>
      </div>`;
    return `
      <h3 class="cat-h"><i class="bi bi-people-fill"></i> Команда <span class="addon">${staff.length}</span></h3>
      <div class="db-table">${staff.map((c) => personRow(c, false)).join("")}</div>
      <h3 class="cat-h"><i class="bi bi-cup-hot"></i> Гости <span class="addon">${clients.length} · можно повысить до мастера</span></h3>
      ${clients.length ? `<div class="db-table">${clients.map((c) => personRow(c, true)).join("")}</div>`
        : `<p class="muted">Пока нет зарегистрированных гостей.</p>`}
    `;
  }

  /* ——— СМЕНЫ ——— */
  function panelShifts() {
    const days = Shifts.upcoming(7);
    const staff = Auth.listStaff().filter((s) => s.role === "master");
    const staffOpts = staff.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
    const dayBlock = (d) => {
      const dn = d.dateObj.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" });
      const slot = (key) => {
        const meta = Shifts.SLOTS[key];
        const items = d.items.filter((s) => s.slot === key);
        return `
          <div class="shift-slot">
            <div class="ss-head"><i class="bi ${meta.icon}"></i> ${meta.label} <small>${meta.time}</small></div>
            <div class="ss-people">
              ${items.length ? items.map((s) => `<span class="ss-person">${s.userName}<button class="ss-x" data-shift-del="${s.id}">×</button></span>`).join("")
                : `<span class="muted" style="font-size:12px">никого</span>`}
            </div>
            ${staff.length ? `<div class="ss-add">
              <select class="gf-select" data-shift-user="${d.date}|${key}">${staffOpts}</select>
              <button class="ic-btn" data-shift-add="${d.date}|${key}" title="Назначить"><i class="bi bi-plus-lg"></i></button>
            </div>` : ""}
          </div>`;
      };
      return `
        <div class="shift-day">
          <div class="shift-date">${dn}</div>
          <div class="shift-slots">${slot("morning")}${slot("evening")}</div>
        </div>`;
    };
    return `
      ${staff.length ? "" : `<p class="muted">Сначала добавьте мастеров во вкладке «Персонал».</p>`}
      <div class="shifts-grid">${days.map(dayBlock).join("")}</div>
    `;
  }

  const PANELS = { overview: panelOverview, orders: panelOrders, stock: panelStock, staff: panelStaff, shifts: panelShifts };

  return {
    html,
    mount(root) {
      const tabsEl = root.querySelector("#adminTabs");
      const panel = root.querySelector("#adminPanel");
      let current = "overview";

      function bindPanel() {
        // навигация по вкладкам изнутри карточек
        panel.querySelectorAll("[data-jump]").forEach((b) =>
          b.addEventListener("click", () => switchTab(b.dataset.jump)));

        // заказы
        panel.querySelectorAll("[data-advance]").forEach((b) =>
          b.addEventListener("click", () => { Orders.advance(b.dataset.advance); UI.toast("Статус обновлён"); renderPanel(); }));
        panel.querySelectorAll("[data-cancel]").forEach((b) =>
          b.addEventListener("click", () => { Orders.setStatus(b.dataset.cancel, "cancelled"); UI.toast("Заказ отменён"); renderPanel(); }));

        // склад
        panel.querySelectorAll("[data-stock-plus]").forEach((b) =>
          b.addEventListener("click", () => { Inventory.adjust(b.dataset.stockPlus, +100); renderPanel(); }));
        panel.querySelectorAll("[data-stock-minus]").forEach((b) =>
          b.addEventListener("click", () => { Inventory.adjust(b.dataset.stockMinus, -50); renderPanel(); }));

        // персонал
        panel.querySelectorAll("[data-promote]").forEach((b) =>
          b.addEventListener("click", async () => { const res=await Auth.setRole(b.dataset.promote, "master"); UI.toast(res.ok?"Гость повышен до мастера":res.error); renderPanel(); }));
        panel.querySelectorAll("[data-demote]").forEach((b) =>
          b.addEventListener("click", async () => { const res=await Auth.setRole(b.dataset.demote, "client"); UI.toast(res.ok?"Мастер переведён в гости":res.error); renderPanel(); }));

        // смены
        panel.querySelectorAll("[data-shift-add]").forEach((b) =>
          b.addEventListener("click", () => {
            const [date, slot] = b.dataset.shiftAdd.split("|");
            const sel = panel.querySelector(`[data-shift-user="${date}|${slot}"]`);
            if (!sel || !sel.value) return;
            const user = Auth.userById(sel.value);
            Shifts.plan({ date, slot, userId: user.id, userName: user.name });
            UI.toast("Смена назначена"); renderPanel();
          }));
        panel.querySelectorAll("[data-shift-del]").forEach((b) =>
          b.addEventListener("click", () => { Shifts.remove(b.dataset.shiftDel); renderPanel(); }));
      }

      function renderPanel() {
        panel.innerHTML = (PANELS[current] || panelOverview)();
        bindPanel();
      }

      function switchTab(key) {
        current = key;
        tabsEl.querySelectorAll(".atab").forEach((t) => t.classList.toggle("active", t.dataset.atab === key));
        renderPanel();
      }

      tabsEl.querySelectorAll("[data-atab]").forEach((t) =>
        t.addEventListener("click", () => switchTab(t.dataset.atab)));

      renderPanel();
    },
  };
};
