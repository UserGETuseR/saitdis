'use client';

import { useState, useId } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { priceLine } from '@/lib/pricing';
import { formatKopecks, formatWeight } from '@/lib/money';
import type { MenuProduct } from '@/lib/catalog';

const WEIGHT_PRESETS = [100, 200, 300, 400, 500];

export function ProductCard({ product }: { product: MenuProduct }) {
  const { addProduct } = useCart();
  const detailsId = useId();
  const [showDetails, setShowDetails] = useState(false);

  const isWeighted = product.productType === 'WEIGHTED';
  const step = product.weightStepGrams ?? 100;
  const min = product.minWeightGrams ?? 100;
  const max = product.maxWeightGrams ?? 500;

  const [grams, setGramsState] = useState(min);
  const [qty, setQty] = useState(1);

  const presets = WEIGHT_PRESETS.filter((g) => g >= min && g <= max);

  const line = priceLine({
    product: {
      id: product.id,
      name: product.name,
      productType: product.productType,
      basePriceKopecks: product.basePriceKopecks,
      baseWeightGrams: product.baseWeightGrams,
      weightStepGrams: product.weightStepGrams,
      minWeightGrams: product.minWeightGrams,
      maxWeightGrams: product.maxWeightGrams,
      unitLabel: product.unitLabel,
      isAvailable: product.isAvailable,
      needsConfirmation: product.needsConfirmation,
    },
    grams: isWeighted ? grams : null,
    quantity: isWeighted ? 1 : qty,
  });

  const hasDetails = Boolean(product.composition || product.fullDescription || product.allergens);

  function handleAdd() {
    if (!product.isAvailable) return;
    if (isWeighted) addProduct(product, { grams });
    else addProduct(product, { quantity: qty });
  }

  return (
    <article className="product-card">
      <div className="product-media">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} loading="lazy" />
        ) : (
          <div className="ph" aria-hidden="true">
            🔥
          </div>
        )}
        <div className="product-badges">
          {product.isFeatured && <span className="badge badge-fire">Популярное</span>}
          {product.isNew && <span className="badge badge-new">Новинка</span>}
          {product.isSpicy && <span className="badge badge-spicy">🌶 Остро</span>}
        </div>
      </div>

      <div className="product-body">
        <h3 className="product-title">{product.name}</h3>
        {(product.shortDescription || product.composition) && (
          <p className="product-desc">
            {product.shortDescription || product.composition}
          </p>
        )}

        <div className="product-price-row">
          <span className="product-price">{formatKopecks(line.lineTotalKopecks)}</span>
          {isWeighted ? (
            <small>
              {formatKopecks(product.basePriceKopecks)} / {product.baseWeightGrams ?? 100} г
            </small>
          ) : (
            <small>
              {product.sizeLabel
                ? product.sizeLabel
                : product.baseWeightGrams
                  ? formatWeight(product.baseWeightGrams)
                  : product.unitLabel || 'за шт'}
            </small>
          )}
        </div>

        {!product.isAvailable ? (
          <div className="product-unavailable">Нет в наличии</div>
        ) : isWeighted ? (
          <>
            <div className="weight-presets" role="group" aria-label="Выбор веса">
              {presets.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={grams === g ? 'active' : ''}
                  aria-pressed={grams === g}
                  onClick={() => setGramsState(g)}
                >
                  {g} г
                </button>
              ))}
            </div>
            <div className="product-actions">
              <div className="qty" role="group" aria-label="Изменить вес">
                <button
                  type="button"
                  aria-label="Уменьшить вес"
                  disabled={grams <= min}
                  onClick={() => setGramsState((g) => Math.max(min, g - step))}
                >
                  −
                </button>
                <span className="val">{formatWeight(grams)}</span>
                <button
                  type="button"
                  aria-label="Увеличить вес"
                  disabled={grams >= max}
                  onClick={() => setGramsState((g) => Math.min(max, g + step))}
                >
                  +
                </button>
              </div>
              <button type="button" className="btn btn-primary grow" onClick={handleAdd}>
                В корзину
              </button>
            </div>
          </>
        ) : (
          <div className="product-actions">
            <div className="qty" role="group" aria-label="Количество">
              <button
                type="button"
                aria-label="Уменьшить количество"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span className="val">{qty}</span>
              <button
                type="button"
                aria-label="Увеличить количество"
                disabled={qty >= 99}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
              >
                +
              </button>
            </div>
            <button type="button" className="btn btn-primary grow" onClick={handleAdd}>
              В корзину
            </button>
          </div>
        )}

        {hasDetails && (
          <>
            <button
              type="button"
              className="link-more"
              aria-expanded={showDetails}
              aria-controls={detailsId}
              onClick={() => setShowDetails((v) => !v)}
            >
              {showDetails ? 'Скрыть состав' : 'Подробнее о блюде'}
            </button>
            {showDetails && (
              <div id={detailsId} className="text-secondary" style={{ fontSize: '0.88rem' }}>
                {product.composition && (
                  <p style={{ margin: '4px 0' }}>
                    <b>Состав:</b> {product.composition}
                  </p>
                )}
                {product.fullDescription && <p style={{ margin: '4px 0' }}>{product.fullDescription}</p>}
                {product.allergens && (
                  <p className="text-muted" style={{ margin: '4px 0' }}>
                    Аллергены: {product.allergens}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
