// Допустимые значения строковых «enum»-полей (SQLite не поддерживает enum).
// Эти списки — единственный источник правды; Zod-схемы ссылаются на них.

export const PRODUCT_TYPES = [
  'WEIGHTED',
  'FIXED_PORTION',
  'UNIT',
  'SIZE_VARIANT',
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const ORDER_STATUSES = [
  'NEW',
  'CONFIRMED',
  'COOKING',
  'READY',
  'COURIER',
  'COMPLETED',
  'CANCELLED',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Новый',
  CONFIRMED: 'Подтверждён',
  COOKING: 'Готовится',
  READY: 'Готов',
  COURIER: 'У курьера',
  COMPLETED: 'Выполнен',
  CANCELLED: 'Отменён',
};

export const FULFILLMENT_TYPES = ['DELIVERY', 'PICKUP'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CARD_ONLINE', 'SBP'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Наличными при получении',
  TRANSFER: 'Переводом после подтверждения',
  CARD_ONLINE: 'Картой онлайн',
  SBP: 'СБП',
};

export const PAYMENT_STATUSES = [
  'NOT_REQUIRED',
  'PENDING',
  'WAITING_FOR_CONFIRMATION',
  'PAID',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Способ расчёта доставки для конкретного заказа.
export const DELIVERY_CALCS = ['FREE', 'OPERATOR_CONFIRMATION', 'FIXED'] as const;
export type DeliveryCalc = (typeof DELIVERY_CALCS)[number];

export const NOTIFICATION_STATUSES = ['PENDING', 'SENT', 'FAILED', 'SKIPPED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const PROMO_KINDS = [
  'info',
  'free_delivery',
  'discount',
  'seasonal',
  'set',
] as const;
export type PromoKind = (typeof PROMO_KINDS)[number];

// Заказ можно перевести только по осмысленным переходам статуса.
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  NEW: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COOKING', 'CANCELLED'],
  COOKING: ['READY', 'CANCELLED'],
  READY: ['COURIER', 'COMPLETED', 'CANCELLED'],
  COURIER: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
