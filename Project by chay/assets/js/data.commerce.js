// Торговая глава 2026: добавки, травы, десерты, мерч и объяснимые сочетания.
(function () {
  // Добавки к чаю. pairs — категории чая, к которым добавка идёт осмысленно.
  // Раньше половина категорий (sheng, yellow, светлые и тёмные улуны) не была
  // покрыта ни одной добавкой, и гость получал случайный список.
  window.TEA_ADDONS = [
    { id:"honey", name:"Горный мёд", price:70, kind:"addon", pairs:["red","shu","mate","sheng","oolong_dark"], note:"смягчает пряные и плотные главы" },
    { id:"lemon", name:"Свежий лимон", price:50, kind:"addon", pairs:["red","green","mate","sheng"], note:"добавляет чистую цитрусовую линию" },
    { id:"alt_milk", name:"Растительное молоко", price:90, kind:"addon", pairs:["red","shu","mate","oolong_dark"], note:"для мягкой, округлой подачи" },
    // Травы — отдельный вид добавки: их гость выбирает как часть настоя,
    // а не как дополнение к готовой чашке.
    { id:"mint", name:"Садовая мята", price:50, kind:"herb", pairs:["green","white","gaba","yellow"], note:"делает послевкусие прохладнее" },
    { id:"thyme", name:"Горный чабрец", price:60, kind:"herb", pairs:["red","shu","oolong_dark","sheng"], note:"тёплая пряная линия к плотному листу" },
    { id:"melissa", name:"Мелисса", price:50, kind:"herb", pairs:["gaba","white","green","yellow"], note:"спокойная цитрусовая мягкость для вечера" },
    { id:"jasmine", name:"Жасмин", price:60, kind:"herb", pairs:["green","white","oolong_light","yellow"], note:"цветочный акцент к светлому чаю" },
    { id:"ginger", name:"Свежий имбирь", price:60, kind:"herb", pairs:["red","shu","mate","oolong_dark"], note:"согревает и добавляет остроту" },
    { id:"rose", name:"Лепестки розы", price:70, kind:"herb", pairs:["oolong_light","white","red","gaba"], note:"деликатный аромат без сладости" },
  ];

  const extraDesserts = [
    { id:"date_cake",name:"Финиковый кекс",art:"date",price:290,fillings:["финик","грецкий орех","корица"],desc:"Тёплый кекс без лишней сладости.",teaCats:["shu","red","oolong_dark","sheng"] },
    { id:"dark_chocolate",name:"Тёмный шоколад",art:"chocolate",price:220,fillings:["какао 72%","морская соль"],desc:"Небольшая плитка к глубокому чаю.",teaCats:["shu","red","oolong_dark","sheng","mate"] },
    { id:"rice_mochi",name:"Рисовый моти",art:"mochi",price:260,fillings:["кокос","маття"],desc:"Нежная глава к светлому листу.",teaCats:["green","white","oolong_light","gaba","yellow"] },
  ];
  window.DESSERTS = [...(window.DESSERTS || []), ...extraDesserts.filter((item)=>!(window.DESSERTS||[]).some((old)=>old.id===item.id))];
  // Кокосовый шар описан в data.drinks.js без сочетаний — дополняем здесь,
  // чтобы у жёлтого чая и мате тоже была осмысленная пара.
  const coconut=(window.DESSERTS||[]).find((item)=>item.id==="coconut_ball");
  if(coconut&&!coconut.teaCats)coconut.teaCats=["white","green","oolong_light","yellow","mate"];

  window.MERCH = [
    { id:"merch_cup",sku:"CHI-MERCH-CUP",name:"Пиала «Каждая чашка»",price:1290,kind:"merch",desc:"Фирменная керамика для ежедневного ритуала.",mark:"茶" },
    { id:"merch_gaiwan",sku:"CHI-MERCH-GAIWAN",name:"Гайвань «Новая глава»",price:2490,kind:"merch",desc:"Белая гайвань с терракотовым знаком чайной.",mark:"道" },
    { id:"merch_tote",sku:"CHI-MERCH-TOTE",name:"Шоппер «Чай пей и добрей»",price:1190,kind:"merch",desc:"Плотный хлопок · фирменная фраза и знак мудреца.",mark:"▸" },
    { id:"merch_set",sku:"CHI-MERCH-SET",name:"Набор «Чайная история»",price:3790,kind:"merch",desc:"Пиала, закладка и три чайные главы по 10 граммов.",mark:"01" },
  ];

  // Рекомендации выстроены одной цепочкой: чай → десерт → добавки и травы →
  // грибная глава. Каждая рекомендация объясняется, а не появляется молча.
  const byCategory = (list, tea, field) => (list || []).filter((item) => (item[field] || []).includes(tea?.cat));

  window.Pairings = {
    desserts(tea) {
      const exact = byCategory(window.DESSERTS, tea, "teaCats");
      return (exact.length ? exact : window.DESSERTS || []).slice(0, 3);
    },
    // Добавки к готовой чашке (мёд, лимон, молоко).
    addons(tea) {
      const list = (window.TEA_ADDONS || []).filter((item) => item.kind !== "herb");
      const exact = list.filter((item) => (item.pairs || []).includes(tea?.cat));
      return (exact.length ? exact : list).slice(0, 3);
    },
    // Травы в настой — отдельный шаг выбора.
    herbs(tea) {
      const list = (window.TEA_ADDONS || []).filter((item) => item.kind === "herb");
      const exact = list.filter((item) => (item.pairs || []).includes(tea?.cat));
      return (exact.length ? exact : list).slice(0, 3);
    },
    // Грибная глава по настроению. Мухомор не предлагается автоматически
    // никогда — только через отдельное знакомство с правилами.
    mushroom(tea, intention) {
      const list = window.MUSHROOMS || [];
      if (intention === "focus") return list.find((item) => item.id === "lionsmane") || null;
      if (intention === "energy") return list.find((item) => item.id === "cordyceps") || null;
      return null;
    },
    // Грибы, которые сочетаются с этим чаем по описанию грибной карты.
    mushroomsFor(tea) {
      const label = (window.TEA_CATEGORIES || []).find((entry) => entry.key === tea?.cat)?.label || "";
      return (window.MUSHROOMS || []).filter((item) => {
        if (item.id === "amanita") return false;
        const pairs = (item.teaCats || []);
        if (pairs.length) return pairs.includes(tea?.cat);
        // Старый формат: сочетания описаны словами, сверяем по названию категории.
        return (item.pairsWith || []).some((entry) => label && String(entry).toLowerCase().includes(label.toLowerCase().split(" ")[0]));
      });
    },
    reason(tea, dessert) {
      const notes = (tea?.notes || []).slice(0, 2).join(" · ");
      if (!notes) return `${String(dessert?.name || "десерт")} не перебивает вкус чая.`;
      return `${notes} в чае поддерживают ${String(dessert?.name || "десерт").toLowerCase()} без лишней сладости.`;
    },
    herbReason(tea, herb) {
      return `${String(herb?.note || "меняет характер настоя")} — подходит к ${String(tea?.type || "этому чаю").toLowerCase()}.`;
    },
  };
})();
