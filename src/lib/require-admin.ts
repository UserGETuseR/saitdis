import { redirect } from 'next/navigation';
import { getAdminSession } from './auth';

/** Гарантирует наличие сессии администратора, иначе редирект на логин. */
export async function requireAdmin(): Promise<{ uid: string; username: string }> {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
