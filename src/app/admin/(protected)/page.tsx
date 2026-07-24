import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatKopecks } from '@/lib/money';
import { formatPhoneDisplay } from '@/lib/phone';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [newCount, todayOrders, needsConfirm, productCount, recent, revenueAgg] =
    await Promise.all([
      prisma.order.count({ where: { status: 'NEW' } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.product.count({ where: { needsConfirmation: true } }),
      prisma.product.count(),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.order.aggregate({
        _sum: { itemsSubtotalKopecks: true },
        where: { createdAt: { gte: startOfDay }, status: { not: 'CANCELLED' } },
      }),
    ]);

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Сводка</h1>
      </div>

      {needsConfirm > 0 && (
        <div className="warn-banner">
          ⚠️ {needsConfirm} позиц. требуют подтверждения (цена, вес или состав). Они скрыты из
          витрины. <Link href="/admin/menu?filter=needsConfirmation">Проверить →</Link>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="num">{newCount}</div>
          <div className="label">Новые заказы</div>
        </div>
        <div className="stat">
          <div className="num">{todayOrders}</div>
          <div className="label">Заказов сегодня</div>
        </div>
        <div className="stat">
          <div className="num">{formatKopecks(revenueAgg._sum.itemsSubtotalKopecks ?? 0)}</div>
          <div className="label">Сумма блюд за сегодня</div>
        </div>
        <div className="stat">
          <div className="num">{productCount}</div>
          <div className="label">Товаров в базе</div>
        </div>
      </div>

      <div className="admin-topbar" style={{ marginTop: 32 }}>
        <h2 style={{ margin: 0 }}>Последние заказы</h2>
        <Link href="/admin/orders" className="btn btn-secondary btn-sm">
          Все заказы
        </Link>
      </div>

      {recent.length === 0 ? (
        <div className="empty-state">Заказов пока нет.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Клиент</th>
                <th>Сумма</th>
                <th>Статус</th>
                <th>Время</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
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
                  <td>
                    {o.deliveryKopecks === null
                      ? `${formatKopecks(o.itemsSubtotalKopecks)}+`
                      : formatKopecks(o.totalKopecks)}
                  </td>
                  <td>
                    <span className={`status-pill status-${o.status}`}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                    </span>
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
