import type { Metadata, Viewport } from 'next';
import './globals.css';
import './components.css';
import { CartProvider } from '@/components/cart/CartProvider';
import { getSiteSettings } from '@/lib/settings';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ОГОНЬ ДУШИ — доставка блюд на мангале по Краснодару',
    template: '%s · ОГОНЬ ДУШИ',
  },
  description:
    'Шашлык, люля-кебаб, рыба и овощи на живом огне с доставкой по Краснодару. Бесплатная доставка от 1500 ₽.',
  applicationName: 'ОГОНЬ ДУШИ',
  keywords: ['шашлык', 'доставка', 'Краснодар', 'мангал', 'люля-кебаб', 'шаурма'],
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: 'ОГОНЬ ДУШИ',
    title: 'ОГОНЬ ДУШИ — доставка блюд на мангале',
    description: 'Блюда на живом огне с доставкой по Краснодару.',
    url: siteUrl,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#100e0c',
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();
  return (
    <html lang="ru">
      <body>
        <CartProvider
          minimumOrderWeightGrams={settings.minimumOrderWeightGrams}
          freeDeliveryThresholdKopecks={settings.freeDeliveryThresholdKopecks}
        >
          {children}
        </CartProvider>
      </body>
    </html>
  );
}
