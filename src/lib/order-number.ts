import type { PrismaClient, Prisma } from '@prisma/client';

/**
 * Генерирует человекочитаемый номер заказа вида OD-260724-0007
 * (OD-ДДММГГ-порядковый за день). Уникальность гарантирует constraint в БД;
 * при коллизии вызывающий код повторяет попытку.
 */
export async function generateOrderNumber(
  db: PrismaClient | Prisma.TransactionClient,
  date = new Date(),
): Promise<string> {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const datePart = `${dd}${mm}${yy}`;

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const countToday = await db.order.count({
    where: { createdAt: { gte: startOfDay, lte: endOfDay } },
  });

  const seq = String(countToday + 1).padStart(4, '0');
  return `OD-${datePart}-${seq}`;
}
