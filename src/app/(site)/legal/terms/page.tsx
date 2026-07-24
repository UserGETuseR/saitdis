import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/settings';
import { formatKopecks } from '@/lib/money';

export const metadata: Metadata = { title: 'Условия заказа' };

export default async function TermsPage() {
  const s = await getSiteSettings();
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Условия заказа и доставки</h1>
        <div className="warn-banner">
          Черновик. Итоговые условия (зоны, сроки, стоимость доставки) подтверждает владелец.
        </div>
        <h3>Минимальный заказ</h3>
        <p className="text-secondary">
          Минимальный вес заказа — {s.minimumOrderWeightGrams} г.
        </p>
        <h3>Доставка</h3>
        <p className="text-secondary">
          При заказе от {formatKopecks(s.freeDeliveryThresholdKopecks)} доставка по установленной зоне
          бесплатна. При меньшей сумме, а также вне зоны, стоимость доставки уточняет оператор при
          подтверждении заказа.
        </p>
        <h3>Весовые блюда</h3>
        <p className="text-secondary">
          Цена весовых блюд указана за 100 г. Итоговая сумма по фактическому весу может уточняться
          оператором.
        </p>
        <h3>Оплата</h3>
        <p className="text-secondary">
          Доступна оплата при получении и переводом после подтверждения. Онлайн-оплата будет
          доступна после подключения эквайринга.
        </p>
      </div>
    </section>
  );
}
