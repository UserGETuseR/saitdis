import type { Order, OrderItem } from '@prisma/client';
import { formatKopecks, formatWeight } from '../money';
import { formatPhoneDisplay } from '../phone';
import {
  FULFILLMENT_TYPES,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from '../constants';

type OrderWithItems = Order & { items: OrderItem[] };

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function itemLine(item: OrderItem): string {
  const qtyOrWeight =
    item.productType === 'WEIGHTED' && item.grams
      ? formatWeight(item.grams * item.quantity)
      : `${item.quantity} ${item.unitLabel || 'шт'}`;
  return `• ${escapeHtml(item.name)} — ${qtyOrWeight} — ${formatKopecks(item.lineTotalKopecks)}`;
}

/** Формирует HTML-текст уведомления о заказе (Telegram parse_mode=HTML). */
export function formatOrderMessage(order: OrderWithItems, adminUrl: string): string {
  const created = new Date(order.createdAt).toLocaleString('ru-RU', {
    dateStyle: 'short',
    timeStyle: 'short',
  });

  const fulfillment =
    order.fulfillmentType === FULFILLMENT_TYPES[0] ? 'Доставка' : 'Самовывоз';

  const addressLines: string[] = [];
  if (order.fulfillmentType === 'DELIVERY') {
    const parts = [
      order.street,
      order.apartment && `кв. ${order.apartment}`,
      order.entrance && `подъезд ${order.entrance}`,
      order.floor && `этаж ${order.floor}`,
      order.intercom && `домофон ${order.intercom}`,
    ].filter(Boolean);
    if (parts.length) addressLines.push(`🏠 ${escapeHtml(parts.join(', '))}`);
  }

  const timing =
    order.timingMode === 'SCHEDULED' && order.scheduledAt
      ? new Date(order.scheduledAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
      : 'Как можно скорее';

  const delivery =
    order.deliveryKopecks === null
      ? 'уточняет оператор'
      : order.deliveryKopecks === 0
        ? 'бесплатно'
        : formatKopecks(order.deliveryKopecks);

  const total =
    order.deliveryKopecks === null
      ? `${formatKopecks(order.itemsSubtotalKopecks)} + доставка`
      : formatKopecks(order.totalKopecks);

  const lines = [
    `🔥 <b>Новый заказ ${escapeHtml(order.number)}</b>`,
    `🕒 ${escapeHtml(created)}`,
    '',
    `👤 ${escapeHtml(order.customerName)}`,
    `📞 ${escapeHtml(formatPhoneDisplay(order.phone))}`,
    `📦 ${fulfillment} · ${escapeHtml(timing)}`,
    ...addressLines,
    '',
    '<b>Состав:</b>',
    ...order.items.map(itemLine),
    '',
    `Блюда: ${formatKopecks(order.itemsSubtotalKopecks)}`,
    `Доставка: ${delivery}`,
    `<b>Итого: ${total}</b>`,
    `Вес: ${formatWeight(order.totalWeightGrams)}`,
    `Оплата: ${PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}`,
  ];

  if (order.comment) {
    lines.push('', `💬 ${escapeHtml(order.comment)}`);
  }

  lines.push('', `🔗 ${adminUrl}`);

  return lines.join('\n');
}

/** Простой текстовый вариант для email. */
export function formatOrderPlainText(order: OrderWithItems, adminUrl: string): string {
  return formatOrderMessage(order, adminUrl)
    .replace(/<\/?b>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
