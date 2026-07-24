import { describe, it, expect } from 'vitest';
import {
  priceLine,
  priceCart,
  normalizeGrams,
  type PricingProduct,
} from '../../src/lib/pricing';

function weightedProduct(over: Partial<PricingProduct> = {}): PricingProduct {
  return {
    id: 'p1',
    name: 'Шашлык из свиной шеи',
    productType: 'WEIGHTED',
    basePriceKopecks: 17000, // 170 ₽ / 100 г
    baseWeightGrams: 100,
    weightStepGrams: 100,
    minWeightGrams: 100,
    maxWeightGrams: 500,
    unitLabel: 'г',
    isAvailable: true,
    needsConfirmation: false,
    ...over,
  };
}

function fixedProduct(over: Partial<PricingProduct> = {}): PricingProduct {
  return {
    id: 'p2',
    name: 'Шаурма куриная',
    productType: 'FIXED_PORTION',
    basePriceKopecks: 30000, // 300 ₽
    baseWeightGrams: null,
    weightStepGrams: null,
    minWeightGrams: null,
    maxWeightGrams: null,
    unitLabel: 'порция',
    isAvailable: true,
    needsConfirmation: false,
    ...over,
  };
}

const rules = { minimumOrderWeightGrams: 300, freeDeliveryThresholdKopecks: 150000 };

describe('весовой товар', () => {
  it('считает цену за выбранный вес (300 г при 170 ₽/100 г = 510 ₽)', () => {
    const line = priceLine({ product: weightedProduct(), grams: 300, quantity: 1 });
    expect(line.lineTotalKopecks).toBe(51000);
    expect(line.grams).toBe(300);
    expect(line.weightGrams).toBe(300);
  });

  it('меняет стоимость при изменении веса', () => {
    const g100 = priceLine({ product: weightedProduct(), grams: 100, quantity: 1 });
    const g500 = priceLine({ product: weightedProduct(), grams: 500, quantity: 1 });
    expect(g100.lineTotalKopecks).toBe(17000);
    expect(g500.lineTotalKopecks).toBe(85000);
  });

  it('привязывает вес к шагу и границам min/max', () => {
    const p = weightedProduct();
    expect(normalizeGrams(p, 250)).toBe(300); // округление к шагу 100
    expect(normalizeGrams(p, 50)).toBe(100); // не ниже минимума
    expect(normalizeGrams(p, 9999)).toBe(500); // не выше максимума
    expect(normalizeGrams(p, null)).toBe(100); // дефолт = минимум
  });

  it('снапит вес к шагу перед расчётом (150 г при шаге 100 -> 200 г)', () => {
    const p = weightedProduct({ basePriceKopecks: 3300 });
    const line = priceLine({ product: p, grams: 150, quantity: 1 });
    // 150 округляется к 200 г -> 3300 * 200/100 = 6600
    expect(line.grams).toBe(200);
    expect(line.lineTotalKopecks).toBe(6600);
  });

  it('корректно округляет копейки при шаге 50 г', () => {
    // база 100 г, шаг 50 г, цена 333 коп/100 г; при 150 г = 499.5 -> округляем к 500
    const p = weightedProduct({
      basePriceKopecks: 333,
      weightStepGrams: 50,
      minWeightGrams: 50,
    });
    const line = priceLine({ product: p, grams: 150, quantity: 1 });
    expect(line.grams).toBe(150);
    expect(line.lineTotalKopecks).toBe(500); // round(333*150/100) = round(499.5) = 500
  });
});

describe('фиксированная порция и количество', () => {
  it('умножает цену порции на количество', () => {
    const line = priceLine({ product: fixedProduct(), quantity: 3 });
    expect(line.lineTotalKopecks).toBe(90000); // 3 × 300 ₽
    expect(line.grams).toBeNull();
  });

  it('ограничивает количество разумными рамками', () => {
    const line = priceLine({ product: fixedProduct(), quantity: 1000 });
    expect(line.quantity).toBe(99);
  });
});

describe('минимальный вес заказа', () => {
  it('не проходит при весе меньше минимума', () => {
    const totals = priceCart(
      [{ product: weightedProduct(), grams: 200, quantity: 1 }],
      rules,
    );
    expect(totals.totalWeightGrams).toBe(200);
    expect(totals.meetsMinimumWeight).toBe(false);
  });

  it('проходит ровно на границе минимума', () => {
    const totals = priceCart(
      [{ product: weightedProduct(), grams: 300, quantity: 1 }],
      rules,
    );
    expect(totals.meetsMinimumWeight).toBe(true);
  });
});

describe('доставка', () => {
  it('бесплатна при сумме >= порога', () => {
    const totals = priceCart(
      [{ product: weightedProduct(), grams: 100, quantity: 1 }, { product: fixedProduct({ basePriceKopecks: 140000 }), quantity: 1 }],
      rules,
    );
    // 170 + 1400 = 1570 ₽ >= 1500 -> FREE
    expect(totals.itemsSubtotalKopecks).toBe(157000);
    expect(totals.deliveryCalc).toBe('FREE');
    expect(totals.deliveryKopecks).toBe(0);
  });

  it('уточняется оператором при сумме ниже порога', () => {
    const totals = priceCart(
      [{ product: fixedProduct(), quantity: 1 }],
      rules,
    );
    expect(totals.deliveryCalc).toBe('OPERATOR_CONFIRMATION');
    expect(totals.deliveryKopecks).toBeNull();
    expect(totals.amountToFreeDeliveryKopecks).toBe(120000); // 1500 - 300
  });

  it('при самовывозе доставка не считается', () => {
    const totals = priceCart([{ product: fixedProduct(), quantity: 1 }], {
      ...rules,
      fulfillmentType: 'PICKUP',
    });
    expect(totals.deliveryCalc).toBe('FREE');
    expect(totals.deliveryKopecks).toBe(0);
  });
});

describe('недоступные товары', () => {
  it('исключаются из подытога и веса, помечаются флагом', () => {
    const totals = priceCart(
      [
        { product: weightedProduct(), grams: 300, quantity: 1 },
        { product: fixedProduct({ id: 'x', isAvailable: false }), quantity: 2 },
      ],
      rules,
    );
    expect(totals.hasUnavailable).toBe(true);
    expect(totals.availableCount).toBe(1);
    expect(totals.itemsSubtotalKopecks).toBe(51000); // только доступный
  });
});

describe('позиции, требующие подтверждения', () => {
  it('помечаются в итогах корзины', () => {
    const totals = priceCart(
      [{ product: weightedProduct({ needsConfirmation: true }), grams: 300, quantity: 1 }],
      rules,
    );
    expect(totals.hasNeedsConfirmation).toBe(true);
  });
});
