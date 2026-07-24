'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart, type CartItem } from './CartProvider';
import { formatKopecks, formatWeight } from '@/lib/money';
import { priceLine } from '@/lib/pricing';

export function CartDrawer() {
  const { isOpen, close, items, totals, remove } = useCart();
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement;
    const node = drawerRef.current;
    // фокус на первый интерактивный элемент
    const focusables = node?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusables?.[0]?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        close();
        return;
      }
      if (e.key === 'Tab' && node) {
        const list = node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = list[0];
        const last = list[list.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus({ preventScroll: true });
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  const hasItems = items.length > 0;
  const belowMin = hasItems && totals.availableCount > 0 && !totals.meetsMinimumWeight;
  const canCheckout = totals.availableCount > 0 && totals.meetsMinimumWeight;

  return (
    <>
      <div className="drawer-overlay" onClick={close} aria-hidden="true" />
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Корзина"
        ref={drawerRef}
      >
        <div className="drawer-head">
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Корзина</h2>
          <button type="button" className="icon-btn" aria-label="Закрыть корзину" onClick={close}>
            ✕
          </button>
        </div>

        <div className="drawer-body" aria-live="polite">
          {!hasItems && (
            <div className="empty-state" style={{ marginTop: 24 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden="true">
                🛒
              </div>
              <p style={{ margin: 0 }}>Корзина пуста</p>
              <p className="text-muted" style={{ fontSize: '0.88rem' }}>
                Добавьте блюда из меню
              </p>
            </div>
          )}

          {items.map((item) => (
            <CartLineRow key={item.productId} item={item} onRemove={() => remove(item.productId)} />
          ))}

          {totals.hasUnavailable && (
            <div className="notice notice-warning">
              Некоторые товары стали недоступны и не учитываются в сумме. Удалите их или замените.
            </div>
          )}
          {belowMin && (
            <div className="notice notice-warning">
              Минимальный вес заказа — {totals.minimumOrderWeightGrams} г. Сейчас{' '}
              {formatWeight(totals.totalWeightGrams)}. Добавьте ещё блюда.
            </div>
          )}
          {totals.hasNeedsConfirmation && (
            <div className="notice notice-info">
              Итоговую стоимость отдельных позиций подтвердит оператор.
            </div>
          )}
        </div>

        {hasItems && (
          <div className="drawer-foot">
            <div className="totals-row">
              <span>Блюда</span>
              <span>{formatKopecks(totals.itemsSubtotalKopecks)}</span>
            </div>
            <div className="totals-row">
              <span>Доставка</span>
              <span>
                {totals.deliveryKopecks === 0
                  ? 'бесплатно'
                  : totals.deliveryKopecks === null
                    ? 'уточнит оператор'
                    : formatKopecks(totals.deliveryKopecks)}
              </span>
            </div>
            {totals.amountToFreeDeliveryKopecks > 0 && (
              <div className="notice notice-info" style={{ marginTop: 8 }}>
                До бесплатной доставки: {formatKopecks(totals.amountToFreeDeliveryKopecks)}
              </div>
            )}
            <div className="totals-row total">
              <span>Итого</span>
              <span>
                {totals.deliveryKopecks === null
                  ? `${formatKopecks(totals.itemsSubtotalKopecks)} + доставка`
                  : formatKopecks(totals.totalKopecks)}
              </span>
            </div>
            <Link
              href="/checkout"
              className="btn btn-primary btn-block mt-16"
              aria-disabled={!canCheckout}
              onClick={(e) => {
                if (!canCheckout) e.preventDefault();
                else close();
              }}
            >
              Оформить заказ
            </Link>
            <button type="button" className="btn btn-ghost btn-block mt-8" onClick={close}>
              Продолжить выбор
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function CartLineRow({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  const { setGrams, setQuantity } = useCart();
  const line = priceLine({
    product: {
      id: item.productId,
      name: item.name,
      productType: item.productType,
      basePriceKopecks: item.basePriceKopecks,
      baseWeightGrams: item.baseWeightGrams,
      weightStepGrams: item.weightStepGrams,
      minWeightGrams: item.minWeightGrams,
      maxWeightGrams: item.maxWeightGrams,
      unitLabel: item.unitLabel,
      isAvailable: item.isAvailable,
      needsConfirmation: item.needsConfirmation,
    },
    grams: item.grams,
    quantity: item.quantity,
  });

  const step = item.weightStepGrams ?? 100;
  const isWeighted = item.productType === 'WEIGHTED';

  return (
    <div className="cart-line" style={{ opacity: item.isAvailable ? 1 : 0.55 }}>
      <div className="cart-line-media" aria-hidden="true">
        {item.imageUrl ? <img src={item.imageUrl} alt="" /> : '🔥'}
      </div>
      <div className="cart-line-info">
        <div className="name">{item.name}</div>
        <div className="meta">
          {isWeighted
            ? `${formatKopecks(item.basePriceKopecks)} / ${item.baseWeightGrams ?? 100} г`
            : formatKopecks(item.basePriceKopecks)}
          {!item.isAvailable && ' · нет в наличии'}
          {item.priceChanged && item.isAvailable && ' · цена обновилась'}
        </div>

        <div className="cart-line-controls">
          {isWeighted ? (
            <div className="qty" role="group" aria-label={`Вес: ${item.name}`}>
              <button
                type="button"
                aria-label="Уменьшить вес"
                disabled={(item.grams ?? 0) <= (item.minWeightGrams ?? step)}
                onClick={() => setGrams(item.productId, (item.grams ?? step) - step)}
              >
                −
              </button>
              <span className="val">{formatWeight(item.grams ?? step)}</span>
              <button
                type="button"
                aria-label="Увеличить вес"
                disabled={(item.grams ?? 0) >= (item.maxWeightGrams ?? 500)}
                onClick={() => setGrams(item.productId, (item.grams ?? step) + step)}
              >
                +
              </button>
            </div>
          ) : (
            <div className="qty" role="group" aria-label={`Количество: ${item.name}`}>
              <button
                type="button"
                aria-label="Уменьшить количество"
                disabled={item.quantity <= 1}
                onClick={() => setQuantity(item.productId, item.quantity - 1)}
              >
                −
              </button>
              <span className="val">{item.quantity}</span>
              <button
                type="button"
                aria-label="Увеличить количество"
                disabled={item.quantity >= 99}
                onClick={() => setQuantity(item.productId, item.quantity + 1)}
              >
                +
              </button>
            </div>
          )}
          <strong>{formatKopecks(line.lineTotalKopecks)}</strong>
        </div>

        <button type="button" className="remove-btn mt-8" onClick={onRemove}>
          Удалить
        </button>
      </div>
    </div>
  );
}
