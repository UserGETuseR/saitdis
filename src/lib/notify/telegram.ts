// Telegram-канал уведомлений. Если токен/чат не заданы — канал считается
// отключённым (SKIPPED), заказ при этом сохраняется в любом случае.

export interface TelegramResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export async function sendTelegramMessage(html: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return { status: 'SKIPPED', error: 'TELEGRAM_BOT_TOKEN/CHAT_ID не заданы' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // не даём висеть бесконечно
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { status: 'FAILED', error: `Telegram ${res.status}: ${body.slice(0, 300)}` };
    }
    return { status: 'SENT' };
  } catch (err) {
    return {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Неизвестная ошибка Telegram',
    };
  }
}
