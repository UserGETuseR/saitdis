'use client';

import { useActionState } from 'react';
import { saveSettingsAction, type ActionState } from '@/app/admin/actions';
import type { SiteSettings } from '@/lib/settings';

export function SettingsForm({ settings }: { settings: SiteSettings }) {
  const [state, formAction, pending] = useActionState<ActionState | null, FormData>(
    saveSettingsAction,
    null,
  );

  return (
    <form action={formAction}>
      {state?.ok && (
        <div className="notice notice-success" role="status">
          Сохранено.
        </div>
      )}
      {state?.error && (
        <div className="notice notice-error" role="alert">
          {state.error}
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Контакты</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="contactPhoneDisplay">Телефон (отображаемый)</label>
            <input
              id="contactPhoneDisplay"
              name="contactPhoneDisplay"
              className="input"
              defaultValue={settings.contactPhoneDisplay}
            />
          </div>
          <div className="field">
            <label htmlFor="contactPhoneRaw">Телефон для звонка (+7…)</label>
            <input
              id="contactPhoneRaw"
              name="contactPhoneRaw"
              className="input"
              defaultValue={settings.contactPhoneRaw}
            />
          </div>
          <div className="field">
            <label htmlFor="contactEmail">Email</label>
            <input
              id="contactEmail"
              name="contactEmail"
              className="input"
              defaultValue={settings.contactEmail}
            />
          </div>
          <div className="field">
            <label htmlFor="city">Город</label>
            <input id="city" name="city" className="input" defaultValue={settings.city} />
          </div>
          <div className="field">
            <label htmlFor="address">Адрес</label>
            <input id="address" name="address" className="input" defaultValue={settings.address} />
          </div>
          <div className="field">
            <label htmlFor="workingHours">Часы работы (пусто = не показывать)</label>
            <input
              id="workingHours"
              name="workingHours"
              className="input"
              placeholder="напр. Ежедневно 10:00–22:00"
              defaultValue={settings.workingHours}
            />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Доставка</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="minimumOrderWeightGrams">Мин. вес заказа, г</label>
            <input
              id="minimumOrderWeightGrams"
              name="minimumOrderWeightGrams"
              type="number"
              className="input"
              defaultValue={settings.minimumOrderWeightGrams}
            />
          </div>
          <div className="field">
            <label htmlFor="freeDeliveryThresholdRubles">Бесплатная доставка от, ₽</label>
            <input
              id="freeDeliveryThresholdRubles"
              name="freeDeliveryThresholdRubles"
              type="number"
              className="input"
              defaultValue={Math.round(settings.freeDeliveryThresholdKopecks / 100)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="deliveryZoneText">Описание зоны доставки</label>
          <input
            id="deliveryZoneText"
            name="deliveryZoneText"
            className="input"
            defaultValue={settings.deliveryZoneText}
          />
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>О заведении и карта</h2>
        <div className="field">
          <label htmlFor="aboutText">Текст «О нас»</label>
          <textarea
            id="aboutText"
            name="aboutText"
            className="textarea"
            defaultValue={settings.aboutText}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="mapEmbedUrl">URL встраиваемой карты (2ГИС/Яндекс)</label>
            <input
              id="mapEmbedUrl"
              name="mapEmbedUrl"
              className="input"
              placeholder="https://…"
              defaultValue={settings.mapEmbedUrl}
            />
          </div>
          <div className="field">
            <label htmlFor="mapRouteUrl">URL для построения маршрута</label>
            <input
              id="mapRouteUrl"
              name="mapRouteUrl"
              className="input"
              defaultValue={settings.mapRouteUrl}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ownerDetails">Реквизиты владельца (для футера)</label>
          <input
            id="ownerDetails"
            name="ownerDetails"
            className="input"
            defaultValue={settings.ownerDetails}
          />
        </div>
        <div className="field">
          <label htmlFor="socialLinks">Соцсети (по строке «Название|ссылка»)</label>
          <textarea
            id="socialLinks"
            name="socialLinks"
            className="textarea"
            placeholder={'Instagram|https://…\nВКонтакте|https://…'}
            defaultValue={settings.socialLinks.map((s) => `${s.label}|${s.url}`).join('\n')}
          />
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Разделы сайта</h2>
        <label className="check-row">
          <input type="checkbox" name="promosEnabled" defaultChecked={settings.promosEnabled} />
          Показывать блок акций
        </label>
        <label className="check-row mt-8">
          <input type="checkbox" name="reviewsEnabled" defaultChecked={settings.reviewsEnabled} />
          Показывать блок отзывов
        </label>
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Сохранение…' : 'Сохранить настройки'}
      </button>
    </form>
  );
}
