import Link from 'next/link';
import { CategoryForm } from '@/components/admin/CategoryForm';

export default function NewCategoryPage() {
  return (
    <>
      <div className="admin-topbar">
        <div>
          <Link href="/admin/categories" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Категории
          </Link>
          <h1 style={{ margin: '4px 0 0' }}>Новая категория</h1>
        </div>
      </div>
      <CategoryForm />
    </>
  );
}
