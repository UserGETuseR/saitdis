import { isTelegramConfigured } from '@/lib/notify/telegram';
import { isEmailConfigured } from '@/lib/notify/email';
import { isOnlinePaymentEnabled } from '@/lib/payments';
import { getSiteSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

function StatusRow({
  title,
  ok,
  okText,
  offText,
  hint,
}: {
  title: string;
  ok: boolean;
  okText: string;
  offText: string;
  hint: string;
}) {
  return (
    <div className="panel">
      <div className="row" style={{ justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h3 style={{ margin: '0 0 4px' }}>{title}</h3>
          <p className="text-secondary" style={{ margin: 0, fontSize: '0.9rem' }}>
            {hint}
          </p>
        </div>
        <span
          className="status-pill"
          style={{
            background: ok ? 'rgba(79,174,116,0.16)' : 'rgba(140,128,114,0.16)',
            color: ok ? '#7fd6a3' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          {ok ? okText : offText}
        </span>
      </div>
    </div>
  );
}

export default async function IntegrationsPage() {
  const settings = await getSiteSettings();

  return (
    <>
      <div className="admin-topbar">
        <h1 style={{ margin: 0 }}>Интеграции</h1>
      </div>

      <p className="text-secondary">
        Ключи задаются через переменные окружения (.env) и не хранятся в базе. Здесь показан только
        статус подключения.
      </p>

      <StatusRow
        title="Telegram-уведомления"
        ok={isTelegramConfigured()}
        okText="Подключено"
        offText="Не настроено"
        hint="TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID. При ошибке заказ всё равно сохраняется."
      />
      <StatusRow
        title="Email-уведомления"
        ok={isEmailConfigured()}
        okText="Подключено"
        offText="Не настроено"
        hint="SMTP_HOST, SMTP_FROM, ORDER_NOTIFY_EMAIL (+ пакет nodemailer)."
      />
      <StatusRow
        title="Онлайн-оплата (эквайринг)"
        ok={isOnlinePaymentEnabled()}
        okText="Подключено"
        offText="Выключено"
        hint="PAYMENT_PROVIDER + merchant credentials + webhook secret. Требует договора и тестов."
      />
      <StatusRow
        title="Карта (2ГИС/встраивание)"
        ok={Boolean(settings.mapEmbedUrl)}
        okText="Карта задана"
        offText="Только адрес и маршрут"
        hint="URL встраиваемой карты задаётся в Настройках. Без него показываются адрес и кнопка маршрута."
      />
    </>
  );
}
