'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';
import { formatKopecks } from '@/lib/money';

interface NavCategory {
  slug: string;
  name: string;
}

export function Header({
  phoneDisplay,
  phoneRaw,
  workingHours,
  categories,
}: {
  phoneDisplay: string;
  phoneRaw: string;
  workingHours: string;
  categories: NavCategory[];
}) {
  const { count, totals, open } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  // Блокируем прокрутку body под открытым мобильным меню и закрываем по Escape.
  useEffect(() => {
    if (!menuOpen) return;
    document.body.style.overflow = 'hidden';
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      burgerRef.current?.focus({ preventScroll: true });
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const mobileMenu = (
    <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Меню">
      <div className="mobile-menu-head">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            🔥
          </span>
          <span className="brand-name">
            ОГОНЬ <span>ДУШИ</span>
          </span>
        </span>
        <button type="button" className="icon-btn" aria-label="Закрыть меню" onClick={closeMenu}>
          ✕
        </button>
      </div>
      <nav aria-label="Мобильная навигация">
        <Link href="/#menu" onClick={closeMenu}>
          Меню
        </Link>
        {categories.map((c) => (
          <Link key={c.slug} href={`/#cat-${c.slug}`} onClick={closeMenu}>
            {c.name}
          </Link>
        ))}
        <Link href="/#delivery" onClick={closeMenu}>
          Доставка
        </Link>
        <Link href="/#about" onClick={closeMenu}>
          О нас
        </Link>
        <Link href="/#contacts" onClick={closeMenu}>
          Контакты
        </Link>
      </nav>
      <a className="btn btn-primary btn-block mobile-menu-cta" href={`tel:${phoneRaw}`}>
        Позвонить {phoneDisplay}
      </a>
    </div>
  );

  return (
    <header className="site-header">
      <div className="container">
        <Link href="/" className="brand" aria-label="ОГОНЬ ДУШИ — на главную">
          <span className="brand-mark" aria-hidden="true">
            🔥
          </span>
          <span className="brand-name">
            ОГОНЬ <span>ДУШИ</span>
          </span>
        </Link>

        <nav className="nav-desktop" aria-label="Основная навигация">
          <Link href="/#menu">Меню</Link>
          <Link href="/#delivery">Доставка</Link>
          <Link href="/#about">О нас</Link>
          <Link href="/#contacts">Контакты</Link>
        </nav>

        <div className="header-right">
          <span className="status-dot" title={workingHours || 'Приём заказов онлайн'}>
            {workingHours ? workingHours : 'Принимаем заказы'}
          </span>
          <a className="header-phone" href={`tel:${phoneRaw}`}>
            {phoneDisplay}
            <small>Заказ по телефону</small>
          </a>
          <button
            type="button"
            className="cart-button"
            onClick={open}
            aria-label={`Корзина, товаров: ${count}, сумма ${formatKopecks(
              totals.itemsSubtotalKopecks,
            )}`}
          >
            <span aria-hidden="true">🛒</span>
            <span className="cart-sum">{formatKopecks(totals.itemsSubtotalKopecks)}</span>
            {count > 0 && <span className="count">{count}</span>}
          </button>
          <button
            type="button"
            className="burger"
            ref={burgerRef}
            aria-label="Открыть меню"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Мобильное меню рендерим порталом в <body>, чтобы оно не попадало в
          контекст наложения sticky-хедера (backdrop-filter ломает position:fixed). */}
      {mounted && menuOpen && createPortal(mobileMenu, document.body)}
    </header>
  );
}
