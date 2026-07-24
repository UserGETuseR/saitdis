// Адаптер онлайн-оплаты. По умолчанию провайдер `none` — онлайн-оплата
// выключена, и метод CARD_ONLINE/SBP на витрине не предлагается как готовый.
// Реальный провайдер (ЮKassa, Тинькофф и т.п.) подключается через env без
// изменения кода витрины/заказов. Цена и order id формируются ТОЛЬКО сервером.

import { createHmac, timingSafeEqual } from 'node:crypto';

export interface PaymentInitInput {
  orderId: string;
  orderNumber: string;
  amountKopecks: number;
  description: string;
  returnUrl: string;
}

export interface PaymentInitResult {
  ok: boolean;
  /** URL, куда редиректить покупателя для оплаты (если применимо). */
  redirectUrl?: string;
  providerRef?: string;
  error?: string;
}

export interface PaymentWebhookResult {
  ok: boolean;
  providerRef?: string;
  // Новый статус платежа в терминах нашей системы.
  status?: 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  error?: string;
}

export interface PaymentProvider {
  readonly id: string;
  readonly enabled: boolean;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  verifyWebhook(rawBody: string, signature: string | null): PaymentWebhookResult;
}

/** Провайдер-заглушка: онлайн-оплата не подключена. */
class NoneProvider implements PaymentProvider {
  readonly id = 'none';
  readonly enabled = false;

  async init(): Promise<PaymentInitResult> {
    return {
      ok: false,
      error: 'Онлайн-оплата не подключена. Настройте PAYMENT_PROVIDER в .env.',
    };
  }

  verifyWebhook(): PaymentWebhookResult {
    return { ok: false, error: 'Онлайн-оплата не подключена' };
  }
}

/**
 * Каркас реального провайдера. Показывает, где проверять подпись webhook
 * (идемпотентно, с защитой от повтора — на уровне обработчика по providerRef).
 * Не активен, пока не заданы merchant credentials и не пройдены тестовые
 * платёж/возврат/повторный webhook (см. docs/CLIENT_CONFIRMATION_CHECKLIST.md).
 */
class GenericHmacProvider implements PaymentProvider {
  readonly id: string;
  readonly enabled: boolean;
  private readonly webhookSecret: string;

  constructor(id: string) {
    this.id = id;
    this.webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
    this.enabled =
      Boolean(process.env.PAYMENT_MERCHANT_ID) &&
      Boolean(process.env.PAYMENT_SECRET_KEY) &&
      Boolean(this.webhookSecret);
  }

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (!this.enabled) {
      return { ok: false, error: 'Не заданы merchant credentials для эквайринга' };
    }
    // TODO: реальный вызов API провайдера для создания платежа.
    // Здесь формируется providerRef и redirectUrl из ответа провайдера.
    return {
      ok: false,
      error: 'Интеграция провайдера ещё не реализована — требуется договор и ключи',
    };
  }

  verifyWebhook(rawBody: string, signature: string | null): PaymentWebhookResult {
    if (!this.enabled || !signature) {
      return { ok: false, error: 'Webhook не настроен' };
    }
    const expected = createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'Неверная подпись webhook' };
    }
    // TODO: разобрать rawBody и вернуть статус/providerRef из полезной нагрузки.
    return { ok: false, error: 'Разбор webhook не реализован' };
  }
}

export function getPaymentProvider(): PaymentProvider {
  const id = (process.env.PAYMENT_PROVIDER ?? 'none').toLowerCase();
  switch (id) {
    case 'yookassa':
    case 'tinkoff':
      return new GenericHmacProvider(id);
    case 'none':
    default:
      return new NoneProvider();
  }
}

/** Онлайн-оплата доступна на витрине? */
export function isOnlinePaymentEnabled(): boolean {
  return getPaymentProvider().enabled;
}
