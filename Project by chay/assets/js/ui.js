// ===== UI-хелперы и переиспользуемые компоненты =====

window.UI = (function () {
  // Позиция без цены не должна ронять весь шаблон экрана.
  const rub = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0).toLocaleString("ru-RU") + " ₽";

  const teaById = (id) => window.TEAS.find((t) => t.id === id);
  const mushroomById = (id) => window.MUSHROOMS.find((m) => m.id === id);

  // Единственный канал обратной связи приложения: подтверждения заказа,
  // ошибки синхронизации и отказы по правам. Регион помечен как live,
  // иначе ни одно из этих сообщений не доходит до скринридера.
  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      t.setAttribute("role", "status");
      t.setAttribute("aria-live", "polite");
      t.setAttribute("aria-atomic", "true");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // Чип эффекта
  function effectChip(key) {
    const e = window.EFFECTS[key];
    if (!e) return "";
    return `<span class="eff-chip" style="--c:${e.color}"><i class="bi ${e.icon}"></i> ${e.label}</span>`;
  }

  // Карточка чая для меню/каталога
  function teaCard(tea) {
    const fav = window.Store.isFavorite(tea.id);
    const weights = tea.weights || [];
    const priceLabel = weights.length > 1 ? `от ${rub(tea.price)}` : rub(tea.price);
    const weightsHTML = weights.length
      ? `<div class="cweights">${weights.map((w) => `<span class="wchip">${w.g} · ${rub(w.price)}</span>`).join("")}</div>`
      : "";
    return `
    <div class="card tea-card" data-tea="${tea.id}">
      <button class="fav ${fav ? "on" : ""}" data-fav="${tea.id}" title="В избранное">
        <i class="bi ${fav ? "bi-heart-fill" : "bi-heart"}"></i>
      </button>
      <div class="ctier"><i class="bi bi-patch-check"></i> ${tea.tier === "premium" ? "Премиум" : "Популярный"}</div>
      <h4>${tea.name}</h4>
      <div class="corigin"><i class="bi bi-geo-alt"></i> ${tea.origin}</div>
      <p class="cstory">${tea.story}</p>
      <div class="ctype">${tea.type}</div>
      ${weightsHTML}
      <div class="card-foot">
        <span class="price">${priceLabel}</span>
        <button class="btn small" data-add-tea="${tea.id}"><i class="bi bi-cup-hot"></i> В чашку</button>
      </div>
    </div>`;
  }

  // Карточка гриба
  function mushroomCard(m) {
    return `
    <div class="card mush-card" style="--mc:${m.color}" data-mush="${m.id}">
      <div class="mush-glyph"><i class="bi ${m.icon}"></i></div>
      <h4>${m.name}</h4>
      <div class="mlatin">${m.latin}</div>
      <div class="meffect">${effectChip(m.effectKey)}</div>
      <p class="cstory">${m.story}</p>
      <div class="mrow"><span class="mk"><i class="bi bi-droplet-half"></i> Вкус</span><span>${m.taste}</span></div>
      <div class="mrow"><span class="mk"><i class="bi bi-eyedropper"></i> Доза</span><span>${m.dose}</span></div>
      <div class="mrow"><span class="mk"><i class="bi bi-link-45deg"></i> С чем</span><span>${m.pairsWith.join(", ")}</span></div>
      <div class="card-foot">
        <span class="price">+ ${rub(m.price)}</span>
        <span class="mbenefits">${m.benefits.slice(0, 2).join(" · ")}</span>
      </div>
    </div>`;
  }

  // Тушь-пейзаж за заголовком эликсира. type: 'pine' | 'sun'
  function inkScene(type, sfx) {
    sfx = sfx || "";
    if (type === "sun") {
      return `
      <div class="ex-scene">
        <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="sun${sfx}" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#f08a4e"/><stop offset="45%" stop-color="#c0432a"/><stop offset="100%" stop-color="#c0432a" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="404" cy="118" r="96" fill="url(#sun${sfx})"/>
          <circle cx="404" cy="118" r="52" fill="#c0432a" opacity=".9"/>
          <path d="M0 206 L110 150 L210 196 L320 138 L424 188 L520 150 L600 196 L600 360 L0 360Z" fill="#43342a" opacity=".55"/>
          <path d="M0 252 L96 210 L210 254 L312 214 L420 258 L520 222 L600 250 L600 360 L0 360Z" fill="#2c2219" opacity=".85"/>
          <path d="M0 300 L130 268 L262 306 L386 274 L504 306 L600 286 L600 360 L0 360Z" fill="#181109"/>
          <ellipse cx="320" cy="224" rx="230" ry="22" fill="#0f0a06" opacity=".5"/>
        </svg>
      </div>`;
    }
    if (type === "moon") {
      return `
      <div class="ex-scene">
        <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <radialGradient id="moon${sfx}" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#f4eed8"/><stop offset="62%" stop-color="#d9cfae"/><stop offset="100%" stop-color="#d9cfae" stop-opacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="408" cy="100" r="98" fill="url(#moon${sfx})" opacity=".55"/>
          <circle cx="408" cy="100" r="50" fill="#ece2c4"/>
          <path d="M0 214 L120 168 L230 210 L340 162 L450 206 L540 172 L600 208 L600 360 L0 360Z" fill="#2b241d" opacity=".7"/>
          <path d="M0 256 L110 222 L220 258 L330 224 L440 260 L540 230 L600 256 L600 360 L0 360Z" fill="#1d160f"/>
          <g fill="#0e0a06">
            <rect x="494" y="206" width="40" height="46"/>
            <path d="M484 208 q30 -22 60 0 q-8 6 -30 6 q-22 0 -30 -6Z"/>
            <path d="M488 190 q26 -20 52 0 q-7 6 -26 6 q-19 0 -26 -6Z"/>
            <path d="M492 174 q22 -17 44 0 q-6 5 -22 5 q-16 0 -22 -5Z"/>
            <rect x="510" y="158" width="8" height="12"/>
          </g>
          <rect x="0" y="300" width="600" height="60" fill="#0c0805" opacity=".5"/>
          <rect x="402" y="150" width="12" height="150" fill="#ece2c4" opacity=".12"/>
        </svg>
      </div>`;
    }
    // pine — туманные горы и сосна
    return `
      <div class="ex-scene">
        <svg viewBox="0 0 600 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <path d="M0 170 L120 110 L230 165 L340 100 L450 160 L540 120 L600 165 L600 360 L0 360Z" fill="#473930" opacity=".45"/>
          <path d="M0 220 L110 175 L220 222 L330 180 L440 226 L540 188 L600 220 L600 360 L0 360Z" fill="#2f251c" opacity=".8"/>
          <ellipse cx="300" cy="205" rx="260" ry="26" fill="#15100a" opacity=".55"/>
          <path d="M0 286 L140 256 L270 292 L394 262 L512 294 L600 276 L600 360 L0 360Z" fill="#160f09"/>
          <g stroke="#120c07" stroke-width="5" fill="none" stroke-linecap="round">
            <path d="M468 300 C470 250 462 215 470 182"/>
            <path d="M470 210 C452 198 440 200 426 190"/>
            <path d="M470 226 C490 214 506 216 520 204"/>
            <path d="M470 196 C456 186 448 184 438 174"/>
          </g>
          <g fill="#100b06">
            <ellipse cx="424" cy="186" rx="26" ry="9"/>
            <ellipse cx="520" cy="200" rx="24" ry="8"/>
            <ellipse cx="452" cy="170" rx="22" ry="8"/>
            <ellipse cx="478" cy="178" rx="20" ry="7"/>
          </g>
        </svg>
      </div>`;
  }

  // Гравюрная иллюстрация ингредиента. key: 'lionsmane' | 'rhodiola' | др.
  function ingredientArt(key, sfx) {
    sfx = sfx || "";
    if (key === "lionsmane") {
      // Львиная грива / ёжовик — мохнатый шар с висящими «иглами»
      let spines = "";
      for (let i = 0; i < 16; i++) {
        const x = 16 + i * 4.3;
        const len = 12 + ((i * 7) % 16);
        spines += `<path d="M${x} 44 q1 ${len * 0.6} 0 ${len}" />`;
      }
      return `
      <svg class="ex-art" viewBox="0 0 96 96" aria-hidden="true">
        <defs><radialGradient id="lm${sfx}" cx="45%" cy="40%" r="60%"><stop offset="0" stop-color="#f1d9a8"/><stop offset="1" stop-color="#d98a3c"/></radialGradient></defs>
        <path d="M48 14c16 0 28 11 28 24 0 9-6 14-14 16-4 1-8 2-14 2s-10-1-14-2c-8-2-14-7-14-16 0-13 12-24 28-24Z" fill="url(#lm${sfx})" stroke="#7a4a1e" stroke-width="2"/>
        <g stroke="#b9762f" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9">${spines}</g>
        <g stroke="#a8641f" stroke-width="1.3" fill="none" opacity=".5">
          <path d="M34 30q14 -8 28 0"/><path d="M30 38q18 -9 36 0"/>
        </g>
      </svg>`;
    }
    if (key === "rhodiola") {
      // Родиола розовая — пучок красных соцветий на стеблях
      return `
      <svg class="ex-art" viewBox="0 0 96 96" aria-hidden="true">
        <g stroke="#5c7a3a" stroke-width="3" fill="none" stroke-linecap="round">
          <path d="M48 86 C46 64 44 52 44 40"/>
          <path d="M48 86 C54 66 58 54 60 42"/>
          <path d="M48 86 C42 68 36 56 32 46"/>
        </g>
        <g fill="#5c7a3a" opacity=".9">
          <path d="M40 60c-7-3-12-1-12-1s4 4 11 4Z"/>
          <path d="M56 56c7-3 12 0 12 0s-5 4-11 3Z"/>
        </g>
        <g fill="#c0432a" stroke="#8a2e1c" stroke-width="1.2">
          ${[[44,36],[60,38],[32,42],[52,30],[40,28]].map(([cx, cy]) =>
            `<g>${[0,72,144,216,288].map((a) => {
              const r = 6, x = cx + r * Math.cos(a * Math.PI / 180), y = cy + r * Math.sin(a * Math.PI / 180);
              return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4"/>`;
            }).join("")}<circle cx="${cx}" cy="${cy}" r="2.4" fill="#f0a85a"/></g>`).join("")}
        </g>
      </svg>`;
    }
    if (key === "cordyceps") {
      // Кордицепс — пучок оранжевых «булав» из основания
      const stalks = [
        "M48 86 C44 60 40 44 36 22", "M48 86 C48 58 48 40 48 18",
        "M48 86 C52 60 56 44 60 24", "M48 86 C40 62 32 48 26 30",
        "M48 86 C56 62 64 48 70 30", "M48 86 C46 64 44 52 42 34",
        "M48 86 C50 64 52 52 54 34",
      ];
      const tops = [[36,22],[48,18],[60,24],[26,30],[70,30],[42,34],[54,34]];
      return `
      <svg class="ex-art" viewBox="0 0 96 96" aria-hidden="true">
        <defs><linearGradient id="cd${sfx}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#b5431f"/><stop offset="1" stop-color="#f0903e"/></linearGradient></defs>
        <path d="M30 88 q18 -10 36 0 q-6 6 -18 6 q-12 0 -18 -6Z" fill="#5b3a1e"/>
        <g stroke="url(#cd${sfx})" stroke-width="4.6" fill="none" stroke-linecap="round">${stalks.map((d) => `<path d="${d}"/>`).join("")}</g>
        <g fill="#f0993f" stroke="#b5431f" stroke-width="1">${tops.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="7"/>`).join("")}</g>
      </svg>`;
    }
    if (key === "reishi") {
      // Рейши — веерная «полка» с кольцами роста на ножке
      return `
      <svg class="ex-art" viewBox="0 0 96 96" aria-hidden="true">
        <defs><radialGradient id="rs${sfx}" cx="38%" cy="80%" r="80%"><stop offset="0" stop-color="#7a2f17"/><stop offset="62%" stop-color="#b5431f"/><stop offset="88%" stop-color="#e0863c"/><stop offset="100%" stop-color="#f3d8a6"/></radialGradient></defs>
        <path d="M44 86 C42 70 40 60 50 54" fill="none" stroke="#6e4427" stroke-width="6" stroke-linecap="round"/>
        <path d="M50 56 C24 50 14 34 30 22 C46 10 84 16 84 40 C84 56 70 62 50 56Z" fill="url(#rs${sfx})" stroke="#5b2a14" stroke-width="2"/>
        <g fill="none" stroke="#7a2f17" stroke-width="1.5" opacity=".55">
          <path d="M40 52 C30 44 28 34 38 28"/>
          <path d="M50 52 C42 42 42 30 54 24"/>
          <path d="M60 52 C56 42 58 30 70 26"/>
        </g>
      </svg>`;
    }
    if (key === "amanita") {
      // Красный мухомор — отдельная глава грибной карты (data.elixirs.js · «Тишина»).
      // Без этой ветки глава получала безликую иконку-заглушку.
      const dots = [[36, 30, 4.6], [52, 26, 5.4], [44, 40, 3.6], [61, 36, 4], [28, 40, 3.2], [54, 44, 3]];
      return `
      <svg class="ex-art" viewBox="0 0 96 96" aria-hidden="true">
        <defs><radialGradient id="am${sfx}" cx="40%" cy="26%" r="82%"><stop offset="0" stop-color="#e8492b"/><stop offset="70%" stop-color="#c4321c"/><stop offset="100%" stop-color="#8f2312"/></radialGradient></defs>
        <path d="M30 88 q18 -8 36 0 q-6 6 -18 6 q-12 0 -18 -6Z" fill="#5b3a1e" opacity=".55"/>
        <path d="M40 84 C38 70 38 62 42 52 L56 52 C60 62 60 70 58 84 Z" fill="#f3e3c4" stroke="#c8b48c" stroke-width="1.6"/>
        <path d="M14 52 C14 28 32 14 49 14 C67 14 84 28 84 52 C64 58 34 58 14 52 Z" fill="url(#am${sfx})" stroke="#7d1d0f" stroke-width="2"/>
        <g fill="#f7ecd6">${dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join("")}</g>
        <path d="M40 52 q9 5 18 0" fill="none" stroke="#f3e3c4" stroke-width="3" stroke-linecap="round"/>
      </svg>`;
    }
    // запасной — иконка
    return `<div class="ex-art ex-art-icon"><i class="bi bi-flower1"></i></div>`;
  }

  function navigate(hash) {
    window.location.hash = hash;
  }

  // Карточка услуги / базовой позиции
  function serviceCard(s) {
    const tiers = s.tiers
      ? `<div class="svc-tiers">${s.tiers.map((t) => `<span class="svc-tier"><b>${rub(t.price)}</b> ${t.label}</span>`).join("")}</div>`
      : "";
    const priceLabel = s.tiers ? `от ${rub(s.price)}` : rub(s.price);
    return `
    <div class="card service-card" data-service="${s.id}">
      <div class="svc-icon"><i class="bi ${s.icon}"></i></div>
      <h4>${s.name}</h4>
      <p class="cstory">${s.desc}</p>
      ${tiers}
      ${s.addon ? `<div class="svc-addon"><i class="bi bi-plus-circle"></i> ${s.addon}</div>` : ""}
      <div class="card-foot">
        <div class="svc-price"><span class="price">${priceLabel}</span><span class="svc-unit">${s.unit}</span></div>
        <button class="btn small" data-svc="${s.id}"><i class="bi bi-bag-plus"></i> ${s.cta}</button>
      </div>
    </div>`;
  }

  // Маскот «Дед ЧИ» с пиалой (SVG), suffix — уникальный для градиентов
  function dedMark(suffix, className) {
    return `<img class="ded-mark ${className || ""}" src="img/brand/logo-mark-color.png" alt="Чайный дед" loading="lazy">`;
    /* Резерв старого шаблона ниже сохраняется для совместимости сохранённых
       экранов, но все новые поверхности используют фирменный знак из брендбука. */
    const f = "df" + suffix, b = "db" + suffix;
    return `
    <svg class="ded-mark ${className || ""}" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="${f}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3e8d2"/><stop offset="1" stop-color="#e6d3ac"/></linearGradient>
        <linearGradient id="${b}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8783e"/><stop offset="1" stop-color="#c34a2c"/></linearGradient>
      </defs>
      <g fill="none" stroke="#5b3a1e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M27 9c-1.6 1.7-1.6 3.4 0 5.1" opacity=".8"/>
        <path d="M32 7c-1.6 1.9-1.6 3.8 0 5.7" opacity=".8"/>
        <path d="M37 9c1.6 1.7 1.6 3.4 0 5.1" opacity=".8"/>
      </g>
      <path d="M22 27c0-7.2 4.5-12 10-12s10 4.8 10 12c0 4-1.4 6.6-3.4 8.2H25.4C23.4 33.6 22 31 22 27Z" fill="url(#${f})" stroke="#5b3a1e" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="32" cy="9.5" r="2.2" fill="url(#${b})" stroke="#5b3a1e" stroke-width="1.6"/>
      <g fill="none" stroke="#5b3a1e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M25.5 25.5c1.2-1.4 3.4-1.4 4.6-.2"/>
        <path d="M38.5 25.5c-1.2-1.4-3.4-1.4-4.6-.2"/>
        <path d="M26 29.4c1-0.9 2.6-0.9 3.6 0"/>
        <path d="M34.4 29.4c1-0.9 2.6-0.9 3.6 0"/>
      </g>
      <path d="M25.4 34c-1.2 4.5-1 9 1.2 12.4 1.6 2.5 3.5 3.4 5.4 3.4s3.8-.9 5.4-3.4c2.2-3.4 2.4-7.9 1.2-12.4Z" fill="url(#${f})" stroke="#5b3a1e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M30 35.5c1.3 1 2.7 1 4 0" fill="none" stroke="#5b3a1e" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M19 49h26c-1 6.2-6.4 9.5-13 9.5S20 55.2 19 49Z" fill="url(#${b})" stroke="#5b3a1e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M17 48.4h30" stroke="#5b3a1e" stroke-width="2.4" stroke-linecap="round"/>
    </svg>`;
  }

  // ——— Иллюстрации напитков и десертов (SVG) ———
  const CUP_COLORS = {
    lemon:    { from: "#f4d24a", to: "#e8862c", lid: "#c0432a", dome: true },
    ginger:   { from: "#f3b048", to: "#db6f24", lid: "#c0432a", dome: true },
    shu:      { from: "#e0913f", to: "#6b3216", lid: "#efe3cf", dome: false },
    hemp:     { from: "#6f7d5e", to: "#2c2a1e", lid: "#1a140e", dome: false },
    lavender: { from: "#8a4fa8", to: "#3f4f9a", lid: "#c0432a", dome: true },
    pranya:   { from: "#f3cf52", to: "#d59a2e", lid: "#d98a3c", dome: true },
  };

  function cupSVG(key, sfx) {
    const c = CUP_COLORS[key] || CUP_COLORS.lemon;
    const clip = "cc" + sfx, grad = "cg" + sfx;
    const lid = c.dome
      ? `<path d="M26 36 Q50 13 74 36 Z" fill="${c.lid}"/><path d="M46 16 L62 16 L60 24 L48 24 Z" fill="${c.lid}"/><rect x="57" y="2" width="5" height="16" rx="2.5" transform="rotate(18 59 10)" fill="${c.lid}"/>`
      : `<rect x="25" y="26" width="50" height="13" rx="3" fill="${c.lid}"/><rect x="31" y="19" width="38" height="9" rx="2" fill="${c.lid}"/><rect x="57" y="4" width="5" height="18" rx="2.5" transform="rotate(16 59 13)" fill="#cdbb9d"/>`;
    return `
    <svg class="drink-svg" viewBox="0 0 100 134" aria-hidden="true">
      <defs>
        <clipPath id="${clip}"><path d="M28 38 L72 38 L66 124 Q66 128 61 128 L39 128 Q34 128 34 124 Z"/></clipPath>
        <linearGradient id="${grad}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.from}"/><stop offset="1" stop-color="${c.to}"/></linearGradient>
      </defs>
      <path d="M28 38 L72 38 L66 124 Q66 128 61 128 L39 128 Q34 128 34 124 Z" fill="rgba(255,255,255,.05)" stroke="rgba(239,227,207,.32)" stroke-width="1.5"/>
      <g clip-path="url(#${clip})">
        <rect x="26" y="50" width="48" height="80" fill="url(#${grad})"/>
        <circle cx="44" cy="104" r="3.2" fill="rgba(255,255,255,.16)"/>
        <circle cx="55" cy="115" r="2.2" fill="rgba(255,255,255,.13)"/>
        <circle cx="40" cy="120" r="1.8" fill="rgba(255,255,255,.12)"/>
      </g>
      <circle cx="50" cy="82" r="13" fill="rgba(20,16,11,.5)" stroke="${c.lid}" stroke-width="1.5"/>
      <text x="50" y="87.5" text-anchor="middle" font-size="14" fill="${c.lid}" font-family="serif">茶</text>
      ${lid}
    </svg>`;
  }

  // Иллюстрация напитка/десерта по ключу
  function drinkArt(key, sfx) {
    sfx = sfx || "";
    if (CUP_COLORS[key]) return cupSVG(key, sfx);

    if (key === "masala") {
      return `
      <svg class="drink-svg" viewBox="0 0 110 120" aria-hidden="true">
        <defs><linearGradient id="ms${sfx}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9a878"/><stop offset="1" stop-color="#a9683c"/></linearGradient></defs>
        <g fill="none" stroke="#cdbb9d" stroke-width="2.4" stroke-linecap="round" opacity=".55">
          <path d="M44 26 q-6 -8 0 -16"/><path d="M55 24 q-6 -9 0 -18"/><path d="M66 26 q-6 -8 0 -16"/>
        </g>
        <path d="M30 44 H80 V70 Q80 96 55 96 Q30 96 30 70 Z" fill="url(#ms${sfx})" stroke="#6e4427" stroke-width="2.5"/>
        <ellipse cx="55" cy="44" rx="25" ry="6" fill="#e7c79e" stroke="#6e4427" stroke-width="2"/>
        <path d="M80 54 q18 2 16 18 q-2 12 -16 12" fill="none" stroke="#6e4427" stroke-width="4"/>
        <g stroke="#7a4a1e" stroke-width="3" stroke-linecap="round"><path d="M40 44 l10 -12"/><path d="M44 46 l10 -12"/></g>
        <g fill="#8a2e1c" stroke="#5b2a14" stroke-width="1">${[0,60,120,180,240,300].map((a)=>{const x=64+7*Math.cos(a*Math.PI/180),y=40+7*Math.sin(a*Math.PI/180);return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="2.4" ry="4" transform="rotate(${a} ${x.toFixed(1)} ${y.toFixed(1)})"/>`;}).join("")}</g>
      </svg>`;
    }

    if (key === "mate") {
      return `
      <svg class="drink-svg" viewBox="0 0 110 120" aria-hidden="true">
        <defs><radialGradient id="mt${sfx}" cx="42%" cy="40%" r="65%"><stop offset="0" stop-color="#8a5a2e"/><stop offset="1" stop-color="#4a2d14"/></radialGradient></defs>
        <rect x="52" y="14" width="6" height="64" rx="3" transform="rotate(12 55 46)" fill="#cdbb9d" stroke="#8a7a5a" stroke-width="1"/>
        <circle cx="55" cy="74" r="34" fill="url(#mt${sfx})" stroke="#3a2310" stroke-width="2.5"/>
        <path d="M27 60 Q55 42 83 60 Q83 50 76 44 Q55 34 34 44 Q27 50 27 60Z" fill="#5c7a3a" stroke="#3a2310" stroke-width="1.5"/>
        <path d="M30 64 Q55 52 80 64" fill="none" stroke="#46612b" stroke-width="2"/>
        <g fill="#46612b">${[34,44,54,64,74].map((x,i)=>`<ellipse cx="${x}" cy="${56+(i%2)*5}" rx="3.6" ry="2.2"/>`).join("")}</g>
        <ellipse cx="55" cy="100" rx="20" ry="5" fill="#2a1a0c"/>
      </svg>`;
    }

    if (key === "coconut") {
      const balls = [[40,60,22],[72,52,20],[96,66,19],[58,86,20],[88,90,18]];
      const nuts = `<path d="M66 40 q8 -5 12 3 q-7 4 -12 -3Z" fill="#e0a23a"/><path d="M44 70 q-8 -3 -10 5 q8 2 10 -5Z" fill="#d98a3c"/>`;
      let dots = "";
      // Крошка распределяется по детерминированной спирали: Math.random() рисовал
      // одну и ту же карточку по-разному при каждом повторном рендере.
      balls.forEach(([cx, cy, r], idx) => {
        for (let k = 0; k < 26; k++) {
          const a = (k * 2.399963 + idx * 0.7) % (Math.PI * 2);
          const rr = ((k + 1) / 27) * (r - 3);
          dots += `<circle cx="${(cx + rr * Math.cos(a)).toFixed(1)}" cy="${(cy + rr * Math.sin(a)).toFixed(1)}" r="1" fill="rgba(150,120,90,.4)"/>`;
        }
      });
      return `
      <svg class="drink-svg" viewBox="0 0 130 120" aria-hidden="true">
        <defs><radialGradient id="co${sfx}" cx="42%" cy="36%" r="70%"><stop offset="0" stop-color="#fbf6ec"/><stop offset="1" stop-color="#e6d8c2"/></radialGradient></defs>
        ${balls.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#co${sfx})" stroke="#d8c6aa" stroke-width="1"/>`).join("")}
        ${dots}
        ${nuts}
      </svg>`;
    }

    return `<div class="ex-art ex-art-icon"><i class="bi bi-cup-straw"></i></div>`;
  }

  // Карточка холодного чая (круглое фото + название + состав + цена)
  function coldCard(item, i) {
    return `
    <div class="cold-card" data-card="${item.id}">
      <div class="cold-img">${drinkArt(item.art, "c" + i)}</div>
      <h4 class="cold-name">${item.name}</h4>
      <div class="cold-comp">${item.comp}</div>
      <div class="cold-foot">
        <span class="price">${rub(item.price)}</span>
        <button class="btn small" data-item="${item.id}"><i class="bi bi-bag-plus"></i> Заказать</button>
      </div>
    </div>`;
  }

  // Карточка авторского напитка (Масала, Мате)
  function authorCard(item, i) {
    return `
    <div class="card author-card" data-card="${item.id}">
      <div class="author-img">${drinkArt(item.art, "a" + i)}</div>
      <div class="author-text">
        <h4>${item.name}</h4>
        <p class="cstory">${item.desc}</p>
        ${item.addon ? `<div class="svc-addon"><i class="bi bi-plus-circle"></i> ${item.addon}</div>` : ""}
        <div class="card-foot">
          <span class="price">${rub(item.price)}</span>
          <button class="btn small" data-item="${item.id}"><i class="bi bi-bag-plus"></i> ${item.cta || "Заказать"}</button>
        </div>
      </div>
    </div>`;
  }

  // Карточка десерта
  function dessertCard(item, i) {
    return `
    <div class="card dessert-card" data-card="${item.id}">
      <div class="dessert-text">
        <h4>${item.name}</h4>
        <div class="price dessert-price">${rub(item.price)}</div>
        ${item.fillings ? `<div class="dessert-fillings">${item.fillings.map((f) => `<span>${f}</span>`).join("")}</div>` : ""}
        <button class="btn small" data-item="${item.id}"><i class="bi bi-bag-plus"></i> Заказать</button>
      </div>
      <div class="dessert-img">${drinkArt(item.art, "d" + i)}</div>
    </div>`;
  }

  // Аватар пользователя (инициалы на цветном круге)
  function avatar(user, size) {
    size = size || 40;
    if (!user) return "";
    return `<span class="avatar" style="--av:${user.avatarColor}; width:${size}px; height:${size}px; font-size:${Math.round(size * 0.4)}px">${user.initials || "?"}</span>`;
  }

  return { rub, teaById, mushroomById, toast, teaCard, effectChip, mushroomCard, serviceCard, coldCard, authorCard, dessertCard, drinkArt, navigate, dedMark, inkScene, ingredientArt, avatar };
})();
