import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { formatKopecks, formatWeight } from '@/lib/money';
import { formatPhoneDisplay } from '@/lib/phone';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_FLOW,
  PAYMENT_METHOD_LABELS,
  type OrderStatus,
  type PaymentMethod,
} from '@/lib/constants';
import { CopyButton } from '@/components/admin/CopyButton';
import { setOrderStatusAction, resendNotificationAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order) notFound();

  const nextStatuses = ORDER_STATUS_FLOW[order.status as OrderStatus] ?? [];
  const addressParts = [
    order.street,
    order.apartment && `кв. ${order.apartment}`,
    order.entrance && `подъезд ${order.entrance}`,
    order.floor && `этаж ${order.floor}`,
    order.intercom && `домофон ${order.intercom}`,
  ].filter(Boolean);
  const fullAddress = addressParts.join(', ');

  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/orders" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Все заказы
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>Заказ {order.number}</h1>
        </div>
        <span className={`status-pill status-${order.status}`}>
          {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
        </span>
      </div>

      <div className="two-col">
        <div>
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Состав</h2>
            {order.items.map((i) => (
              <div key={i.id} className="totals-row">
                <span>
                  {i.name}
                  <br />
                  <small className="text-muted">
                    {i.productType === 'WEIGHTED'
                      ? formatWeight((i.grams ?? 0) * i.quantity)
                      : `${i.quantity} ${i.unitLabel || 'шт'}`}
                    {i.needsConfirmation && ' · требует подтверждения'}
                  </small>
                </span>
                <span>{formatKopecks(i.lineTotalKopecks)}</span>
              </div>
            ))}
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
                    ? 'уточнить у клиента'
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
            <div className="totals-row">
              <span>Вес</span>
              <span>{formatWeight(order.totalWeightGrams)}</span>
            </div>
          </div>

          {order.comment && (
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Комментарий клиента</h2>
              <p style={{ margin: 0 }}>{order.comment}</p>
            </div>
          )}
        </div>

        <div>
          {/* Управление статусом */}
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Статус</h2>
            {nextStatuses.length === 0 ? (
              <p className="text-muted" style={{ margin: 0 }}>
                Финальный статус — изменения недоступны.
              </p>
            ) : (
              <div className="stack gap-8">
                {nextStatuses.map((s) => (
                  <form key={s} action={setOrderStatusAction}>
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="hidden" name="status" value={s} />
                    <button
                      type="submit"
                      className={`btn btn-block btn-sm ${s === 'CANCELLED' ? 'btn-ghost' : 'btn-primary'}`}
                    >
                      {s === 'CANCELLED' ? 'Отменить заказ' : `→ ${ORDER_STATUS_LABELS[s]}`}
                    </button>
                  </form>
                ))}
              </div>
            )}
          </div>

          {/* Клиент */}
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Клиент</h2>
            <p style={{ margin: '0 0 4px' }}>
              <b>{order.customerName}</b>
            </p>
            <p style={{ margin: '0 0 10px' }}>
              <a href={`tel:${order.phone}`} className="btn btn-secondary btn-sm">
                📞 {formatPhoneDisplay(order.phone)}
              </a>
            </p>
            <div className="totals-row">
              <span>Получение</span>
              <span>{order.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</span>
            </div>
            {order.fulfillmentType === 'DELIVERY' && fullAddress && (
              <div style={{ marginTop: 8 }}>
                <div className="text-secondary" style={{ fontSize: '0.9rem' }}>
                  {fullAddress}
                </div>
                <div className="mt-8">
                  <CopyButton text={fullAddress} label="Копировать адрес" />
                </div>
              </div>
            )}
            <div className="totals-row mt-8">
              <span>Оплата</span>
              <span>
                {PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod}
              </span>
            </div>
            <div className="totals-row">
              <span>Статус оплаты</span>
              <span>{order.paymentStatus}</span>
            </div>
            <div className="totals-row">
              <span>Время</span>
              <span>
                {order.timingMode === 'SCHEDULED' && order.scheduledAt
                  ? new Date(order.scheduledAt).toLocaleString('ru-RU')
                  : 'Как можно скорее'}
              </span>
            </div>
          </div>

          {/* Уведомления */}
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Уведомления</h2>
            <div className="totals-row">
              <span>Telegram</span>
              <span
                style={{
                  color:
                    order.telegramStatus === 'FAILED'
                      ? 'var(--error)'
                      : order.telegramStatus === 'SENT'
                        ? 'var(--success)'
                        : undefined,
                }}
              >
                {order.telegramStatus}
              </span>
            </div>
            {order.telegramError && (
              <div className="notice notice-error" style={{ fontSize: '0.8rem' }}>
                {order.telegramError}
              </div>
            )}
            <div className="totals-row">
              <span>Email</span>
              <span>{order.emailStatus}</span>
            </div>
            <form action={resendNotificationAction} className="mt-8">
              <input type="hidden" name="orderId" value={order.id} />
              <button type="submit" className="btn btn-secondary btn-sm btn-block">
                Отправить уведомление повторно
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
