import Link from 'next/link';
import { PromoForm } from '@/components/admin/PromoForm';

export default function NewPromoPage() {
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/promos" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Акции
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>Новая акция</h1>
        </div>
      </div>
      <PromoForm />
    </>
  );
}
