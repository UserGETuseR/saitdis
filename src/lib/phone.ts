// Нормализация и валидация российского номера телефона.

/** Приводит номер к формату +7XXXXXXXXXX или возвращает null, если номер невалиден. */
export function normalizePhone(input: string): string | null {
  const digits = (input || '').replace(/\D/g, '');
  let ten: string | null = null;

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    ten = digits.slice(1);
  } else if (digits.length === 10) {
    ten = digits;
  }

  if (!ten || ten.length !== 10) return null;
  // Российский мобильный/городской: первая цифра 3–9 (отсекаем явный мусор).
  if (!/^[3-9]/.test(ten)) return null;

  return `+7${ten}`;
}

export function isValidPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

/** Форматирует +7XXXXXXXXXX для отображения: +7 909 447-87-84. */
export function formatPhoneDisplay(normalized: string): string {
  const m = normalized.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  if (!m) return normalized;
  return `+7 ${m[1]} ${m[2]}-${m[3]}-${m[4]}`;
}
