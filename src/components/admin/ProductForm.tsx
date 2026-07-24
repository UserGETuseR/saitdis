'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { saveProductAction, type ActionState } from '@/app/admin/actions';
import { PRODUCT_TYPES } from '@/lib/constants';

const TYPE_LABELS: Record<string, string> = {
  WEIGHTED: 'Весовой (за 100 г)',
  FIXED_PORTION: 'Порция',
  UNIT: 'Штучный',
  SIZE_VARIANT: 'С размером',
};

interface ProductData {
  id: string;
  name: string;
  slug: string;
  categoryId: string;
  productType: string;
  basePriceKopecks: number;
  baseWeightGrams: number | null;
  weightStepGrams: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  unitLabel: string | null;
  sizeLabel: string | null;
  shortDescription: string | null;
  composition: string | null;
  fullDescription: string | null;
  allergens: string | null;
  sortOrder: number;
  imageUrl: string | null;
  isAvailable: boolean;
  isHidden: boolean;
  needsConfirmation: boolean;
  isSpicy: boolean;
  isFeatured: boolean;
  isNew: boolean;
}

export function ProductForm({
  categories,
  product,
}: {
  categories: { id: string; name: string }[];
  product?: ProductData;
}) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    saveProductAction,
    null,
  );
  const [type, setType] = useState(product?.productType ?? 'WEIGHTED');
  const err = (k: string) => state?.fieldErrors?.[k];

  return (
    <form action={formAction} encType="multipart/form-data">
      {product && <input type="hidden" name="id" value={product.id} />}

      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Основное</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="name">Название *</label>
            <input id="name" name="name" className="input" defaultValue={product?.name} required />
            {err('name') && <div className="field-error">{err('name')}</div>}
          </div>
          <div className="field">
            <label htmlFor="slug">Slug (латиница) *</label>
            <input id="slug" name="slug" className="input" defaultValue={product?.slug} required />
            {err('slug') && <div className="field-error">{err('slug')}</div>}
          </div>
          <div className="field">
            <label htmlFor="categoryId">Категория *</label>
            <select
              id="categoryId"
              name="categoryId"
              className="select"
              defaultValue={product?.categoryId ?? categories[0]?.id}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="productType">Тип товара *</label>
            <select
              id="productType"
              name="productType"
              className="select"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {PRODUCT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Цена и вес</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="basePriceRubles">
              Цена, ₽ {type === 'WEIGHTED' ? '(за базовый вес)' : '(за единицу)'} *
            </label>
            <input
              id="basePriceRubles"
              name="basePriceRubles"
              className="input"
              type="number"
              min="0"
              step="1"
              defaultValue={product ? product.basePriceKopecks / 100 : ''}
              required
            />
            {err('basePriceRubles') && <div className="field-error">{err('basePriceRubles')}</div>}
          </div>
          <div className="field">
            <label htmlFor="baseWeightGrams">Базовый вес, г</label>
            <input
              id="baseWeightGrams"
              name="baseWeightGrams"
              className="input"
              type="number"
              min="0"
              defaultValue={product?.baseWeightGrams ?? (type === 'WEIGHTED' ? 100 : '')}
            />
            <div className="hint">Для весовых — обычно 100. Используется и для расчёта веса заказа.</div>
          </div>
          {type === 'WEIGHTED' && (
            <>
              <div className="field">
                <label htmlFor="weightStepGrams">Шаг веса, г</label>
                <input
                  id="weightStepGrams"
                  name="weightStepGrams"
                  className="input"
                  type="number"
                  defaultValue={product?.weightStepGrams ?? 100}
                />
              </div>
              <div className="field">
                <label htmlFor="minWeightGrams">Мин. вес, г</label>
                <input
                  id="minWeightGrams"
                  name="minWeightGrams"
                  className="input"
                  type="number"
                  defaultValue={product?.minWeightGrams ?? 100}
                />
              </div>
              <div className="field">
                <label htmlFor="maxWeightGrams">Макс. вес, г</label>
                <input
                  id="maxWeightGrams"
                  name="maxWeightGrams"
                  className="input"
                  type="number"
                  defaultValue={product?.maxWeightGrams ?? 500}
                />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="unitLabel">Единица (подпись)</label>
            <input
              id="unitLabel"
              name="unitLabel"
              className="input"
              placeholder="г / шт / порция"
              defaultValue={product?.unitLabel ?? ''}
            />
          </div>
          {type === 'SIZE_VARIANT' && (
            <div className="field">
              <label htmlFor="sizeLabel">Размер</label>
              <input
                id="sizeLabel"
                name="sizeLabel"
                className="input"
                placeholder="30 см"
                defaultValue={product?.sizeLabel ?? ''}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="sortOrder">Порядок</label>
            <input
              id="sortOrder"
              name="sortOrder"
              className="input"
              type="number"
              defaultValue={product?.sortOrder ?? 0}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Описание</h2>
        <div className="field">
          <label htmlFor="composition">Состав</label>
          <input
            id="composition"
            name="composition"
            className="input"
            defaultValue={product?.composition ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="shortDescription">Краткое описание</label>
          <input
            id="shortDescription"
            name="shortDescription"
            className="input"
            defaultValue={product?.shortDescription ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="fullDescription">Полное описание</label>
          <textarea
            id="fullDescription"
            name="fullDescription"
            className="textarea"
            defaultValue={product?.fullDescription ?? ''}
          />
        </div>
        <div className="field">
          <label htmlFor="allergens">Аллергены</label>
          <input
            id="allergens"
            name="allergens"
            className="input"
            defaultValue={product?.allergens ?? ''}
          />
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Фото</h2>
        {product?.imageUrl && (
          <div style={{ marginBottom: 12 }}>
            {}
            <img
              src={product.imageUrl}
              alt=""
              style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--border)' }}
            />
            <label className="check-row mt-8">
              <input type="checkbox" name="removeImage" value="true" />
              Удалить текущее фото
            </label>
          </div>
        )}
        <div className="field">
          <label htmlFor="image">Загрузить изображение (JPEG/PNG/WebP/AVIF, до 5 МБ)</label>
          <input id="image" name="image" type="file" accept="image/*" className="input" />
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Флаги</h2>
        <div className="grid-2">
          <label className="check-row">
            <input type="checkbox" name="isAvailable" defaultChecked={product?.isAvailable ?? true} />
            В наличии
          </label>
          <label className="check-row">
            <input type="checkbox" name="isHidden" defaultChecked={product?.isHidden ?? false} />
            Скрыт из витрины
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              name="needsConfirmation"
              defaultChecked={product?.needsConfirmation ?? false}
            />
            Требует подтверждения
          </label>
          <label className="check-row">
            <input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured ?? false} />
            Популярное
          </label>
          <label className="check-row">
            <input type="checkbox" name="isNew" defaultChecked={product?.isNew ?? false} />
            Новинка
          </label>
          <label className="check-row">
            <input type="checkbox" name="isSpicy" defaultChecked={product?.isSpicy ?? false} />
            Острое
          </label>
        </div>
      </div>

      <div className="row gap-12">
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Сохранение…' : 'Сохранить'}
        </button>
        <Link href="/admin/menu" className="btn btn-ghost">
          Отмена
        </Link>
      </div>
    </form>
  );
}
