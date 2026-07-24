import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { formatKopecks } from '@/lib/money';
import { setProductAvailabilityAction, setProductHiddenAction } from '../../actions';

export const dynamic = 'force-dynamic';

const TYPE_SHORT: Record<string, string> = {
  WEIGHTED: 'весовой',
  FIXED_PORTION: 'порция',
  UNIT: 'штучный',
  SIZE_VARIANT: 'размер',
};

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const onlyNeedsConfirm = filter === 'needsConfirmation';

  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      products: {
        where: onlyNeedsConfirm ? { needsConfirmation: true } : undefined,
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Меню</h1>
        <div className="row gap-8">
          {onlyNeedsConfirm && (
            <Link href="/admin/menu" className="btn btn-ghost btn-sm">
              Показать все
            </Link>
          )}
          <Link href="/admin/menu/new" className="btn btn-primary btn-sm">
            + Добавить товар
          </Link>
        </div>
      </div>

      {onlyNeedsConfirm && (
        <div className="warn-banner">
          Показаны только позиции, требующие подтверждения. Проверьте цену, вес или состав, затем
          снимите флаг и уберите «скрыт», чтобы опубликовать.
        </div>
      )}

      {categories.map((cat) => (
        <div key={cat.id} style={{ marginBottom: 28 }}>
          <h2 style={{ marginBottom: 10 }}>
            {cat.name}{' '}
            <span className="text-muted" style={{ fontSize: '0.9rem' }}>
              ({cat.products.length})
            </span>
          </h2>
          {cat.products.length === 0 ? (
            <p className="text-muted">Нет товаров.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Тип</th>
                    <th>Цена</th>
                    <th>Статус</th>
                    <th>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/admin/menu/${p.id}`}>
                          <b>{p.name}</b>
                        </Link>
                        <div className="row gap-8 wrap" style={{ marginTop: 4 }}>
                          {p.needsConfirmation && (
                            <span className="badge badge-warning">требует подтверждения</span>
                          )}
                          {p.isHidden && <span className="badge badge-muted">скрыт</span>}
                          {p.isFeatured && <span className="badge badge-fire">популярное</span>}
                          {p.isSpicy && <span className="badge badge-spicy">остро</span>}
                          {p.isNew && <span className="badge badge-new">новинка</span>}
                        </div>
                      </td>
                      <td>
                        <small>{TYPE_SHORT[p.productType] ?? p.productType}</small>
                      </td>
                      <td>
                        {formatKopecks(p.basePriceKopecks)}
                        {p.productType === 'WEIGHTED' && (
                          <small className="text-muted"> /{p.baseWeightGrams ?? 100}г</small>
                        )}
                      </td>
                      <td>
                        <span
                          className="status-pill"
                          style={{
                            background: p.isAvailable
                              ? 'rgba(79,174,116,0.16)'
                              : 'rgba(224,86,61,0.16)',
                            color: p.isAvailable ? '#7fd6a3' : '#ff9d88',
                          }}
                        >
                          {p.isAvailable ? 'в наличии' : 'нет'}
                        </span>
                      </td>
                      <td>
                        <div className="row gap-8 wrap">
                          <form action={setProductAvailabilityAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="value" value={String(!p.isAvailable)} />
                            <button type="submit" className="btn btn-ghost btn-sm">
                              {p.isAvailable ? 'Снять с продажи' : 'В наличие'}
                            </button>
                          </form>
                          <form action={setProductHiddenAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="value" value={String(!p.isHidden)} />
                            <button type="submit" className="btn btn-ghost btn-sm">
                              {p.isHidden ? 'Показать' : 'Скрыть'}
                            </button>
                          </form>
                          <Link href={`/admin/menu/${p.id}`} className="btn btn-secondary btn-sm">
                            Изменить
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
