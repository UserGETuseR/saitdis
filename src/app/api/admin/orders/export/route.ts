import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/auth';
import { formatPhoneDisplay } from '@/lib/phone';

export const dynamic = 'force-dynamic';

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: { items: true },
    take: 5000,
  });

  const header = [
    'Номер',
    'Дата',
    'Статус',
    'Клиент',
    'Телефон',
    'Получение',
    'Адрес',
    'Блюда, ₽',
    'Доставка',
    'Итого, ₽',
    'Вес, г',
    'Оплата',
    'Комментарий',
    'Состав',
  ];

  const rows = orders.map((o) => {
    const items = o.items
      .map((i) =>
        i.productType === 'WEIGHTED'
          ? `${i.name} (${(i.grams ?? 0) * i.quantity} г)`
          : `${i.name} ×${i.quantity}`,
      )
      .join('; ');
    const address =
      o.fulfillmentType === 'DELIVERY'
        ? [o.street, o.apartment && `кв.${o.apartment}`].filter(Boolean).join(', ')
        : '';
    return [
      o.number,
      new Date(o.createdAt).toLocaleString('ru-RU'),
      o.status,
      o.customerName,
      formatPhoneDisplay(o.phone),
      o.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз',
      address,
      (o.itemsSubtotalKopecks / 100).toFixed(2),
      o.deliveryKopecks === null ? 'оператор' : (o.deliveryKopecks / 100).toFixed(2),
      o.deliveryKopecks === null ? '' : (o.totalKopecks / 100).toFixed(2),
      o.totalWeightGrams,
      o.paymentMethod,
      o.comment ?? '',
      items,
    ].map(csvCell);
  });

  const csv = [header.map(csvCell), ...rows].map((r) => r.join(',')).join('\r\n');
  // BOM для корректной кириллицы в Excel.
  const body = '﻿' + csv;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="orders-${Date.now()}.csv"`,
    },
  });
}
