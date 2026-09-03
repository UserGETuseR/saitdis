(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;",
  })[char]);
  const modal = () => document.getElementById("modal");

  // Телефон чайной для доставки и подтверждения заказа.
  const CONTACT_PHONE = "+7 962 888-68-80";
  const CONTACT_PHONE_HREF = "+79628886880";

  // Способы оплаты. СБП включается, когда директор подключит платёжного
  // провайдера и заполнит CHA_CONFIG.payments.sbp — до этого гость видит
  // честный вариант «оплата в чайной».
  const PAYMENT_METHODS = [
    {
      id: "venue",
      name: "В чайной при получении",
      note: "Картой через терминал или наличными.",
      available: true,
    },
    {
      id: "sbp",
      name: "СБП · по QR после подтверждения",
      note: "Мастер проверит заказ и пришлёт подтверждённый QR или ссылку. До этого переводить ничего не нужно.",
      // Даже без банковского API гость может выбрать СБП: способ оплаты
      // сохраняется в заказе, а команда отправляет штатный QR после проверки.
      // Когда появятся ключи эквайринга, этот же сценарий станет автоматическим.
      available: true,
    },
  ];

  // Пока открыта модалка, страница под ней не должна прокручиваться:
  // на телефоне это уводило пользователя с места чтения.
  function lockScroll(locked) {
    const body = document.body;
    if (locked) {
      if (body.dataset.scrollLock) return;
      body.dataset.scrollLock = String(window.scrollY || 0);
      body.style.overflow = "hidden";
    } else {
      if (!body.dataset.scrollLock) return;
      delete body.dataset.scrollLock;
      body.style.overflow = "";
    }
  }

  const close = () => { modal().classList.remove("open"); modal().innerHTML = ""; modal().onclick = null; lockScroll(false); };

  // Расчёт цены живёт в brewing.js (window.Pricing) — один источник для меню,
  // конфигуратора и корзины. Обёртка сохранена для обратной совместимости.
  const quote = (tea, grams) => Pricing.teaPrice(tea, grams);
  const localDate = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const localTime = (date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const nextSlot = (minutes) => {
    const date = new Date(Date.now() + minutes * 60_000);
    date.setSeconds(0, 0);
    date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15);
    return date;
  };

  // Конфигуратор позиции. Порядок шагов повторяет живой разговор с мастером:
  // как будете пить → сколько чая → как заваривать → десерт → травы и грибы.
  // Цена пересобирается построчно, чтобы гость видел, из чего она сложилась.
  function openTea(teaId, preset = {}) {
    const tea = UI.teaById(teaId);
    if (!tea) return;
    const formats = window.SERVICE_FORMATS || [];
    const packs = Pricing.divisiblePacks(tea);
    const guide = Brewing.guide(tea);
    const desserts = Pairings.desserts(tea);
    const addons = Pairings.addons(tea);
    const herbs = Pairings.herbs(tea);
    const mushrooms = (window.MUSHROOMS || []).filter((item) => item.id !== "amanita");
    const amanita = (window.MUSHROOMS || []).find((item) => item.id === "amanita");
    const wisdom = Wisdom.forKey("builder", tea.id);

    let formatId = preset.formatId && formats.some((entry) => entry.id === preset.formatId) ? preset.formatId : (formats[0]?.id || "cup");
    const startFormat = Pricing.formatById(formatId);
    let gramsValue = Math.max(1, Math.round(Number(preset.grams) || startFormat?.recommendedGrams || packs[0]?.grams || 8));

    const box = modal();
    box.innerHTML = `<div class="modal-card preorder-builder">
      <button class="modal-x" data-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button>
      <div class="builder-head"><div><span class="section-tag">Настроить позицию</span><h2>${esc(tea.name)}</h2><p>${esc(tea.story)}</p></div><img src="img/brand/logo-mark-color.png" alt="Чайный дед"></div>
      <form id="teaBuilder">
        <section>
          <span class="builder-step">01 · как будете пить</span>
          <div class="builder-options format-options">${formats.map((item) => `<label><input type="radio" name="format" value="${item.id}" ${item.id === formatId ? "checked" : ""}><span><b>${esc(item.name)}</b><small>${esc(item.note)}</small><em data-format-price="${item.id}"></em></span></label>`).join("")}</div>
          <p class="builder-hint" id="formatHint"></p>
        </section>
        <section id="gramSection">
          <span class="builder-step">02 · сколько чая подготовить</span>
          <div class="gram-control"><button type="button" data-gram-step="-1" aria-label="Убрать грамм">−</button><label><span class="sr-only" for="builderGrams">Граммовка</span><input id="builderGrams" name="grams" type="number" min="1" max="1000" step="1" inputmode="numeric" value="${gramsValue}"><span>граммов</span></label><button type="button" data-gram-step="1" aria-label="Добавить грамм">+</button></div>
          <div class="gram-quick">${packs.map((entry) => `<button type="button" data-grams="${entry.grams}">${esc(entry.label)} · ${UI.rub(entry.price)}</button>`).join("")}</div>
          <p class="builder-hint" id="gramHint"></p>
        </section>
        <section class="brew-guide-section">
          <span class="builder-step">03 · как это заваривается</span>
          <div class="brew-guide-grid">
            <article><span>Вода</span><b>${esc(guide.temperature.label)}</b><small>${guide.temperature.assumed ? "ориентир для этого типа листа" : "по карте сорта"}</small></article>
            <article><span>Фирменный стакан 0,5 л</span><b>${esc(guide.cup.label)}</b><small>${guide.cup.grams ? `навеска ${guide.cup.grams} г` : "навеску подберёт мастер"}</small></article>
            <article><span>Первый пролив</span><b>${esc(guide.pours[0].label)}</b><small>${guide.freeform ? "доливать многократно" : `далее ${esc(guide.pours[1].label)}, ${esc(guide.pours[2].label)}`}</small></article>
          </div>
          <p class="builder-hint">${esc(guide.referenceLabel)} · <a href="#/brew?tea=${encodeURIComponent(tea.id)}" data-brew-link>открыть полную карту заваривания с таймером ↘</a></p>
        </section>
        <section>
          <span class="builder-step">04 · десерт к выбранному вкусу</span>
          <div class="builder-options">${desserts.map((item) => `<label><input type="checkbox" name="dessert" value="${item.id}"><span><b>${esc(item.name)}</b><small>${esc(Pairings.reason(tea, item))} · +${UI.rub(item.price)}</small></span></label>`).join("") || '<p class="builder-hint">Десерт к этому чаю подберёт мастер.</p>'}</div>
        </section>
        <section>
          <span class="builder-step">05 · травы в настой</span>
          <div class="builder-options">${herbs.map((item) => `<label><input type="checkbox" name="herb" value="${item.id}"><span><b>${esc(item.name)}</b><small>${esc(item.note)} · +${UI.rub(item.price)}</small></span></label>`).join("")}</div>
        </section>
        <section>
          <span class="builder-step">06 · добавки к чашке</span>
          <div class="builder-options">${addons.map((item) => `<label><input type="checkbox" name="addon" value="${item.id}"><span><b>${esc(item.name)}</b><small>${esc(item.note)} · +${UI.rub(item.price)}</small></span></label>`).join("")}</div>
        </section>
        <section>
          <span class="builder-step">07 · грибная глава, только осознанно</span>
          <div class="builder-options"><label><input type="radio" name="mushroom" value="" checked><span><b>Чистый чай</b><small>без грибного продукта</small></span></label>${mushrooms.map((item) => `<label><input type="radio" name="mushroom" value="${item.id}"><span><b>${esc(item.name)}</b><small>${esc(item.taste)} · +${UI.rub(item.price)}</small></span></label>`).join("")}</div>
          ${amanita ? `<p class="builder-hint amanita-note"><b>${esc(amanita.name)}</b> не добавляется через приложение. ${esc(amanita.safety)} <a href="#/menu?chapter=mushrooms" data-close-link>Прочитать правила ↘</a></p>` : ""}
          <p class="builder-disclaimer">${esc(window.MUSHROOM_DISCLAIMER)}</p>
        </section>
        ${wisdom ? `<section class="builder-wisdom"><img src="img/brand/mark-bowl-terra.svg" alt=""><div><span>Чайный дед подсказывает</span><b>${esc(wisdom.text)}</b><small>${esc(wisdom.tip)}</small></div></section>` : ""}
        <footer>
          <div class="builder-total"><small>Стоимость позиции</small><b id="builderTotal"></b><ul id="builderBreakdown"></ul></div>
          <button class="btn primary" type="submit">Добавить в корзину</button>
        </footer>
      </form>
    </div>`;
    box.classList.add("open");
    box.querySelector("[data-close]").onclick = close;
    box.onclick = (event) => { if (event.target === box) close(); };
    lockScroll(true);

    const form = box.querySelector("#teaBuilder");
    const gramsInput = form.elements.grams;
    const gramSection = box.querySelector("#gramSection");
    const gramHint = box.querySelector("#gramHint");
    const formatHint = box.querySelector("#formatHint");
    const totalNode = box.querySelector("#builderTotal");
    const breakdownNode = box.querySelector("#builderBreakdown");

    const collect = () => {
      const chosenFormat = form.elements.format.value;
      const herbList = [...form.querySelectorAll('[name="herb"]:checked')].map((input) => TEA_ADDONS.find((item) => item.id === input.value)).filter(Boolean);
      const addonList = [...form.querySelectorAll('[name="addon"]:checked')].map((input) => TEA_ADDONS.find((item) => item.id === input.value)).filter(Boolean);
      const sweets = [...form.querySelectorAll('[name="dessert"]:checked')].map((input) => DESSERTS.find((item) => item.id === input.value)).filter(Boolean);
      const mushroom = UI.mushroomById(form.elements.mushroom.value);
      return { formatId: chosenFormat, herbs: herbList, addons: addonList, desserts: sweets, mushroom };
    };

    const calculate = () => {
      const state = collect();
      const format = Pricing.formatById(state.formatId);
      // Церемония включает чай, поэтому граммовка там не запрашивается.
      const teaByWeight = !format.includesTea;
      gramSection.hidden = !teaByWeight;
      gramsInput.disabled = !teaByWeight;

      const value = Math.min(1000, Math.max(1, Math.round(Number(gramsInput.value) || 1)));
      if (String(value) !== gramsInput.value) gramsInput.value = value;
      gramsValue = value;

      formatHint.textContent = format.hint || "";
      if (teaByWeight) {
        const recommended = format.recommendedGrams;
        gramHint.textContent = recommended
          ? `Рекомендуем ${recommended} г. Можно указать любую граммовку от 1 грамма — цена пересчитается.`
          : "Можно указать любую граммовку от 1 грамма.";
      }

      // Цена каждого формата показывается прямо в выборе.
      formats.forEach((item) => {
        const node = box.querySelector(`[data-format-price="${item.id}"]`);
        if (!node) return;
        const service = Pricing.servicePrice(tea, item.id);
        const leaf = item.includesTea ? 0 : Pricing.teaPrice(tea, item.recommendedGrams || value);
        node.textContent = item.includesTea
          ? `${UI.rub(service)} · ${Pricing.ceremonyTier(tea).label}`
          : service > 0 ? `${UI.rub(service)} + чай (${UI.rub(leaf)} за ${item.recommendedGrams || value} г)` : `от ${UI.rub(leaf)}`;
      });

      const result = Pricing.breakdown({ tea, formatId: state.formatId, grams: value, addons: [...state.herbs, ...state.addons], mushroom: state.mushroom, desserts: state.desserts });
      totalNode.textContent = UI.rub(result.total);
      breakdownNode.innerHTML = result.rows.map((row) => `<li><span>${esc(row.label)}</span><b>${row.price ? UI.rub(row.price) : "включено"}</b></li>`).join("");
      return result;
    };

    form.addEventListener("change", calculate);
    gramsInput.addEventListener("input", calculate);
    form.querySelectorAll("[data-grams]").forEach((button) => { button.onclick = () => { gramsInput.value = button.dataset.grams; calculate(); }; });
    form.querySelectorAll("[data-gram-step]").forEach((button) => {
      button.onclick = () => {
        gramsInput.value = Math.min(1000, Math.max(1, (Number(gramsInput.value) || 1) + Number(button.dataset.gramStep)));
        calculate();
      };
    });
    box.querySelector("[data-brew-link]")?.addEventListener("click", () => close());
    box.querySelector("[data-close-link]")?.addEventListener("click", () => close());
    calculate();

    form.onsubmit = (event) => {
      event.preventDefault();
      const state = collect();
      const format = Pricing.formatById(state.formatId);
      const result = Pricing.breakdown({ tea, formatId: state.formatId, grams: gramsValue, addons: [...state.herbs, ...state.addons], mushroom: state.mushroom, desserts: state.desserts });
      // Десерты уходят отдельными строками — их готовят и считают отдельно.
      const dessertTotal = state.desserts.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
      const teaLinePrice = result.total - dessertTotal;
      const parts = [format.short || format.name];
      if (!format.includesTea) parts.push(`${gramsValue} г`);
      if (format.includesTea) parts.push(Pricing.ceremonyTier(tea).label);
      state.herbs.forEach((item) => parts.push(item.name));
      state.addons.forEach((item) => parts.push(item.name));
      if (state.mushroom) parts.push(state.mushroom.name);

      Store.addConfigured({
        kind: "tea",
        sku: `TEA-${tea.id}`,
        teaId: tea.id,
        mushroomId: state.mushroom?.id || null,
        name: tea.name,
        grams: format.includesTea ? null : gramsValue,
        quantity: format.includesTea ? 1 : gramsValue,
        unit: format.includesTea ? "pcs" : "g",
        formatId: format.id,
        serviceId: format.serviceId || null,
        addons: [...state.herbs, ...state.addons].map((item) => item.id),
        price: teaLinePrice,
        sub: parts.join(" · "),
      });
      state.desserts.forEach((item) => Store.addConfigured({ kind: "dessert", sku: `DESSERT-${item.id}`, name: item.name, quantity: 1, unit: "pcs", price: item.price, sub: `К чаю ${tea.name}` }));
      Store.logPick(tea.id, state.mushroom?.id || null);
      App.refreshCart?.();
      UI.toast("Позиция добавлена в корзину");
      close();
      App.openCart();
    };
  }

  function addProduct(id) {
    const item = [...(window.COLD_DRINKS || []), ...(window.MATCHA_DRINKS || []), ...(window.SIGNATURE_DRINKS || []), ...(window.DESSERTS || []), ...(window.MERCH || [])].find((entry) => entry.id === id);
    if (!item) return;
    Store.addConfigured({kind:item.kind || ((MERCH || []).some((entry) => entry.id === id) ? "merch" : DESSERTS.some((entry) => entry.id === id) ? "dessert" : "drink"), sku:item.sku || `CHI-${id}`, name:item.name, quantity:1, unit:"pcs", price:item.price, sub:item.comp || item.desc || null});
    App.refreshCart?.();
    UI.toast(`${item.name} · в корзине`);
  }

  // Заказ услуги: церемония, варка, стакан навынос. Раньше услуги вообще
  // нельзя было положить в корзину — они не выводились в меню.
  function addService(id, options = {}) {
    const service = (window.SERVICES || []).find((entry) => entry.id === id);
    if (!service) return;
    // Церемония считается по категории чая, поэтому её настраивают через чай.
    if (service.tiers && !options.tierLabel) {
      openServicePicker(service);
      return;
    }
    const guests = Math.max(1, Math.round(Number(options.guests) || 1));
    const unitPrice = Number(options.price) || Number(service.price) || 0;
    const label = options.tierLabel ? `${service.name} · ${options.tierLabel}` : service.name;
    Store.addConfigured({
      kind: "service",
      sku: `SERVICE-${service.id}`,
      serviceId: service.id,
      name: label,
      quantity: guests,
      unit: "pcs",
      price: unitPrice * guests,
      sub: [service.unit, guests > 1 ? `${guests} чел.` : null, service.addon].filter(Boolean).join(" · "),
    });
    App.refreshCart?.();
    UI.toast(`${service.name} · в корзине`);
  }

  // Выбор категории и числа гостей для церемонии.
  function openServicePicker(service) {
    const box = modal();
    const tiers = service.tiers || [];
    box.innerHTML = `<div class="modal-card service-picker">
      <button class="modal-x" data-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button>
      <div class="builder-head"><div><span class="section-tag">Записаться на услугу</span><h2>${esc(service.name)}</h2><p>${esc(service.desc)}</p></div><img src="img/brand/mark-bowl-terra.svg" alt=""></div>
      <form id="serviceForm">
        <section><span class="builder-step">01 · категория чая</span><div class="builder-options">${tiers.map((tier, index) => `<label><input type="radio" name="tier" value="${index}" ${index ? "" : "checked"}><span><b>${esc(tier.label)}</b><small>${UI.rub(tier.price)} ${esc(service.unit)}</small></span></label>`).join("")}</div><p class="builder-hint">Категорию подтвердит мастер по выбранному сорту. Точный сорт обсудите при встрече или в комментарии к заказу.</p></section>
        <section><span class="builder-step">02 · сколько гостей</span><div class="gram-control"><button type="button" data-guest-step="-1" aria-label="Меньше гостей">−</button><label><span class="sr-only" for="serviceGuests">Гостей</span><input id="serviceGuests" name="guests" type="number" min="1" max="20" step="1" inputmode="numeric" value="1"><span>гостей</span></label><button type="button" data-guest-step="1" aria-label="Больше гостей">+</button></div></section>
        <footer><div class="builder-total"><small>Стоимость</small><b id="serviceTotal"></b></div><button class="btn primary" type="submit">Добавить в корзину</button></footer>
      </form>
    </div>`;
    box.classList.add("open");
    box.querySelector("[data-close]").onclick = close;
    box.onclick = (event) => { if (event.target === box) close(); };
    lockScroll(true);
    const form = box.querySelector("#serviceForm");
    const guests = form.elements.guests;
    const totalNode = box.querySelector("#serviceTotal");
    const current = () => tiers[Number(form.elements.tier.value) || 0] || tiers[0];
    const calculate = () => {
      guests.value = Math.min(20, Math.max(1, Math.round(Number(guests.value) || 1)));
      totalNode.textContent = UI.rub((current()?.price || 0) * Number(guests.value));
    };
    form.addEventListener("change", calculate);
    guests.addEventListener("input", calculate);
    form.querySelectorAll("[data-guest-step]").forEach((button) => {
      button.onclick = () => { guests.value = Math.min(20, Math.max(1, (Number(guests.value) || 1) + Number(button.dataset.guestStep))); calculate(); };
    });
    calculate();
    form.onsubmit = (event) => {
      event.preventDefault();
      const tier = current();
      addService(service.id, { tierLabel: tier?.label, price: tier?.price, guests: Number(guests.value) });
      close();
      App.openCart();
    };
  }

  function openCheckout() {
    const cart = Store.get().cart.slice();
    if (!cart.length) return;
    const user = Auth.current();
    const profile = user?.profile || {};
    const branch = Branches.current() || { city:"Сочи" };
    const initial = nextSlot(45);
    const lastDate = new Date(Date.now() + 30 * 86400000);
    const box = modal();
    box.innerHTML = `<div class="modal-card checkout-sheet">
      <button class="modal-x" data-close aria-label="Закрыть"><i class="bi bi-x-lg"></i></button>
      <div class="checkout-heading"><div><span class="section-tag">Заказ · ${esc(branch.city)}</span><h2>Когда всё<br>подготовить?</h2><p>Сначала выберите способ получения. Мы проверим время и сразу передадим заказ команде.</p></div><img src="img/brand/logo-mark-color.png" alt="Чайный дед"></div>
      <div class="checkout-summary">${cart.map((item) => `<div><span>${esc(item.name || "Чай")}${item.sub ? `<small>${esc(item.sub)}</small>` : ""}</span><b>${UI.rub(item.price)}</b></div>`).join("")}<strong><span>Итого</span><b>${UI.rub(Store.cartTotal())}</b></strong></div>
      <form id="preorderForm" novalidate>
        <div class="fulfillment-pick"><label><input type="radio" name="fulfillment" value="pickup" checked><span><b>Заберу в чайной</b><small>минимум через 30 минут</small></span></label><label><input type="radio" name="fulfillment" value="delivery"><span><b>Нужна доставка</b><small>минимум через 90 минут · стоимость подтвердит мастер</small></span></label></div>
        <p class="delivery-note">Доставку по городу оформляем по телефону: мастер уточнит адрес, время и стоимость. <a href="tel:${esc(CONTACT_PHONE_HREF)}">${esc(CONTACT_PHONE)}</a></p>
        <div class="payment-pick"><span class="builder-step">Как удобно оплатить</span>${PAYMENT_METHODS.map((method, index) => `<label><input type="radio" name="payment" value="${method.id}" ${index ? "" : "checked"} ${method.available ? "" : "disabled"}><span><b>${esc(method.name)}</b><small>${esc(method.available ? method.note : method.unavailableNote)}</small></span></label>`).join("")}</div>
        <div class="checkout-fields"><label>Ваше имя<input name="userName" required minlength="2" value="${esc(user?.name || "")}" autocomplete="name" placeholder="Как к вам обратиться"></label><label>Телефон и карта лояльности<input name="phone" required inputmode="tel" autocomplete="tel" value="${esc(user?.phone || profile.phone || "")}" placeholder="+7 900 000-00-00"></label><label>Дата получения<input name="date" type="date" min="${localDate(new Date())}" max="${localDate(lastDate)}" value="${localDate(initial)}" required></label><label>Время получения<input name="time" type="time" step="900" value="${localTime(initial)}" required></label><label class="delivery-address hidden">Адрес доставки<input name="address" autocomplete="street-address" placeholder="Улица, дом, квартира"></label><label>Как сообщить о готовности<select name="notification"><option value="${user ? "in_app" : "call"}">${user ? "В приложении" : "Позвонить"}</option>${user ? '<option value="call">Позвонить</option>' : '<option value="in_app">После регистрации в приложении</option>'}<option value="telegram">Telegram после подключения</option></select></label></div>
        <label class="checkout-note">Комментарий<textarea name="note" rows="3" maxlength="500" placeholder="Пожелание к заказу, подаче или доставке"></textarea></label>
        <div class="checkout-error hidden" id="checkoutError" role="alert"></div>
        <label class="consent-line"><input type="checkbox" name="consent" required><span>Подтверждаю номер и согласен получить сообщение о статусе заказа.</span></label>
        <button class="btn primary full" type="submit">Передать заказ в чайную</button><p>Оплату и стоимость доставки подтвердит сотрудник. Статус заказа сохраняется в кабинете, если вы вошли.</p>
      </form>
    </div>`;
    box.classList.add("open");
    box.querySelector("[data-close]").onclick = close;
    box.onclick = (event) => { if (event.target === box) close(); };
    lockScroll(true);
    const form = box.querySelector("#preorderForm");
    const address = box.querySelector(".delivery-address");
    const errorBox = box.querySelector("#checkoutError");
    const showError = (message) => { errorBox.textContent = message; errorBox.classList.remove("hidden"); };
    const syncFulfillment = () => {
      const delivery = form.elements.fulfillment.value === "delivery";
      address.classList.toggle("hidden", !delivery);
      form.elements.address.required = delivery;
      const earliest = nextSlot(delivery ? 90 : 30);
      const chosen = new Date(`${form.elements.date.value}T${form.elements.time.value || "00:00"}:00`);
      if (!Number.isFinite(chosen.getTime()) || chosen < earliest) {
        form.elements.date.value = localDate(earliest);
        form.elements.time.value = localTime(earliest);
      }
      errorBox.classList.add("hidden");
    };
    form.querySelectorAll('[name="fulfillment"]').forEach((radio) => radio.addEventListener("change", syncFulfillment));
    form.onsubmit = async (event) => {
      event.preventDefault();
      errorBox.classList.add("hidden");
      const submit = form.querySelector('[type="submit"]');
      const data = Object.fromEntries(new FormData(form).entries());
      const scheduledAt = new Date(`${data.date}T${data.time}:00`).getTime();
      const leadMinutes = data.fulfillment === "delivery" ? 90 : 30;
      if (!form.reportValidity()) return;
      if (!/^\+?[0-9 ()-]{10,20}$/.test(data.phone)) return showError("Проверьте номер телефона — по нему команда подтвердит заказ.");
      if (!Number.isFinite(scheduledAt) || scheduledAt < Date.now() + (leadMinutes - 1) * 60_000) return showError(`Выберите время минимум через ${leadMinutes} минут.`);
      if (scheduledAt > Date.now() + 31 * 86400000) return showError("Предзаказ можно оформить не более чем на 30 дней вперёд.");
      if (data.fulfillment === "delivery" && String(data.address || "").trim().length < 8) return showError("Укажите полный адрес доставки.");
      submit.disabled = true;
      try {
        const paymentMethod = PAYMENT_METHODS.find((method) => method.id === data.payment && method.available) || PAYMENT_METHODS[0];
        const order = Orders.create({userId:user?.id || null, userName:data.userName, items:cart, channel:"self", fulfillment:data.fulfillment, phone:data.phone, address:data.address || "", scheduledAt, notification:data.notification, payment:paymentMethod.id, note:data.note || ""});
        const synced = !ApiClient.isReady() ? false : await ApiClient.whenSynced("orders", order.id);
        Store.clearCart();
        Notifications.add({type:"order", title:"Заказ принят", body:`${branch.city} · ${new Date(scheduledAt).toLocaleString("ru-RU", {day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"})}`, entityId:order.id});
        document.getElementById("cart")?.classList.remove("open");
        document.getElementById("cartOverlay")?.classList.remove("open");
        const mode = data.fulfillment === "delivery" ? "Доставка" : "Самовывоз";
        const wisdom = Wisdom.ofTheDay("order");
        box.innerHTML = `<div class="modal-card preorder-success"><img src="img/brand/logo-color.png" alt="Чайный дед"><span class="section-tag">${synced ? "Заказ передан команде" : "Заказ сохранён на устройстве"}</span><h2>Будем ждать<br>вашу главу.</h2><dl><div><dt>Номер</dt><dd>${esc(order.id.slice(-8).toUpperCase())}</dd></div><div><dt>Получение</dt><dd>${mode} · ${new Date(scheduledAt).toLocaleString("ru-RU", {day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"})}</dd></div><div><dt>Оплата</dt><dd>${esc(paymentMethod.name)}</dd></div><div><dt>Связь</dt><dd>${esc(data.phone)}</dd></div></dl><p>${user ? "Статус уже появился в кабинете гостя." : "Создайте кабинет с этим номером — заказ будет связан с вашей картой лояльности."}</p>${data.fulfillment === "delivery" ? `<p class="delivery-note">По доставке мастер позвонит на ${esc(data.phone)} и подтвердит адрес и стоимость.</p>` : ""}${wisdom ? `<blockquote class="success-wisdom">${esc(wisdom.text)}<cite>Чайный дед</cite></blockquote>` : ""}<div><button class="btn primary" data-success-go="${user ? "#/client" : "#/auth"}">${user ? "Смотреть статус" : "Создать кабинет"}</button><button class="btn ghost" data-close-success>Закрыть</button></div></div>`;
        box.querySelector("[data-success-go]").onclick = () => { const target = box.querySelector("[data-success-go]").dataset.successGo; close(); UI.navigate(target); };
        box.querySelector("[data-close-success]").onclick = close;
        App.renderCart?.();
      } catch (error) {
        showError(error.message || "Не удалось передать заказ. Попробуйте ещё раз.");
        submit.disabled = false;
      }
    };
  }

  window.Commerce = { openTea, addProduct, addService, openServicePicker, openCheckout, quote, lockScroll };
})();
