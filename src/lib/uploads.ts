import { randomBytes } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ALLOWED = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 МБ

export interface UploadResult {
  ok: boolean;
  url?: string;
  error?: string;
}

/**
 * Сохраняет загруженное изображение в public/uploads с безопасным случайным
 * именем. Проверяет тип и размер. Возвращает публичный URL.
 */
export async function saveUploadedImage(file: File): Promise<UploadResult> {
  if (!file || file.size === 0) return { ok: false, error: 'Файл не выбран' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'Файл больше 5 МБ' };

  const ext = ALLOWED.get(file.type);
  if (!ext) return { ok: false, error: 'Допустимы только JPEG, PNG, WebP, AVIF' };

  const buffer = Buffer.from(await file.arrayBuffer());
  const name = `${Date.now()}-${randomBytes(8).toString('hex')}.${ext}`;
  const dir = path.join(process.cwd(), 'public', 'uploads');
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buffer);

  return { ok: true, url: `/uploads/${name}` };
}
