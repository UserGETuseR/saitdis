import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { ProductForm } from '@/components/admin/ProductForm';

export const dynamic = 'force-dynamic';

export default async function NewProductPage() {
  const categories = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/menu" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Меню
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>Новый товар</h1>
        </div>
      </div>
      <ProductForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </>
  );
}
