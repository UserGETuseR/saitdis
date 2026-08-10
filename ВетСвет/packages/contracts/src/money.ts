export type Money = Readonly<{ amountMinor: number; currency: 'RUB' }>;

export function rubles(amountMinor: number): Money {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Money must use a non-negative integer amount in minor units.');
  return { amountMinor, currency: 'RUB' };
}
