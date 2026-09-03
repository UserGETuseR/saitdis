// Редакция директора 2026: единый клиентский путь, лёгкая публичная поверхность и объяснимый выбор.
(function () {
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
  const go = (root) => root.querySelectorAll("[data-go]").forEach((node) => {
    node.onclick = () => UI.navigate(node.dataset.go);
  });
  const phrase = (text, chapter) => `<section class="brand-flight"><span>${esc(chapter)}</span><p>${esc(text)}</p><img src="img/brand/mark-bowl-terra.svg" alt=""></section>`;
  const productButton = (id, label = "Добавить") => `<button data-product="${esc(id)}">${esc(label)} <span aria-hidden="true">↘</span></button>`;
  const searchable = (item, extra = "") => `data-menu-item data-search="${esc([item.name, item.comp, item.desc, item.origin, extra].filter(Boolean).join(" ").toLowerCase())}"`;

  const plural = (count, one, few, many) => {
    const mod100 = count % 100, mod10 = count % 10;
    if (mod100 >= 11 && mod100 <= 14) return many;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
  };

  // Гость ищет своими словами: «матча» вместо «маття», «сладкое» вместо
  // «десерт», «травяной» вместо названия конкретной травы.
  const SEARCH_SYNONYMS = {
    "матча": ["маття"],
    "маття": ["матча"],
    "matcha": ["маття"],
    "сладкое": ["десерт", "моти", "кекс", "шоколад", "кокос"],
    "десерт": ["моти", "кекс", "шоколад", "кокос"],
    "холодное": ["холодный", "лёд", "тоник"],
    "холодный": ["холодная глава", "лёд"],
    "лимонад": ["холодный", "тоник", "лимон"],
    "белый": ["белый чай"],
    "зелёный": ["зеленый", "зелёный чай"],
    "зеленый": ["зелёный", "зелёный чай"],
    "красный": ["красный чай"],
    "чёрный": ["красный чай"],
    "черный": ["красный чай"],
    "жёлтый": ["желтый", "жёлтый чай"],
    "пуэр": ["шу", "шэн"],
    "габа": ["gaba", "габа-улун"],
    "улун": ["оолонг"],
    "гриб": ["ежовик", "кордицепс", "мухомор", "грибная"],
    "грибы": ["ежовик", "кордицепс", "мухомор", "грибная"],
    "трава": ["мята", "чабрец", "мелисса", "жасмин", "имбирь", "роза"],
    "травы": ["мята", "чабрец", "мелисса", "жасмин", "имбирь", "роза"],
    "мёд": ["мед", "горный мёд"],
    "мед": ["мёд", "горный мёд"],
    "церемония": ["проливы", "варка", "лу юй"],
    "варка": ["лу юй", "церемония"],
    "подарок": ["набор", "мерч", "пиала", "гайвань", "шоппер"],
    "посуда": ["пиала", "гайвань", "набор"],
    "навынос": ["стакан", "с собой"],
    "молоко": ["растительное молоко", "латте"],
  };
  const coldProduct = (item, index) => `<article class="director-drink" ${searchable(item, "холодный напиток")}> <span>${String(index + 1).padStart(2, "0")} · холодная глава</span><h3>${esc(item.name)}</h3><p>${esc(item.comp)}</p><footer><b>${UI.rub(item.price)}</b>${productButton(item.id)}</footer></article>`;
  const matchaProduct = (item, index) => `<article class="director-matcha" ${searchable(item, "маття matcha")}> <header><span>${String(index + 1).padStart(2, "0")}</span><small>${index === 0 ? "мягкая" : index === 1 ? "свежая" : "цитрусовая"}</small></header><h3>${esc(item.name)}</h3><p>${esc(item.comp)}</p><footer><b>${UI.rub(item.price)}</b>${productButton(item.id)}</footer></article>`;
  // Карточка чая: цепочка рекомендаций «чай → десерт → добавки и травы»,
  // параметры заваривания и переход к полной карте с таймером.
  const teaCard = (tea, index) => {
    const dessert = Pairings.desserts(tea)[0];
    const herb = Pairings.herbs(tea)[0];
    const addon = Pairings.addons(tea)[0];
    const mushroom = Pairings.mushroomsFor(tea)[0];
    const guide = Brewing.guide(tea);
    const packs = Pricing.divisiblePacks(tea);
    const tier = Pricing.ceremonyTier(tea);
    const from = Pricing.teaPrice(tea, packs[0]?.grams || 10);
    return `<article class="director-tea" ${searchable(tea, `${tea.type} ${(tea.notes || []).join(" ")} ${(TEA_CATEGORIES.find((entry) => entry.key === tea.cat)?.label) || ""}`)}>
      <span>${String(index + 1).padStart(2, "0")} · ${esc(tea.origin)}</span>
      <h3>${esc(tea.name)}</h3>
      <p>${esc(tea.story)}</p>
      <div class="director-notes">${tea.notes.slice(0, 3).map((note) => `<i>${esc(note)}</i>`).join("")}</div>
      <div class="tea-brew-line"><span>${esc(guide.temperature.label)}</span><span>стакан · ${esc(guide.cup.label)}</span><span>${guide.freeform ? "доливать" : `пролив · ${esc(guide.pours[0].label)}`}</span></div>
      <ol class="tea-pairing">
        <li><span>Чай</span><b>${esc(tea.type)}</b><small>${packs.length ? `${packs.map((pack) => esc(pack.label)).join(" · ")} или любая граммовка` : "любая граммовка от 1 грамма"}</small></li>
        <li><span>Десерт</span><b>${esc(dessert?.name || "подберёт мастер")}</b><small>${esc(dessert ? Pairings.reason(tea, dessert) : "сочетание уточним при заказе")}</small></li>
        <li><span>Добавки</span><b>${esc([herb?.name, addon?.name].filter(Boolean).join(" · ") || "без добавок")}</b><small>${esc(herb?.note || addon?.note || "чай звучит самостоятельно")}</small></li>
        ${mushroom ? `<li><span>Грибная глава</span><b>${esc(mushroom.name)}</b><small>${esc(mushroom.taste)} · только по желанию</small></li>` : ""}
      </ol>
      ${adviceNote(tea)}
      <footer><b>от ${UI.rub(from)}<em>церемония · ${esc(tier.label)}</em></b><span class="tea-card-actions"><button data-brew-open="${tea.id}" class="ghost-action">Как заваривать</button><button data-tea-builder="${tea.id}">Выбрать</button></span></footer>
    </article>`;
  };

  // Совет чайного мастера о конкретном сорте, если он опубликован.
  const adviceNote = (tea) => {
    const advice = (window.Content?.advice?.(tea.id) || [])[0];
    if (!advice) return "";
    return `<blockquote class="tea-advice"><span>Совет мастера</span><p>${esc(advice.excerpt || String(advice.body || "").slice(0, 190))}</p><cite>${esc(advice.authorName)}</cite></blockquote>`;
  };
  const dessert = (item, index) => `<article class="director-dessert" ${searchable(item, (item.fillings || []).join(" "))}><span>${String(index + 1).padStart(2, "0")} · к чашке</span><div class="dessert-mark"><i>${index % 2 ? "道" : "茶"}</i><small>${esc((item.fillings || []).slice(0, 2).join(" · "))}</small></div><h3>${esc(item.name)}</h3><p>${esc(item.desc || "")}</p><small>Сочетание · ${(item.teaCats || []).slice(0, 3).map((cat) => esc(TEA_CATEGORIES.find((entry) => entry.key === cat)?.label || cat)).join(" · ")}</small><footer><b>${UI.rub(item.price)}</b>${productButton(item.id)}</footer></article>`;
  const merch = (item, index) => `<article class="director-merch" ${searchable(item, "мерч товары домой")}><span>${String(index + 1).padStart(2, "0")} · фирменная вещь</span><div class="merch-object"><i>${esc(item.mark)}</i><img src="img/brand/logo-mark-color.png" alt=""></div><h3>${esc(item.name)}</h3><p>${esc(item.desc)}</p><footer><b>${UI.rub(item.price)}</b>${productButton(item.id)}</footer></article>`;

  // Услуги чайной: церемонии, варка Лу Юй, стакан навынос.
  // Раньше они существовали в данных, но в меню не выводились совсем.
  const serviceCard = (item, index) => {
    const priceLabel = item.tiers ? `от ${UI.rub(item.tiers[0].price)}` : UI.rub(item.price);
    return `<article class="director-service" ${searchable(item, `услуга церемония варка ${item.unit}`)}>
      <span>${String(index + 1).padStart(2, "0")} · ${esc(item.unit)}</span>
      <div class="service-mark"><i class="bi ${esc(item.icon)}"></i></div>
      <h3>${esc(item.name)}</h3>
      <p>${esc(item.desc)}</p>
      ${item.tiers ? `<ul class="service-tiers">${item.tiers.map((tier) => `<li><span>${esc(tier.label)}</span><b>${UI.rub(tier.price)}</b></li>`).join("")}</ul>` : ""}
      ${item.addon ? `<small class="service-addon">${esc(item.addon)}</small>` : ""}
      <footer><b>${priceLabel}<em>${esc(item.unit)}</em></b><button data-service="${esc(item.id)}">${esc(item.cta || "Заказать")} <span aria-hidden="true">↘</span></button></footer>
    </article>`;
  };

  const mushroomCopy = {
    lionsmane: { number: "01", philosophy: "Ясность без спешки" },
    cordyceps: { number: "02", philosophy: "Ритм длинного дня" },
    amanita: { number: "03", philosophy: "Только осознанный выбор" },
  };
  const orderedMushrooms = () => ["lionsmane", "cordyceps", "amanita"].map((id) => MUSHROOMS.find((item) => item.id === id)).filter(Boolean);
  const mushroomCard = (item) => {
    const copy = mushroomCopy[item.id];
    return `<article class="director-mushroom mushroom-${item.id}" ${searchable(item, `${item.latin} ${(item.benefits || []).join(" ")}`)}><header><span>${copy.number}</span><small>${esc(item.latin)}</small></header><h3>${esc(item.name)}</h3><strong>${esc(copy.philosophy)}</strong><p>${esc(item.story)}</p><section class="mushroom-benefits"><span>Характер главы</span><div>${item.benefits.map((benefit) => `<i>${esc(benefit)}</i>`).join("")}</div></section><dl><div><dt>Сочетание с чаем</dt><dd>${esc(item.pairsWith.join(" · "))}</dd></div><div><dt>Сочетание с десертом</dt><dd>${esc((item.desserts || []).join(" · "))}</dd></div><div><dt>Важно</dt><dd>${esc(item.safety)}</dd></div></dl><button data-mushroom-menu="${item.id}">${item.id === "amanita" ? "Прочитать правила" : "Подобрать чай к настроению"} <span>↘</span></button></article>`;
  };
  const mushroomChapter = (compact = false) => `<section id="chapter-mushrooms" class="mushroom-chapter ${compact ? "is-compact" : ""}"><header><div><span class="section-tag">Грибная карта · без обещаний лечения</span><h2>Три гриба — три разных характера.</h2></div><p>Ежовик, красный мухомор и кордицепс представлены честно: с философией, вкусовым профилем, чайной и десертной парой, а также понятными ограничениями.</p></header><figure class="mushroom-stage"><img src="img/mushroom-lineup-v1.png" alt="Ежовик гребенчатый, красный мухомор и кордицепс"><figcaption><img src="img/brand/logo-color.png" alt="Чайный дед"><div><span>Чайный дед объясняет</span><b>Никаких громких обещаний.</b><p>Сначала знакомство и правила. Потом — только ваш осознанный выбор.</p></div></figcaption></figure><div class="mushroom-philosophy">${orderedMushrooms().map(mushroomCard).join("")}</div><footer><img src="img/brand/mark-bowl-terra.svg" alt=""><p>${esc(MUSHROOM_DISCLAIMER)}</p></footer></section>`;

  // Заголовки задаются прямо в разметке экранов и здесь больше не
  // перезаписываются: прежняя версия ставила textContent и стирала
  // фирменные <br> и курсивные <em> внутри заголовка.
  const applyReadableCopy = () => {};

  const mountCatalog = (root) => {
    applyReadableCopy(root);
    go(root);
    root.querySelectorAll("[data-tea-builder]").forEach((button) => { button.onclick = () => Commerce.openTea(button.dataset.teaBuilder); });
    root.querySelectorAll("[data-product]").forEach((button) => { button.onclick = () => Commerce.addProduct(button.dataset.product); });
    root.querySelectorAll("[data-service]").forEach((button) => { button.onclick = () => Commerce.addService(button.dataset.service); });
    // Переход к карте заваривания конкретного сорта.
    root.querySelectorAll("[data-brew-open]").forEach((button) => { button.onclick = () => UI.navigate(`#/brew?tea=${encodeURIComponent(button.dataset.brewOpen)}`); });
    root.querySelectorAll("[data-category]").forEach((button) => { button.onclick = () => root.querySelector(`#chapter-${button.dataset.category}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); });
    root.querySelectorAll("[data-mushroom-menu]").forEach((button) => {
      button.onclick = () => {
        if (button.dataset.mushroomMenu === "amanita") {
          root.querySelector(".mushroom-chapter>footer")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        UI.navigate("#/alchemist");
      };
    });
    // Быстрый переход к конкретной чайной полке (белый чай, пуэр и так далее).
    root.querySelectorAll("[data-shelf]").forEach((button) => {
      button.onclick = () => root.querySelector(`#shelf-${button.dataset.shelf}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const menuSearch = root.querySelector("#menuSearch");
    if (menuSearch) {
      const empty = root.querySelector("#menuSearchEmpty");
      const clear = root.querySelector("[data-menu-search-clear]");
      const counter = root.querySelector("#menuSearchCount");
      const applySearch = () => {
        const query = menuSearch.value.trim().toLowerCase();
        // Синонимы: гость ищет «матча», «пуэр», «сладкое» — находим то же,
        // что и по официальному названию раздела.
        const expanded = query ? [query, ...(SEARCH_SYNONYMS[query] || [])] : [];
        let visible = 0;
        root.querySelectorAll("[data-menu-item]").forEach((card) => {
          const haystack = card.dataset.search || "";
          const show = !query || expanded.some((term) => haystack.includes(term));
          card.classList.toggle("menu-search-hidden", !show);
          if (show) visible += 1;
        });
        // Пустые полки и разделы скрываются целиком, иначе на экране остаются
        // заголовки без карточек.
        root.querySelectorAll("[data-shelf-section], .catalog-chapter, .tea-library").forEach((section) => {
          const cards = section.querySelectorAll("[data-menu-item]");
          if (!cards.length) return;
          const shown = [...cards].some((card) => !card.classList.contains("menu-search-hidden"));
          section.classList.toggle("menu-search-hidden", Boolean(query) && !shown);
        });
        empty?.classList.toggle("hidden", visible > 0);
        clear?.classList.toggle("hidden", !query);
        if (counter) counter.textContent = query ? `${visible} ${plural(visible, "позиция", "позиции", "позиций")}` : "";
      };
      menuSearch.addEventListener("input", applySearch);
      clear?.addEventListener("click", () => { menuSearch.value = ""; applySearch(); menuSearch.focus(); });
      applySearch();
    }
  };

  Views.home = function () {
    const branch = Branches.current() || { city: "Сочи", chapter: "Морской свет" };
    const featured = TEAS.slice(0, 3);
    return { html: `<header class="director-hero tea-house-hero"><div class="director-hero-copy"><div class="tea-house-status"><span><i></i>Предзаказ доступен</span><button data-city-open-home>${esc(branch.city)} · выбрать город</button></div><span class="story-kicker"><i></i>${esc(branch.city)} · ${esc(branch.chapter)}</span><h1>Чайная история<br><em>рядом с вами.</em></h1><p>Выберите чай или напиток, настройте вкус и укажите удобное время. Мастер увидит заказ и подготовит его к вашему приходу.</p><div class="hero-actions"><button class="btn primary" data-go="#/menu">Заказать к времени</button><button class="btn ghost" data-go="#/alchemist">Помогите выбрать</button></div><ol class="order-steps"><li><b>01</b><span>Выберите</span></li><li><b>02</b><span>Настройте</span></li><li><b>03</b><span>Заберите</span></li></ol></div><figure class="director-ded-stage tea-house-stage"><span>ЧАЙНЫЙ ДЕД · РЯДОМ</span><img src="img/brand/logo-color.png" alt="Чайный дед — фирменный мудрец с пиалой"><figcaption><b>Не знаете, что взять?</b><p>Четыре ответа — и мы предложим понятную пару.</p><button data-go="#/alchemist">Подобрать чай ↘</button></figcaption></figure></header><section class="tea-house-dock"><article><span>Сейчас</span><b>Можно собрать заказ онлайн</b><p>Корзина сохранится, пока вы выбираете.</p></article><article><span>Получение</span><b>В чайной или доставкой</b><p>Дата и время — перед подтверждением.</p></article><article><span>Связь</span><b>Мастер остаётся на связи</b><a href="tel:+79628886880">+7 962 888-68-80</a></article><button data-go="#/menu">Открыть меню <i>↘</i></button></section>${phrase("Чай пей и добрей. Остальное мы подготовим ко времени.", "▸ ЧАЙНАЯ ИСТОРИЯ")}<section class="wrap choice-stage"><header><span class="section-tag">Выберите свой путь</span><h2>Начать можно<br>по-разному.</h2></header><div><article class="choice-menu"><span>01 · быстрый заказ</span><h3>Открыть меню и выбрать самим.</h3><p>Чай, маття, холодные напитки, десерты и товары для дома — в одной корзине.</p><button data-go="#/menu">Перейти в меню <b>↘</b></button></article><article class="choice-guided"><span>02 · помощь с выбором</span><h3>Ответить на четыре вопроса.</h3><p>Подберём чай по настроению, времени и вкусу и объясним каждую рекомендацию.</p><button data-go="#/alchemist">Начать подбор <b>↘</b></button></article></div></section><section class="wrap director-featured"><header><div><span class="section-tag">Знакомство с меню</span><h2>Три чайные<br>главы.</h2></div><button class="btn ghost" data-go="#/menu?chapter=tea">Всё меню</button></header><div>${featured.map(teaCard).join("")}</div></section><section class="cold-editorial home-cold"><div><span class="section-tag">Холодная линия · как в чайной</span><h2>Настой, лёд<br>и живой вкус.</h2><p>Реальная подача из меню: прозрачный стакан, настоящий цвет ингредиентов и фирменный знак Чайного деда.</p><button class="btn primary" data-go="#/menu?chapter=cold">Смотреть напитки</button></div><figure class="real-menu-photo"><img src="img/cold-menu-reference-real.png" alt="Холодный чай в фирменных стаканах Чайной истории"><figcaption><img src="img/brand/logo-color.png" alt=""><span>Фирменная подача · Сочи</span></figcaption></figure></section>${mushroomChapter(true)}`, mount(root) { mountCatalog(root); root.querySelector("[data-city-open-home]")?.addEventListener("click", () => App.openCityPicker()); } };
  };

  function menuView() {
    const categories = TEA_CATEGORIES.map((category) => ({ category, items: TEAS.filter((tea) => tea.cat === category.key) })).filter((entry) => entry.items.length);
    const branch = Branches.current() || { city: "Сочи" };
    return { html: `<header class="preorder-hero menu-real-hero"><div><span class="story-kicker"><i></i>${esc(branch.city)} · меню и предзаказ</span><h1>Что будем<br><em>заваривать?</em></h1><p>Выберите позицию, настройте граммовку и добавки. В корзине укажете способ и точное время получения.</p><div><button class="btn primary" data-cart-open>Открыть корзину</button><button class="btn ghost" data-go="#/alchemist">Нужна подсказка</button></div></div><img src="img/brand/logo-color.png" alt="Чайный дед"></header><section class="menu-toolbox"><div><span>Поиск по меню</span><label for="menuSearch"><i class="bi bi-search" aria-hidden="true"></i><input id="menuSearch" type="search" inputmode="search" placeholder="Чай, вкус, десерт или услуга" aria-describedby="menuSearchCount"><button class="hidden" type="button" data-menu-search-clear aria-label="Очистить поиск">×</button></label><small id="menuSearchCount" class="menu-search-count" role="status" aria-live="polite"></small></div><ol><li><b>1</b>Выберите</li><li><b>2</b>Настройте</li><li><b>3</b>Укажите время</li></ol></section><nav class="catalog-index" aria-label="Разделы меню"><button data-category="tea">Чай</button><button data-category="matcha" class="is-accent">Маття</button><button data-category="cold" class="is-accent">Холодные</button><button data-category="mushrooms" class="is-accent">Грибы</button><button data-category="service">Церемонии</button><button data-category="dessert">Десерты</button><button data-category="merch">Домой</button></nav><nav class="catalog-subindex" id="teaSubindex" aria-label="Виды чая">${categories.map(({ category }) => `<button data-shelf="${esc(category.key)}">${esc(category.label)}</button>`).join("")}</nav><div id="menuSearchEmpty" class="menu-search-empty hidden"><img src="img/brand/logo-mark-color.png" alt=""><h2>Такого вкуса пока нет.</h2><p>Попробуйте другое слово или попросите Чайного деда подобрать чай по настроению.</p><button class="btn primary" data-go="#/alchemist">Подобрать чай</button></div><main class="director-catalog"><section id="chapter-tea" class="tea-library"><header><span class="section-tag">01 · основа меню</span><h2>Чай и ничего лишнего.</h2><p>Выберите сорт, затем настройте граммовку и сочетания. Ничего не добавится без вашего решения.</p></header>${categories.map(({ category, items }) => `<section class="tea-shelf" id="shelf-${esc(category.key)}" data-shelf-section="${esc(category.key)}"><header><h3>${esc(category.label)}</h3><p>${esc(category.sub)}</p></header><div>${items.map(teaCard).join("")}</div></section>`).join("")}</section><section id="chapter-cold" class="catalog-chapter cold-chapter"><header><span>02 · холодная линия · реальная подача</span><h2>Холодный чай с настоящим вкусом.</h2><p>Фирменные стаканы из заведения, живой цвет настоя и прозрачный лёд — именно так напиток встречает гостя.</p></header><figure class="cold-lineup real-menu-photo"><img src="img/cold-menu-reference-real.png" alt="Холодные напитки в фирменных стаканах Чайной истории"><figcaption><img src="img/brand/logo-color.png" alt="Чайная история"><span>Подача из действующего меню · приготовим ко времени</span></figcaption></figure><div class="cold-product-grid">${COLD_DRINKS.map(coldProduct).join("")}</div></section><section id="chapter-matcha" class="catalog-chapter matcha-chapter"><header><span>03 · маття · реальное меню</span><h2>Маття в трёх понятных вкусах.</h2><p>Бамбл, латте и тоник — в тех же фирменных стаканах, которые гость увидит в чайной.</p></header><div class="matcha-real-grid"><figure class="matcha-real-photo real-menu-photo"><img src="img/matcha-menu-reference-real.png" alt="Маття-бамбл, маття-латте и маття-тоник в Чайной истории"><figcaption><img src="img/brand/logo-mark-color.png" alt=""><span>350 мл · фирменная подача</span></figcaption></figure>${MATCHA_DRINKS.map(matchaProduct).join("")}</div></section>${mushroomChapter(false)}<section id="chapter-service" class="catalog-chapter service-chapter"><header><span>05 · как подать чай</span><h2>Церемонии, варка и стакан навынос.</h2><p>Один и тот же сорт звучит иначе в проливах, в варке по технике Лу Юй и в стакане 0,5 л. Стоимость подачи считается отдельно от чая.</p></header><div>${(window.SERVICES || []).map(serviceCard).join("")}</div></section><section id="chapter-dessert" class="catalog-chapter dessert-chapter"><header><span>06 · к чашке</span><h2>Десерты к выбранному чаю.</h2><p>Каждая карточка объясняет, с каким вкусом десерт раскрывается лучше.</p></header><div>${DESSERTS.map(dessert).join("")}</div></section><section id="chapter-merch" class="catalog-chapter merch-chapter"><header><span>07 · унести историю домой</span><h2>Чайный ритуал для дома.</h2><p>Пиалы, гайвань и наборы можно забрать в чайной или заказать с доставкой.</p></header><div>${MERCH.map(merch).join("")}</div></section></main>${phrase("Вы выбираете вкус. Мастер отвечает за то, чтобы всё было готово вовремя.", "▸ ВАШ ЗАКАЗ")}`, mount(root) { mountCatalog(root); root.querySelector("[data-cart-open]").onclick = () => App.openCart(); const requested = new URLSearchParams((location.hash.split("?")[1] || "")).get("chapter"); if (requested) setTimeout(() => root.querySelector(`#chapter-${requested}`)?.scrollIntoView({ behavior: "smooth" }), 50); } };
  }
  Views.preorder = menuView;
  Views.menu = menuView;

  Views.mushrooms = function () {
    return { html: `<header class="mushroom-hero"><div><span class="story-kicker"><i></i>знакомство · не медицинская рекомендация</span><h1>Три грибные<br><em>главы.</em></h1><p>У каждой — свой характер, правила и чайное окружение. Мы объясняем спокойно и не добавляем ничего автоматически.</p><button class="btn primary" data-go="#/menu?chapter=mushrooms">Открыть в меню</button></div><img src="img/brand/logo-mark-color.png" alt="Чайный дед"></header>${mushroomChapter(false)}${phrase("Осознанный выбор важнее громкого обещания.", "▸ ФИЛОСОФИЯ ЧАЙНОЙ")}`, mount: mountCatalog };
  };

  Views.alchemist = (function () {
    const questions = [
      { key: "mood", title: "Что вам нужно от этой паузы?", sub: "Не диагноз — только честная точка начала.", options: [{ v: "calm", t: "Тишина", d: "замедлиться и выдохнуть" }, { v: "focus", t: "Ясность", d: "собраться без суеты" }, { v: "energy", t: "Ритм", d: "длинный день впереди" }, { v: "comfort", t: "Тепло", d: "мягкий домашний вкус" }, { v: "discovery", t: "Новое", d: "неожиданная чайная глава" }] },
      { key: "time", title: "Когда будет эта чашка?", sub: "Время помогает выбрать характер настоя.", options: [{ v: "morning", t: "Утро", d: "мягко проснуться" }, { v: "day", t: "День", d: "остаться в потоке" }, { v: "evening", t: "Вечер", d: "сбавить темп" }, { v: "any", t: "Не важно", d: "выбрать по вкусу" }] },
      { key: "strength", title: "Какой характер вам ближе?", sub: "От почти прозрачного до глубокого.", options: [{ v: 1, t: "Нежный", d: "цветы и лёгкость" }, { v: 2, t: "Сбалансированный", d: "середина и объём" }, { v: 3, t: "Насыщенный", d: "глубина и тепло" }] },
      { key: "taste", title: "Куда тянется вкус?", sub: "Так мы точнее предложим чай и десерт.", options: [{ v: "fresh", t: "Свежесть", d: "трава, цветы, цитрус" }, { v: "sweet", t: "Мягкая сладость", d: "мёд, фрукты, сливки" }, { v: "deep", t: "Глубина", d: "дерево, какао, обжарка" }, { v: "pure", t: "Чистый лист", d: "без добавок" }] },
    ];
    const score = (tea, answers) => { let result = tea.mood.includes(answers.mood) ? 7 : 0; if (answers.time === "any" || tea.time === answers.time) result += 3; if (Math.abs(tea.strength - Number(answers.strength)) === 0) result += 3; if (answers.taste === "fresh" && tea.notes.some((note) => /цвет|цитрус|свеж|трава/.test(note))) result += 3; if (answers.taste === "sweet" && tea.notes.some((note) => /мёд|карам|фрукт|слив/.test(note))) result += 3; if (answers.taste === "deep" && tea.notes.some((note) => /дерев|какао|обжар|земл|шокол/.test(note))) result += 3; return result; };
    return function () {
      let step = 0; let answers = {};
      return { html: `<main class="mood-quiz"><aside><span class="section-tag">Чай по настроению</span><h1>Начните<br>с себя.</h1><p>Четыре коротких ответа превратятся в понятный выбор: чай, способ заваривания и подходящий десерт.</p><img src="img/brand/logo-mark-color.png" alt="Чайный дед"></aside><section id="moodStage"></section></main>`, mount(root) {
        applyReadableCopy(root);
        const stage = root.querySelector("#moodStage");
        const render = () => { const question = questions[step]; stage.innerHTML = `<div class="quiz-progress">${questions.map((_, index) => `<i class="${index <= step ? "on" : ""}"></i>`).join("")}</div><span class="quiz-count">вопрос ${String(step + 1).padStart(2, "0")} из ${String(questions.length).padStart(2, "0")}</span><h2>${esc(question.title)}</h2><p>${esc(question.sub)}</p><div class="quiz-answers">${question.options.map((option, index) => `<button data-answer="${option.v}"><span>${String(index + 1).padStart(2, "0")}</span><b>${esc(option.t)}</b><small>${esc(option.d)}</small></button>`).join("")}</div>${step ? '<button class="quiz-back">← Назад</button>' : ""}`; stage.querySelectorAll("[data-answer]").forEach((button) => { button.onclick = () => { answers[question.key] = button.dataset.answer; step += 1; step < questions.length ? render() : result(); }; }); stage.querySelector(".quiz-back")?.addEventListener("click", () => { step -= 1; render(); }); };
        const result = () => { const ranked = TEAS.map((tea) => ({ tea, score: score(tea, answers) })).sort((a, b) => b.score - a.score).slice(0, 3); const primary = ranked[0].tea; const mushroom = Pairings.mushroom(primary, answers.mood); const sweet = Pairings.desserts(primary)[0]; const addon = answers.taste === "pure" ? null : Pairings.addons(primary)[0]; Store.logPick(primary.id, mushroom?.id || null); stage.innerHTML = `<span class="quiz-count">ваш чай сейчас</span><h2>${esc(primary.name)}</h2><p>${answers.mood === "energy" ? "Для собранного ритма" : answers.mood === "focus" ? "Для ясного внимания" : answers.mood === "calm" ? "Для спокойной паузы" : "Для выбранного вами характера"}: ${esc(primary.type.toLowerCase())}, ${esc(primary.time === "evening" ? "спокойная вечерняя подача" : "подходит к выбранному времени")} и ${esc(primary.notes.slice(0, 2).join(" · "))} во вкусе.</p><div class="recommendation-set"><article><span>01 · чай</span><b>${esc(primary.name)}</b><small>${esc(primary.brew.amount)} · ${esc(primary.brew.temp)}</small></article><article><span>02 · добавка</span><b>${esc(addon?.name || "Чистый лист")}</b><small>${esc(addon?.note || "вкус останется прозрачным")}</small></article><article><span>03 · к чашке</span><b>${esc(sweet?.name || "Без десерта")}</b><small>${esc(sweet ? Pairings.reason(primary, sweet) : "чай звучит самостоятельно")}</small></article><article><span>04 · опционально</span><b>${esc(mushroom?.name || "Без грибной главы")}</b><small>${esc(mushroom?.effect || "ничего дополнительного не требуется")}</small></article></div>${mushroom ? `<p class="builder-disclaimer">${esc(MUSHROOM_DISCLAIMER)}</p>` : ""}<div class="recommendation-actions"><button class="btn primary" data-build>Настроить чай</button><button class="btn ghost" data-again>Ответить заново</button></div><div class="alternatives"><span>Ещё два подходящих чая</span>${ranked.slice(1).map(({ tea }) => `<button data-alt="${tea.id}"><b>${esc(tea.name)}</b><small>${esc(tea.notes.slice(0, 2).join(" · "))}</small></button>`).join("")}</div>`; stage.querySelector("[data-build]").onclick = () => Commerce.openTea(primary.id); stage.querySelector("[data-again]").onclick = () => { step = 0; answers = {}; render(); }; stage.querySelectorAll("[data-alt]").forEach((button) => { button.onclick = () => Commerce.openTea(button.dataset.alt); }); };
        render();
      } };
    };
  })();

  Views.passport = function () {
    const state = Store.get(); const favoriteTeas = state.favorites.map(UI.teaById).filter(Boolean); const history = state.history.map((entry) => ({ ...entry, teaData: UI.teaById(entry.tea), mushroomData: entry.mushroom ? UI.mushroomById(entry.mushroom) : null })).filter((entry) => entry.teaData); const hasStory = favoriteTeas.length || history.length || state.stamps; const nextReward = 6 - (state.stamps % 6 || 0);
    return { html: `<header class="my-tea-hero"><div><span class="story-kicker"><i></i>ваша личная чайная полка</span><h1>Мой чай.</h1><p>Здесь остаются любимые сорта, результаты выбора и отметки лояльности. Не паспорт и не отчёт — просто понятная память о вкусе.</p><button class="btn primary" data-go="#/alchemist">Выбрать чай на сегодня</button></div><img src="img/brand/logo-mark-color.png" alt="Чайный дед"></header><main class="wrap my-tea-page"><section class="loyalty-story"><div><span class="section-tag">Карта лояльности</span><h2>${state.stamps} ${state.stamps === 1 ? "чашка" : "чашек"} в истории</h2><p>${state.stamps ? `До следующей награды — ${nextReward}.` : "Первая отметка появится после готового заказа."}</p></div><div class="stamps">${Array.from({ length: 6 }, (_, index) => `<span class="stamp ${index < state.stamps % 6 ? "on" : ""}"><i class="bi ${index === 5 ? "bi-gift" : "bi-cup-hot"}"></i></span>`).join("")}</div></section>${hasStory ? `${favoriteTeas.length ? `<section class="my-tea-section"><header><span class="section-tag">Любимые главы</span><h2>К ним хочется вернуться.</h2></header><div class="my-tea-favorites">${favoriteTeas.map(teaCard).join("")}</div></section>` : ""}${history.length ? `<section class="my-tea-section"><header><span class="section-tag">Недавний выбор</span><h2>История вкуса.</h2></header><div class="my-tea-history">${history.slice(0, 12).map((entry) => `<article><div><span>${new Date(entry.ts).toLocaleDateString("ru-RU")}</span><h3>${esc(entry.teaData.name)}</h3></div><p>${esc(entry.mushroomData ? `Грибная глава · ${entry.mushroomData.name}` : entry.teaData.notes.slice(0, 2).join(" · "))}</p><button data-tea-builder="${entry.teaData.id}">Повторить <span>↘</span></button></article>`).join("")}</div></section>` : ""}` : `<section class="my-tea-empty"><span>01 · первая запись</span><h2>Здесь пока тихо —<br>и это нормально.</h2><p>Ответьте на четыре вопроса или добавьте любимый сорт из меню. После этого раздел начнёт собирать вашу чайную историю.</p><div><button class="btn primary" data-go="#/alchemist">Выбрать по настроению</button><button class="btn ghost" data-go="#/menu">Открыть меню</button></div></section>`}</main>`, mount: mountCatalog };
  };
})();
