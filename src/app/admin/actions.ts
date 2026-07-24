'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import {
  getAdminSession,
  verifyPassword,
  setSessionCookie,
  clearSessionCookie,
} from '@/lib/auth';
import { audit } from '@/lib/audit';
import { notifyOwnerAboutOrder } from '@/lib/notify';
import { saveUploadedImage } from '@/lib/uploads';
import { rublesToKopecks } from '@/lib/money';
import {
  loginSchema,
  productAdminSchema,
  categoryAdminSchema,
  promoAdminSchema,
} from '@/lib/validation';
import { ORDER_STATUS_FLOW, type OrderStatus } from '@/lib/constants';

export interface ActionState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function assertAdmin() {
  const s = await getAdminSession();
  if (!s) redirect('/admin/login');
  return s;
}

function nn(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === 'on' || v === 'true';
}

// --- Auth ------------------------------------------------------------------

export async function loginAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    username: formData.get('username'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Введите логин и пароль' };

  const user = await prisma.adminUser.findUnique({
    where: { username: parsed.data.username },
  });
  const valid = user && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !valid) {
    return { error: 'Неверный логин или пароль' };
  }

  await setSessionCookie(user.id, user.username);
  await audit({ actor: user.username, action: 'login' });
  redirect('/admin');
}

export async function logoutAction(): Promise<void> {
  const s = await getAdminSession();
  await clearSessionCookie();
  if (s) await audit({ actor: s.username, action: 'logout' });
  redirect('/admin/login');
}

// --- Orders ----------------------------------------------------------------

export async function setOrderStatusAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const orderId = String(formData.get('orderId') ?? '');
  const status = String(formData.get('status') ?? '') as OrderStatus;
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  const allowed = ORDER_STATUS_FLOW[order.status as OrderStatus] ?? [];
  if (!allowed.includes(status)) return; // недопустимый переход — игнорируем

  await prisma.order.update({ where: { id: orderId }, data: { status } });
  await audit({
    actor: admin.username,
    action: 'order.status',
    entity: 'Order',
    entityId: orderId,
    meta: { from: order.status, to: status },
  });
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath('/admin/orders');
  revalidatePath('/admin');
}

export async function resendNotificationAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const orderId = String(formData.get('orderId') ?? '');
  await notifyOwnerAboutOrder(orderId);
  await audit({
    actor: admin.username,
    action: 'order.resend',
    entity: 'Order',
    entityId: orderId,
  });
  revalidatePath(`/admin/orders/${orderId}`);
}

// --- Товары ----------------------------------------------------------------

export async function setProductAvailabilityAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const value = formData.get('value') === 'true';
  await prisma.product.update({ where: { id }, data: { isAvailable: value } });
  await audit({
    actor: admin.username,
    action: 'product.availability',
    entity: 'Product',
    entityId: id,
    meta: { value },
  });
  revalidatePath('/admin/menu');
  revalidatePath('/');
}

export async function setProductHiddenAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const value = formData.get('value') === 'true';
  await prisma.product.update({ where: { id }, data: { isHidden: value } });
  await audit({
    actor: admin.username,
    action: 'product.hidden',
    entity: 'Product',
    entityId: id,
    meta: { value },
  });
  revalidatePath('/admin/menu');
  revalidatePath('/');
}

/** Мягкое удаление товара = архивирование (скрытие), без потери истории заказов. */
export async function archiveProductAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.product.update({ where: { id }, data: { isHidden: true, isAvailable: false } });
  await audit({
    actor: admin.username,
    action: 'product.archive',
    entity: 'Product',
    entityId: id,
  });
  revalidatePath('/admin/menu');
  revalidatePath('/');
  redirect('/admin/menu');
}

export async function saveProductAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const admin = await assertAdmin();
  const id = nn(formData.get('id'));

  const parsed = productAdminSchema.safeParse({
    categoryId: formData.get('categoryId'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    shortDescription: formData.get('shortDescription') ?? '',
    fullDescription: formData.get('fullDescription') ?? '',
    composition: formData.get('composition') ?? '',
    productType: formData.get('productType'),
    basePriceRubles: formData.get('basePriceRubles'),
    baseWeightGrams: formData.get('baseWeightGrams') || undefined,
    weightStepGrams: formData.get('weightStepGrams') || undefined,
    minWeightGrams: formData.get('minWeightGrams') || undefined,
    maxWeightGrams: formData.get('maxWeightGrams') || undefined,
    unitLabel: formData.get('unitLabel') ?? '',
    sizeLabel: formData.get('sizeLabel') ?? '',
    allergens: formData.get('allergens') ?? '',
    isAvailable: bool(formData, 'isAvailable'),
    isHidden: bool(formData, 'isHidden'),
    needsConfirmation: bool(formData, 'needsConfirmation'),
    isSpicy: bool(formData, 'isSpicy'),
    isFeatured: bool(formData, 'isFeatured'),
    isNew: bool(formData, 'isNew'),
    sortOrder: formData.get('sortOrder') || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join('.') || 'form';
      if (!fieldErrors[k]) fieldErrors[k] = issue.message;
    }
    return { ok: false, error: 'Проверьте поля', fieldErrors };
  }

  const d = parsed.data;

  // Изображение (опционально).
  let imageUrl: string | null | undefined = undefined;
  const image = formData.get('image');
  if (image instanceof File && image.size > 0) {
    const up = await saveUploadedImage(image);
    if (!up.ok) return { ok: false, error: up.error };
    imageUrl = up.url ?? null;
  } else if (formData.get('removeImage') === 'true') {
    imageUrl = null;
  }

  const data = {
    categoryId: d.categoryId,
    name: d.name,
    slug: d.slug,
    shortDescription: d.shortDescription || null,
    fullDescription: d.fullDescription || null,
    composition: d.composition || null,
    productType: d.productType,
    basePriceKopecks: rublesToKopecks(d.basePriceRubles),
    baseWeightGrams: d.baseWeightGrams ?? null,
    weightStepGrams: d.weightStepGrams ?? null,
    minWeightGrams: d.minWeightGrams ?? null,
    maxWeightGrams: d.maxWeightGrams ?? null,
    unitLabel: d.unitLabel || null,
    sizeLabel: d.sizeLabel || null,
    allergens: d.allergens || null,
    isAvailable: d.isAvailable ?? true,
    isHidden: d.isHidden ?? false,
    needsConfirmation: d.needsConfirmation ?? false,
    isSpicy: d.isSpicy ?? false,
    isFeatured: d.isFeatured ?? false,
    isNew: d.isNew ?? false,
    sortOrder: d.sortOrder ?? 0,
    ...(imageUrl !== undefined ? { imageUrl } : {}),
  };

  try {
    if (id) {
      await prisma.product.update({ where: { id }, data });
      await audit({ actor: admin.username, action: 'product.update', entity: 'Product', entityId: id });
    } else {
      const created = await prisma.product.create({ data });
      await audit({ actor: admin.username, action: 'product.create', entity: 'Product', entityId: created.id });
    }
  } catch (err) {
    if (String(err).includes('Unique constraint')) {
      return { ok: false, error: 'Такой slug уже используется', fieldErrors: { slug: 'Занят' } };
    }
    return { ok: false, error: 'Не удалось сохранить товар' };
  }

  revalidatePath('/admin/menu');
  revalidatePath('/');
  redirect('/admin/menu');
}

// --- Категории -------------------------------------------------------------

export async function saveCategoryAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const admin = await assertAdmin();
  const id = nn(formData.get('id'));
  const parsed = categoryAdminSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description') ?? '',
    sortOrder: formData.get('sortOrder') || undefined,
    isHidden: bool(formData, 'isHidden'),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[issue.path.join('.') || 'form'] = issue.message;
    }
    return { ok: false, error: 'Проверьте поля', fieldErrors };
  }
  const d = parsed.data;
  const data = {
    name: d.name,
    slug: d.slug,
    description: d.description || null,
    sortOrder: d.sortOrder ?? 0,
    isHidden: d.isHidden ?? false,
  };
  try {
    if (id) {
      await prisma.category.update({ where: { id }, data });
    } else {
      await prisma.category.create({ data });
    }
    await audit({ actor: admin.username, action: id ? 'category.update' : 'category.create' });
  } catch (err) {
    if (String(err).includes('Unique constraint')) {
      return { ok: false, error: 'Такой slug уже используется', fieldErrors: { slug: 'Занят' } };
    }
    return { ok: false, error: 'Не удалось сохранить категорию' };
  }
  revalidatePath('/admin/categories');
  revalidatePath('/');
  redirect('/admin/categories');
}

// --- Акции -----------------------------------------------------------------

export async function savePromoAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const admin = await assertAdmin();
  const id = nn(formData.get('id'));
  const parsed = promoAdminSchema.safeParse({
    title: formData.get('title'),
    body: formData.get('body') ?? '',
    kind: formData.get('kind'),
    isActive: bool(formData, 'isActive'),
    sortOrder: formData.get('sortOrder') || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: 'Проверьте поля' };
  }
  const d = parsed.data;
  const data = {
    title: d.title,
    body: d.body || null,
    kind: d.kind,
    isActive: d.isActive ?? true,
    sortOrder: d.sortOrder ?? 0,
  };
  if (id) await prisma.promo.update({ where: { id }, data });
  else await prisma.promo.create({ data });
  await audit({ actor: admin.username, action: id ? 'promo.update' : 'promo.create' });
  revalidatePath('/admin/promos');
  revalidatePath('/');
  redirect('/admin/promos');
}

export async function togglePromoAction(formData: FormData): Promise<void> {
  await assertAdmin();
  const id = String(formData.get('id') ?? '');
  const value = formData.get('value') === 'true';
  await prisma.promo.update({ where: { id }, data: { isActive: value } });
  revalidatePath('/admin/promos');
  revalidatePath('/');
}

export async function deletePromoAction(formData: FormData): Promise<void> {
  const admin = await assertAdmin();
  const id = String(formData.get('id') ?? '');
  await prisma.promo.delete({ where: { id } });
  await audit({ actor: admin.username, action: 'promo.delete', entity: 'Promo', entityId: id });
  revalidatePath('/admin/promos');
  revalidatePath('/');
}

// --- Настройки / контакты / доставка --------------------------------------

export async function saveSettingsAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const admin = await assertAdmin();

  const entries: Record<string, string> = {
    CONTACT_PHONE_DISPLAY: String(formData.get('contactPhoneDisplay') ?? ''),
    CONTACT_PHONE_RAW: String(formData.get('contactPhoneRaw') ?? ''),
    CONTACT_EMAIL: String(formData.get('contactEmail') ?? ''),
    ADDRESS: String(formData.get('address') ?? ''),
    CITY: String(formData.get('city') ?? ''),
    WORKING_HOURS: String(formData.get('workingHours') ?? ''),
    DELIVERY_ZONE_TEXT: String(formData.get('deliveryZoneText') ?? ''),
    ABOUT_TEXT: String(formData.get('aboutText') ?? ''),
    OWNER_DETAILS: String(formData.get('ownerDetails') ?? ''),
    MAP_EMBED_URL: String(formData.get('mapEmbedUrl') ?? ''),
    MAP_ROUTE_URL: String(formData.get('mapRouteUrl') ?? ''),
    REVIEWS_ENABLED: bool(formData, 'reviewsEnabled') ? 'true' : 'false',
    PROMOS_ENABLED: bool(formData, 'promosEnabled') ? 'true' : 'false',
  };

  const minWeight = parseInt(String(formData.get('minimumOrderWeightGrams') ?? '300'), 10);
  if (Number.isFinite(minWeight) && minWeight >= 0) {
    entries.MINIMUM_ORDER_WEIGHT_GRAMS = String(minWeight);
  }
  const freeRub = parseInt(String(formData.get('freeDeliveryThresholdRubles') ?? '1500'), 10);
  if (Number.isFinite(freeRub) && freeRub >= 0) {
    entries.FREE_DELIVERY_THRESHOLD_KOPECKS = String(freeRub * 100);
  }

  // Соцсети: строки «label|url» по одной на строку.
  const socialRaw = String(formData.get('socialLinks') ?? '');
  const social = socialRaw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [label, url] = l.split('|').map((x) => x.trim());
      return label && url ? { label, url } : null;
    })
    .filter(Boolean);
  entries.SOCIAL_LINKS = JSON.stringify(social);

  await prisma.$transaction(
    Object.entries(entries).map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } }),
    ),
  );

  await audit({ actor: admin.username, action: 'settings.update' });
  revalidatePath('/');
  revalidatePath('/admin/settings');
  revalidatePath('/admin/delivery');
  revalidatePath('/admin/contacts');
  return { ok: true };
}
