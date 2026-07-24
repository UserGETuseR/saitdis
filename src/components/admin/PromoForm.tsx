'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { savePromoAction, type ActionState } from '@/app/admin/actions';
import { PROMO_KINDS } from '@/lib/constants';

const KIND_LABELS: Record<string, string> = {
  info: 'Информация',
  free_delivery: 'Бесплатная доставка',
  discount: 'Скидка',
  seasonal: 'Сезонное',
  set: 'Набор',
};

interface PromoData {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  isActive: boolean;
  sortOrder: number;
}

export function PromoForm({ promo }: { promo?: PromoData }) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    savePromoAction,
    null,
  );

  return (
    <form action={formAction} className="panel">
      {promo && <input type="hidden" name="id" value={promo.id} />}
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}
      <div className="field">
        <label htmlFor="title">Заголовок *</label>
        <input id="title" name="title" className="input" defaultValue={promo?.title} required />
      </div>
      <div className="field">
        <label htmlFor="body">Текст</label>
        <textarea id="body" name="body" className="textarea" defaultValue={promo?.body ?? ''} />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="kind">Тип</label>
          <select id="kind" name="kind" className="select" defaultValue={promo?.kind ?? 'info'}>
            {PROMO_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="sortOrder">Порядок</label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            className="input"
            defaultValue={promo?.sortOrder ?? 0}
          />
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" name="isActive" defaultChecked={promo?.isActive ?? true} />
        Активна (показывать на сайте)
      </label>
      <div className="row gap-12 mt-16">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </button>
        <Link href="/admin/promos" className="btn btn-ghost">
          Отмена
        </Link>
      </div>
    </form>
  );
}
