import { prisma } from './prisma';

/** Пишет запись в журнал значимых действий администратора. Не бросает исключений. */
export async function audit(params: {
  actor: string;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: unknown;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actor: params.actor,
        action: params.action,
        entity: params.entity ?? null,
        entityId: params.entityId ?? null,
        meta: params.meta === undefined ? null : JSON.stringify(params.meta),
      },
    });
  } catch (err) {
    console.error('[audit] не удалось записать журнал:', err);
  }
}
