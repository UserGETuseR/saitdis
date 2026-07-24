'use client';

import { useEffect } from 'react';
import { useCart } from './CartProvider';
import { formatKopecks } from '@/lib/money';

export function MobileCartBar() {
  const { count, totals, open } = useCart();

  // Резервируем место под панель, когда в корзине есть товары.
  useEffect(() => {
    document.body.classList.toggle('has-cart', count > 0);
    return () => document.body.classList.remove('has-cart');
  }, [count]);

  if (count === 0) return null;

  return (
    <button type="button" className="mobile-cart-bar" onClick={open} aria-label="Открыть корзину">
      <span className="info">
        <small>
          {count} {pluralItems(count)}
        </small>
        <b>{formatKopecks(totals.itemsSubtotalKopecks)}</b>
      </span>
      <span className="go">Корзина →</span>
    </button>
  );
}

function pluralItems(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'товар';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'товара';
  return 'товаров';
}
