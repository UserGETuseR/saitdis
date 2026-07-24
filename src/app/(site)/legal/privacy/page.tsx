import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/settings';

export const metadata: Metadata = { title: 'Политика конфиденциальности' };

export default async function PrivacyPage() {
  const s = await getSiteSettings();
  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <h1>Политика конфиденциальности</h1>
        <div className="warn-banner">
          Черновик. Текст необходимо согласовать с владельцем/юристом перед публикацией.
        </div>
        <p className="text-secondary">
          Настоящая политика описывает, как обрабатываются персональные данные посетителей сайта
          «ОГОНЬ ДУШИ» при оформлении заказа доставки.
        </p>
        <h3>Какие данные мы собираем</h3>
        <p className="text-secondary">
          Имя, номер телефона и адрес доставки — только для приёма и выполнения заказа. Данные
          банковских карт на сайте не хранятся.
        </p>
        <h3>Как используются данные</h3>
        <p className="text-secondary">
          Для связи по заказу, доставки и уточнения деталей. Мы не передаём данные третьим лицам,
          кроме случаев, необходимых для выполнения заказа.
        </p>
        <h3>Контакты</h3>
        <p className="text-secondary">
          По вопросам обработки данных: {s.contactEmail}, {s.contactPhoneDisplay}, {s.address}.
        </p>
      </div>
    </section>
  );
}
