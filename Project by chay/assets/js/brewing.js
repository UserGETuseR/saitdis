// ===== Заваривание и цена: единый расчёт для меню, карточки и корзины =====
//
// Раньше цена считалась в двух местах по-разному, а параметры заваривания были
// свободным текстом. Из-за этого:
//   • быстрая кнопка «50 г · 1 174 ₽» давала в итоге 1 170 ₽ (линейная цена
//     вместо фактической цены фасовки);
//   • «3–4 мин» в таймере превращалось в 10 секунд (парсер брал первое число
//     и не смотрел на единицу измерения).
//
// Здесь оба расчёта собраны в одном месте: window.Brewing (как заваривать)
// и window.Pricing (сколько это стоит).

window.Brewing = (function () {
  // Фирменный стакан — 0,5 л. Табличные навески в каталоге даны на 150 мл.
  const CUP_VOLUME_ML = 500;
  const REFERENCE_VOLUME_ML = 150;

  // «90°C», «90–95°C», «70–80°C» → { min, max, label }
  function temperature(tea) {
    const raw = String(tea?.brew?.temp || "");
    const numbers = raw.match(/\d+/g);
    if (!numbers || !numbers.length) return { min: 90, max: 95, label: "90–95 °C", assumed: true };
    const values = numbers.map(Number);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { min, max, label: min === max ? `${min} °C` : `${min}–${max} °C`, assumed: false };
  }

  // «7 г на 150 мл» → 7. «калабас на 2/3» → null (не пересчитываем).
  function referenceGrams(tea) {
    const raw = String(tea?.brew?.amount || "");
    const match = raw.match(/(\d+(?:[.,]\d+)?)\s*г/i);
    if (!match) return null;
    const grams = Number(String(match[1]).replace(",", "."));
    return grams > 0 ? grams : null;
  }

  // Навеска на фирменный стакан 0,5 л, пересчитанная с табличных 150 мл.
  function cupGrams(tea) {
    const reference = referenceGrams(tea);
    if (!reference) return null;
    return Math.round(reference * (CUP_VOLUME_ML / REFERENCE_VOLUME_ML));
  }

  // Разбор времени с учётом единицы измерения.
  // «по проливам, 10–20 сек» → { min:10, max:20, unit:"sec" }
  // «3–4 мин» → { min:180, max:240, unit:"min" }
  // «доливать многократно» → null
  function parseDuration(raw) {
    const text = String(raw || "").toLowerCase();
    const numbers = text.match(/\d+(?:[.,]\d+)?/g);
    if (!numbers || !numbers.length) return null;
    const minutes = /мин/.test(text);
    const values = numbers.map((value) => Number(String(value).replace(",", ".")) * (minutes ? 60 : 1));
    return { min: Math.round(Math.min(...values)), max: Math.round(Math.max(...values)), unit: minutes ? "min" : "sec" };
  }

  const humanTime = (seconds) => {
    const value = Math.max(1, Math.round(Number(seconds) || 0));
    if (value < 60) return `${value} сек`;
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${minutes} мин ${rest} сек` : `${minutes} мин`;
  };

  // Время первого пролива в секундах. Используется таймером.
  function firstPour(tea) {
    const parsed = parseDuration(tea?.brew?.time);
    if (parsed) return Math.min(600, Math.max(5, parsed.min));
    // Мате и подобные форматы доливают без фиксированного времени.
    return 30;
  }

  // Проливы: каждый следующий длиннее предыдущего. Шаг берём из разброса в
  // каталоге («10–20 сек» → шаг 10), иначе — половину первого пролива.
  function pourPlan(tea, count = 5) {
    const parsed = parseDuration(tea?.brew?.time);
    const first = firstPour(tea);
    const step = parsed && parsed.max > parsed.min ? parsed.max - parsed.min : Math.max(3, Math.round(first / 2));
    return Array.from({ length: count }, (_, index) => ({
      index: index + 1,
      seconds: first + step * index,
      label: humanTime(first + step * index),
    }));
  }

  // Заваривание в фирменном стакане: один пролив, время заметно дольше.
  function cupPlan(tea) {
    const parsed = parseDuration(tea?.brew?.time);
    const base = parsed ? parsed.max : 120;
    // В большом объёме лист отдаёт вкус медленнее, поэтому время увеличиваем.
    const seconds = Math.min(420, Math.max(60, Math.round(base * 4)));
    return { seconds, label: humanTime(seconds), grams: cupGrams(tea) };
  }

  // Готовая карта заваривания для карточки чая и экрана заваривания.
  function guide(tea) {
    if (!tea) return null;
    const temp = temperature(tea);
    const pours = pourPlan(tea);
    const cup = cupPlan(tea);
    const reference = referenceGrams(tea);
    return {
      teaId: tea.id,
      temperature: temp,
      referenceGrams: reference,
      referenceLabel: reference ? `${reference} г на ${REFERENCE_VOLUME_ML} мл` : String(tea?.brew?.amount || "по характеру листа"),
      cup: { ...cup, volumeMl: CUP_VOLUME_ML },
      pours,
      pourSourceLabel: String(tea?.brew?.time || "по проливам"),
      // У мате нет фиксированного времени — честно об этом говорим.
      freeform: !parseDuration(tea?.brew?.time),
    };
  }

  return { temperature, referenceGrams, cupGrams, parseDuration, firstPour, pourPlan, cupPlan, guide, humanTime, CUP_VOLUME_ML, REFERENCE_VOLUME_ML };
})();

window.Pricing = (function () {
  // Фасовки из каталога. Строка `g` — свободный текст («10 г», «Целый блин
  // (200 г)», «Пачка 500 г»), поэтому берём число и отсеиваем неделимые формы:
  // блин и целый гриб продаются целиком и не годятся для расчёта за грамм.
  function packs(tea) {
    return (tea?.weights || [])
      .map((entry) => ({
        label: String(entry.g),
        grams: Number(String(entry.g).match(/\d+/)?.[0]),
        price: Number(entry.price),
        whole: /блин|гриб|пачка|упаковка/i.test(String(entry.g)),
      }))
      .filter((entry) => entry.grams > 0 && Number.isFinite(entry.price))
      .sort((a, b) => a.grams - b.grams);
  }

  // Фасовки, которые можно взвесить по граммам.
  function divisiblePacks(tea) {
    const all = packs(tea);
    const divisible = all.filter((entry) => !entry.whole);
    // Мате продаётся только пачками — тогда считаем по ней, иначе делить нечего.
    return divisible.length ? divisible : all;
  }

  function pricePerGram(tea) {
    const steps = divisiblePacks(tea);
    if (steps.length) return steps[0].price / steps[0].grams;
    const base = Number(tea?.price) || 0;
    return base > 0 ? base / 10 : 0;
  }

  // Цена сырья за произвольную граммовку.
  // Точное совпадение с фасовкой отдаёт её цену как есть — иначе быстрая
  // кнопка «50 г · 1 174 ₽» расходилась с итогом на 4 ₽.
  // Для промежуточных значений берём цену за грамм ближайшей меньшей фасовки,
  // сохраняя объёмную скидку.
  function teaPrice(tea, grams) {
    const amount = Math.max(1, Math.round(Number(grams) || 0));
    const steps = divisiblePacks(tea);
    if (!steps.length) return Math.max(1, Math.round(pricePerGram(tea) * amount));
    const exact = steps.find((entry) => entry.grams === amount);
    if (exact) return exact.price;
    let base = steps[0];
    for (const entry of steps) if (entry.grams <= amount) base = entry;
    return Math.max(1, Math.round((base.price / base.grams) * amount));
  }

  function formatById(id) {
    return (window.SERVICE_FORMATS || []).find((entry) => entry.id === id) || (window.SERVICE_FORMATS || [])[0] || null;
  }

  // Категория церемонии по цене чая за грамм.
  function ceremonyTier(tea) {
    const perGram = pricePerGram(tea);
    const tiers = window.CEREMONY_TIERS || [];
    return tiers.find((tier) => perGram <= tier.maxPricePerGram) || tiers[tiers.length - 1] || { label: "I категория", price: 550 };
  }

  // Стоимость самой подачи, без сырья и добавок.
  function servicePrice(tea, formatId) {
    const format = formatById(formatId);
    if (!format) return 0;
    if (format.id === "pours") return ceremonyTier(tea).price;
    return Number(format.basePrice) || 0;
  }

  // Полная расшифровка цены позиции: гость видит, из чего сложилась сумма.
  function breakdown({ tea, formatId, grams, addons = [], mushroom = null, desserts = [] }) {
    const format = formatById(formatId);
    const rows = [];
    const amount = Math.max(1, Math.round(Number(grams) || 1));

    if (format && (format.basePrice > 0 || format.id === "pours")) {
      const price = servicePrice(tea, format.id);
      const label = format.id === "pours" ? `${format.name} · ${ceremonyTier(tea).label}` : format.name;
      rows.push({ key: "service", label, price, note: format.unit });
    }

    if (!format || !format.includesTea) {
      rows.push({ key: "tea", label: `${tea.name} · ${amount} г`, price: teaPrice(tea, amount), note: "чайный лист" });
    } else {
      rows.push({ key: "tea", label: `${tea.name} · чай включён в церемонию`, price: 0, note: "готовит мастер" });
    }

    addons.forEach((item) => rows.push({ key: `addon:${item.id}`, label: item.name, price: Number(item.price) || 0, note: "добавка" }));
    if (mushroom) rows.push({ key: `mushroom:${mushroom.id}`, label: mushroom.name, price: Number(mushroom.price) || 0, note: "грибная глава" });
    desserts.forEach((item) => rows.push({ key: `dessert:${item.id}`, label: item.name, price: Number(item.price) || 0, note: "десерт" }));

    const total = rows.reduce((sum, row) => sum + (Number(row.price) || 0), 0);
    return { rows, total, format, ceremonyTier: format?.id === "pours" ? ceremonyTier(tea) : null };
  }

  return { packs, divisiblePacks, pricePerGram, teaPrice, formatById, ceremonyTier, servicePrice, breakdown };
})();
