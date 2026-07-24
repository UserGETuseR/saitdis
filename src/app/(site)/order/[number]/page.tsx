import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getSiteSettings } from '@/lib/settings';
import { formatKopecks, formatWeight } from '@/lib/money';
import { formatPhoneDisplay } from '@/lib/phone';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Заказ оформлен',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function OrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const order = await prisma.order.findUnique({
    where: { number },
    include: { items: true },
  });
  if (!order) notFound();

  const settings = await getSiteSettings();

  return (
    <section className="section-tight">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="order-hero">
          <div className="check" aria-hidden="true">
            ✓
          </div>
          <h1>Заказ принят</h1>
          <p className="lead" style={{ margin: '0 auto' }}>
            Номер заказа <b>{order.number}</b>. Мы свяжемся с вами по телефону для подтверждения.
          </p>
        </div>

        <div className="panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Состав заказа</h2>
            <span className={`status-pill status-${order.status}`}>
              {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
            </span>
          </div>

          <div className="stack mt-16">
            {order.items.map((i) => (
              <div key={i.id} className="totals-row">
                <span>
                  {i.name}
                  <br />
                  <small className="text-muted">
                    {i.productType === 'WEIGHTED'
                      ? formatWeight((i.grams ?? 0) * i.quantity)
                      : `${i.quantity} ${i.unitLabel || 'шт'}`}
                    {i.needsConfirmation && ' · уточняется оператором'}
                  </small>
                </span>
                <span>{formatKopecks(i.lineTotalKopecks)}</span>
              </div>
            ))}
          </div>

          <hr className="divider mt-16" />
          <div className="totals-row mt-16">
            <span>Блюда</span>
            <span>{formatKopecks(order.itemsSubtotalKopecks)}</span>
          </div>
          <div className="totals-row">
            <span>Доставка</span>
            <span>
              {order.deliveryKopecks === 0
                ? 'бесплатно'
                : order.deliveryKopecks === null
                  ? 'уточнит оператор'
                  : formatKopecks(order.deliveryKopecks)}
            </span>
          </div>
          <div className="totals-row total">
            <span>Итого</span>
            <span>
              {order.deliveryKopecks === null
                ? `${formatKopecks(order.itemsSubtotalKopecks)} + доставка`
                : formatKopecks(order.totalKopecks)}
            </span>
          </div>

          {order.deliveryKopecks === null && order.fulfillmentType === 'DELIVERY' && (
            <div className="notice notice-info mt-8">
              Стоимость доставки уточнит оператор при подтверждении заказа.
            </div>
          )}
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Детали</h2>
          <div className="totals-row">
            <span>Получение</span>
            <span>{order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</span>
          </div>
          {order.fulfillmentType === 'DELIVERY' && order.street && (
            <div className="totals-row">
              <span>Адрес</span>
              <span style={{ textAlign: 'right' }}>
                {[order.street, order.apartment && `кв. ${order.apartment}`]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}
          <div className="totals-row">
            <span>Телефон</span>
            <span>{formatPhoneDisplay(order.phone)}</span>
          </div>
          <div className="totals-row">
            <span>Оплата</span>
            <span>
              {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
            </span>
          </div>
          {order.comment && (
            <div className="totals-row">
              <span>Комментарий</span>
              <span style={{ textAlign: 'right', maxWidth: '60%' }}>{order.comment}</span>
            </div>
          )}
        </div>

        <div className="center mt-24">
          <p className="text-secondary">
            Вопросы по заказу? Позвоните нам:{' '}
            <a href={`tel:${settings.contactPhoneRaw}`}>
              <b>{settings.contactPhoneDisplay}</b>
            </a>
          </p>
          <Link href="/" className="btn btn-secondary">
            На главную
          </Link>
        </div>
      </div>
    </section>
  );
}
