/** Server-side only. Deliberately no token is ever put in client bundles or logs. */
export type TelegramRuntimeConfig = {
  token: string;
  webhookSecret?: string;
};

export function readTelegramRuntimeConfig(environment: Record<string, string | undefined>): TelegramRuntimeConfig {
  const token = environment.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required to start the Telegram bot.');
  if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('TELEGRAM_BOT_TOKEN has an invalid format.');
  return { token, webhookSecret: environment.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined };
}
