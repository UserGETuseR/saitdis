import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { PromoForm } from '@/components/admin/PromoForm';

export const dynamic = 'force-dynamic';

export default async function EditPromoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const promo = await prisma.promo.findUnique({ where: { id } });
  if (!promo) notFound();

  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/promos" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Акции
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>{promo.title}</h1>
        </div>
      </div>
      <PromoForm
        promo={{
          id: promo.id,
          title: promo.title,
          body: promo.body,
          kind: promo.kind,
          isActive: promo.isActive,
          sortOrder: promo.sortOrder,
        }}
      />
    </>
  );
}
