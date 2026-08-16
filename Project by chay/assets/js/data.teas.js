// ===== Каталог чая «Чайная история» =====
// Реальный ассортимент чайной (ГАБА · пуэры · улуны · красный/белый/зелёный/жёлтый · мате)
// cat — категория витрины (см. TEA_CATEGORIES)
// tier: 'popular' | 'premium'
// mood: energy | calm | focus | comfort | discovery
// strength: 1 (нежный) ... 3 (насыщенный)
// time: morning | day | evening | any
// caffeine: высокий | средний | низкий | без кофеина
// price — базовая цена (за младшую граммовку), в рублях
// weights — реальные фасовки и цены
// pairs — рекомендуемые грибные эффекты для этого чая

// Категории витрины (порядок = порядок на странице «Меню»)
window.TEA_CATEGORIES = [
  { key: "gaba",         label: "ГАБА-чаи",        icon: "bi-stars",        sub: "Наш флагман: мягкое расслабление, антистресс и ясный ум" },
  { key: "shu",          label: "Шу Пуэр",         icon: "bi-circle-half",  sub: "Тёмный, землистый, выдержанный — чай-заземление" },
  { key: "sheng",        label: "Шэн Пуэр",        icon: "bi-fire",         sub: "Живой сырой пуэр с мощной ча-ци" },
  { key: "oolong_light", label: "Светлые улуны",   icon: "bi-flower2",      sub: "Цветочные, кремовые, многопроливные" },
  { key: "oolong_dark",  label: "Тёмные улуны",    icon: "bi-tornado",      sub: "Утёсные и обжаренные — глубина и минералы" },
  { key: "red",          label: "Красный чай",     icon: "bi-cup-hot-fill", sub: "Медовые, согревающие, с какао и сухофруктами" },
  { key: "white",        label: "Белый чай",       icon: "bi-snow",         sub: "Деликатные, сладковатые, тонкие" },
  { key: "green",        label: "Зелёный чай",     icon: "bi-tree",         sub: "Свежие и яркие, для фокуса и тонуса" },
  { key: "yellow",       label: "Жёлтый чай",      icon: "bi-brightness-high", sub: "Редкая категория — нежность и благородство" },
  { key: "mate",         label: "Мате",            icon: "bi-cup-straw",    sub: "Бодрящий южноамериканский ритуал" },
];

window.TEAS = [
  /* ——————————————— ГАБА (флагман) ——————————————— */
  {
    id: "gaba_golden", cat: "gaba", name: "ГАБА Голден «Золотая»", origin: "Тайвань", tier: "popular",
    type: "ГАБА-улун", mood: ["calm", "focus"], strength: 2, time: "evening",
    caffeine: "низкий", price: 360,
    weights: [{ g: "10 г", price: 360 }, { g: "50 г", price: 1800 }, { g: "100 г", price: 3600 }],
    notes: ["карамель", "печёный персик", "сухофрукты"], pairs: ["calm", "focus"],
    story: "Золотистый ГАБА с высоким содержанием ГАМК. Мягко снимает напряжение и сохраняет ясность — идеальный вечерний улун.",
    brew: { temp: "90°C", time: "по проливам, 30 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "gaba_alishan", cat: "gaba", name: "Габа Алишань Экстра", origin: "Тайвань, Алишань", tier: "premium",
    type: "ГАБА-улун", mood: ["calm", "discovery"], strength: 2, time: "day",
    caffeine: "низкий", price: 450,
    weights: [{ g: "10 г", price: 450 }, { g: "50 г", price: 2250 }, { g: "100 г", price: 4500 }],
    notes: ["спелые фрукты", "сливки", "цветы"], pairs: ["calm", "balance"],
    story: "Высокогорный ГАБА с легендарной горы Алишань. Плотный, сочный, с долгим фруктово-сливочным послевкусием.",
    brew: { temp: "90–95°C", time: "по проливам, 30–40 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "gaba_888", cat: "gaba", name: "Габа 888, Формоза", origin: "Тайвань", tier: "premium",
    type: "ГАБА-улун", mood: ["calm", "comfort"], strength: 2, time: "evening",
    caffeine: "низкий", price: 550,
    weights: [{ g: "10 г", price: 550 }, { g: "50 г", price: 2750 }, { g: "100 г", price: 5500 }],
    notes: ["мёд", "ром", "вишня", "тёмные фрукты"], pairs: ["calm", "balance"],
    story: "Насыщенный формозский ГАБА премиум-класса. Винные ноты, мёд и тёплая глубина — улун для особых вечеров.",
    brew: { temp: "90°C", time: "по проливам, 30 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "gaba_ruby", cat: "gaba", name: "Габа «Рубиновая» Камфора, Руби 18", origin: "Тайвань", tier: "premium",
    type: "ГАБА (красный)", mood: ["comfort", "calm"], strength: 3, time: "evening",
    caffeine: "низкий", price: 570,
    weights: [{ g: "10 г", price: 570 }, { g: "50 г", price: 2850 }, { g: "100 г", price: 5700 }],
    notes: ["камфора", "мята", "корица", "тёмный мёд"], pairs: ["calm", "immunity"],
    story: "ГАБА из знаменитого сорта Руби 18 с фирменными нотами камфоры и мяты. Глубокий, согревающий, обволакивающий.",
    brew: { temp: "95°C", time: "по проливам, 20–30 сек", amount: "6 г на 150 мл" },
  },
  {
    id: "gaba_blackpearl", cat: "gaba", name: "Габа Чёрный Жемчуг", origin: "Тайвань", tier: "popular",
    type: "ГАБА-улун (скрученный)", mood: ["calm", "comfort"], strength: 2, time: "evening",
    caffeine: "низкий", price: 380,
    weights: [{ g: "10 г", price: 380 }, { g: "50 г", price: 1900 }, { g: "100 г", price: 3800 }],
    notes: ["изюм", "карамель", "тёмные ягоды"], pairs: ["calm", "balance"],
    story: "Плотно скрученный ГАБА-улун «чёрные жемчужины». Раскрывается медленно, отдавая тёплую ягодно-карамельную сладость.",
    brew: { temp: "90°C", time: "по проливам, 30–40 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "gaba_shen_wake", cat: "gaba", name: "ГАБА-Шен «Пробуждение»", origin: "Юньнань", tier: "popular",
    type: "ГАБА-шен пуэр", mood: ["energy", "focus"], strength: 2, time: "morning",
    caffeine: "средний", price: 190,
    weights: [{ g: "10 г", price: 190 }, { g: "50 г", price: 950 }, { g: "100 г", price: 1900 }, { g: "Целый блин", price: 2800 }],
    notes: ["свежесть", "цитрус", "лёгкая горчинка"], pairs: ["focus", "energy"],
    story: "Редкий гибрид: шен-пуэр по технологии ГАБА. Бодрит мягко и без резкости, проясняя голову с самого утра.",
    brew: { temp: "90°C", time: "по проливам, 10–20 сек", amount: "6 г на 150 мл" },
  },

  /* ——————————————— ШУ ПУЭР ——————————————— */
  {
    id: "shu_laochatou", cat: "shu", name: "Шу Пуэр «Лао Ча Тоу», 2009", origin: "Юньнань", tier: "premium",
    type: "Шу Пуэр (чайные головы)", mood: ["comfort", "discovery"], strength: 3, time: "evening",
    caffeine: "средний", price: 400,
    weights: [{ g: "20 г", price: 400 }, { g: "50 г", price: 1000 }, { g: "100 г", price: 2000 }],
    notes: ["карамель", "чернослив", "земля", "древесина"], pairs: ["calm", "balance"],
    story: "«Старые чайные головы» — спёкшиеся комочки, что томятся в проливе бесконечно долго. Густой, сладкий, бархатный пуэр.",
    brew: { temp: "100°C", time: "по проливам, 15–25 сек", amount: "8 г на 150 мл" },
  },
  {
    id: "shu_peacock", cat: "shu", name: "Мэнхайский Павлин, Шу Пуэр, 2020", origin: "Юньнань, Мэнхай", tier: "popular",
    type: "Шу Пуэр", mood: ["comfort", "calm"], strength: 3, time: "evening",
    caffeine: "средний", price: 170,
    weights: [{ g: "10 г", price: 170 }, { g: "50 г", price: 850 }, { g: "Целый блин (200 г)", price: 2200 }],
    notes: ["какао", "орех", "влажная древесина"], pairs: ["calm", "balance"],
    story: "Знаменитый мэнхайский вкус: чистый, плотный и сливочный шу без лишней земли. Эталон жанра для каждого дня.",
    brew: { temp: "100°C", time: "по проливам, 10–20 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "shu_legend", cat: "shu", name: "Шу Пуэр Гу Шу «Легенда»", origin: "Юньнань (древние деревья)", tier: "premium",
    type: "Шу Пуэр (гу шу)", mood: ["comfort", "discovery"], strength: 3, time: "evening",
    caffeine: "средний", price: 360,
    weights: [{ g: "10 г", price: 360 }, { g: "50 г", price: 1800 }, { g: "Блинчик (200 г)", price: 4800 }],
    notes: ["шоколад", "сухофрукты", "глубина", "сладость"], pairs: ["calm", "balance"],
    story: "Шу с древних деревьев гу шу. Плотное тело, благородная сладость и долгое тёплое послевкусие — пуэр-медитация.",
    brew: { temp: "100°C", time: "по проливам, 10–20 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "shu_mushroom", cat: "shu", name: "Шу Пуэр «Грибной», Лао Юцзи, 2023", origin: "Юньнань", tier: "popular",
    type: "Шу Пуэр", mood: ["comfort", "discovery"], strength: 3, time: "evening",
    caffeine: "средний", price: 210,
    weights: [{ g: "10 г", price: 210 }, { g: "50 г", price: 1050 }, { g: "100 г", price: 2100 }, { g: "Целый блин (357 г)", price: 5100 }],
    notes: ["лесные грибы", "земля", "орех", "камфора"], pairs: ["immunity", "balance"],
    story: "Знаменитый «грибной» аромат влажного склада — глубокий лесной характер. Тёплый, обволакивающий, очень узнаваемый.",
    brew: { temp: "100°C", time: "по проливам, 10–20 сек", amount: "7 г на 150 мл" },
  },

  /* ——————————————— ШЭН ПУЭР ——————————————— */
  {
    id: "sheng_dingxing", cat: "sheng", name: "Дин Син, Шэн Пуэр, ~1994", origin: "Юньнань", tier: "premium",
    type: "Выдержанный шэн пуэр", mood: ["discovery", "comfort"], strength: 3, time: "day",
    caffeine: "средний", price: 570,
    weights: [{ g: "10 г", price: 570 }, { g: "50 г", price: 2850 }, { g: "100 г", price: 5700 }, { g: "Целый гриб (250 г)", price: 11500 }],
    notes: ["камфора", "старое дерево", "сухофрукты", "аптека"], pairs: ["calm", "balance"],
    story: "Старый шэн почти тридцатилетней выдержки. Превратился в тёплый, благородный напиток с камфорно-древесной глубиной.",
    brew: { temp: "95–100°C", time: "по проливам, 10–15 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "sheng_kunlu", cat: "sheng", name: "Куньлушань Цяо Му, осень 2020", origin: "Юньнань, Куньлушань", tier: "premium",
    type: "Шэн Пуэр (цяо му)", mood: ["energy", "discovery"], strength: 3, time: "morning",
    caffeine: "высокий", price: 505,
    weights: [{ g: "10 г", price: 505 }, { g: "50 г", price: 2525 }, { g: "Блин (200 г)", price: 5800 }],
    notes: ["мёд", "горный мёд", "цветы", "лёгкая горчинка"], pairs: ["energy", "focus"],
    story: "Шэн с высокогорных деревьев цяо му. Яркая ча-ци, медовая сладость и чистое горное послевкусие.",
    brew: { temp: "90–95°C", time: "по проливам, 10–15 сек", amount: "6 г на 150 мл" },
  },
  {
    id: "sheng_heather", cat: "sheng", name: "Шэн Пуэр «Вересковый мёд»", origin: "Юньнань", tier: "popular",
    type: "Шэн Пуэр", mood: ["discovery", "energy"], strength: 2, time: "day",
    caffeine: "высокий", price: 240,
    weights: [{ g: "10 г", price: 240 }, { g: "50 г", price: 1200 }, { g: "Целый блин (200 г)", price: 3200 }],
    notes: ["цветочный мёд", "травы", "свежесть"], pairs: ["focus", "energy"],
    story: "Светлый ароматный шэн с медово-цветочным характером. Лёгкая бодрость и солнечное настроение в чашке.",
    brew: { temp: "90°C", time: "по проливам, 10–15 сек", amount: "6 г на 150 мл" },
  },

  /* ——————————————— СВЕТЛЫЕ УЛУНЫ ——————————————— */
  {
    id: "tgy_milan", cat: "oolong_light", name: "Те Гуань Инь Ми Лан Сян, Премиум", origin: "Китай, Аньси", tier: "popular",
    type: "Светлый улун", mood: ["calm", "discovery"], strength: 2, time: "day",
    caffeine: "средний", price: 255,
    weights: [{ g: "10 г", price: 255 }, { g: "50 г", price: 1275 }, { g: "100 г", price: 2550 }],
    notes: ["медовая орхидея", "цветы", "сливки"], pairs: ["focus", "balance"],
    story: "«Аромат медовой орхидеи» — бирюзовая Гуань Инь с роскошным цветочным букетом, что раскрывается от пролива к проливу.",
    brew: { temp: "90–95°C", time: "по проливам, 20–40 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "dongfang_xingzhu", cat: "oolong_light", name: "Дун Фан Мэй Жень Син Чжу", origin: "Тайвань", tier: "premium",
    type: "Светлый улун (Восточная красавица)", mood: ["comfort", "discovery"], strength: 2, time: "day",
    caffeine: "средний", price: 410,
    weights: [{ g: "10 г", price: 410 }, { g: "50 г", price: 2050 }, { g: "100 г", price: 4100 }],
    notes: ["мёд", "спелый персик", "мускат"], pairs: ["balance", "focus"],
    story: "«Восточная красавица» с укусом цикадки, что дарит листу мускатно-медовый аромат. Нежный, сладкий, праздничный улун.",
    brew: { temp: "85–90°C", time: "по проливам, 30 сек", amount: "6 г на 150 мл" },
  },
  {
    id: "dongding_songpo", cat: "oolong_light", name: "Дун Дин Сон По", origin: "Тайвань", tier: "popular",
    type: "Светлый улун (лёгкая обжарка)", mood: ["comfort", "calm"], strength: 2, time: "day",
    caffeine: "средний", price: 220,
    weights: [{ g: "10 г", price: 220 }, { g: "50 г", price: 1100 }, { g: "100 г", price: 2200 }],
    notes: ["обжарка", "сливочное масло", "цветы"], pairs: ["balance", "focus"],
    story: "Классический тайваньский Дун Дин с «морозного пика». Кремовая текстура, мягкая обжарка и долгое сладкое послевкусие.",
    brew: { temp: "95°C", time: "по проливам, 30–40 сек", amount: "7 г на 150 мл" },
  },

  /* ——————————————— ТЁМНЫЕ УЛУНЫ ——————————————— */
  {
    id: "dahongpao_monastery", cat: "oolong_dark", name: "Да Хун Пао (сделан в Монастыре)", origin: "Китай, горы Уи", tier: "premium",
    type: "Тёмный утёсный улун", mood: ["discovery", "focus"], strength: 3, time: "day",
    caffeine: "высокий", price: 360,
    weights: [{ g: "10 г", price: 360 }, { g: "50 г", price: 1800 }, { g: "100 г", price: 3600 }],
    notes: ["минералы", "карамель", "обжарка", "скала"], pairs: ["focus", "energy"],
    story: "«Большой красный халат» — легендарный утёсный улун. Глубокий минеральный вкус с долгим обжаренным послевкусием.",
    brew: { temp: "95–100°C", time: "по проливам, 15–30 сек", amount: "8 г на 150 мл" },
  },
  {
    id: "foshou", cat: "oolong_dark", name: "Фо Шоу «Ладонь Будды»", origin: "Китай, Фуцзянь", tier: "popular",
    type: "Тёмный улун", mood: ["comfort", "discovery"], strength: 2, time: "day",
    caffeine: "средний", price: 270,
    weights: [{ g: "10 г", price: 270 }, { g: "50 г", price: 1350 }, { g: "100 г", price: 2700 }],
    notes: ["цитрус", "выпечка", "тёплое дерево"], pairs: ["balance", "calm"],
    story: "Улун из крупного листа сорта «рука Будды». Мягкий, с цитрусово-сдобным ароматом и обволакивающим теплом.",
    brew: { temp: "95°C", time: "по проливам, 20–30 сек", amount: "7 г на 150 мл" },
  },
  {
    id: "uy_rougui", cat: "oolong_dark", name: "УИ Жоу Гуй", origin: "Китай, Фуцзянь, Уишань", tier: "premium",
    type: "Тёмный утёсный улун", mood: ["discovery", "focus"], strength: 3, time: "day",
    caffeine: "высокий", price: 300,
    weights: [{ g: "10 г", price: 300 }, { g: "50 г", price: 1500 }, { g: "100 г", price: 3000 }],
    notes: ["корица", "обжарка", "минералы", "сладость"], pairs: ["focus", "energy"],
    story: "«Корица» с гор Уи — яркий утёсный улун с пряным коричным акцентом и плотным обжаренным телом.",
    brew: { temp: "95–100°C", time: "по проливам, 15–30 сек", amount: "8 г на 150 мл" },
  },

  /* ——————————————— КРАСНЫЙ ЧАЙ ——————————————— */
  {
    id: "jinjunmei", cat: "red", name: "Цзинь Цзюнь Мэй (слабая обжарка)", origin: "Китай, Фуцзянь", tier: "premium",
    type: "Красный чай", mood: ["comfort", "energy"], strength: 2, time: "morning",
    caffeine: "высокий", price: 305,
    weights: [{ g: "10 г", price: 305 }, { g: "50 г", price: 1525 }, { g: "100 г", price: 3050 }],
    notes: ["мёд", "какао", "цветы", "батат"], pairs: ["energy", "balance"],
    story: "«Золотые брови» из почек — элитный красный чай. Мягкий, медово-какаовый, с бархатистой сладостью без терпкости.",
    brew: { temp: "85–90°C", time: "по проливам, 10–20 сек", amount: "5 г на 150 мл" },
  },
  {
    id: "dianhong_jinzhen", cat: "red", name: "ДяньХун Цзинь Чжэнь Ван, весна", origin: "Китай, Юньнань", tier: "popular",
    type: "Красный чай (золотые иглы)", mood: ["energy", "comfort"], strength: 3, time: "morning",
    caffeine: "высокий", price: 300,
    weights: [{ g: "10 г", price: 300 }, { g: "50 г", price: 1500 }, { g: "100 г", price: 3000 }],
    notes: ["мёд", "солод", "сухофрукты"], pairs: ["energy"],
    story: "Юньнаньский красный из золотистых почек. Густой, медовый, согревающий — идеальный бодрый старт дня.",
    brew: { temp: "90°C", time: "3–4 мин или проливами", amount: "5 г на 200 мл" },
  },
  {
    id: "tanyang", cat: "red", name: "Тан Ян, красный из деревни Тан Ян", origin: "Китай, Фуцзянь", tier: "popular",
    type: "Красный чай", mood: ["comfort", "calm"], strength: 2, time: "evening",
    caffeine: "средний", price: 234,
    weights: [{ g: "10 г", price: 234 }, { g: "50 г", price: 1174 }, { g: "100 г", price: 2350 }],
    notes: ["мёд", "роза", "сладкий батат"], pairs: ["calm", "immunity"],
    story: "Деревенский красный из исторического района Тан Ян. Мягкий, цветочно-медовый, уютный — для спокойного вечера.",
    brew: { temp: "90°C", time: "по проливам, 15–25 сек", amount: "5 г на 150 мл" },
  },

  /* ——————————————— БЕЛЫЙ ЧАЙ ——————————————— */
  {
    id: "yinzhen", cat: "white", name: "Бай Хао Инь Чжень «Серебряные иглы»", origin: "Китай, Фуцзянь", tier: "premium",
    type: "Белый чай", mood: ["calm", "focus"], strength: 1, time: "day",
    caffeine: "низкий", price: 230,
    weights: [{ g: "10 г", price: 230 }, { g: "50 г", price: 1150 }, { g: "100 г", price: 2300 }],
    notes: ["сено", "дыня", "мёд", "тонкость"], pairs: ["calm", "balance"],
    story: "Только почки в серебряном пушке — самый деликатный из белых чаёв. Нежнейший, сладковатый, почти невесомый.",
    brew: { temp: "80–85°C", time: "3–4 мин", amount: "5 г на 200 мл" },
  },
  {
    id: "yueguangbai", cat: "white", name: "Юэ Гуан Бай «Лунный свет», Премиум", origin: "Китай, Юньнань", tier: "popular",
    type: "Белый чай", mood: ["calm", "comfort"], strength: 2, time: "evening",
    caffeine: "низкий", price: 265,
    weights: [{ g: "10 г", price: 265 }, { g: "50 г", price: 1325 }, { g: "100 г", price: 2650 }],
    notes: ["мёд", "сухофрукты", "ваниль"], pairs: ["calm", "immunity"],
    story: "«Лунный свет» — юньнаньский белый с тёмным и светлым листом. Медово-фруктовый, мягкий, чуть пряный.",
    brew: { temp: "85–90°C", time: "по проливам, 20–30 сек", amount: "5 г на 150 мл" },
  },

  /* ——————————————— ЗЕЛЁНЫЙ ЧАЙ ——————————————— */
  {
    id: "maofeng", cat: "green", name: "Зелёный Мао Фэн, Премиум", origin: "Китай", tier: "popular",
    type: "Зелёный чай", mood: ["focus", "energy"], strength: 2, time: "morning",
    caffeine: "средний", price: 165,
    weights: [{ g: "10 г", price: 165 }, { g: "50 г", price: 825 }, { g: "100 г", price: 1650 }],
    notes: ["свежая зелень", "орех", "сладость"], pairs: ["focus", "energy"],
    story: "«Ворсистые пики» — классический зелёный с нежным ворсом на почках. Свежий, сладковатый, бодрит без резкости.",
    brew: { temp: "75–80°C", time: "1.5–2 мин", amount: "4 г на 200 мл" },
  },
  {
    id: "taiping", cat: "green", name: "Тайпин Хоукуй, Премиум, весна", origin: "Китай, Аньхой", tier: "premium",
    type: "Зелёный чай", mood: ["focus", "discovery"], strength: 2, time: "day",
    caffeine: "средний", price: 370,
    weights: [{ g: "10 г", price: 370 }, { g: "50 г", price: 1850 }, { g: "100 г", price: 3700 }],
    notes: ["орхидея", "свежая зелень", "сахарный тростник"], pairs: ["focus", "balance"],
    story: "«Обезьяний главарь из Тайпина» — крупные плоские листья длиной в ладонь. Орхидейный аромат и чистейшая сладость.",
    brew: { temp: "80°C", time: "2 мин", amount: "4 г на 200 мл" },
  },

  /* ——————————————— ЖЁЛТЫЙ ЧАЙ ——————————————— */
  {
    id: "junshan", cat: "yellow", name: "Цзюнь Шань Инь Чжень, жёлтый, весна", origin: "Китай, Хунань", tier: "premium",
    type: "Жёлтый чай", mood: ["focus", "calm"], strength: 1, time: "day",
    caffeine: "средний", price: 510,
    weights: [{ g: "10 г", price: 510 }, { g: "50 г", price: 2550 }, { g: "100 г", price: 5100 }],
    notes: ["кукуруза", "печёное яблоко", "мёд"], pairs: ["focus", "balance"],
    story: "Легендарный жёлтый чай с острова Цзюнь Шань. Томление под тканью убирает горечь — остаётся мягкая благородная сладость.",
    brew: { temp: "80°C", time: "2–3 мин", amount: "4 г на 200 мл" },
  },

  /* ——————————————— МАТЕ ——————————————— */
  {
    id: "mate_canarias", cat: "mate", name: "Матэ Canarias Traditional", origin: "Уругвай", tier: "popular",
    type: "Мате", mood: ["energy", "focus"], strength: 3, time: "morning",
    caffeine: "средний", price: 1800,
    weights: [{ g: "Пачка 500 г", price: 1800 }],
    notes: ["трава", "табак", "земля"], pairs: ["energy", "focus"],
    story: "Уругвайский мате крупного помола с пылью — крепкий, насыщенный, традиционный. Бодрит мягко и долго, без кофеинового отката.",
    brew: { temp: "70–80°C", time: "доливать многократно", amount: "калабас на 2/3" },
  },
  {
    id: "mate_guarana", cat: "mate", name: "CBSe Guarana (мате с гуараной)", origin: "Аргентина", tier: "popular",
    type: "Мате с травами", mood: ["energy", "discovery"], strength: 2, time: "day",
    caffeine: "средний", price: 1400,
    weights: [{ g: "Упаковка 500 г", price: 1400 }],
    notes: ["гуарана", "травы", "лёгкая сладость"], pairs: ["energy", "focus"],
    story: "Аргентинский мате с гуараной — заряд бодрости и фокуса. Мягче уругвайского, с приятным травяным характером.",
    brew: { temp: "70–80°C", time: "доливать многократно", amount: "калабас на 2/3" },
  },
];
