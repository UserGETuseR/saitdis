import Link from 'next/link';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { _count: { select: { products: true } } },
  });

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Категории</h1>
        <Link href="/admin/categories/new" className="btn btn-primary btn-sm">
          + Добавить категорию
        </Link>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Порядок</th>
              <th>Название</th>
              <th>Slug</th>
              <th>Товаров</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.sortOrder}</td>
                <td>
                  <b>{c.name}</b>
                </td>
                <td>
                  <small className="text-muted">{c.slug}</small>
                </td>
                <td>{c._count.products}</td>
                <td>
                  {c.isHidden ? (
                    <span className="badge badge-muted">скрыта</span>
                  ) : (
                    <span className="badge badge-new">видна</span>
                  )}
                </td>
                <td>
                  <Link href={`/admin/categories/${c.id}`} className="btn btn-secondary btn-sm">
                    Изменить
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
