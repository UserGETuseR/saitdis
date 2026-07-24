import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Согласие на обработку данных' };

export default function ConsentPage() {
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Согласие на обработку персональных данных</h1>
        <div className="warn-banner">
          Черновик. Текст необходимо согласовать с владельцем/юристом перед публикацией.
        </div>
        <p className="text-secondary">
          Оформляя заказ, пользователь даёт согласие на обработку указанных им персональных данных
          (имя, телефон, адрес) с целью приёма, подтверждения и доставки заказа. Согласие действует
          до его отзыва пользователем.
        </p>
        <p className="text-secondary">
          Отозвать согласие можно, обратившись по контактам, указанным на сайте.
        </p>
      </div>
    </section>
  );
}
