// Email-канал уведомлений (дополнительный). Реализован как адаптер: если SMTP
// не сконфигурирован — канал SKIPPED. Фактическая отправка через SMTP требует
// пакета `nodemailer` (npm i nodemailer) — динамический импорт ниже подключит
// его, если он установлен. Без него канал остаётся отключённым, но заказ
// сохраняется.

export interface EmailResult {
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  error?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.ORDER_NOTIFY_EMAIL && process.env.SMTP_FROM,
  );
}

export async function sendOrderEmail(subject: string, text: string): Promise<EmailResult> {
  if (!isEmailConfigured()) {
    return { status: 'SKIPPED', error: 'SMTP не сконфигурирован' };
  }

  try {
    // Динамический импорт по вычисляемому имени — чтобы отсутствие nodemailer
    // не ломало типизацию и сборку. Пакет ставится опционально при включении email.
    const moduleName = 'nodemailer';
    const mod = (await import(/* webpackIgnore: true */ moduleName).catch(() => null)) as
      | { createTransport: (opts: unknown) => { sendMail: (m: unknown) => Promise<unknown> } }
      | null;

    if (!mod) {
      return {
        status: 'SKIPPED',
        error: 'Пакет nodemailer не установлен (npm i nodemailer)',
      };
    }

    const transporter = mod.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.ORDER_NOTIFY_EMAIL,
      subject,
      text,
    });

    return { status: 'SENT' };
  } catch (err) {
    return {
      status: 'FAILED',
      error: err instanceof Error ? err.message : 'Ошибка отправки email',
    };
  }
}
