import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cartSchema } from '@/lib/validation';
import { priceCart, type CartLineInput } from '@/lib/pricing';
import { getDeliveryRules } from '@/lib/settings';
import type { ProductType } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * Пересчитывает корзину по актуальным данным и возвращает публичные поля
 * товаров, чтобы клиент обновил снимок цен/наличия. Сервер — источник цены.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Некорректный JSON' }, { status: 400 });
  }

  const parsed = cartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Некорректная корзина' }, { status: 400 });
  }

  const fulfillment =
    typeof body === 'object' && body && (body as { fulfillmentType?: string }).fulfillmentType === 'PICKUP'
      ? 'PICKUP'
      : 'DELIVERY';

  const ids = [...new Set(parsed.data.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isHidden: false },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const rules = await getDeliveryRules();

  const inputs: CartLineInput[] = [];
  for (const item of parsed.data.items) {
    const p = byId.get(item.productId);
    if (!p) continue;
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

  const totals = priceCart(inputs, { ...rules, fulfillmentType: fulfillment });

  const publicProducts = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    composition: p.composition,
    fullDescription: p.fullDescription,
    productType: p.productType,
    basePriceKopecks: p.basePriceKopecks,
    baseWeightGrams: p.baseWeightGrams,
    weightStepGrams: p.weightStepGrams,
    minWeightGrams: p.minWeightGrams,
    maxWeightGrams: p.maxWeightGrams,
    unitLabel: p.unitLabel,
    sizeLabel: p.sizeLabel,
    imageUrl: p.imageUrl,
    isAvailable: p.isAvailable,
    needsConfirmation: p.needsConfirmation,
    isSpicy: p.isSpicy,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    allergens: p.allergens,
  }));

  return NextResponse.json({ ok: true, totals, products: publicProducts });
}
