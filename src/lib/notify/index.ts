import { prisma } from '../prisma';
import { formatOrderMessage, formatOrderPlainText } from './format';
import { sendTelegramMessage } from './telegram';
import { sendOrderEmail } from './email';

function adminOrderUrl(orderId: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return `${base}/admin/orders/${orderId}`;
}

/**
 * Отправляет уведомления владельцу по всем каналам и обновляет статусы в заказе.
 * Ошибка канала НЕ роняет заказ — она записывается в статус/лог и может быть
 * повторена из админки.
 */
export async function notifyOwnerAboutOrder(orderId: string): Promise<{
  telegramStatus: string;
  emailStatus: string;
}> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    return { telegramStatus: 'FAILED', emailStatus: 'FAILED' };
  }

  const url = adminOrderUrl(order.id);
  const html = formatOrderMessage(order, url);
  const text = formatOrderPlainText(order, url);

  const [tg, mail] = await Promise.all([
    sendTelegramMessage(html),
    sendOrderEmail(`Новый заказ ${order.number}`, text),
  ]);

  await prisma.order.update({
    where: { id: order.id },
    data: {
      telegramStatus: tg.status,
      telegramError: tg.error ?? null,
      emailStatus: mail.status,
      emailError: mail.error ?? null,
    },
  });

  if (tg.status === 'FAILED') {
    console.error(`[notify] Telegram FAILED для заказа ${order.number}: ${tg.error}`);
  }
  if (mail.status === 'FAILED') {
    console.error(`[notify] Email FAILED для заказа ${order.number}: ${mail.error}`);
  }

  return { telegramStatus: tg.status, emailStatus: mail.status };
}
