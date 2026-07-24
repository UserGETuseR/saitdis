import { cache } from 'react';
import { prisma } from './prisma';

// Ключи и значения по умолчанию. Всё, что здесь, редактируется в админ-панели
// (раздел «Настройки» / «Контакты» / «Доставка»). Значения хранятся строками.

export const SETTING_DEFAULTS = {
  MINIMUM_ORDER_WEIGHT_GRAMS: '300',
  FREE_DELIVERY_THRESHOLD_KOPECKS: '150000', // 1500 ₽
  CONTACT_PHONE_DISPLAY: '+7 909 447-87-84',
  CONTACT_PHONE_RAW: '+79094478784',
  CONTACT_EMAIL: 'OgonDushi13@yandex.ru',
  ADDRESS: 'г. Краснодар, ул. Кирилла Россинского, д. 65',
  CITY: 'Краснодар',
  // Часы работы НЕ выдумываем: пусто => блок скрыт до подтверждения владельцем.
  WORKING_HOURS: '',
  DELIVERY_ZONE_TEXT: 'Доставка по Краснодару. Точные границы зоны уточняются у оператора.',
  REVIEWS_ENABLED: 'false',
  PROMOS_ENABLED: 'true',
  MAP_EMBED_URL: '',
  MAP_ROUTE_URL: 'https://2gis.ru/krasnodar/search/Кирилла%20Россинского%2065',
  OWNER_DETAILS: '',
  SOCIAL_LINKS: '[]', // JSON: [{ "label": "...", "url": "..." }]
  ABOUT_TEXT:
    'Готовим на живом огне. Мясо и овощи отправляются на мангал только после подтверждения заказа, поэтому блюда доезжают свежими. Работаем в Краснодаре, на улице Кирилла Россинского.',
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export interface SiteSettings {
  minimumOrderWeightGrams: number;
  freeDeliveryThresholdKopecks: number;
  contactPhoneDisplay: string;
  contactPhoneRaw: string;
  contactEmail: string;
  address: string;
  city: string;
  workingHours: string;
  deliveryZoneText: string;
  reviewsEnabled: boolean;
  promosEnabled: boolean;
  mapEmbedUrl: string;
  mapRouteUrl: string;
  ownerDetails: string;
  socialLinks: { label: string; url: string }[];
  aboutText: string;
}

function toInt(value: string, fallback: number): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseSocial(value: string): { label: string; url: string }[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x) => x && typeof x.label === 'string' && typeof x.url === 'string',
      );
    }
  } catch {
    // игнорируем некорректный JSON
  }
  return [];
}

/** Читает все настройки из БД, накладывая их поверх значений по умолчанию. */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = (key: SettingKey): string => map.get(key) ?? SETTING_DEFAULTS[key];

  return {
    minimumOrderWeightGrams: toInt(get('MINIMUM_ORDER_WEIGHT_GRAMS'), 300),
    freeDeliveryThresholdKopecks: toInt(get('FREE_DELIVERY_THRESHOLD_KOPECKS'), 150000),
    contactPhoneDisplay: get('CONTACT_PHONE_DISPLAY'),
    contactPhoneRaw: get('CONTACT_PHONE_RAW'),
    contactEmail: get('CONTACT_EMAIL'),
    address: get('ADDRESS'),
    city: get('CITY'),
    workingHours: get('WORKING_HOURS'),
    deliveryZoneText: get('DELIVERY_ZONE_TEXT'),
    reviewsEnabled: get('REVIEWS_ENABLED') === 'true',
    promosEnabled: get('PROMOS_ENABLED') === 'true',
    mapEmbedUrl: get('MAP_EMBED_URL') || process.env.NEXT_PUBLIC_MAP_EMBED_URL || '',
    mapRouteUrl: get('MAP_ROUTE_URL') || process.env.NEXT_PUBLIC_MAP_ROUTE_URL || '',
    ownerDetails: get('OWNER_DETAILS'),
    socialLinks: parseSocial(get('SOCIAL_LINKS')),
    aboutText: get('ABOUT_TEXT'),
  };
});

/** Возвращает правила доставки для расчёта корзины. */
export async function getDeliveryRules() {
  const s = await getSiteSettings();
  return {
    minimumOrderWeightGrams: s.minimumOrderWeightGrams,
    freeDeliveryThresholdKopecks: s.freeDeliveryThresholdKopecks,
  };
}

/** Обновляет одну настройку (upsert). Используется в админке. */
export async function setSetting(key: SettingKey, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}
