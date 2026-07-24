import { z } from 'zod';
import {
  FULFILLMENT_TYPES,
  PAYMENT_METHODS,
  PRODUCT_TYPES,
  PROMO_KINDS,
} from './constants';
import { normalizePhone } from './phone';

// --- Корзина / заказ (публичные) -------------------------------------------

export const cartItemSchema = z.object({
  productId: z.string().min(1),
  grams: z.number().int().positive().max(100_000).nullable().optional(),
  quantity: z.number().int().min(1).max(99),
});

export const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1, 'Корзина пуста'),
});

export const checkoutSchema = z
  .object({
    customerName: z.string().trim().min(2, 'Укажите имя').max(80),
    phone: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const normalized = normalizePhone(v);
        if (!normalized) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Некорректный номер телефона' });
          return z.NEVER;
        }
        return normalized;
      }),
    fulfillmentType: z.enum(FULFILLMENT_TYPES),
    street: z.string().trim().max(200).optional().or(z.literal('')),
    apartment: z.string().trim().max(30).optional().or(z.literal('')),
    entrance: z.string().trim().max(30).optional().or(z.literal('')),
    floor: z.string().trim().max(30).optional().or(z.literal('')),
    intercom: z.string().trim().max(30).optional().or(z.literal('')),
    timingMode: z.enum(['ASAP', 'SCHEDULED']).default('ASAP'),
    scheduledAt: z.string().datetime().optional().or(z.literal('')),
    comment: z.string().trim().max(1000).optional().or(z.literal('')),
    paymentMethod: z.enum(PAYMENT_METHODS),
    consent: z.literal(true, {
      errorMap: () => ({ message: 'Необходимо согласие на обработку данных' }),
    }),
    idempotencyKey: z.string().min(8).max(100),
    items: z.array(cartItemSchema).min(1, 'Корзина пуста'),
  })
  .superRefine((data, ctx) => {
    if (data.fulfillmentType === 'DELIVERY' && (!data.street || data.street.trim().length < 3)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['street'],
        message: 'Укажите адрес доставки',
      });
    }
    if (data.timingMode === 'SCHEDULED' && !data.scheduledAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scheduledAt'],
        message: 'Выберите дату и время',
      });
    }
  });

export type CheckoutInput = z.infer<typeof checkoutSchema>;

// --- Админка: логин --------------------------------------------------------

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

// --- Админка: товар --------------------------------------------------------

export const productAdminSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Только строчные латинские буквы, цифры и дефис')
    .min(2)
    .max(120),
  shortDescription: z.string().trim().max(200).optional().or(z.literal('')),
  fullDescription: z.string().trim().max(2000).optional().or(z.literal('')),
  composition: z.string().trim().max(1000).optional().or(z.literal('')),
  productType: z.enum(PRODUCT_TYPES),
  basePriceRubles: z.coerce.number().min(0).max(1_000_000),
  baseWeightGrams: z.coerce.number().int().min(0).max(100_000).optional(),
  weightStepGrams: z.coerce.number().int().min(0).max(10_000).optional(),
  minWeightGrams: z.coerce.number().int().min(0).max(100_000).optional(),
  maxWeightGrams: z.coerce.number().int().min(0).max(100_000).optional(),
  unitLabel: z.string().trim().max(30).optional().or(z.literal('')),
  sizeLabel: z.string().trim().max(30).optional().or(z.literal('')),
  allergens: z.string().trim().max(200).optional().or(z.literal('')),
  isAvailable: z.coerce.boolean().optional(),
  isHidden: z.coerce.boolean().optional(),
  needsConfirmation: z.coerce.boolean().optional(),
  isSpicy: z.coerce.boolean().optional(),
  isFeatured: z.coerce.boolean().optional(),
  isNew: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

// --- Админка: категория ----------------------------------------------------

export const categoryAdminSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(80),
  description: z.string().trim().max(400).optional().or(z.literal('')),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isHidden: z.coerce.boolean().optional(),
});

// --- Админка: акция --------------------------------------------------------

export const promoAdminSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().max(600).optional().or(z.literal('')),
  kind: z.enum(PROMO_KINDS),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
});
