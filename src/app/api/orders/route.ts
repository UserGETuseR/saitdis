import { NextResponse } from 'next/server';
import { checkoutSchema } from '@/lib/validation';
import { createOrder } from '@/lib/orders';
import { notifyOwnerAboutOrder } from '@/lib/notify';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(req: Request) {
  // Ограничение частоты создания заказов на IP.
  const ip = clientIp(req);
  const limit = rateLimit(`order:${ip}`, 6, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: 'Слишком много попыток. Подождите немного.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Некорректный запрос' }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || 'form';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ ok: false, error: 'Проверьте поля формы', fieldErrors }, { status: 400 });
  }

  const result = await createOrder(parsed.data);
  if (!result.ok || !result.order) {
    const status = result.code === 'INTERNAL' ? 500 : 409;
    return NextResponse.json(
      { ok: false, error: result.error ?? 'Не удалось создать заказ', code: result.code },
      { status },
    );
  }

  // Уведомляем владельца. Ошибка канала НЕ отменяет заказ.
  try {
    await notifyOwnerAboutOrder(result.order.id);
  } catch (err) {
    console.error('[orders] ошибка уведомления (заказ сохранён):', err);
  }

  return NextResponse.json({
    ok: true,
    number: result.order.number,
    id: result.order.id,
  });
}
