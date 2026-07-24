// Расчёт стоимости корзины. Чистые функции без обращения к БД — их вызывает
// и клиент (для отображения), и сервер (как единственный источник цены).
// Все суммы — в копейках, веса — в граммах.

import type { ProductType } from './constants';

export interface PricingProduct {
  id: string;
  name: string;
  productType: ProductType;
  basePriceKopecks: number;
  baseWeightGrams: number | null;
  weightStepGrams: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  unitLabel: string | null;
  isAvailable: boolean;
  needsConfirmation: boolean;
}

export interface CartLineInput {
  product: PricingProduct;
  /** Выбранный вес в граммах — только для WEIGHTED. */
  grams?: number | null;
  /** Количество порций/штук — для FIXED_PORTION | UNIT | SIZE_VARIANT (и как множитель). */
  quantity: number;
}

export interface PricedLine {
  productId: string;
  name: string;
  productType: ProductType;
  unitLabel: string | null;
  grams: number | null;
  quantity: number;
  unitPriceKopecks: number;
  lineTotalKopecks: number;
  /** Вклад позиции в общий вес заказа (граммы). */
  weightGrams: number;
  needsConfirmation: boolean;
  available: boolean;
  issues: string[];
}

const DEFAULT_STEP = 100;
const DEFAULT_MIN_WEIGHT = 100;

function normalizeQuantity(quantity: number): number {
  if (!Number.isFinite(quantity)) return 1;
  const q = Math.floor(quantity);
  return Math.min(Math.max(q, 1), 99);
}

/**
 * Нормализует выбранный вес весового товара: приводит к шагу, применяет
 * границы min/max. Возвращает валидное значение грамм.
 */
export function normalizeGrams(product: PricingProduct, grams: number | null | undefined): number {
  const step = product.weightStepGrams ?? DEFAULT_STEP;
  const min = product.minWeightGrams ?? Math.max(step, DEFAULT_MIN_WEIGHT);
  const max = product.maxWeightGrams ?? min + step * 9;
  const requested = Number.isFinite(grams) && grams ? grams : min;
  // округляем к ближайшему шагу
  const snapped = Math.round(requested / step) * step;
  return Math.min(Math.max(snapped, min), max);
}

/** Считает одну позицию корзины. */
export function priceLine(input: CartLineInput): PricedLine {
  const { product } = input;
  const quantity = normalizeQuantity(input.quantity);
  const issues: string[] = [];

  let grams: number | null = null;
  let unitPriceKopecks = product.basePriceKopecks;
  let lineTotalKopecks: number;
  let weightGrams = 0;

  if (product.productType === 'WEIGHTED') {
    const base = product.baseWeightGrams ?? DEFAULT_STEP;
    grams = normalizeGrams(product, input.grams);
    // цена за base грамм -> цена за grams грамм
    const perSelection = Math.round((product.basePriceKopecks * grams) / base);
    lineTotalKopecks = perSelection * quantity;
    weightGrams = grams * quantity;
  } else {
    // FIXED_PORTION | UNIT | SIZE_VARIANT — цена за единицу × количество
    lineTotalKopecks = product.basePriceKopecks * quantity;
    weightGrams = (product.baseWeightGrams ?? 0) * quantity;
  }

  if (!product.isAvailable) {
    issues.push('Товар временно недоступен');
  }

  return {
    productId: product.id,
    name: product.name,
    productType: product.productType,
    unitLabel: product.unitLabel,
    grams,
    quantity,
    unitPriceKopecks,
    lineTotalKopecks,
    weightGrams,
    needsConfirmation: product.needsConfirmation,
    available: product.isAvailable,
    issues,
  };
}

export interface DeliveryRules {
  minimumOrderWeightGrams: number;
  freeDeliveryThresholdKopecks: number;
  /** Способ получения влияет на расчёт: самовывоз => доставка не считается. */
  fulfillmentType?: 'DELIVERY' | 'PICKUP';
}

export interface CartTotals {
  lines: PricedLine[];
  itemsSubtotalKopecks: number;
  totalWeightGrams: number;
  availableCount: number;
  hasUnavailable: boolean;
  hasNeedsConfirmation: boolean;
  minimumOrderWeightGrams: number;
  meetsMinimumWeight: boolean;
  /** Итоговая стоимость доставки: number (копейки) или null, если уточняет оператор. */
  deliveryKopecks: number | null;
  deliveryCalc: 'FREE' | 'OPERATOR_CONFIRMATION' | 'FIXED';
  freeDeliveryThresholdKopecks: number;
  /** Сколько не хватает до бесплатной доставки (копейки), либо 0. */
  amountToFreeDeliveryKopecks: number;
  /** Итог: подытог + доставка (если известна). Если доставка неизвестна — равен подытогу. */
  totalKopecks: number;
}

/**
 * Считает корзину целиком: подытог, вес, проверку минимального веса и правило
 * доставки. Только доступные позиции формируют подытог и вес.
 */
export function priceCart(inputs: CartLineInput[], rules: DeliveryRules): CartTotals {
  const lines = inputs.map(priceLine);
  const availableLines = lines.filter((l) => l.available);

  const itemsSubtotalKopecks = availableLines.reduce((s, l) => s + l.lineTotalKopecks, 0);
  const totalWeightGrams = availableLines.reduce((s, l) => s + l.weightGrams, 0);

  const meetsMinimumWeight =
    availableLines.length === 0 ? false : totalWeightGrams >= rules.minimumOrderWeightGrams;

  const isPickup = rules.fulfillmentType === 'PICKUP';

  let deliveryKopecks: number | null;
  let deliveryCalc: CartTotals['deliveryCalc'];

  if (isPickup) {
    deliveryKopecks = 0;
    deliveryCalc = 'FREE';
  } else if (
    availableLines.length > 0 &&
    itemsSubtotalKopecks >= rules.freeDeliveryThresholdKopecks
  ) {
    deliveryKopecks = 0;
    deliveryCalc = 'FREE';
  } else {
    // Ниже порога или пустая корзина — стоимость уточняет оператор.
    deliveryKopecks = null;
    deliveryCalc = 'OPERATOR_CONFIRMATION';
  }

  const amountToFreeDeliveryKopecks =
    !isPickup && itemsSubtotalKopecks < rules.freeDeliveryThresholdKopecks
      ? rules.freeDeliveryThresholdKopecks - itemsSubtotalKopecks
      : 0;

  const totalKopecks = itemsSubtotalKopecks + (deliveryKopecks ?? 0);

  return {
    lines,
    itemsSubtotalKopecks,
    totalWeightGrams,
    availableCount: availableLines.length,
    hasUnavailable: lines.some((l) => !l.available),
    hasNeedsConfirmation: availableLines.some((l) => l.needsConfirmation),
    minimumOrderWeightGrams: rules.minimumOrderWeightGrams,
    meetsMinimumWeight,
    deliveryKopecks,
    deliveryCalc,
    freeDeliveryThresholdKopecks: rules.freeDeliveryThresholdKopecks,
    amountToFreeDeliveryKopecks,
    totalKopecks,
  };
}
