import { cache } from 'react';
import { prisma } from './prisma';
import type { ProductType } from './constants';

export interface MenuProduct {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  composition: string | null;
  fullDescription: string | null;
  productType: ProductType;
  basePriceKopecks: number;
  baseWeightGrams: number | null;
  weightStepGrams: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  unitLabel: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  needsConfirmation: boolean;
  isSpicy: boolean;
  isFeatured: boolean;
  isNew: boolean;
  allergens: string | null;
}

export interface MenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  products: MenuProduct[];
}

function toMenuProduct(p: {
  id: string;
  slug: string;
  name: string;
  shortDescription: string | null;
  composition: string | null;
  fullDescription: string | null;
  productType: string;
  basePriceKopecks: number;
  baseWeightGrams: number | null;
  weightStepGrams: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  unitLabel: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  needsConfirmation: boolean;
  isSpicy: boolean;
  isFeatured: boolean;
  isNew: boolean;
  allergens: string | null;
}): MenuProduct {
  return { ...p, productType: p.productType as ProductType };
}

/**
 * Публичное меню: только неспрятанные категории и товары. Спрятанные товары
 * (в т.ч. needsConfirmation) в витрину не попадают. Недоступные (isAvailable=false)
 * показываются как «нет в наличии».
 */
export const getMenu = cache(async (): Promise<MenuCategory[]> => {
  const categories = await prisma.category.findMany({
    where: { isHidden: false },
    orderBy: { sortOrder: 'asc' },
    include: {
      products: {
        where: { isHidden: false },
        orderBy: [{ isAvailable: 'desc' }, { sortOrder: 'asc' }],
      },
    },
  });

  return categories
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      products: c.products.map(toMenuProduct),
    }))
    .filter((c) => c.products.length > 0);
});
