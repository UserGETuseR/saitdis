'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { saveCategoryAction, type ActionState } from '@/app/admin/actions';

interface CategoryData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isHidden: boolean;
}

export function CategoryForm({ category }: { category?: CategoryData }) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    saveCategoryAction,
    null,
  );
  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} className="panel">
      {category && <input type="hidden" name="id" value={category.id} />}
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label htmlFor="name">Название *</label>
          <input id="name" name="name" className="input" defaultValue={category?.name} required />
          {err('name') && <div className="field-error">{err('name')}</div>}
        </div>
        <div className="field">
          <label htmlFor="slug">Slug (латиница) *</label>
          <input id="slug" name="slug" className="input" defaultValue={category?.slug} required />
          {err('slug') && <div className="field-error">{err('slug')}</div>}
        </div>
        <div className="field">
          <label htmlFor="sortOrder">Порядок</label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            className="input"
            defaultValue={category?.sortOrder ?? 0}
          />
        </div>
        <div className="field">
          <label htmlFor="description">Описание</label>
          <input
            id="description"
            name="description"
            className="input"
            defaultValue={category?.description ?? ''}
          />
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" name="isHidden" defaultChecked={category?.isHidden ?? false} />
        Скрыть категорию
      </label>
      <div className="row gap-12 mt-16">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </button>
        <Link href="/admin/categories" className="btn btn-ghost">
          Отмена
        </Link>
      </div>
    </form>
  );
}
