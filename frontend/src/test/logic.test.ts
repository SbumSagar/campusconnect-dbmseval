import { describe, expect, it } from 'vitest';
import { cartOps, type Cart } from '../context/CartContext';
import type { MenuItem } from '../types';
import { batchOf, dateRange, displayName, initials, isDemoId, isOpenNow, money } from '../utils/format';

const item = (store: string, name: string, price: number): MenuItem => ({ store_name: store, item_name: name, category: 'X', price, is_available: true });
const empty: Cart = { store_name: null, lines: [] };

describe('cart (one store per order)', () => {
  it('adds items and increments quantities', () => {
    let c = cartOps.add(empty, item('Central Canteen', 'Masala Dosa', 60))!;
    c = cartOps.add(c, item('Central Canteen', 'Masala Dosa', 60))!;
    c = cartOps.add(c, item('Central Canteen', 'Filter Coffee', 20))!;
    expect(c.store_name).toBe('Central Canteen');
    expect(c.lines).toEqual([
      { item_name: 'Masala Dosa', category: 'X', price: 60, quantity: 2 },
      { item_name: 'Filter Coffee', category: 'X', price: 20, quantity: 1 },
    ]);
    expect(cartOps.count(c)).toBe(3);
    expect(cartOps.subtotal(c)).toBe(140);
  });

  it('refuses an item from a different store', () => {
    const c = cartOps.add(empty, item('Central Canteen', 'Masala Dosa', 60))!;
    expect(cartOps.add(c, item('Campus Café', 'Cappuccino', 90))).toBeNull();
  });

  it('changes and removes quantities; an emptied cart forgets its store', () => {
    let c = cartOps.add(empty, item('Central Canteen', 'Masala Dosa', 60))!;
    c = cartOps.setQuantity(c, 'Masala Dosa', 5);
    expect(cartOps.subtotal(c)).toBe(300);
    c = cartOps.setQuantity(c, 'Masala Dosa', 0);
    expect(c).toEqual(empty);
  });

  it('caps a line at 20 units', () => {
    const c = cartOps.setQuantity(cartOps.add(empty, item('S', 'I', 1))!, 'I', 99);
    expect(c.lines[0].quantity).toBe(20);
  });
});

describe('formatting helpers', () => {
  it('formats rupees', () => {
    expect(money(1234.5)).toBe('₹1,234.5');
    expect(money(132979)).toBe('₹1,32,979');
  });

  it('title-cases capitalised roster names only', () => {
    expect(displayName('GURRAM ADITH REDDY')).toBe('Gurram Adith Reddy');
    expect(displayName('M A FAHEEM ADNAN')).toBe('M A Faheem Adnan');
    expect(displayName('Aarav Mehta')).toBe('Aarav Mehta');
    expect(initials('Dr. Vikram Shetty')).toBe('VS');
  });

  it('knows when a store is open, including past midnight', () => {
    const at = (h: number, m = 0) => new Date(`2026-11-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
    expect(isOpenNow('08:00', '20:00', at(12))).toBe(true);
    expect(isOpenNow('08:00', '20:00', at(20))).toBe(false);
    expect(isOpenNow('20:00', '03:00', at(23, 30))).toBe(true);
    expect(isOpenNow('20:00', '03:00', at(2))).toBe(true);
    expect(isOpenNow('20:00', '03:00', at(10))).toBe(false);
    expect(isOpenNow(null, '03:00')).toBeNull();
  });

  it('describes date ranges', () => {
    expect(dateRange('2026-08-15T00:00:00+05:30', '2026-08-15T23:59:00+05:30')).toMatch(/15 Aug 2026/);
  });

  it('reads batch and demo flags from IDs', () => {
    expect(batchOf('2024A7PS0392H')).toBe('2024');
    expect(isDemoId('DEMO2023A7PS001H')).toBe(true);
    expect(isDemoId('2020A3PS2116H')).toBe(false);
  });
});
