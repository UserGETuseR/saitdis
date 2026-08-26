// Торговая глава 2026: добавки, десерты, мерч и объяснимые сочетания.
(function () {
  window.TEA_ADDONS = [
    { id:"honey", name:"Горный мёд", price:70, pairs:["red","shu","mate"], note:"смягчает пряные и плотные главы" },
    { id:"lemon", name:"Свежий лимон", price:50, pairs:["red","green","mate"], note:"добавляет чистую цитрусовую линию" },
    { id:"mint", name:"Садовая мята", price:50, pairs:["green","white","gaba"], note:"делает послевкусие прохладнее" },
    { id:"alt_milk", name:"Растительное молоко", price:90, pairs:["red","shu","mate"], note:"для мягкой, округлой подачи" },
  ];

  const extraDesserts = [
    { id:"date_cake",name:"Финиковый кекс",art:"date",price:290,fillings:["финик","грецкий орех","корица"],desc:"Тёплый кекс без лишней сладости.",teaCats:["shu","red","oolong_dark"] },
    { id:"dark_chocolate",name:"Тёмный шоколад",art:"chocolate",price:220,fillings:["какао 72%","морская соль"],desc:"Небольшая плитка к глубокому чаю.",teaCats:["shu","red","oolong_dark"] },
    { id:"rice_mochi",name:"Рисовый моти",art:"mochi",price:260,fillings:["кокос","маття"],desc:"Нежная глава к светлому листу.",teaCats:["green","white","oolong_light","gaba"] },
  ];
  window.DESSERTS = [...(window.DESSERTS || []), ...extraDesserts.filter((item)=>!(window.DESSERTS||[]).some((old)=>old.id===item.id))];
  const coconut=(window.DESSERTS||[]).find((item)=>item.id==="coconut_ball"); if(coconut&&!coconut.teaCats)coconut.teaCats=["white","green","oolong_light"];

  window.MERCH = [
    { id:"merch_cup",sku:"CHI-MERCH-CUP",name:"Пиала «Каждая чашка»",price:1290,kind:"merch",desc:"Фирменная керамика для ежедневного ритуала.",mark:"茶" },
    { id:"merch_gaiwan",sku:"CHI-MERCH-GAIWAN",name:"Гайвань «Новая глава»",price:2490,kind:"merch",desc:"Белая гайвань с терракотовым знаком чайной.",mark:"道" },
    { id:"merch_tote",sku:"CHI-MERCH-TOTE",name:"Шоппер «Чай пей и добрей»",price:1190,kind:"merch",desc:"Плотный хлопок · фирменная фраза и знак мудреца.",mark:"▸" },
    { id:"merch_set",sku:"CHI-MERCH-SET",name:"Набор «Чайная история»",price:3790,kind:"merch",desc:"Пиала, закладка и три чайные главы по 10 граммов.",mark:"01" },
  ];

  window.Pairings = {
    desserts(tea){const exact=(window.DESSERTS||[]).filter((item)=>(item.teaCats||[]).includes(tea.cat));return (exact.length?exact:window.DESSERTS||[]).slice(0,3);},
    addons(tea){const exact=(window.TEA_ADDONS||[]).filter((item)=>item.pairs.includes(tea.cat));return (exact.length?exact:window.TEA_ADDONS||[]).slice(0,3);},
    mushroom(tea,intention){
      if(intention==="focus")return (window.MUSHROOMS||[]).find((item)=>item.id==="lionsmane")||null;
      if(intention==="energy")return (window.MUSHROOMS||[]).find((item)=>item.id==="cordyceps")||null;
      return null;
    },
    reason(tea,dessert){return `${tea.notes.slice(0,2).join(" · ")} в чае поддерживают ${String(dessert.name).toLowerCase()} без лишней сладости.`;},
  };
})();
