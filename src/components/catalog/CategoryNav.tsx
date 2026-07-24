'use client';

import { useEffect, useState, useRef } from 'react';

interface NavCat {
  slug: string;
  name: string;
}

export function CategoryNav({ categories }: { categories: NavCat[] }) {
  const [active, setActive] = useState(categories[0]?.slug ?? '');
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          const slug = visible[0].target.id.replace('cat-', '');
          setActive(slug);
        }
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    );

    for (const c of categories) {
      const el = document.getElementById(`cat-${c.slug}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  // Центрируем активную вкладку ВНУТРИ ленты — двигаем только её горизонтальный
  // скролл, не трогая прокрутку страницы (иначе страница «съезжает»).
  useEffect(() => {
    const container = navRef.current;
    const link = container?.querySelector<HTMLElement>(`a[data-slug="${active}"]`);
    if (!container || !link) return;
    const target = link.offsetLeft - container.clientWidth / 2 + link.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [active]);

  return (
    <nav className="catnav" aria-label="Категории меню">
      <div className="container">
        <div className="catnav-scroll" ref={navRef}>
          {categories.map((c) => (
            <a
              key={c.slug}
              href={`#cat-${c.slug}`}
              data-slug={c.slug}
              className={active === c.slug ? 'active' : ''}
              aria-current={active === c.slug ? 'true' : undefined}
            >
              {c.name}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
