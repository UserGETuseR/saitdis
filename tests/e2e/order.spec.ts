import { test, expect } from '@playwright/test';

// Основной сценарий: меню → корзина → оформление → подтверждение.
test('оформление заказа с самовывозом', async ({ page }) => {
  await page.goto('/');

  // Меню загружено
  await expect(page.getByRole('heading', { name: 'Выбирайте блюда' })).toBeVisible();

  // Первая карточка — весовой шашлык. Выбираем 300 г и добавляем.
  const firstCard = page.locator('.product-card').first();
  await firstCard.getByRole('button', { name: '300 г' }).click();
  await firstCard.getByRole('button', { name: 'В корзину' }).click();

  // Открылась корзина
  const drawer = page.getByRole('dialog', { name: 'Корзина' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('510 ₽').first()).toBeVisible();

  // Переходим к оформлению
  await drawer.getByRole('link', { name: 'Оформить заказ' }).click();
  await expect(page).toHaveURL(/\/checkout/);

  // Самовывоз (доставка не требует адреса)
  await page.getByRole('button', { name: /Самовывоз/ }).click();

  // Контакты
  await page.getByLabel('Имя *').fill('Тест Автотест');
  await page.getByLabel('Телефон *').fill('9094478784');

  // Согласие + отправка
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Оформить заказ' }).click();

  // Страница подтверждения
  await expect(page).toHaveURL(/\/order\/OD-/);
  await expect(page.getByRole('heading', { name: 'Заказ принят' })).toBeVisible();
});

test('минимальный вес не даёт оформить', async ({ page }) => {
  await page.goto('/');
  // Добавляем весовой товар только 100 г (ниже минимума 300 г).
  const firstCard = page.locator('.product-card').first();
  await firstCard.getByRole('button', { name: '100 г' }).click();
  await firstCard.getByRole('button', { name: 'В корзину' }).click();

  const drawer = page.getByRole('dialog', { name: 'Корзина' });
  await expect(drawer.getByText(/Минимальный вес заказа/)).toBeVisible();
});
