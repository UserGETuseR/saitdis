import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/payments';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

/**
 * Приём webhook от эквайринга. Проверяет подпись и идемпотентно обновляет
 * статус оплаты заказа. Повторная доставка того же события не меняет данные.
 */
export async function POST(req: Request) {
  const provider = getPaymentProvider();
  const raw = await req.text();
  const signature =
    req.headers.get('x-signature') ??
    req.headers.get('signature') ??
    req.headers.get('x-api-signature');

  const result = provider.verifyWebhook(raw, signature);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  if (!result.providerRef || !result.status) {
    return NextResponse.json({ ok: true, note: 'нет данных для обновления' });
  }

  const order = await prisma.order.findFirst({
    where: { paymentProviderRef: result.providerRef },
  });
  if (!order) {
    // Неизвестный платёж — подтверждаем приём, но ничего не меняем.
    return NextResponse.json({ ok: true, note: 'заказ не найден' });
  }

  // Идемпотентность: если статус уже установлен — не обрабатываем повторно.
  if (order.paymentStatus === result.status) {
    return NextResponse.json({ ok: true, note: 'уже обработано' });
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: result.status },
  });
  await audit({
    actor: 'payment-webhook',
    action: 'payment.status',
    entity: 'Order',
    entityId: order.id,
    meta: { status: result.status, providerRef: result.providerRef },
  });

  return NextResponse.json({ ok: true });
}
