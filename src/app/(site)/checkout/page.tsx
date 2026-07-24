import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { getSiteSettings } from '@/lib/settings';
import { isOnlinePaymentEnabled } from '@/lib/payments';

export const metadata: Metadata = {
  title: 'Оформление заказа',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const settings = await getSiteSettings();
  return (
    <section className="section-tight">
      <div className="container">
        <nav aria-label="Хлебные крошки" style={{ marginBottom: 12 }}>
          <Link href="/#menu" className="text-muted" style={{ fontSize: '0.9rem' }}>
            ← Вернуться в меню
          </Link>
        </nav>
        <h1 style={{ marginBottom: 24 }}>Оформление заказа</h1>
        <CheckoutForm
          address={settings.address}
          onlinePaymentEnabled={isOnlinePaymentEnabled()}
        />
      </div>
    </section>
  );
}
