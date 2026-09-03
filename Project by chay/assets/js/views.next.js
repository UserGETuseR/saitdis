// Новая продуктовая поверхность 2026: публичная история, заваривание,
// сертификаты и рабочий контур команды.
(function () {
  const goMount = (root) => root.querySelectorAll("[data-go]").forEach((node) => node.addEventListener("click", () => UI.navigate(node.dataset.go)));
  const fmt = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  Views.home = function () {
    const activeBranch=window.Branches?.current?.()||{id:"sochi",city:"Сочи",chapter:"Морской свет",subtitle:"Чай после солнца · первая глава сети"};
    const branches=window.Branches?.all?.()||[];
    const html = `
      <header class="story-hero" data-city="${activeBranch.id}">
        <div class="story-hero-noise"></div><div class="story-orbit o1"></div><div class="story-orbit o2"></div>
        <div class="story-copy">
          <span class="story-kicker">${activeBranch.city} · ${activeBranch.chapter}</span>
          <h1>У каждой<br><em>чашки</em><br><span class="hero-last">своя глава.</span></h1>
          <p>Не просто меню, а живая чайная книга. Выберите состояние, узнайте легенду листа и пройдите свой ритуал без спешки.</p>
          <div class="story-actions"><button class="btn primary" data-go="#/menu">Открыть чайную карту <span aria-hidden="true">↘</span></button><button class="btn ghost" data-go="#/brew">Заварить самому</button></div>
          <div class="story-metrics" aria-label="Чайная история в цифрах"><span><b>04</b> города</span><span><b>01</b> единая история</span><span><b>∞</b> время для себя</span></div>
        </div>
        <figure class="story-cup-stage" aria-label="Три фирменных напитка маття">
          <div class="story-photo-frame"><img src="img/matcha-lineup-v1.png" alt="Маття-латте, маття-тоник и маття-бамбл в стаканах Чайной истории"></div>
          <figcaption class="cup-note"><b>Новая глава</b><span>маття · лёд · характер</span></figcaption>
          <span class="story-art-index">CHAPTER · 01</span>
        </figure>
        <button class="hero-city-seal" data-city-open><small>Сейчас открыта глава</small><b>${activeBranch.city}</b><span>${activeBranch.subtitle}</span></button>
        <a class="story-scroll" href="#cityBookTitle"><span>Листайте историю</span><i aria-hidden="true">↓</i></a>
        <span class="story-index">01 · ${activeBranch.city.toUpperCase()} · ЧАЙ НЕ ПЬЮТ ТОРОПЯСЬ</span>
      </header>

      <section class="story-ribbon" aria-label="Философия бренда"><span>Чай не пьют торопясь.</span><i>茶</i><span>Каждая чашка · закладка.</span><i>道</i><span>Каждый сорт · новая глава.</span></section>

      <section class="city-book" aria-labelledby="cityBookTitle">
        <div class="city-book-head wrap"><div><span class="section-tag">Четыре города · одна история</span><h2 id="cityBookTitle">У каждого города<br><em>свой ритм чая.</em></h2></div><p>Один характер бренда и четыре живые интонации. Сочи — первая глава, с которой начинается путешествие по сети.</p></div>
        <div class="city-chapters wrap">${branches.map((b,i)=>`<button class="city-chapter ${b.id===activeBranch.id?"active":""}" data-city-chapter="${b.id}"><span>0${i+1} · ${b.id==="sochi"?"первая глава":"глава сети"}</span><b>${b.city}</b><em>${b.chapter}</em><small>${b.subtitle}</small><i>Открыть главу <u>↗</u></i></button>`).join("")}</div>
      </section>

      <section class="wrap ritual-intro">
        <div class="ritual-copy"><span class="section-tag">Начните не с меню</span><h2>Скажите,<br>что вам сейчас <em>нужно.</em></h2><p>Чайная карта отвечает не списком позиций, а маршрутом к нужному состоянию.</p><button class="btn ghost" data-go="#/alchemist">Подобрать состояние</button></div>
        <div class="ritual-path"><article><span>01</span><p><b>Выберите состояние</b>Спокойствие, энергия, ясность или новый вкус.</p></article><article><span>02</span><p><b>Познакомьтесь с чаем</b>Легенда, характер листа и честные вкусовые ноты.</p></article><article><span>03</span><p><b>Заварите правильно</b>Температура, граммовка и живой таймер проливов.</p></article></div>
      </section>

      <section class="wrap matcha-stage">
        <div class="matcha-heading"><span class="section-tag">Сезонная линия</span><h2>Маття<br><em>в движении.</em></h2><p>Три напитка, три состояния. Настоящие текстуры, фирменные стаканы и вкус, который хочется забрать с собой.</p></div>
        <div class="matcha-editorial">
          <figure class="matcha-visual"><img src="img/matcha-lineup-v1.png" alt="Три сезонных напитка маття в фирменных стаканах"><figcaption><span>01—03</span><b>Сезонная глава</b><small>Маття · Сочи · 2026</small></figcaption></figure>
          <div class="matcha-menu">${window.MATCHA_DRINKS.map((d, i) => `<article class="matcha-card tone-${d.tone}"><span>0${i + 1}</span><div><h3>${d.name}</h3><p>${d.comp}</p></div><b>${UI.rub(d.price)}</b><button data-item="${d.id}" aria-label="Добавить ${d.name}">↘</button></article>`).join("")}</div>
        </div>
      </section>

      <section class="wrap story-bridge"><div class="ded-large">${UI.dedMark("home-next", "")}</div><div><span class="section-tag">Чайный Дед рядом</span><h2>Настоящий чай<br>не нуждается<br><span class="bridge-nowrap">в спецэффектах.</span></h2><p>Ему нужны хороший лист, вода, внимание и история, которую хочется передать дальше.</p><blockquote>«Сначала послушайте воду. Потом — себя.»</blockquote><button class="btn ghost" data-go="#/menu">Смотреть чайную карту</button></div></section>

      <section class="wrap gift-call"><span>Подарить не вещь, а время</span><h2>Сертификат<br>на чайную историю.</h2><p>Пауза, которая останется в памяти дольше подарочной упаковки.</p><button class="btn primary" data-go="#/certificate">Выбрать сертификат</button></section>`;
    return { html, mount(root) { goMount(root);root.querySelector("[data-city-open]")?.addEventListener("click",()=>App.openCityPicker());root.querySelectorAll("[data-city-chapter]").forEach((button)=>button.addEventListener("click",async()=>{const result=await Branches.select(button.dataset.cityChapter);if(!result.ok){UI.toast(result.error);return;}await Auth.refreshTeam?.(result.branch.id);App.render();})); root.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => App.addMenuItem(b.dataset.item))); } };
  };

  Views.menu = function () {
    const byCat = (key) => window.TEAS.filter((t) => t.cat === key);
    const matcha = window.MATCHA_DRINKS.map((d, i) => `<article class="matcha-card tone-${d.tone}"><div class="matcha-shot shot-${i}"></div><span>0${i + 1}</span><h3>${d.name}</h3><p>${d.comp}</p><div><b>${UI.rub(d.price)}</b><button data-item="${d.id}" aria-label="Добавить ${d.name}">↘</button></div></article>`).join("");
    const html = `<header class="menu-intro"><span class="section-tag">Меню Чайной истории</span><h1>Лист.<br><em>Вода.</em><br>Состояние.</h1><p>Авторские напитки выглядят ярко. Настоящий чай говорит тише — через происхождение, аромат и послевкусие.</p></header><section class="wrap"><div class="menu-ded">${UI.dedMark("menu-next", "")}<div><b>Чайный Дед подсказывает</b><span>Не знаете сорт — начните с того, как хотите себя чувствовать.</span></div><button class="btn ghost" data-go="#/brew">Заварить себя</button></div><h3 class="cat-h"><i class="bi bi-stars"></i> Маття <span class="addon">в фирменных стаканах</span></h3><div class="matcha-lineup menu-matcha">${matcha}</div><h3 class="cat-h"><i class="bi bi-cup-straw"></i> Холодные напитки</h3><div class="grid cold-grid">${window.COLD_DRINKS.map(UI.coldCard).join("")}</div><h3 class="cat-h"><i class="bi bi-fire"></i> Ритуалы и услуги</h3><div class="grid services-grid">${window.SERVICES.map(UI.serviceCard).join("")}</div>${window.TEA_CATEGORIES.map((c) => { const list = byCat(c.key); return list.length ? `<h3 class="cat-h" id="cat-${c.key}"><i class="bi ${c.icon}"></i> ${c.label}<span class="addon">${c.sub}</span></h3><div class="grid">${list.map(UI.teaCard).join("")}</div>` : ""; }).join("")}</section>`;
    return { html, mount(root) { goMount(root); root.querySelectorAll("[data-item]").forEach((b) => b.addEventListener("click", () => App.addMenuItem(b.dataset.item))); root.querySelectorAll("[data-svc]").forEach((b) => b.addEventListener("click", () => App.addService(b.dataset.svc))); root.querySelectorAll("[data-add-tea]").forEach((b) => b.addEventListener("click", () => App.openElixirPicker(b.dataset.addTea))); root.querySelectorAll("[data-fav]").forEach((b) => b.addEventListener("click", () => { Store.toggleFavorite(b.dataset.fav); b.classList.toggle("on"); })); } };
  };

  // Заваривание: не голый таймер, а карта параметров конкретного сорта.
  // Гость приходит сюда из карточки чая (#/brew?tea=<id>) и видит температуру,
  // время для фирменного стакана и режим проливов. Таймер — дополнение, а не
  // содержание экрана.
  Views.brew = function () {
    const teas = window.TEAS.slice();
    const requested = new URLSearchParams((location.hash.split("?")[1] || "")).get("tea");
    const initial = teas.find((tea) => tea.id === requested) || teas[0];
    const wisdom = Wisdom.ofTheDay("brewing");
    const html = `<header class="brew-hero brew-chapter-hero"><div class="brew-hero-copy"><span class="story-kicker"><i></i> карта заваривания</span><h1>Как заварить<br><em>этот чай.</em></h1><p>Температура воды, время в фирменном стакане и режим проливов — для каждого сорта отдельно. Ниже можно включить таймер и остаться рядом с чашкой.</p><ol class="brew-route"><li><b>01</b><span>Лист<small>выбрать сорт</small></span></li><li><b>02</b><span>Вода<small>температура и навеска</small></span></li><li><b>03</b><span>Время<small>стакан или проливы</small></span></li></ol></div><figure class="brew-brand-art"><img src="img/brand/mark-color.png" alt="Фирменный знак — рука с пиалой"><figcaption><span>茶 · РУКА С ПИАЛОЙ</span><b>Вода уже<br>слушает лист.</b></figcaption></figure></header>
      <section class="wrap brew-atelier">
        <header class="brew-atelier-head"><div><span class="section-tag">Рекомендации чайной</span><h2>Параметры берём из карты сорта.</h2></div><p>Те же значения показываются при настройке позиции в меню. Здесь к ним добавляется таймер и объяснение, чем стакан отличается от проливов.</p></header>
        <div class="brew-workspace">
          <aside class="brew-picker">
            <span class="brew-folio">01 · ЛИСТ</span>
            <label for="brewTea">Какой чай завариваем?<select id="brewTea">${teas.map((tea) => `<option value="${tea.id}" ${tea.id === initial.id ? "selected" : ""}>${tea.name}</option>`).join("")}</select></label>
            <p>Быстрый выбор</p>
            <div class="brew-quick">${teas.slice(0, 8).map((tea, index) => `<button data-brew-pick="${tea.id}"><span>${String(index + 1).padStart(2, "0")}</span>${tea.name.split(" ").slice(0, 3).join(" ")}</button>`).join("")}</div>
            ${wisdom ? `<div class="brew-wisdom"><img src="img/brand/mark-bowl-terra.svg" alt=""><b>${wisdom.text}</b><small>${wisdom.tip}</small></div>` : ""}
          </aside>
          <article class="brew-story" id="brewStory"></article>
          <article class="brew-timer" id="brewTimer"></article>
        </div>
      </section>`;
    return { html, mount(root) {
      let timer = null, left = 0, selected = initial, pour = 1, mode = "pours";
      const select = root.querySelector("#brewTea"), story = root.querySelector("#brewStory"), timerBox = root.querySelector("#brewTimer");
      App.onLeave?.(() => { if (timer) { clearInterval(timer); timer = null; } });

      const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
      // Длительность текущего шага: для стакана — одно время, для проливов —
      // растущее по номеру пролива.
      const stepSeconds = () => {
        const guide = Brewing.guide(selected);
        if (mode === "cup") return guide.cup.seconds;
        const plan = guide.pours;
        return (plan[Math.min(pour - 1, plan.length - 1)] || plan[0]).seconds;
      };

      const render = () => {
        stop();
        selected = UI.teaById(select.value) || teas[0];
        const guide = Brewing.guide(selected);
        pour = 1;
        left = stepSeconds();
        story.innerHTML = `<div class="brew-story-meta"><span>02 · ВОДА И НАВЕСКА</span><small>${(TEA_CATEGORIES.find((entry) => entry.key === selected.cat)?.label) || "чайная глава"}</small></div>
          <h2>${selected.name}</h2>
          <p>${selected.story}</p>
          <div class="taste-notes">${selected.notes.map((note) => `<span>${note}</span>`).join("")}</div>
          <dl class="brew-params">
            <div><dt>Температура воды</dt><dd>${guide.temperature.label}</dd></div>
            <div><dt>Навеска по карте</dt><dd>${guide.referenceLabel}</dd></div>
            <div><dt>Фирменный стакан 0,5 л</dt><dd>${guide.cup.grams ? `${guide.cup.grams} г · ${guide.cup.label}` : guide.cup.label}</dd></div>
            <div><dt>Проливы</dt><dd>${guide.freeform ? "доливать многократно, без строгого времени" : guide.pours.slice(0, 4).map((entry) => entry.label).join(" → ")}</dd></div>
          </dl>
          ${(() => {
            // Советы чайных мастеров об этом сорте: пишет мастер в редакции,
            // публикацию подтверждает управляющая.
            const advice = window.Content?.advice?.(selected.id) || [];
            if (!advice.length) return "";
            return `<section class="brew-advice"><span class="section-tag">Советы чайных мастеров</span>${advice.slice(0, 3).map((item) => `<article><h3>${item.title}</h3><p>${item.excerpt || String(item.body || "").slice(0, 240)}</p><cite>${item.authorName}</cite></article>`).join("")}</section>`;
          })()}
          <div class="brew-actions"><button class="btn primary" data-order-tea>Заказать этот чай ↘</button><button class="btn ghost" data-fav-tea>${Store.isFavorite(selected.id) ? "В избранном" : "В избранное"}</button></div>`;
        root.querySelectorAll("[data-brew-pick]").forEach((button) => button.classList.toggle("active", button.dataset.brewPick === selected.id));
        story.querySelector("[data-order-tea]").onclick = () => Commerce.openTea(selected.id);
        story.querySelector("[data-fav-tea]").onclick = (event) => {
          Store.toggleFavorite(selected.id);
          event.currentTarget.textContent = Store.isFavorite(selected.id) ? "В избранном" : "В избранное";
          UI.toast(Store.isFavorite(selected.id) ? "Сорт добавлен в «Мой чай»" : "Сорт убран из избранного");
        };
        drawTimer();
        Store.discoverTea(selected.id);
      };

      const drawTimer = () => {
        const guide = Brewing.guide(selected);
        const total = Math.max(1, stepSeconds());
        const progress = Math.max(0, Math.min(1, left / total));
        const stepLabel = mode === "cup" ? "стакан 0,5 л" : `пролив ${String(pour).padStart(2, "0")}`;
        timerBox.innerHTML = `<div class="brew-story-meta"><span>03 · ВРЕМЯ</span><small>${stepLabel}</small></div>
          <div class="brew-mode" role="group" aria-label="Способ заваривания"><button type="button" data-mode="pours" class="${mode === "pours" ? "active" : ""}">Проливы</button><button type="button" data-mode="cup" class="${mode === "cup" ? "active" : ""}">Стакан 0,5 л</button></div>
          <div class="timer-dial"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52"></circle><circle class="timer-progress" pathLength="100" cx="60" cy="60" r="52" style="stroke-dashoffset:${100 - progress * 100}"></circle></svg><img src="img/brand/mark-bowl-terra.svg" alt=""><b role="timer" aria-live="polite" aria-label="Осталось секунд">${left}</b><small>секунд</small></div>
          <h3>${left ? (mode === "cup" ? "Стакан заваривается" : "Вода уже слушает лист") : "Готово"}</h3>
          <p>${left ? (mode === "cup" ? `Настой в объёме 0,5 л держим ${guide.cup.label}.` : "Запустите время и останьтесь рядом с чашкой.") : (mode === "cup" ? "Достаньте лист, чтобы вкус не стал горьким." : "Разлейте чай полностью. Следующий пролив будет длиннее.")}</p>
          <div class="timer-actions"><button class="btn primary" id="timerStart">${timer ? "Пауза" : left ? "Запустить" : mode === "cup" ? "Повторить" : "Следующий пролив"}</button><button class="btn ghost" id="timerReset">Сброс</button></div>
          ${guide.freeform ? `<p class="brew-freeform">У этого чая нет строгого времени: доливайте воду по вкусу, ориентируясь на насыщенность настоя.</p>` : ""}`;
        timerBox.querySelectorAll("[data-mode]").forEach((button) => button.onclick = () => {
          mode = button.dataset.mode; pour = 1; stop(); left = stepSeconds(); drawTimer();
        });
        timerBox.querySelector("#timerStart").onclick = () => {
          if (!left) { if (mode === "pours") pour += 1; left = stepSeconds(); }
          if (timer) { stop(); drawTimer(); return; }
          timer = setInterval(() => {
            left -= 1;
            if (left <= 0) { stop(); left = 0; UI.toast(mode === "cup" ? "Стакан готов" : `Пролив ${pour} готов`); }
            drawTimer();
          }, 1000);
          drawTimer();
        };
        timerBox.querySelector("#timerReset").onclick = () => { stop(); pour = 1; left = stepSeconds(); drawTimer(); };
      };

      select.onchange = render;
      root.querySelectorAll("[data-brew-pick]").forEach((button) => button.onclick = () => { select.value = button.dataset.brewPick; render(); });
      render();
    } };
  };

  Views.certificate = function () {
    const u = Auth.current();
    const html = `<header class="gift-hero"><span class="story-kicker"><i></i> цифровой подарок</span><h1>Подарить<br><em>время.</em></h1><p>Мы подготовим сертификат и свяжемся по телефону для подтверждения оплаты.</p></header><section class="wrap gift-layout"><form id="giftForm" class="gift-form"><label>Ваше имя<input name="buyerName" required value="${u ? u.name : ""}"></label><label>Имя получателя<input name="recipientName" required></label><label>Телефон для связи<input name="phone" inputmode="tel" placeholder="+7 900 000-00-00" required></label><fieldset><legend>Номинал</legend>${[1500, 3000, 5000, 10000].map((n, i) => `<label><input type="radio" name="amount" value="${n}" ${i === 1 ? "checked" : ""}><span>${UI.rub(n)}</span></label>`).join("")}</fieldset><label>Пожелание<textarea name="wish" rows="3" placeholder="Несколько тёплых слов"></textarea></label><button class="btn primary" type="submit">Оставить заявку</button><p class="form-note">Оплата пока подтверждается сотрудником по телефону. После подтверждения сертификат получит уникальный код.</p></form><aside class="gift-preview"><span>ЧАЙНАЯ ИСТОРИЯ</span><b>Время<br>для себя</b><i>茶</i><small>цифровой сертификат</small></aside></section>`;
    return { html, mount(root) { root.querySelector("#giftForm").onsubmit = async (event) => { event.preventDefault(); const form=event.currentTarget; const submit=form.querySelector('button[type="submit"]'); submit.disabled=true; const data = Object.fromEntries(new FormData(form).entries()); const rec = Operations.createCertificate(data); const synced=!window.ApiClient||!ApiClient.isReady()?false:await ApiClient.whenSynced("certificates",rec.id); form.innerHTML = `<div class="gift-success"><i class="bi bi-check2-circle"></i><span>${synced?"Заявка принята":"Заявка сохранена локально"}</span><h2>${rec.code}</h2><p>${synced?`Сотрудник уже видит заявку и свяжется с вами по номеру ${rec.phone}.`:`Связь с сервером не подтверждена. Позвоните нам и назовите код ${rec.code}.`}</p><div class="gift-success-actions">${u?`<button type="button" class="btn primary" data-go="#/client">Следить в кабинете</button>`:""}<button type="button" class="btn ghost" data-go="#/">На главную</button></div></div>`; goMount(form); }; } };
  };

  Views.messages = function () {
    const u=Auth.current(); if(!u)return Views.auth();
    const cards=Operations.inbox().map((m)=>`<article><span>${m.subject} · ${m.fromRole==="client"?"гость":"команда"}</span><h3>${m.text}</h3><p>${m.fromName} · ${fmt(m.createdAt)}</p></article>`).join("")||"<p class=muted>Диалогов пока нет. Напишите — команда ответит здесь.</p>";
    const team=Auth.listPublicTeam();
    const html=`<header class="team-hero client-dialog-hero"><span class="story-kicker"><i></i> связь с чайной</span><h1>Диалог,<br><em>а не заявка.</em></h1><p>Выберите чайного мастера или напишите управляющей. Ответ останется в вашем кабинете и не потеряется в личных чатах.</p></header><section class="wrap team-shell"><div class="team-grid"><form id="clientMessageForm" class="work-form"><span class="section-tag">Новое сообщение</span><label>Кому<select name="targetId"><option value="">Управляющей чайной</option>${team.map((person)=>`<option value="${person.id}">${person.name} · ${person.title||"Чайный мастер"}</option>`).join("")}</select></label><label>Тема<input name="subject" required placeholder="Бронь, чай, сертификат..."></label><label>Сообщение<textarea name="text" rows="6" required placeholder="Расскажите, чем помочь"></textarea></label><button class="btn primary">Отправить сообщение</button></form><div class="work-list"><h2>Ваш диалог</h2>${cards}</div></div></section>`;
    return{html,mount(root){root.querySelector("#clientMessageForm").onsubmit=async(event)=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector("button");button.disabled=true;const data=Object.fromEntries(new FormData(form).entries());const rec=Operations.sendMessage({audience:data.targetId?"master":"management",targetId:data.targetId||null,subject:data.subject,text:data.text});const synced=!ApiClient.isReady()?false:await ApiClient.whenSynced("messages",rec.id);UI.toast(synced?"Сообщение доставлено":"Сообщение сохранено и ждёт синхронизации");App.render();};}};
  };

  Views.team = function () {
    const u = Auth.current(); if (!u || !["master", "admin", "owner"].includes(u.role)) return Views.auth();
    const activeBranch=Branches.current();
    const tabs=[...(["admin","owner"].includes(u.role)?[["cities",u.role==="owner"?"Сеть городов":"Мой город"]]:[]),["inbox","Сообщения"],["editor","Редакция"],["stock","Остатки"],["loyalty","Лояльность"],["guides","Памятки"],["requests","Заявки"],["reports","Отчёт смены"],["certs","Сертификаты"],...(["admin","owner"].includes(u.role)?[["1c","Связь с 1С"]]:[])];
    const html = `<header class="team-hero"><span class="story-kicker"><i></i> ${u.role==="owner"?"сеть · четыре главы":`${activeBranch.city} · рабочее пространство`}</span><h1>Команда<br><em>говорит ясно.</em></h1><p>${u.name}, здесь сообщения, лояльность, памятки, заявки, отчёты смены и сертификаты не теряются в личных чатах.</p><div class="team-branch-mark"><small>${u.role==="owner"?"контур директора":"ваша чайная"}</small><b>${u.role==="owner"?"Вся сеть":activeBranch.city}</b></div></header><section class="wrap team-shell"><nav id="teamTabs">${tabs.map(([k,l],i)=>`<button data-team-tab="${k}" class="${i?"":"active"}">${l}</button>`).join("")}</nav><div id="teamPanel"></div></section>`;
    return { html, mount(root) {
      const panel = root.querySelector("#teamPanel"); let tab = tabs[0][0];
      const stateLabel = (s) => ({new:"заявка получена",contacted:"связались",awaiting_payment:"ожидаем оплату",in_progress:"в работе",done:"закрыта",confirmed:"оплата подтверждена",issued:"выпущен",redeemed:"использован",cancelled:"отменён"}[s] || s);
      const certNext = {new:["contacted","Отметить контакт"],contacted:["awaiting_payment","Ждём оплату"],awaiting_payment:["confirmed","Подтвердить оплату"],confirmed:["issued","Выпустить сертификат"],issued:["redeemed","Погасить сертификат"]};
      const certSteps = ["new","contacted","awaiting_payment","confirmed","issued","redeemed"];
      const certCard = (c) => { const next=certNext[c.status],current=Math.max(0,certSteps.indexOf(c.status)); return `<article class="certificate-flow-card"><span>${c.code} · ${stateLabel(c.status)}</span><h3>${UI.rub(c.amount)} для ${c.recipientName}</h3><p>${c.buyerName} · ${c.phone} · ${fmt(c.createdAt)}</p><div class="certificate-track">${certSteps.map((step,i)=>`<i class="${i<current?"done":i===current?"current":""}" title="${stateLabel(step)}"></i>`).join("")}</div>${c.contactNote?`<p class="certificate-note">${c.contactNote}</p>`:""}${next?`<label class="cert-note-field">Комментарий для команды<input data-cert-note="${c.id}" value="${c.contactNote||""}" placeholder="Например: созвонились, ждём перевод"></label><div class="cert-actions"><button data-cert-next="${c.id}|${next[0]}">${next[1]}</button><button class="danger-ghost" data-cert-cancel="${c.id}">Отменить</button></div>`:""}</article>`; };
      const render = () => {
        if(tab==="cities"){
          const summary=new Map(Branches.summaries().map((item)=>[item.id,item]));
          const allUsers=Auth.listAll();
          panel.innerHTML=`<div class="network-console"><div class="network-intro"><span class="section-tag">Операционная книга сети</span><h2>${u.role==="owner"?"Четыре города. Один стандарт заботы.":`${activeBranch.city} · своя команда.`}</h2><p>${u.role==="owner"?"Переключайтесь между главами, смотрите нагрузку и назначайте сотрудникам рабочую чайную.":"Здесь видна команда и текущий ритм вашей чайной. Данные других городов изолированы."}</p></div><div class="network-cards">${Branches.all().filter((branch)=>u.role==="owner"||branch.id===u.branchId).map((branch,i)=>{const s=summary.get(branch.id)||{},people=allUsers.filter((person)=>person.branchId===branch.id&&["master","admin"].includes(person.role));return`<article class="network-card ${branch.id==="sochi"?"network-lead":""}"><span>0${i+1} · ${branch.id==="sochi"?"первая рабочая глава":"глава сети"}</span><h3>${branch.city}</h3><em>${branch.chapter}</em><p>${branch.subtitle}</p><dl><div><dt>Команда</dt><dd>${s.staffCount??people.length}</dd></div><div><dt>В работе</dt><dd>${s.activeOrders??0}</dd></div><div><dt>Дефицит</dt><dd>${s.lowStock??0}</dd></div></dl><div class="network-roster">${people.map((person)=>`<span>${UI.avatar(person,28)}<b>${person.name}</b><small>${person.role==="admin"?"управляющая":"чайный мастер"}</small></span>`).join("")||"<small>Команда ещё не назначена</small>"}</div></article>`;}).join("")}</div>${u.role==="owner"?`<section class="branch-assignment"><div><span class="section-tag">Команда по городам</span><h2>У каждого сотрудника<br>есть своя глава.</h2></div><div class="assignment-list">${allUsers.filter((person)=>person.id!==u.id&&["master","admin"].includes(person.role)).map((person)=>`<label><span>${UI.avatar(person,32)}<b>${person.name}</b><small>${person.role==="admin"?"управляющая":"чайный мастер"}</small></span><select data-assign-branch="${person.id}">${Branches.all().map((branch)=>`<option value="${branch.id}" ${person.branchId===branch.id?"selected":""}>${branch.city} · ${branch.chapter}</option>`).join("")}</select></label>`).join("")||"<p class=muted>Сотрудники появятся после назначения роли.</p>"}</div></section>`:""}</div>`;
          if(!Branches.summaries().length&&ApiClient.isReady())Branches.loadSummaries().then(()=>{if(tab==="cities")render();});
        }
        if (tab === "inbox") panel.innerHTML = `<div class="team-grid"><form id="messageForm" class="work-form"><span class="section-tag">Новое сообщение</span><label>Кому<select name="audience"><option value="team">Всей команде</option><option value="admin">Управляющей</option><option value="master">Мастерам</option>${Auth.listClients().map((client)=>`<option value="client:${client.id}">Гостю · ${client.name}</option>`).join("")}</select></label><label>Тема<input name="subject" required></label><label>Сообщение<textarea name="text" rows="5" required></textarea></label><button class="btn primary">Отправить</button></form><div class="work-list"><h2>Единый inbox</h2>${Operations.inbox().map((m)=>`<article><span>${m.subject}</span><h3>${m.text}</h3><p>${m.fromName}${m.targetId?` → ${Auth.userById(m.targetId)?.name||"гостю"}`:""} · ${fmt(m.createdAt)}</p></article>`).join("") || "<p class=muted>Сообщений пока нет.</p>"}</div></div>`;
        if (tab === "editor") { panel.innerHTML=ContentStudio.panelHTML(u,activeBranch);ContentStudio.mount(panel,{rerender:render}); }
        if (tab === "stock") { const items=Inventory.all(),low=Inventory.lowStock();panel.innerHTML=`<div class="team-stock"><header><div><span class="section-tag">Остатки · ${activeBranch.city}</span><h2>Команда видит<br><em>одну правду.</em></h2><p>Мастер видит дефицит и передаёт заявку. Управляющая проводит поступления, списания и инвентаризации в полном журнале.</p></div><img src="img/brand/mark-color.png" alt="" aria-hidden="true"></header><div class="team-stock-summary"><article><b>${items.length}</b><span>позиций</span></article><article class="${low.length?"attention":""}"><b>${low.length}</b><span>ниже минимума</span></article><article><b>${Inventory.history(999).length}</b><span>движений</span></article></div><div class="team-stock-list">${items.map((item)=>`<article class="${item.stock<=item.par?"low":""}"><span>${item.catalogId}</span><div><b>${item.name}</b><small>минимум ${item.par} ${item.unit}</small></div><strong>${item.stock} <small>${item.unit}</small></strong>${item.stock<=item.par?`<button data-team-stock-request="${item.id}">Передать заявку</button>`:"<i>в норме</i>"}</article>`).join("")||"<p class=muted>Справочник ещё не заполнен.</p>"}</div>${["admin","owner"].includes(u.role)?`<button class="btn primary" data-open-admin-stock>Открыть полный учёт</button>`:"<p class=muted>Изменять остатки может управляющая или директор.</p>"}</div>`; }
        if (tab === "loyalty") panel.innerHTML = `<div class="work-list loyalty-desk"><h2>Карты гостей</h2><p class="muted">Карта привязана к номеру телефона. Отметки начисляются автоматически после готового заказа, ручная корректировка всегда попадает в аудит.</p><label class="loyalty-filter">Найти по номеру<input id="loyaltyPhoneFilter" type="search" inputmode="tel" placeholder="+7 900 000-00-00"></label>${Auth.listClients().map((client)=>`<article data-loyalty-card="${String(client.phone||"").replace(/\D/g,"")}"><span>карта гостя</span><h3>${client.name}</h3><p>${client.phone||"номер ещё не добавлен"} · ${client.login}</p><div class="cert-actions"><button data-loyalty="${client.id}|1">+1 отметка</button><button data-loyalty="${client.id}|-6">Списать награду</button></div></article>`).join("")||"<p class=muted>Гостей пока нет.</p>"}</div>`;
        if (tab === "guides") panel.innerHTML = `<div class="guide-grid">${Operations.guides().map((g,i)=>`<article><span>0${i+1} · ${g.tag}</span><h2>${g.title}</h2><p>${g.text}</p></article>`).join("")}</div>`;
        if (tab === "requests") panel.innerHTML = `<div class="team-grid"><form id="requestForm" class="work-form"><span class="section-tag">Мини-заявка</span><label>Тип<select name="type"><option value="stock">Нет расходника / товара</option><option value="incident">Происшествие</option><option value="repair">Ремонт</option><option value="other">Другое</option></select></label><label>Что произошло<input name="title" required></label><label>Подробности<textarea name="details" rows="4" required></textarea></label><label>Срочность<select name="urgency"><option value="normal">Обычная</option><option value="high">Срочно</option></select></label><button class="btn primary">Передать дальше</button></form><div class="work-list"><h2>Маршрут заявок</h2>${Operations.visibleRequests().map((r)=>`<article class="urgency-${r.urgency}"><span>${r.type} · ${stateLabel(r.status)}</span><h3>${r.title}</h3><p>${r.fromName} → ${r.assignedLabel || r.assignedRole}</p>${r.status!=="done"?`<button data-request-done="${r.id}">Закрыть заявку</button>`:""}</article>`).join("") || "<p class=muted>Заявок пока нет.</p>"}</div></div>`;
        if (tab === "reports") panel.innerHTML = `<div class="team-grid"><form id="reportForm" class="work-form"><span class="section-tag">Закрытие смены</span><label>Смена<select name="shift"><option>Дневная</option><option>Вечерняя</option></select></label><div class="check-stack">${[["hall","Зал и чайная зона приведены в порядок"],["cash","Касса и заказы сверены"],["stock","Остатки и дефициты отмечены"],["handoff","Договорённости переданы следующей смене"]].map(([k,l])=>`<label><input type="checkbox" name="${k}"><span>${l}</span></label>`).join("")}</div><label>Комментарий<textarea name="note" rows="3"></textarea></label><button class="btn primary">Сдать отчёт</button></form><div class="work-list"><h2>Последние смены</h2>${Operations.visibleReports().map((r)=>`<article><span>${r.status==="complete"?"смена закрыта":"нужно внимание"}</span><h3>${r.userName} · ${r.shift}</h3><p>${r.completed}/${r.total} пунктов · ${fmt(r.createdAt)}</p></article>`).join("") || "<p class=muted>Отчётов пока нет.</p>"}</div></div>`;
        if (tab === "certs") panel.innerHTML = `<div class="work-list cert-list"><h2>Сертификаты</h2><p class="muted cert-intro">Каждая заявка проходит понятный маршрут — от первого контакта до погашения.</p>${Operations.visibleCertificates().map(certCard).join("") || "<p class=muted>Новых заявок нет.</p>"}</div>`;
        if(tab==="1c"){panel.innerHTML=`<div class="work-list onec-panel"><span class="section-tag">Интеграция без ручного двойного ввода</span><h2>1С · контур обмена</h2><p class="muted">Заказы и изменения склада уже ставятся в надёжную очередь. Для запуска нужен технический доступ к тестовой публикации 1С.</p><div class="onec-status" id="onecStatus">Проверяем готовность контура…</div><ol><li>Название конфигурации и точная версия платформы.</li><li>Адрес тестовой публикации по HTTPS и отдельный сервисный пользователь.</li><li>Согласованные справочники: номенклатура, склады, цены, контрагенты и заказы.</li><li>Описание расширения или HTTP-сервиса <code>/hs/chay/exchange</code>.</li><li>Тестовая база, ответственный 1С-разработчик и окно приёмки.</li></ol><button id="onecProbe">Проверить соединение</button></div>`;const paint=async(probe=false)=>{const box=panel.querySelector("#onecStatus");try{const result=await ApiClient.integrations.oneCStatus(probe),x=result.integration,q=x.queue?.counts||{};box.innerHTML=`<b>${x.configured?(x.probe?.ok?"1С отвечает":"Доступ настроен"):"Ожидается доступ от 1С"}</b><span>В очереди: ${q.pending||0} · передано: ${q.sent||0} · ошибок: ${q.failed||0}</span>${x.probe?.error?`<small>${x.probe.error}</small>`:""}`;}catch(error){box.textContent=error.message;}};paint();panel.querySelector("#onecProbe").onclick=()=>paint(true);}
        bind();
      };
      // Рабочие действия команды подтверждаются сервером, а не только локально.
      // Раньше отклонённый переход статуса сертификата всё равно выглядел
      // выполненным, потому что UI перерисовывался сразу после записи в DB.
      const cloud = () => !!(window.ApiClient && ApiClient.isReady());
      const confirmSync = async (collection, record, okText) => {
        if (!record) { UI.toast("Действие недоступно для вашей роли"); return false; }
        if (!cloud()) { UI.toast(okText); return true; }
        const synced = await ApiClient.whenSynced(collection, record.id);
        UI.toast(synced ? okText : "Сервер не подтвердил изменение. Проверьте связь и повторите.");
        return synced;
      };
      const bind = () => {
        panel.querySelectorAll("[data-assign-branch]").forEach((select) => select.onchange = async () => {
          select.disabled = true;
          const result = await Auth.setUserBranch(select.dataset.assignBranch, select.value);
          UI.toast(result.ok ? "Рабочий город сотрудника обновлён" : result.error);
          select.disabled = false;
          if (result.ok) { await Branches.loadSummaries(); render(); }
        });

        const msg = panel.querySelector("#messageForm");
        if (msg) msg.onsubmit = async (e) => {
          e.preventDefault();
          const form = e.currentTarget, button = form.querySelector("button");
          button.disabled = true;
          try {
            const data = Object.fromEntries(new FormData(form).entries());
            if (String(data.audience).startsWith("client:")) { data.targetId = data.audience.slice(7); data.audience = "client"; }
            await confirmSync("messages", Operations.sendMessage(data), "Сообщение отправлено");
          } finally { button.disabled = false; render(); }
        };

        panel.querySelectorAll("[data-team-stock-request]").forEach((button) => button.onclick = async () => {
          const item = Inventory.byId(button.dataset.teamStockRequest);
          // Позиция могла исчезнуть после синхронизации — без проверки здесь
          // обработчик падал с TypeError и кнопка молча не работала.
          if (!item) { UI.toast("Позиция склада больше не доступна"); render(); return; }
          button.disabled = true;
          await confirmSync("staff_requests", Operations.createRequest({ type: "stock", title: `Пополнить: ${item.name}`, details: `Остаток ${item.stock} ${item.unit}, минимум ${item.par} ${item.unit}.`, urgency: "high" }), "Заявка на пополнение передана управляющей");
        });

        panel.querySelector("[data-open-admin-stock]")?.addEventListener("click", () => UI.navigate("#/admin?tab=stock"));

        panel.querySelectorAll("[data-loyalty]").forEach((button) => button.onclick = async () => {
          const [id, delta] = button.dataset.loyalty.split("|");
          button.disabled = true;
          const note = prompt("Причина корректировки карты", "Корректировка чайным мастером");
          if (note === null) { button.disabled = false; return; }
          try {
            const result = await ApiClient.loyalty.adjust(id, Number(delta), note);
            const stamps = result?.loyalty?.stamps;
            UI.toast(stamps === undefined ? "Карта лояльности обновлена" : `Карта обновлена · отметок: ${stamps}`);
          } catch (error) { UI.toast(error.message); }
          render();
        });

        const req = panel.querySelector("#requestForm");
        if (req) req.onsubmit = async (e) => {
          e.preventDefault();
          const form = e.currentTarget, button = form.querySelector("button");
          button.disabled = true;
          try { await confirmSync("staff_requests", Operations.createRequest(Object.fromEntries(new FormData(form).entries())), "Заявка передана дальше"); }
          finally { button.disabled = false; render(); }
        };

        const rep = panel.querySelector("#reportForm");
        if (rep) rep.onsubmit = async (e) => {
          e.preventDefault();
          const form = e.currentTarget, button = form.querySelector("button");
          button.disabled = true;
          try {
            const fd = new FormData(form);
            await confirmSync("shift_reports", Operations.createReport({ shift: fd.get("shift"), note: fd.get("note"), checks: { hall: fd.has("hall"), cash: fd.has("cash"), stock: fd.has("stock"), handoff: fd.has("handoff") } }), "Отчёт смены сдан");
          } finally { button.disabled = false; render(); }
        };

        panel.querySelectorAll("[data-request-done]").forEach((b) => b.onclick = async () => {
          b.disabled = true;
          await confirmSync("staff_requests", Operations.setRequestStatus(b.dataset.requestDone, "done"), "Заявка закрыта");
          render();
        });

        panel.querySelectorAll("[data-cert-next]").forEach((b) => b.onclick = async () => {
          const [id, status] = b.dataset.certNext.split("|");
          const note = panel.querySelector(`[data-cert-note="${id}"]`)?.value || "";
          b.disabled = true;
          await confirmSync("certificates", Operations.setCertificateStatus(id, status, note), "Статус сертификата обновлён");
          render();
        });

        panel.querySelectorAll("[data-cert-cancel]").forEach((b) => b.onclick = async () => {
          if (!confirm("Отменить заявку на сертификат?")) return;
          b.disabled = true;
          await confirmSync("certificates", Operations.setCertificateStatus(b.dataset.certCancel, "cancelled"), "Заявка отменена");
          render();
        });
      };
      root.querySelectorAll("[data-team-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.teamTab;root.querySelectorAll("[data-team-tab]").forEach(x=>x.classList.toggle("active",x===b));render();}); render();
    } };
  };
})();

document.addEventListener("input",(event)=>{
  if(event.target.id!=="loyaltyPhoneFilter")return;
  const query=event.target.value.replace(/\D/g,"");
  event.target.closest(".loyalty-desk")?.querySelectorAll("[data-loyalty-card]").forEach((card)=>{
    card.hidden=!!query&&!card.dataset.loyaltyCard.includes(query);
  });
});
