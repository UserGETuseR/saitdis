import { PrismaClient } from '@prisma/client';

// Единый экземпляр Prisma Client. В dev-режиме Next.js перезагружает модули,
// поэтому кешируем клиент на globalThis, чтобы не плодить подключения.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
