'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { ProductType } from '@/lib/constants';
import {
  priceCart,
  normalizeGrams,
  type CartTotals,
  type PricingProduct,
} from '@/lib/pricing';
import type { MenuProduct } from '@/lib/catalog';

const STORAGE_KEY = 'od_cart_v1';

export interface CartItem {
  productId: string;
  productType: ProductType;
  name: string;
  unitLabel: string | null;
  imageUrl: string | null;
  basePriceKopecks: number;
  baseWeightGrams: number | null;
  weightStepGrams: number | null;
  minWeightGrams: number | null;
  maxWeightGrams: number | null;
  grams: number | null;
  quantity: number;
  isAvailable: boolean;
  needsConfirmation: boolean;
  priceChanged?: boolean;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  ready: boolean;
  syncing: boolean;
  isOpen: boolean;
  minimumOrderWeightGrams: number;
  freeDeliveryThresholdKopecks: number;
  totals: CartTotals;
  totalsFor: (fulfillment: 'DELIVERY' | 'PICKUP') => CartTotals;
  open: () => void;
  close: () => void;
  addProduct: (p: MenuProduct, opts: { grams?: number; quantity?: number }) => void;
  setGrams: (productId: string, grams: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function toPricingProduct(i: CartItem): PricingProduct {
  return {
    id: i.productId,
    name: i.name,
    productType: i.productType,
    basePriceKopecks: i.basePriceKopecks,
    baseWeightGrams: i.baseWeightGrams,
    weightStepGrams: i.weightStepGrams,
    minWeightGrams: i.minWeightGrams,
    maxWeightGrams: i.maxWeightGrams,
    unitLabel: i.unitLabel,
    isAvailable: i.isAvailable,
    needsConfirmation: i.needsConfirmation,
  };
}

export function CartProvider({
  children,
  minimumOrderWeightGrams,
  freeDeliveryThresholdKopecks,
}: {
  children: React.ReactNode;
  minimumOrderWeightGrams: number;
  freeDeliveryThresholdKopecks: number;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const didSync = useRef(false);

  // Загрузка из localStorage при монтировании.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      /* игнорируем повреждённое хранилище */
    }
    setReady(true);
  }, []);

  // Сохранение.
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* переполнение хранилища и т.п. */
    }
  }, [items, ready]);

  // Синхронизация цен/наличия с сервером (сервер — источник цены).
  useEffect(() => {
    if (!ready || didSync.current) return;
    didSync.current = true;
    const current = items;
    if (current.length === 0) return;

    setSyncing(true);
    fetch('/api/cart/price', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: current.map((i) => ({
          productId: i.productId,
          grams: i.grams,
          quantity: i.quantity,
        })),
      }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.products) return;
        const byId = new Map<string, MenuProduct>(
          data.products.map((p: MenuProduct) => [p.id, p]),
        );
        setItems((prev) =>
          prev
            .map((i) => {
              const fresh = byId.get(i.productId);
              if (!fresh) {
                // товар исчез из каталога
                return { ...i, isAvailable: false };
              }
              const priceChanged = fresh.basePriceKopecks !== i.basePriceKopecks;
              return {
                ...i,
                name: fresh.name,
                unitLabel: fresh.unitLabel,
                imageUrl: fresh.imageUrl,
                basePriceKopecks: fresh.basePriceKopecks,
                baseWeightGrams: fresh.baseWeightGrams,
                weightStepGrams: fresh.weightStepGrams,
                minWeightGrams: fresh.minWeightGrams,
                maxWeightGrams: fresh.maxWeightGrams,
                isAvailable: fresh.isAvailable,
                needsConfirmation: fresh.needsConfirmation,
                priceChanged,
              };
            }),
        );
      })
      .catch(() => {
        /* оффлайн — оставляем сохранённые данные */
      })
      .finally(() => setSyncing(false));
  }, [ready, items]);

  const totalsFor = useCallback(
    (fulfillment: 'DELIVERY' | 'PICKUP'): CartTotals =>
      priceCart(
        items.map((i) => ({
          product: toPricingProduct(i),
          grams: i.grams,
          quantity: i.quantity,
        })),
        { minimumOrderWeightGrams, freeDeliveryThresholdKopecks, fulfillmentType: fulfillment },
      ),
    [items, minimumOrderWeightGrams, freeDeliveryThresholdKopecks],
  );

  const totals = useMemo(() => totalsFor('DELIVERY'), [totalsFor]);

  const count = useMemo(
    () => items.filter((i) => i.isAvailable).reduce((s, i) => s + i.quantity, 0),
    [items],
  );

  const addProduct = useCallback(
    (p: MenuProduct, opts: { grams?: number; quantity?: number }) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === p.id);
        if (p.productType === 'WEIGHTED') {
          const grams = normalizeGrams(
            {
              id: p.id,
              name: p.name,
              productType: p.productType,
              basePriceKopecks: p.basePriceKopecks,
              baseWeightGrams: p.baseWeightGrams,
              weightStepGrams: p.weightStepGrams,
              minWeightGrams: p.minWeightGrams,
              maxWeightGrams: p.maxWeightGrams,
              unitLabel: p.unitLabel,
              isAvailable: p.isAvailable,
              needsConfirmation: p.needsConfirmation,
            },
            opts.grams ?? p.minWeightGrams ?? 100,
          );
          if (existing) {
            return prev.map((i) =>
              i.productId === p.id ? { ...i, grams, quantity: 1 } : i,
            );
          }
          return [...prev, makeItem(p, grams, 1)];
        }
        // fixed / unit / size
        const addQty = opts.quantity ?? 1;
        if (existing) {
          return prev.map((i) =>
            i.productId === p.id
              ? { ...i, quantity: Math.min(i.quantity + addQty, 99) }
              : i,
          );
        }
        return [...prev, makeItem(p, null, addQty)];
      });
      setIsOpen(true);
    },
    [],
  );

  const setGrams = useCallback((productId: string, grams: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId
          ? { ...i, grams: normalizeGrams(toPricingProduct(i), grams) }
          : i,
      ),
    );
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    const q = Math.min(Math.max(Math.floor(quantity), 1), 99);
    setItems((prev) =>
      prev.map((i) => (i.productId === productId ? { ...i, quantity: q } : i)),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const value: CartContextValue = {
    items,
    count,
    ready,
    syncing,
    isOpen,
    minimumOrderWeightGrams,
    freeDeliveryThresholdKopecks,
    totals,
    totalsFor,
    open,
    close,
    addProduct,
    setGrams,
    setQuantity,
    remove,
    clear,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function makeItem(p: MenuProduct, grams: number | null, quantity: number): CartItem {
  return {
    productId: p.id,
    productType: p.productType,
    name: p.name,
    unitLabel: p.unitLabel,
    imageUrl: p.imageUrl,
    basePriceKopecks: p.basePriceKopecks,
    baseWeightGrams: p.baseWeightGrams,
    weightStepGrams: p.weightStepGrams,
    minWeightGrams: p.minWeightGrams,
    maxWeightGrams: p.maxWeightGrams,
    grams,
    quantity,
    isAvailable: p.isAvailable,
    needsConfirmation: p.needsConfirmation,
  };
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart должен использоваться внутри CartProvider');
  return ctx;
}
