import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { MenuItem } from '../types';
import { useAuth } from './AuthContext';

export interface CartLine {
  item_name: string;
  category: string | null;
  price: number;
  quantity: number;
}

export interface Cart {
  store_name: string | null;
  lines: CartLine[];
}

interface CartState extends Cart {
  count: number;
  subtotal: number;
  /** Returns false when the item is from another store (caller decides whether to replace). */
  add: (item: MenuItem) => boolean;
  replaceWith: (item: MenuItem) => void;
  setQuantity: (item_name: string, quantity: number) => void;
  remove: (item_name: string) => void;
  clear: () => void;
  quantityOf: (store: string, item: string) => number;
}

const empty: Cart = { store_name: null, lines: [] };
const CartCtx = createContext<CartState | null>(null);

/** Pure helpers (unit-tested). One store per cart. */
export const cartOps = {
  add(cart: Cart, item: MenuItem): Cart | null {
    if (cart.store_name && cart.store_name !== item.store_name && cart.lines.length) return null;
    const existing = cart.lines.find((l) => l.item_name === item.item_name);
    const lines = existing
      ? cart.lines.map((l) => (l.item_name === item.item_name ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l))
      : [...cart.lines, { item_name: item.item_name, category: item.category, price: Number(item.price), quantity: 1 }];
    return { store_name: item.store_name, lines };
  },
  setQuantity(cart: Cart, item_name: string, quantity: number): Cart {
    const lines = quantity <= 0
      ? cart.lines.filter((l) => l.item_name !== item_name)
      : cart.lines.map((l) => (l.item_name === item_name ? { ...l, quantity: Math.min(20, quantity) } : l));
    return lines.length ? { ...cart, lines } : empty;
  },
  subtotal: (cart: Cart) => cart.lines.reduce((s, l) => s + l.price * l.quantity, 0),
  count: (cart: Cart) => cart.lines.reduce((s, l) => s + l.quantity, 0),
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const key = user?.role === 'student' ? `cc-cart-${user.sub}` : null;
  const [cart, setCart] = useState<Cart>(empty);

  useEffect(() => {
    if (!key) return setCart(empty);
    try {
      const raw = localStorage.getItem(key);
      setCart(raw ? (JSON.parse(raw) as Cart) : empty);
    } catch {
      setCart(empty);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(cart));
    } catch {
      /* storage unavailable - cart still works in memory */
    }
  }, [cart, key]);

  const add = useCallback((item: MenuItem) => {
    const next = cartOps.add(cart, item);
    if (!next) return false;
    setCart(next);
    return true;
  }, [cart]);

  const value = useMemo<CartState>(() => ({
    ...cart,
    count: cartOps.count(cart),
    subtotal: cartOps.subtotal(cart),
    add,
    replaceWith: (item) => setCart(cartOps.add(empty, item)!),
    setQuantity: (n, q) => setCart((c) => cartOps.setQuantity(c, n, q)),
    remove: (n) => setCart((c) => cartOps.setQuantity(c, n, 0)),
    clear: () => setCart(empty),
    quantityOf: (s, i) => (cart.store_name === s ? cart.lines.find((l) => l.item_name === i)?.quantity ?? 0 : 0),
  }), [cart, add]);

  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

export function useCart() {
  const ctx = useContext(CartCtx);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
