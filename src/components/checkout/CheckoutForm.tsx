'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/components/cart/CartProvider';
import { formatKopecks, formatWeight } from '@/lib/money';
import { PAYMENT_METHOD_LABELS } from '@/lib/constants';

const FORM_KEY = 'od_checkout_v1';

interface FormState {
  customerName: string;
  phone: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  street: string;
  apartment: string;
  entrance: string;
  floor: string;
  intercom: string;
  timingMode: 'ASAP' | 'SCHEDULED';
  scheduledAt: string;
  comment: string;
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD_ONLINE' | 'SBP';
  consent: boolean;
}

const EMPTY: FormState = {
  customerName: '',
  phone: '',
  fulfillmentType: 'DELIVERY',
  street: '',
  apartment: '',
  entrance: '',
  floor: '',
  intercom: '',
  timingMode: 'ASAP',
  scheduledAt: '',
  comment: '',
  paymentMethod: 'CASH',
  consent: false,
};

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '');
  let d = digits;
  if (d.startsWith('8')) d = '7' + d.slice(1);
  if (!d.startsWith('7')) d = '7' + d;
  d = d.slice(0, 11);
  const rest = d.slice(1);
  let out = '+7';
  if (rest.length > 0) out += ' (' + rest.slice(0, 3);
  if (rest.length >= 3) out += ') ' + rest.slice(3, 6);
  if (rest.length >= 6) out += '-' + rest.slice(6, 8);
  if (rest.length >= 8) out += '-' + rest.slice(8, 10);
  return out;
}

export function CheckoutForm({
  address,
  onlinePaymentEnabled,
}: {
  address: string;
  onlinePaymentEnabled: boolean;
}) {
  const router = useRouter();
  const { items, totalsFor, clear, ready } = useCart();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef<string>('');

  // Восстановление формы и генерация ключа идемпотентности.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_KEY);
      if (raw) setForm({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      /* пусто */
    }
    idempotencyKey.current =
      (globalThis.crypto?.randomUUID?.() ?? String(Date.now() + Math.random()));
    setRestored(true);
  }, []);

  // Сохранение введённых данных.
  useEffect(() => {
    if (!restored) return;
    try {
      const { consent, ...persist } = form;
      void consent;
      localStorage.setItem(FORM_KEY, JSON.stringify(persist));
    } catch {
      /* пусто */
    }
  }, [form, restored]);

  const totals = useMemo(
    () => totalsFor(form.fulfillmentType),
    [totalsFor, form.fulfillmentType],
  );

  const availableItems = items.filter((i) => i.isAvailable);
  const canSubmit =
    availableItems.length > 0 && totals.meetsMinimumWeight && !submitting && form.consent;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => {
      if (!e[key as string]) return e;
      const next = { ...e };
      delete next[key as string];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setFieldErrors({});

    if (!totals.meetsMinimumWeight) {
      setError(`Минимальный вес заказа — ${totals.minimumOrderWeightGrams} г.`);
      return;
    }

    setSubmitting(true);
    try {
      const scheduledIso =
        form.timingMode === 'SCHEDULED' && form.scheduledAt
          ? new Date(form.scheduledAt).toISOString()
          : '';

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          phone: form.phone,
          fulfillmentType: form.fulfillmentType,
          street: form.street,
          apartment: form.apartment,
          entrance: form.entrance,
          floor: form.floor,
          intercom: form.intercom,
          timingMode: form.timingMode,
          scheduledAt: scheduledIso,
          comment: form.comment,
          paymentMethod: form.paymentMethod,
          consent: form.consent,
          idempotencyKey: idempotencyKey.current,
          items: availableItems.map((i) => ({
            productId: i.productId,
            grams: i.grams,
            quantity: i.quantity,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        setError(data.error ?? 'Не удалось оформить заказ');
        setSubmitting(false);
        return;
      }

      // Успех: чистим корзину и форму, переходим на подтверждение.
      localStorage.removeItem(FORM_KEY);
      clear();
      router.push(`/order/${data.number}`);
    } catch {
      setError('Проблема с соединением. Проверьте интернет и попробуйте ещё раз.');
      setSubmitting(false);
    }
  }

  if (!ready) {
    return <div className="panel">Загрузка корзины…</div>;
  }

  if (availableItems.length === 0) {
    return (
      <div className="panel center">
        <div style={{ fontSize: 40 }} aria-hidden="true">
          🛒
        </div>
        <h2>Корзина пуста</h2>
        <p className="text-secondary">Добавьте блюда из меню, чтобы оформить заказ.</p>
        <Link href="/#menu" className="btn btn-primary">
          Перейти в меню
        </Link>
      </div>
    );
  }

  const isDelivery = form.fulfillmentType === 'DELIVERY';

  return (
    <form className="two-col" onSubmit={handleSubmit} noValidate>
      <div>
        {/* Способ получения */}
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Способ получения</h2>
          <div className="seg" role="tablist" aria-label="Способ получения">
            <button
              type="button"
              className={isDelivery ? 'active' : ''}
              aria-pressed={isDelivery}
              onClick={() => update('fulfillmentType', 'DELIVERY')}
            >
              🚚 Доставка
            </button>
            <button
              type="button"
              className={!isDelivery ? 'active' : ''}
              aria-pressed={!isDelivery}
              onClick={() => update('fulfillmentType', 'PICKUP')}
            >
              🏃 Самовывоз
            </button>
          </div>
          {!isDelivery && (
            <p className="text-secondary mt-16" style={{ marginBottom: 0 }}>
              Самовывоз по адресу: <b>{address}</b>
            </p>
          )}
        </div>

        {/* Контакты */}
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Контактные данные</h2>
          <div className="field">
            <label htmlFor="name">Имя *</label>
            <input
              id="name"
              className="input"
              value={form.customerName}
              onChange={(e) => update('customerName', e.target.value)}
              aria-invalid={Boolean(fieldErrors.customerName)}
              aria-describedby={fieldErrors.customerName ? 'name-err' : undefined}
              autoComplete="name"
              required
            />
            {fieldErrors.customerName && (
              <div className="field-error" id="name-err">
                {fieldErrors.customerName}
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="phone">Телефон *</label>
            <input
              id="phone"
              className="input"
              inputMode="tel"
              placeholder="+7 (___) ___-__-__"
              value={form.phone}
              onChange={(e) => update('phone', formatPhoneInput(e.target.value))}
              aria-invalid={Boolean(fieldErrors.phone)}
              aria-describedby={fieldErrors.phone ? 'phone-err' : undefined}
              autoComplete="tel"
              required
            />
            {fieldErrors.phone && (
              <div className="field-error" id="phone-err">
                {fieldErrors.phone}
              </div>
            )}
          </div>
        </div>

        {/* Адрес */}
        {isDelivery && (
          <div className="panel">
            <h2 style={{ marginTop: 0 }}>Адрес доставки</h2>
            <div className="field">
              <label htmlFor="street">Улица и дом *</label>
              <input
                id="street"
                className="input"
                value={form.street}
                onChange={(e) => update('street', e.target.value)}
                aria-invalid={Boolean(fieldErrors.street)}
                aria-describedby={fieldErrors.street ? 'street-err' : undefined}
                autoComplete="street-address"
              />
              {fieldErrors.street && (
                <div className="field-error" id="street-err">
                  {fieldErrors.street}
                </div>
              )}
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="apartment">Квартира</label>
                <input
                  id="apartment"
                  className="input"
                  value={form.apartment}
                  onChange={(e) => update('apartment', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="entrance">Подъезд</label>
                <input
                  id="entrance"
                  className="input"
                  value={form.entrance}
                  onChange={(e) => update('entrance', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="floor">Этаж</label>
                <input
                  id="floor"
                  className="input"
                  value={form.floor}
                  onChange={(e) => update('floor', e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="intercom">Домофон</label>
                <input
                  id="intercom"
                  className="input"
                  value={form.intercom}
                  onChange={(e) => update('intercom', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Время */}
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Время</h2>
          <div className="seg" role="group" aria-label="Время">
            <button
              type="button"
              className={form.timingMode === 'ASAP' ? 'active' : ''}
              aria-pressed={form.timingMode === 'ASAP'}
              onClick={() => update('timingMode', 'ASAP')}
            >
              Как можно скорее
            </button>
            <button
              type="button"
              className={form.timingMode === 'SCHEDULED' ? 'active' : ''}
              aria-pressed={form.timingMode === 'SCHEDULED'}
              onClick={() => update('timingMode', 'SCHEDULED')}
            >
              Ко времени
            </button>
          </div>
          {form.timingMode === 'SCHEDULED' && (
            <div className="field mt-16">
              <label htmlFor="scheduledAt">Дата и время</label>
              <input
                id="scheduledAt"
                type="datetime-local"
                className="input"
                value={form.scheduledAt}
                onChange={(e) => update('scheduledAt', e.target.value)}
                aria-invalid={Boolean(fieldErrors.scheduledAt)}
              />
              {fieldErrors.scheduledAt && (
                <div className="field-error">{fieldErrors.scheduledAt}</div>
              )}
            </div>
          )}
        </div>

        {/* Оплата */}
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Оплата</h2>
          <div className="radio-cards">
            <label className="radio-card">
              <input
                type="radio"
                name="payment"
                checked={form.paymentMethod === 'CASH'}
                onChange={() => update('paymentMethod', 'CASH')}
              />
              <div>
                <b>{PAYMENT_METHOD_LABELS.CASH}</b>
                <div className="text-secondary" style={{ fontSize: '0.88rem' }}>
                  Оплата наличными курьеру или на месте.
                </div>
              </div>
            </label>
            <label className="radio-card">
              <input
                type="radio"
                name="payment"
                checked={form.paymentMethod === 'TRANSFER'}
                onChange={() => update('paymentMethod', 'TRANSFER')}
              />
              <div>
                <b>{PAYMENT_METHOD_LABELS.TRANSFER}</b>
                <div className="text-secondary" style={{ fontSize: '0.88rem' }}>
                  Оператор пришлёт реквизиты после подтверждения.
                </div>
              </div>
            </label>
            {onlinePaymentEnabled ? (
              <>
                <label className="radio-card">
                  <input
                    type="radio"
                    name="payment"
                    checked={form.paymentMethod === 'CARD_ONLINE'}
                    onChange={() => update('paymentMethod', 'CARD_ONLINE')}
                  />
                  <div>
                    <b>{PAYMENT_METHOD_LABELS.CARD_ONLINE}</b>
                  </div>
                </label>
                <label className="radio-card">
                  <input
                    type="radio"
                    name="payment"
                    checked={form.paymentMethod === 'SBP'}
                    onChange={() => update('paymentMethod', 'SBP')}
                  />
                  <div>
                    <b>{PAYMENT_METHOD_LABELS.SBP}</b>
                  </div>
                </label>
              </>
            ) : (
              <div className="notice notice-info">
                Онлайн-оплата картой и СБП появятся после подключения эквайринга.
              </div>
            )}
          </div>
        </div>

        {/* Комментарий */}
        <div className="panel">
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor="comment">Комментарий к заказу</label>
            <textarea
              id="comment"
              className="textarea"
              value={form.comment}
              onChange={(e) => update('comment', e.target.value)}
              placeholder="Пожелания к приготовлению, ориентиры для курьера…"
            />
          </div>
        </div>
      </div>

      {/* Сводка заказа */}
      <div className="summary-sticky">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Ваш заказ</h2>
          <div className="stack">
            {availableItems.map((i) => {
              const line = totals.lines.find((l) => l.productId === i.productId);
              return (
                <div key={i.productId} className="totals-row">
                  <span>
                    {i.name}
                    <br />
                    <small className="text-muted">
                      {i.productType === 'WEIGHTED'
                        ? formatWeight(i.grams ?? 0)
                        : `${i.quantity} ${i.unitLabel || 'шт'}`}
                    </small>
                  </span>
                  <span>{line ? formatKopecks(line.lineTotalKopecks) : ''}</span>
                </div>
              );
            })}
          </div>

          <hr className="divider mt-16" />
          <div className="totals-row mt-16">
            <span>Блюда</span>
            <span>{formatKopecks(totals.itemsSubtotalKopecks)}</span>
          </div>
          <div className="totals-row">
            <span>Вес</span>
            <span>{formatWeight(totals.totalWeightGrams)}</span>
          </div>
          <div className="totals-row">
            <span>Доставка</span>
            <span>
              {totals.deliveryKopecks === 0
                ? 'бесплатно'
                : totals.deliveryKopecks === null
                  ? 'уточнит оператор'
                  : formatKopecks(totals.deliveryKopecks)}
            </span>
          </div>
          <div className="totals-row total">
            <span>Итого</span>
            <span>
              {totals.deliveryKopecks === null
                ? `${formatKopecks(totals.itemsSubtotalKopecks)} + дост.`
                : formatKopecks(totals.totalKopecks)}
            </span>
          </div>

          {!totals.meetsMinimumWeight && (
            <div className="notice notice-warning">
              Минимальный вес — {totals.minimumOrderWeightGrams} г. Сейчас{' '}
              {formatWeight(totals.totalWeightGrams)}.
            </div>
          )}
          {totals.deliveryKopecks === null && form.fulfillmentType === 'DELIVERY' && (
            <div className="notice notice-info">
              Стоимость доставки уточнит оператор после получения заказа.
            </div>
          )}
          {totals.hasNeedsConfirmation && (
            <div className="notice notice-info">
              Итог отдельных позиций подтвердит оператор по фактическому весу.
            </div>
          )}

          <label className="check-row mt-16">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => update('consent', e.target.checked)}
              aria-invalid={Boolean(fieldErrors.consent)}
            />
            <span>
              Я согласен на обработку персональных данных и принимаю{' '}
              <Link href="/legal/terms" target="_blank">
                условия заказа
              </Link>
              .
            </span>
          </label>
          {fieldErrors.consent && <div className="field-error">{fieldErrors.consent}</div>}

          {error && (
            <div className="notice notice-error mt-8" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block mt-16"
            disabled={!canSubmit}
            aria-disabled={!canSubmit}
          >
            {submitting ? 'Оформляем…' : 'Оформить заказ'}
          </button>
          <p className="text-muted center" style={{ fontSize: '0.8rem', marginTop: 10 }}>
            Регистрация не требуется
          </p>
        </div>
      </div>
    </form>
  );
}
