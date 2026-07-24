// Создание/обновление администратора.
// Использование: npm run admin:create -- <логин> <пароль>
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

async function main() {
  const [, , username, password] = process.argv;
  if (!username || !password) {
    console.error('Использование: npm run admin:create -- <логин> <пароль>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Пароль должен быть не короче 8 символов.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  await prisma.adminUser.upsert({
    where: { username },
    create: { username, passwordHash },
    update: { passwordHash },
  });
  console.log(`Администратор «${username}» создан/обновлён.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
