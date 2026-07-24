import Link from 'next/link';
import type { SiteSettings } from '@/lib/settings';

export function Footer({ settings }: { settings: SiteSettings }) {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer" id="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <span className="brand">
              <span className="brand-mark" aria-hidden="true">
                🔥
              </span>
              <span className="brand-name">
                ОГОНЬ <span>ДУШИ</span>
              </span>
            </span>
            <p className="text-secondary mt-16" style={{ maxWidth: '32ch' }}>
              Блюда на живом огне с доставкой по {settings.city ? 'городу' : 'району'}. Готовим после
              подтверждения заказа.
            </p>
            {settings.ownerDetails && (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>
                {settings.ownerDetails}
              </p>
            )}
            {settings.socialLinks.length > 0 && (
              <div className="row gap-12 mt-8 wrap">
                {settings.socialLinks.map((s) => (
                  <a
                    key={s.url}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost btn-sm"
                  >
                    {s.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4>Навигация</h4>
            <Link href="/#menu">Меню</Link>
            <Link href="/#delivery">Доставка</Link>
            <Link href="/#about">О нас</Link>
            <Link href="/#contacts">Контакты</Link>
          </div>

          <div>
            <h4>Контакты</h4>
            <a href={`tel:${settings.contactPhoneRaw}`}>{settings.contactPhoneDisplay}</a>
            <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
            <span className="text-secondary" style={{ display: 'block', padding: '4px 0' }}>
              {settings.address}
            </span>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {year} ОГОНЬ ДУШИ. Все права защищены.</span>
          <span className="row gap-16 wrap">
            <Link href="/legal/privacy">Политика конфиденциальности</Link>
            <Link href="/legal/consent">Согласие на обработку данных</Link>
            <Link href="/legal/terms">Условия заказа</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
