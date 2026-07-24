import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getSiteSettings } from '@/lib/settings';
import { formatKopecks } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const [settings, zones] = await Promise.all([
    getSiteSettings(),
    prisma.deliveryZone.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Доставка</h1>
        <Link href="/admin/settings" className="btn btn-secondary btn-sm">
          Изменить условия
        </Link>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="num">{settings.minimumOrderWeightGrams} г</div>
          <div className="label">Минимальный вес заказа</div>
        </div>
        <div className="stat">
          <div className="num">{formatKopecks(settings.freeDeliveryThresholdKopecks)}</div>
          <div className="label">Бесплатная доставка от</div>
        </div>
      </div>

      <div className="warn-banner" style={{ marginTop: 20 }}>
        Точные границы бесплатной зоны и стоимость доставки при сумме ниже порога подтверждает
        оператор. Пока зоны не заданы, стоимость доставки для таких заказов помечается как «уточнит
        оператор».
      </div>

      <h2>Зоны доставки</h2>
      {zones.length === 0 ? (
        <div className="empty-state">Зоны не заданы. Стоимость доставки уточняет оператор.</div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Зона</th>
                <th>Описание</th>
                <th>Стоимость</th>
                <th>Бесплатно от</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((z) => (
                <tr key={z.id}>
                  <td>
                    <b>{z.name}</b>
                  </td>
                  <td>
                    <small className="text-secondary">{z.description}</small>
                  </td>
                  <td>
                    {z.deliveryKopecks === null
                      ? 'уточняет оператор'
                      : formatKopecks(z.deliveryKopecks)}
                  </td>
                  <td>
                    {z.freeThresholdKopecks ? formatKopecks(z.freeThresholdKopecks) : '—'}
                  </td>
                  <td>
                    {z.isActive ? (
                      <span className="badge badge-new">активна</span>
                    ) : (
                      <span className="badge badge-muted">выключена</span>
                    )}
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
