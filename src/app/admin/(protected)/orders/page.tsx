import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatKopecks } from '@/lib/money';
import { formatPhoneDisplay } from '@/lib/phone';
import { ORDER_STATUSES, ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const filter = status && ORDER_STATUSES.includes(status as OrderStatus) ? status : undefined;

  const orders = await prisma.order.findMany({
    where: filter ? { status: filter } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Заказы</h1>
        <a href="/api/admin/orders/export" className="btn btn-secondary btn-sm">
          Экспорт CSV
        </a>
      </div>

      <div className="catnav-scroll" style={{ marginBottom: 18 }}>
        <Link href="/admin/orders" className={!filter ? 'active' : ''} style={pill}>
          Все
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/orders?status=${s}`}
            className={filter === s ? 'active' : ''}
            style={pill}
          >
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <div className="empty-state">Заказов не найдено.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Получение</th>
                <th>Сумма</th>
                <th>Оплата</th>
                <th>Статус</th>
                <th>Уведомл.</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/admin/orders/${o.id}`}>
                      <b>{o.number}</b>
                    </Link>
                  </td>
                  <td>
                    {o.customerName}
                    <br />
                    <small className="text-muted">{formatPhoneDisplay(o.phone)}</small>
                  </td>
                  <td>{o.fulfillmentType === 'DELIVERY' ? 'Доставка' : 'Самовывоз'}</td>
                  <td>
                    {o.deliveryKopecks === null
                      ? `${formatKopecks(o.itemsSubtotalKopecks)}+`
                      : formatKopecks(o.totalKopecks)}
                  </td>
                  <td>
                    <small>{o.paymentMethod}</small>
                  </td>
                  <td>
                    <span className={`status-pill status-${o.status}`}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                    </span>
                  </td>
                  <td>
                    <small
                      className="text-muted"
                      title={o.telegramError ?? ''}
                      style={{
                        color:
                          o.telegramStatus === 'FAILED'
                            ? 'var(--error)'
                            : o.telegramStatus === 'SENT'
                              ? 'var(--success)'
                              : undefined,
                      }}
                    >
                      TG: {o.telegramStatus}
                    </small>
                  </td>
                  <td>
                    <small className="text-muted">
                      {new Date(o.createdAt).toLocaleString('ru-RU', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const pill: React.CSSProperties = { textDecoration: 'none' };
