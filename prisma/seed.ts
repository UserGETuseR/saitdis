import { PrismaClient } from '@prisma/client';
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString('hex')}`;
}

const R = (rubles: number) => rubles * 100; // рубли -> копейки

// Пресеты по типам, чтобы не повторять поля.
const weighted = {
  productType: 'WEIGHTED',
  baseWeightGrams: 100,
  weightStepGrams: 100,
  minWeightGrams: 100,
  maxWeightGrams: 500,
  unitLabel: 'г',
};
const portion = (grams: number | null) => ({
  productType: 'FIXED_PORTION',
  baseWeightGrams: grams,
  unitLabel: 'порция',
});
const unit = {
  productType: 'UNIT',
  baseWeightGrams: null as number | null,
  unitLabel: 'шт',
};
const sizeVariant = (grams: number, size: string) => ({
  productType: 'SIZE_VARIANT',
  baseWeightGrams: grams,
  unitLabel: 'шт',
  sizeLabel: size,
});

interface SeedProduct {
  slug: string;
  name: string;
  priceRub: number;
  preset: Record<string, unknown>;
  shortDescription?: string;
  composition?: string;
  needsConfirmation?: boolean;
  isHidden?: boolean;
  isSpicy?: boolean;
  isFeatured?: boolean;
  isNew?: boolean;
  baseWeightGrams?: number | null;
}

interface SeedCategory {
  slug: string;
  name: string;
  description?: string;
  products: SeedProduct[];
}

const CATEGORIES: SeedCategory[] = [
  {
    slug: 'mangal',
    name: 'Блюда на мангале',
    description: 'Мясо и птица на живом огне',
    products: [
      { slug: 'shashlyk-svinaya-sheya', name: 'Шашлык из свиной шеи', priceRub: 170, preset: weighted, isFeatured: true },
      { slug: 'shashlyk-svinye-rebra', name: 'Шашлык из свиных рёбер', priceRub: 140, preset: weighted },
      { slug: 'shashlyk-kurinoe-file', name: 'Шашлык из куриного филе', priceRub: 130, preset: weighted },
      { slug: 'shashlyk-kurinye-krylya', name: 'Шашлык из куриных крыльев', priceRub: 150, preset: weighted },
      { slug: 'shashlyk-kurinoe-bedro', name: 'Шашлык из куриного бедра', priceRub: 130, preset: weighted },
      { slug: 'shashlyk-indeyka', name: 'Шашлык из филе индейки', priceRub: 150, preset: weighted },
      // Спорная цена — не публикуем автоматически.
      { slug: 'shashlyk-telyatina', name: 'Шашлык из вырезки телятины', priceRub: 220, preset: weighted, needsConfirmation: true, isHidden: true },
      { slug: 'shashlyk-baranina-kare', name: 'Шашлык из баранины, каре', priceRub: 250, preset: weighted, needsConfirmation: true, isHidden: true },
      // Тип/вес продажи требуют подтверждения.
      { slug: 'perepela', name: 'Перепела', priceRub: 200, preset: unit, needsConfirmation: true, isHidden: true },
      { slug: 'lyulya-kurinyy', name: 'Люля-кебаб куриный', priceRub: 200, preset: portion(200) },
      { slug: 'lyulya-svino-govyazhiy', name: 'Люля-кебаб свино-говяжий', priceRub: 300, preset: portion(200), isFeatured: true },
    ],
  },
  {
    slug: 'fish',
    name: 'Рыба',
    products: [
      { slug: 'steyk-lososya', name: 'Стейк из лосося', priceRub: 350, preset: weighted, isFeatured: true },
      // Вес и тип расчёта требуют подтверждения.
      { slug: 'skumbriya', name: 'Скумбрия, цельная', priceRub: 150, preset: unit, needsConfirmation: true, isHidden: true },
      { slug: 'krevetki', name: 'Креветки', priceRub: 330, preset: weighted },
    ],
  },
  {
    slug: 'vegetables',
    name: 'Овощи на мангале',
    products: [
      { slug: 'kartofel', name: 'Картофель', priceRub: 70, preset: weighted },
      { slug: 'baklazhan', name: 'Баклажан', priceRub: 100, preset: weighted },
      { slug: 'perec-bolgarskiy', name: 'Перец болгарский', priceRub: 100, preset: weighted },
      { slug: 'pomidor', name: 'Помидор', priceRub: 100, preset: weighted },
      { slug: 'kabachok', name: 'Кабачок', priceRub: 100, preset: weighted },
      { slug: 'perec-ostryy', name: 'Перец острый', priceRub: 100, preset: weighted, isSpicy: true },
      { slug: 'shampinyony', name: 'Шампиньоны', priceRub: 100, preset: weighted },
    ],
  },
  {
    slug: 'shawarma',
    name: 'Шаурма',
    products: [
      { slug: 'shaurma-kurinaya', name: 'Шаурма куриная', priceRub: 300, preset: unit, isFeatured: true },
      { slug: 'shaurma-svinaya', name: 'Шаурма свиная', priceRub: 300, preset: unit },
      // Цена известна, но состав уточняется — не публикуем неподтверждённый состав.
      { slug: 'shaurma-syr-suluguni', name: 'Шаурма с сыром и сулугуни', priceRub: 350, preset: unit, composition: 'Состав уточняется' },
      { slug: 'shaurma-po-arabski', name: 'Шаурма по-арабски', priceRub: 350, preset: unit, composition: 'Состав уточняется (предварительно: курица, салат, огурцы, картофель фри, лаваш)' },
    ],
  },
  {
    slug: 'bakery',
    name: 'Выпечка',
    products: [
      { slug: 'hachapuri-imeretinski', name: 'Хачапури по-имеретински', priceRub: 500, preset: portion(350), baseWeightGrams: 350 },
      { slug: 'hachapuri-adjarski', name: 'Хачапури по-аджарски', priceRub: 450, preset: portion(500), baseWeightGrams: 500, isFeatured: true },
      { slug: 'hachapuri-adjarski-salyami', name: 'Хачапури по-аджарски с салями', priceRub: 500, preset: portion(650), baseWeightGrams: 650 },
      { slug: 'pizza-myaso', name: 'Пицца с мясом', priceRub: 550, preset: sizeVariant(700, '30 см') },
      { slug: 'pizza-pepperoni', name: 'Пицца пепперони', priceRub: 550, preset: sizeVariant(500, '30 см') },
      // Название и состав требуют подтверждения — не публикуем.
      { slug: 'hachapuri-kurinoe', name: 'Хачапури с куриным мясом', priceRub: 700, preset: portion(550), baseWeightGrams: 550, needsConfirmation: true, isHidden: true },
      { slug: 'hachapuri-svino-govyazhee', name: 'Хачапури со свино-говяжьим мясом', priceRub: 700, preset: portion(550), baseWeightGrams: 550, needsConfirmation: true, isHidden: true },
      { slug: 'lavash-metrovyy', name: 'Лаваш метровый', priceRub: 100, preset: unit },
    ],
  },
  {
    slug: 'salads',
    name: 'Салаты',
    products: [
      { slug: 'cezar-kurica', name: '«Цезарь» с курицей', priceRub: 350, preset: portion(250), isFeatured: true },
      { slug: 'cezar-losos', name: '«Цезарь» с лососем', priceRub: 500, preset: portion(250) },
      { slug: 'cezar-krevetki', name: '«Цезарь» с креветками', priceRub: 500, preset: portion(250) },
      { slug: 'ovoshchnoy-salat', name: 'Овощной салат по-домашнему', priceRub: 250, preset: portion(250) },
    ],
  },
  {
    slug: 'sauces',
    name: 'Соусы',
    products: [
      { slug: 'sous-krasnyy', name: 'Соус красный', priceRub: 70, preset: portion(100) },
      { slug: 'sous-belyy', name: 'Соус белый', priceRub: 70, preset: portion(100) },
      { slug: 'adzhika', name: 'Аджика по-домашнему', priceRub: 70, preset: portion(100), isSpicy: true },
      { slug: 'sous-narsharab', name: 'Соус наршараб', priceRub: 100, preset: portion(50) },
      { slug: 'sous-sladkiy-chili', name: 'Соус сладкий чили', priceRub: 100, preset: portion(50) },
    ],
  },
];

async function main() {
  console.log('Сидируем каталог...');

  let catOrder = 0;
  for (const cat of CATEGORIES) {
    const category = await prisma.category.upsert({
      where: { slug: cat.slug },
      create: { slug: cat.slug, name: cat.name, description: cat.description, sortOrder: catOrder },
      update: { name: cat.name, description: cat.description, sortOrder: catOrder },
    });
    catOrder += 1;

    let prodOrder = 0;
    for (const p of cat.products) {
      const { preset } = p;
      const data = {
        categoryId: category.id,
        name: p.name,
        shortDescription: p.shortDescription ?? null,
        composition: p.composition ?? null,
        basePriceKopecks: R(p.priceRub),
        baseWeightGrams:
          p.baseWeightGrams !== undefined
            ? p.baseWeightGrams
            : ((preset.baseWeightGrams as number | null | undefined) ?? null),
        weightStepGrams: (preset.weightStepGrams as number | undefined) ?? null,
        minWeightGrams: (preset.minWeightGrams as number | undefined) ?? null,
        maxWeightGrams: (preset.maxWeightGrams as number | undefined) ?? null,
        unitLabel: (preset.unitLabel as string | undefined) ?? null,
        sizeLabel: (preset.sizeLabel as string | undefined) ?? null,
        productType: preset.productType as string,
        isAvailable: true,
        isHidden: p.isHidden ?? false,
        needsConfirmation: p.needsConfirmation ?? false,
        isSpicy: p.isSpicy ?? false,
        isFeatured: p.isFeatured ?? false,
        isNew: p.isNew ?? false,
        sortOrder: prodOrder,
      };

      await prisma.product.upsert({
        where: { slug: p.slug },
        create: { slug: p.slug, ...data },
        update: data,
      });
      prodOrder += 1;
    }
    console.log(`  ${cat.name}: ${cat.products.length} товаров`);
  }

  // Зона доставки (Краснодар) — до уточнения границ считаем через оператора.
  const existingZone = await prisma.deliveryZone.findFirst({ where: { name: 'Краснодар' } });
  if (!existingZone) {
    await prisma.deliveryZone.create({
      data: {
        name: 'Краснодар',
        description: 'Доставка по городу. Точные границы бесплатной зоны уточняются у оператора.',
        minOrderKopecks: 0,
        deliveryKopecks: null, // уточняет оператор
        freeThresholdKopecks: 150000, // 1500 ₽
        etaMinutes: null,
        isActive: true,
        sortOrder: 0,
      },
    });
  }

  // Реальная акция: бесплатная доставка от 1500 ₽ (подтверждённое условие).
  const existingPromo = await prisma.promo.findFirst({ where: { kind: 'free_delivery' } });
  if (!existingPromo) {
    await prisma.promo.create({
      data: {
        title: 'Бесплатная доставка от 1500 ₽',
        body: 'При заказе от 1500 ₽ доставка по установленной зоне бесплатна. При меньшей сумме стоимость доставки уточнит оператор.',
        kind: 'free_delivery',
        isActive: true,
        sortOrder: 0,
      },
    });
  }

  // Администратор по умолчанию (только для локального запуска — СМЕНИТЕ пароль!).
  const adminCount = await prisma.adminUser.count();
  if (adminCount === 0) {
    const username = process.env.SEED_ADMIN_USERNAME || 'admin';
    const password = process.env.SEED_ADMIN_PASSWORD || 'admin12345';
    await prisma.adminUser.create({
      data: { username, passwordHash: await hashPassword(password) },
    });
    console.log('\n  ⚠️  Создан администратор по умолчанию:');
    console.log(`      логин: ${username}`);
    console.log(`      пароль: ${password}`);
    console.log('      ОБЯЗАТЕЛЬНО смените пароль перед публикацией!\n');
  }

  console.log('Готово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
