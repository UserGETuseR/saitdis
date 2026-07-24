import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { togglePromoAction, deletePromoAction } from '../../actions';

export const dynamic = 'force-dynamic';

export default async function PromosPage() {
  const promos = await prisma.promo.findMany({ orderBy: { sortOrder: 'asc' } });

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Акции</h1>
        <Link href="/admin/promos/new" className="btn btn-primary btn-sm">
          + Добавить акцию
        </Link>
      </div>

      <div className="warn-banner">
        Не публикуйте выдуманные условия. Добавляйте только реально действующие акции.
      </div>

      {promos.length === 0 ? (
        <div className="empty-state">Акций нет.</div>
      ) : (
        <div className="stack gap-12">
          {promos.map((p) => (
            <div key={p.id} className="panel">
              <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px' }}>
                    {p.title}{' '}
                    {p.isActive ? (
                      <span className="badge badge-new">активна</span>
                    ) : (
                      <span className="badge badge-muted">выключена</span>
                    )}
                  </h3>
                  {p.body && (
                    <p className="text-secondary" style={{ margin: 0, fontSize: '0.9rem' }}>
                      {p.body}
                    </p>
                  )}
                </div>
                <div className="row gap-8 wrap">
                  <form action={togglePromoAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <input type="hidden" name="value" value={String(!p.isActive)} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      {p.isActive ? 'Выключить' : 'Включить'}
                    </button>
                  </form>
                  <Link href={`/admin/promos/${p.id}`} className="btn btn-secondary btn-sm">
                    Изменить
                  </Link>
                  <form action={deletePromoAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" className="btn btn-ghost btn-sm">
                      Удалить
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
