"use strict";

// Оповещение чайной о новом заказе.
//
// Контур готов и включается переменными окружения. Пока они пустые, заказ
// всё равно не теряется: он лежит в базе, виден в кабинете и попадает в
// журнал аудита — просто рабочий телефон не звенит.
//
// Поддерживается Telegram (самый быстрый способ без договора) и произвольный
// webhook — под него подключается телефонный робот или любая другая система.
//
// Переменные:
//   TELEGRAM_BOT_TOKEN  — токен бота от @BotFather
//   TELEGRAM_CHAT_ID    — id чата чайной (группы смены)
//   ORDER_WEBHOOK_URL   — POST с JSON заказа: телефония, звонок робота и т.п.
//   ORDER_WEBHOOK_TOKEN — если задан, уходит в Authorization: Bearer

function createOrderAlerts(env = process.env) {
  const telegramToken = String(env.TELEGRAM_BOT_TOKEN || "");
  const telegramChat = String(env.TELEGRAM_CHAT_ID || "");
  const webhookUrl = String(env.ORDER_WEBHOOK_URL || "");
  const webhookToken = String(env.ORDER_WEBHOOK_TOKEN || "");

  const telegramReady = Boolean(telegramToken && telegramChat);
  const webhookReady = Boolean(webhookUrl);
  const configured = telegramReady || webhookReady;

  const FORMAT_LABELS = {
    cup: "стакан 0,5 л",
    pours: "проливы",
    luyu: "варка Лу Юй",
    raw: "сырьё домой",
  };

  function money(value) {
    return `${Math.round(Number(value) || 0).toLocaleString("ru-RU")} ₽`;
  }

  // Короткий текст для смены: что готовить, к какому времени и как оплата.
  function composeText(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const lines = items.map((item) => {
      const parts = [item.name || "Позиция"];
      if (item.grams) parts.push(`${item.grams} г`);
      else if (item.quantity > 1) parts.push(`${item.quantity} шт`);
      if (item.formatId && FORMAT_LABELS[item.formatId]) parts.push(FORMAT_LABELS[item.formatId]);
      if (item.sub) parts.push(item.sub);
      return `• ${parts.join(" · ")} — ${money(item.price)}`;
    });
    const when = order.scheduledAt ? new Date(Number(order.scheduledAt)).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "как можно раньше";
    const head = order.fulfillment === "delivery" ? "ДОСТАВКА" : "САМОВЫВОЗ";
    return [
      `🫖 Новый заказ · ${head}`,
      `№ ${String(order.id || "").slice(-8).toUpperCase()} · ${order.branchId || "sochi"}`,
      `Гость: ${order.userName || "Гость"} · ${order.phone || "телефон не указан"}`,
      `Ко времени: ${when}`,
      order.fulfillment === "delivery" && order.address ? `Адрес: ${order.address}` : null,
      "",
      ...lines,
      "",
      `Итого: ${money(order.total)}`,
      `Оплата: ${order.payment === "sbp" ? "СБП, ждём подтверждение" : "в чайной при получении"}`,
      order.note ? `Комментарий: ${order.note}` : null,
    ].filter((line) => line !== null).join("\n");
  }

  async function post(url, body, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) throw new Error(`${response.status}: ${text.slice(0, 200)}`);
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async function notifyOrder(order) {
    if (!configured) return { sent: false, reason: "not_configured" };
    const results = [];
    if (telegramReady) {
      results.push(
        post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id: telegramChat,
          text: composeText(order),
          disable_web_page_preview: true,
        }).then(() => ({ channel: "telegram", ok: true })).catch((error) => ({ channel: "telegram", ok: false, error: error.message }))
      );
    }
    if (webhookReady) {
      results.push(
        post(webhookUrl, { event: "order.created", order }, webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {})
          .then(() => ({ channel: "webhook", ok: true }))
          .catch((error) => ({ channel: "webhook", ok: false, error: error.message }))
      );
    }
    const settled = await Promise.all(results);
    return { sent: settled.some((entry) => entry.ok), channels: settled };
  }

  return {
    configured,
    publicConfig: { configured, telegram: telegramReady, webhook: webhookReady },
    composeText,
    notifyOrder,
  };
}

module.exports = { createOrderAlerts };
