import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section">
      <div className="container center" style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 56 }} aria-hidden="true">
          🔥
        </div>
        <h1>Страница не найдена</h1>
        <p className="text-secondary">
          Возможно, ссылка устарела. Вернитесь на главную и выберите блюда из меню.
        </p>
        <Link href="/" className="btn btn-primary">
          На главную
        </Link>
      </div>
    </section>
  );
}
