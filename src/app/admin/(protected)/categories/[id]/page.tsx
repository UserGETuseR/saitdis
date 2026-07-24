import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CategoryForm } from '@/components/admin/CategoryForm';

export const dynamic = 'force-dynamic';

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) notFound();

  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/categories" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Категории
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>{category.name}</h1>
        </div>
      </div>
      <CategoryForm
        category={{
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          sortOrder: category.sortOrder,
          isHidden: category.isHidden,
        }}
      />
    </>
  );
}
