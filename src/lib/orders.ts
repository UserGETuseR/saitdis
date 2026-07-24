import { prisma } from './prisma';
import { priceCart, type CartLineInput, type CartTotals } from './pricing';
import { getDeliveryRules, getSiteSettings } from './settings';
import { generateOrderNumber } from './order-number';
import { isOnlinePaymentEnabled } from './payments';
import type { CheckoutInput } from './validation';
import type { ProductType, PaymentMethod } from './constants';

export interface RequestedItem {
  productId: string;
  grams?: number | null;
  quantity: number;
}

/**
 * Пересчитывает корзину по АКТУАЛЬНЫМ данным сервера. Клиентские цены
 * игнорируются полностью. Возвращает и итоги, и «сырой» список товаров,
 * чтобы вызывающий код мог отличить недоступные/исчезнувшие позиции.
 */
export async function recalcCart(
  items: RequestedItem[],
  fulfillmentType?: 'DELIVERY' | 'PICKUP',
): Promise<{ totals: CartTotals; missingProductIds: string[] }> {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const rules = await getDeliveryRules();

  const missingProductIds: string[] = [];
  const inputs: CartLineInput[] = [];

  for (const item of items) {
    const p = byId.get(item.productId);
    if (!p || p.isHidden) {
      missingProductIds.push(item.productId);
      continue;
    }
    inputs.push({
      product: {
        id: p.id,
        name: p.name,
        productType: p.productType as ProductType,
        basePriceKopecks: p.basePriceKopecks,
        baseWeightGrams: p.baseWeightGrams,
        weightStepGrams: p.weightStepGrams,
        minWeightGrams: p.minWeightGrams,
        maxWeightGrams: p.maxWeightGrams,
        unitLabel: p.unitLabel,
        isAvailable: p.isAvailable,
        needsConfirmation: p.needsConfirmation,
      },
      grams: item.grams ?? null,
      quantity: item.quantity,
    });
  }

  const totals = priceCart(inputs, { ...rules, fulfillmentType });
  return { totals, missingProductIds };
}

export interface CreateOrderResult {
  ok: boolean;
  order?: { id: string; number: string };
  error?: string;
  code?:
    | 'EMPTY_CART'
    | 'BELOW_MIN_WEIGHT'
    | 'UNAVAILABLE_ITEMS'
    | 'PAYMENT_UNAVAILABLE'
    | 'INTERNAL';
}

function paymentStatusFor(method: PaymentMethod): string {
  switch (method) {
    case 'CASH':
      return 'NOT_REQUIRED';
    case 'TRANSFER':
      return 'WAITING_FOR_CONFIRMATION';
    case 'CARD_ONLINE':
    case 'SBP':
      return 'PENDING';
    default:
      return 'NOT_REQUIRED';
  }
}

/**
 * Создаёт заказ. Идемпотентно по idempotencyKey. Сервер — источник цены.
 * Возвращает существующий заказ, если ключ уже использовался.
 */
export async function createOrder(input: CheckoutInput): Promise<CreateOrderResult> {
  // 0) Идемпотентность: если заказ с таким ключом уже есть — вернуть его.
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true, number: true },
  });
  if (existing) return { ok: true, order: existing };

  // 1) Онлайн-оплата разрешена только если провайдер подключён.
  if (
    (input.paymentMethod === 'CARD_ONLINE' || input.paymentMethod === 'SBP') &&
    !isOnlinePaymentEnabled()
  ) {
    return {
      ok: false,
      code: 'PAYMENT_UNAVAILABLE',
      error: 'Онлайн-оплата пока не подключена. Выберите оплату при получении или переводом.',
    };
  }

  // 2) Пересчёт на сервере.
  const { totals } = await recalcCart(input.items, input.fulfillmentType);

  if (totals.availableCount === 0) {
    return { ok: false, code: 'EMPTY_CART', error: 'В корзине нет доступных товаров' };
  }
  if (totals.hasUnavailable) {
    return {
      ok: false,
      code: 'UNAVAILABLE_ITEMS',
      error: 'Некоторые товары стали недоступны. Обновите корзину.',
    };
  }
  if (!totals.meetsMinimumWeight) {
    return {
      ok: false,
      code: 'BELOW_MIN_WEIGHT',
      error: `Минимальный вес заказа — ${totals.minimumOrderWeightGrams} г. Добавьте ещё блюда.`,
    };
  }

  // 3) Создание в транзакции с генерацией номера и снимком позиций.
  try {
    const created = await prisma.$transaction(async (tx) => {
      // до 5 попыток на случай коллизии номера
      let number = '';
      for (let attempt = 0; attempt < 5; attempt++) {
        number = await generateOrderNumber(tx);
        const clash = await tx.order.findUnique({ where: { number }, select: { id: true } });
        if (!clash) break;
      }

      return tx.order.create({
        data: {
          number,
          status: 'NEW',
          fulfillmentType: input.fulfillmentType,
          customerName: input.customerName,
          phone: input.phone,
          street: input.fulfillmentType === 'DELIVERY' ? input.street || null : null,
          apartment: input.apartment || null,
          entrance: input.entrance || null,
          floor: input.floor || null,
          intercom: input.intercom || null,
          timingMode: input.timingMode,
          scheduledAt:
            input.timingMode === 'SCHEDULED' && input.scheduledAt
              ? new Date(input.scheduledAt)
              : null,
          comment: input.comment || null,
          paymentMethod: input.paymentMethod,
          paymentStatus: paymentStatusFor(input.paymentMethod),
          itemsSubtotalKopecks: totals.itemsSubtotalKopecks,
          deliveryKopecks: totals.deliveryKopecks,
          totalKopecks: totals.totalKopecks,
          totalWeightGrams: totals.totalWeightGrams,
          deliveryCalc: totals.deliveryCalc,
          consent: input.consent,
          telegramStatus: 'PENDING',
          emailStatus: 'PENDING',
          idempotencyKey: input.idempotencyKey,
          items: {
            create: totals.lines
              .filter((l) => l.available)
              .map((l) => ({
                productId: l.productId,
                name: l.name,
                productType: l.productType,
                unitLabel: l.unitLabel,
                grams: l.grams,
                quantity: l.quantity,
                unitPriceKopecks: l.unitPriceKopecks,
                lineTotalKopecks: l.lineTotalKopecks,
                needsConfirmation: l.needsConfirmation,
              })),
          },
        },
        select: { id: true, number: true },
      });
    });

    return { ok: true, order: created };
  } catch (err) {
    // Возможна гонка по idempotencyKey — проверим ещё раз.
    const again = await prisma.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, number: true },
    });
    if (again) return { ok: true, order: again };

    console.error('[createOrder] ошибка:', err);
    return { ok: false, code: 'INTERNAL', error: 'Не удалось создать заказ. Попробуйте ещё раз.' };
  }
}

/** Данные для страницы подтверждения/уведомления. */
export async function getContactSummary() {
  const s = await getSiteSettings();
  return {
    phoneDisplay: s.contactPhoneDisplay,
    phoneRaw: s.contactPhoneRaw,
    email: s.contactEmail,
    address: s.address,
  };
}
