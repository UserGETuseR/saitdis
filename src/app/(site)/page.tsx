import { getMenu } from '@/lib/catalog';
import { getSiteSettings } from '@/lib/settings';
import { prisma } from '@/lib/prisma';
import { formatKopecks } from '@/lib/money';
import { ProductCard } from '@/components/catalog/ProductCard';
import { CategoryNav } from '@/components/catalog/CategoryNav';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [menu, settings] = await Promise.all([getMenu(), getSiteSettings()]);
  const [promos, reviews] = await Promise.all([
    settings.promosEnabled
      ? prisma.promo.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
      : Promise.resolve([]),
    settings.reviewsEnabled
      ? prisma.review.findMany({
          where: { isPublished: true },
          orderBy: { createdAt: 'desc' },
          take: 12,
        })
      : Promise.resolve([]),
  ]);

  const totalPositions = menu.reduce((s, c) => s + c.products.length, 0);
  const freeThreshold = formatKopecks(settings.freeDeliveryThresholdKopecks);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: 'ОГОНЬ ДУШИ',
    servesCuisine: ['Мангал', 'Кавказская', 'Грузинская'],
    telephone: settings.contactPhoneRaw,
    email: settings.contactEmail,
    address: {
      '@type': 'PostalAddress',
      streetAddress: settings.address,
      addressLocality: settings.city,
      addressCountry: 'RU',
    },
    url: process.env.NEXT_PUBLIC_SITE_URL,
    priceRange: '₽₽',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* HERO */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">🔥 Готовим на живом огне</span>
            <h1>
              Блюда на <span className="fire-word">живом огне</span>
              <br />с доставкой по городу {settings.city}
            </h1>
            <p className="lead">
              Шашлык, люля-кебаб, рыба и овощи на мангале. Собираем заказ и отправляем на огонь
              только после подтверждения — чтобы доехало свежим.
            </p>
            <div className="hero-actions">
              <a href="#menu" className="btn btn-primary">
                Смотреть меню
              </a>
              <a href={`tel:${settings.contactPhoneRaw}`} className="btn btn-secondary">
                📞 Позвонить
              </a>
            </div>
            <div className="hero-facts">
              <div className="hero-fact">
                <b>от 300 г</b>
                <span>минимальный заказ</span>
              </div>
              <div className="hero-fact">
                <b>{freeThreshold}</b>
                <span>бесплатная доставка</span>
              </div>
              <div className="hero-fact">
                <b>{totalPositions}</b>
                <span>позиций в меню</span>
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="placeholder-art">
              <span className="flame">🔥</span>
              <span>Фотография блюда появится здесь</span>
            </div>
          </div>
        </div>
      </section>

      {/* DELIVERY SUMMARY */}
      <section className="section-tight" id="delivery">
        <div className="container">
          <div className="summary-grid">
            <div className="summary-card">
              <div className="ico" aria-hidden="true">
                ⚖️
              </div>
              <b>Минимальный заказ — {settings.minimumOrderWeightGrams} г</b>
              <span>Считаем по весу блюд, а не по сумме.</span>
            </div>
            <div className="summary-card">
              <div className="ico" aria-hidden="true">
                🚚
              </div>
              <b>Бесплатно от {freeThreshold}</b>
              <span>
                По установленной зоне. При меньшей сумме стоимость доставки уточнит оператор.
              </span>
            </div>
            <div className="summary-card">
              <div className="ico" aria-hidden="true">
                📍
              </div>
              <b>{settings.city}</b>
              <span>{settings.address}</span>
            </div>
            <div className="summary-card">
              <div className="ico" aria-hidden="true">
                📞
              </div>
              <b>{settings.contactPhoneDisplay}</b>
              <span>{settings.workingHours || 'Принимаем заказы онлайн и по телефону'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* CATEGORY NAV + CATALOG */}
      <CategoryNav categories={menu.map((c) => ({ slug: c.slug, name: c.name }))} />

      <section className="section" id="menu">
        <div className="container">
          <div className="center" style={{ marginBottom: 8 }}>
            <span className="eyebrow">Меню</span>
            <h2>Выбирайте блюда</h2>
            <p className="lead" style={{ margin: '0 auto' }}>
              Весовые блюда считаются за 100 г — выбирайте нужный вес. Порционные и штучные — по
              количеству.
            </p>
          </div>

          {menu.length === 0 ? (
            <div className="empty-state mt-24">Меню временно недоступно. Загляните позже.</div>
          ) : (
            menu.map((cat) => (
              <div key={cat.id} id={`cat-${cat.slug}`} className="category-block">
                <div className="category-head">
                  <h3 style={{ margin: 0 }}>{cat.name}</h3>
                  <span className="count">{cat.products.length} поз.</span>
                </div>
                <div className="product-grid">
                  {cat.products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* PROMO */}
      {promos.length > 0 && (
        <section className="section-tight" id="promo">
          <div className="container">
            <span className="eyebrow">Акции</span>
            <h2>Выгодно</h2>
            <div className="promo-grid mt-16">
              {promos.map((p) => (
                <div key={p.id} className={`promo-card ${p.kind}`}>
                  <h3>{p.title}</h3>
                  {p.body && <p className="text-secondary" style={{ margin: 0 }}>{p.body}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ABOUT */}
      <section className="section" id="about">
        <div className="container about-grid">
          <div>
            <span className="eyebrow">О заведении</span>
            <h2>Честный мангал без спешки</h2>
            <p className="text-secondary">{settings.aboutText}</p>
          </div>
          <ul className="feature-list">
            <li>
              <span className="ico" aria-hidden="true">
                🔥
              </span>
              <div>
                <b>Живой огонь</b>
                <div className="text-secondary">Готовим на углях, а не на электрогриле.</div>
              </div>
            </li>
            <li>
              <span className="ico" aria-hidden="true">
                ✅
              </span>
              <div>
                <b>Собираем под заказ</b>
                <div className="text-secondary">Отправляем на мангал после подтверждения.</div>
              </div>
            </li>
            <li>
              <span className="ico" aria-hidden="true">
                🥩
              </span>
              <div>
                <b>Свежие продукты</b>
                <div className="text-secondary">Мясо, рыба и овощи — без заморозки на витрине.</div>
              </div>
            </li>
            <li>
              <span className="ico" aria-hidden="true">
                📍
              </span>
              <div>
                <b>{settings.city}</b>
                <div className="text-secondary">{settings.address}</div>
              </div>
            </li>
          </ul>
        </div>
      </section>

      {/* REVIEWS */}
      {settings.reviewsEnabled && (
        <section className="section-tight" id="reviews">
          <div className="container">
            <span className="eyebrow">Отзывы</span>
            <h2>Что говорят гости</h2>
            {reviews.length === 0 ? (
              <div className="empty-state mt-16">
                Пока нет опубликованных отзывов. Оставьте свой после заказа.
              </div>
            ) : (
              <div className="promo-grid mt-16">
                {reviews.map((r) => (
                  <div key={r.id} className="promo-card">
                    <div aria-label={`Оценка ${r.rating} из 5`}>
                      {'★'.repeat(r.rating)}
                      {'☆'.repeat(Math.max(0, 5 - r.rating))}
                    </div>
                    <p className="text-secondary" style={{ margin: '8px 0 4px' }}>
                      {r.body}
                    </p>
                    <b>{r.authorName}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* CONTACTS + MAP */}
      <section className="section" id="contacts">
        <div className="container">
          <span className="eyebrow">Контакты и доставка</span>
          <h2>Как нас найти</h2>
          <div className="contact-grid mt-16">
            <ul className="contact-list">
              <li>
                <span className="ico" aria-hidden="true">
                  📍
                </span>
                <div>
                  <b>Адрес</b>
                  <span className="text-secondary">{settings.address}</span>
                </div>
              </li>
              <li>
                <span className="ico" aria-hidden="true">
                  📞
                </span>
                <div>
                  <b>Телефон</b>
                  <a href={`tel:${settings.contactPhoneRaw}`}>{settings.contactPhoneDisplay}</a>
                </div>
              </li>
              <li>
                <span className="ico" aria-hidden="true">
                  ✉️
                </span>
                <div>
                  <b>Почта</b>
                  <a href={`mailto:${settings.contactEmail}`}>{settings.contactEmail}</a>
                </div>
              </li>
              <li>
                <span className="ico" aria-hidden="true">
                  🚚
                </span>
                <div>
                  <b>Зона доставки</b>
                  <span className="text-secondary">{settings.deliveryZoneText}</span>
                </div>
              </li>
              {settings.mapRouteUrl && (
                <li>
                  <span className="ico" aria-hidden="true">
                    🧭
                  </span>
                  <div>
                    <a
                      href={settings.mapRouteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary btn-sm"
                    >
                      Построить маршрут
                    </a>
                  </div>
                </li>
              )}
            </ul>

            {settings.mapEmbedUrl ? (
              <div className="map-frame">
                <iframe
                  src={settings.mapEmbedUrl}
                  title="Карта: расположение заведения"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            ) : (
              <div className="map-frame">
                <div className="placeholder-art">
                  <span className="flame" aria-hidden="true">
                    🗺️
                  </span>
                  <span>Карта появится после подключения 2ГИС</span>
                  <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                    {settings.address}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
