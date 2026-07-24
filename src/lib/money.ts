// Все денежные суммы хранятся и считаются в копейках (целые числа),
// чтобы избежать ошибок округления с плавающей точкой.

export function rublesToKopecks(rubles: number): number {
  return Math.round(rubles * 100);
}

export function kopecksToRubles(kopecks: number): number {
  return kopecks / 100;
}

const rubFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

const rubFormatterWithKopecks = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Форматирует копейки в строку вида «1 500 ₽» (или «1 550,50 ₽» при копейках). */
export function formatKopecks(kopecks: number): string {
  const rubles = kopecks / 100;
  const isWhole = Number.isInteger(rubles);
  const num = isWhole ? rubFormatter.format(rubles) : rubFormatterWithKopecks.format(rubles);
  return `${num} ₽`;
}

/** Форматирует вес в граммах: «100 г» или «1,2 кг». */
export function formatWeight(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} кг`;
  }
  return `${grams} г`;
}
