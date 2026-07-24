import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ProductForm } from '@/components/admin/ProductForm';
import { archiveProductAction } from '../../../actions';

export const dynamic = 'force-dynamic';

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, categories] = await Promise.all([
    prisma.product.findUnique({ where: { id } }),
    prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
  ]);
  if (!product) notFound();

  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/menu" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Меню
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>{product.name}</h1>
        </div>
      </div>

      {product.needsConfirmation && (
        <div className="warn-banner">
          Проверьте цену, вес или состав перед публикацией. После проверки снимите флаг «Требует
          подтверждения» и уберите «Скрыт из витрины».
        </div>
      )}

      <ProductForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          categoryId: product.categoryId,
          productType: product.productType,
          basePriceKopecks: product.basePriceKopecks,
          baseWeightGrams: product.baseWeightGrams,
          weightStepGrams: product.weightStepGrams,
          minWeightGrams: product.minWeightGrams,
          maxWeightGrams: product.maxWeightGrams,
          unitLabel: product.unitLabel,
          sizeLabel: product.sizeLabel,
          shortDescription: product.shortDescription,
          composition: product.composition,
          fullDescription: product.fullDescription,
          allergens: product.allergens,
          sortOrder: product.sortOrder,
          imageUrl: product.imageUrl,
          isAvailable: product.isAvailable,
          isHidden: product.isHidden,
          needsConfirmation: product.needsConfirmation,
          isSpicy: product.isSpicy,
          isFeatured: product.isFeatured,
          isNew: product.isNew,
        }}
      />

      <div className="panel" style={{ borderColor: 'rgba(224,86,61,0.3)' }}>
        <h2 style={{ marginTop: 0 }}>Архивировать</h2>
        <p className="text-secondary" style={{ fontSize: '0.9rem' }}>
          Товар будет скрыт и снят с продажи, но останется в истории заказов (мягкое удаление).
        </p>
        <form action={archiveProductAction}>
          <input type="hidden" name="id" value={product.id} />
          <button type="submit" className="btn btn-ghost btn-sm">
            Архивировать товар
          </button>
        </form>
      </div>
    </>
  );
}
