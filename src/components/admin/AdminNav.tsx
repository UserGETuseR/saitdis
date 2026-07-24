'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: { href: string; label: string; icon: string }[] = [
  { href: '/admin', label: 'Сводка', icon: '📊' },
  { href: '/admin/orders', label: 'Заказы', icon: '📦' },
  { href: '/admin/menu', label: 'Меню', icon: '🍢' },
  { href: '/admin/categories', label: 'Категории', icon: '🗂️' },
  { href: '/admin/promos', label: 'Акции', icon: '🎉' },
  { href: '/admin/delivery', label: 'Доставка', icon: '🚚' },
  { href: '/admin/settings', label: 'Настройки и контакты', icon: '⚙️' },
  { href: '/admin/integrations', label: 'Интеграции', icon: '🔌' },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="Разделы админки">
      {ITEMS.map((item) => {
        const active =
          item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} className={active ? 'active' : ''}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
