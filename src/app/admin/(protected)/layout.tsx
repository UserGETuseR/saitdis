import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/require-admin';
import { AdminNav } from '@/components/admin/AdminNav';
import { logoutAction } from '../actions';

export const metadata: Metadata = {
  title: 'Панель управления',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <Link href="/admin" className="brand">
          <span className="brand-mark" aria-hidden="true">
            🔥
          </span>
          <span className="brand-name" style={{ fontSize: '1rem' }}>
            ОГОНЬ <span>ДУШИ</span>
          </span>
        </Link>
        <AdminNav />
        <div style={{ marginTop: 'auto', paddingTop: 20 }}>
          <div className="text-muted" style={{ fontSize: '0.8rem', padding: '0 6px 8px' }}>
            {admin.username}
          </div>
          <Link href="/" className="btn btn-ghost btn-sm btn-block" target="_blank">
            Открыть сайт ↗
          </Link>
          <form action={logoutAction} style={{ marginTop: 8 }}>
            <button type="submit" className="btn btn-secondary btn-sm btn-block">
              Выйти
            </button>
          </form>
        </div>
      </aside>
      <main className="admin-main">{children}</main>
    </div>
  );
}
