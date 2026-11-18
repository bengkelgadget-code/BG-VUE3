import { describe, it, expect } from 'vitest';
import { compareProducts, parseVoucherDays, parseVoucherQuota } from '../src/utils/productSort';
import type { Product } from '../src/db/types';

function makeProduct(partial: Partial<Product>): Product {
  return {
    id: partial.id ?? Math.random().toString(),
    name: partial.name ?? 'Produk Test',
    category: partial.category ?? 'voucher',
    operator: partial.operator,
    denomination: partial.denomination,
    modal: partial.modal ?? 10000,
    hargaJual: partial.hargaJual ?? 12000,
    stock: partial.stock ?? 10,
    stockMin: partial.stockMin ?? 0,
    isActive: partial.isActive ?? true,
    createdAt: partial.createdAt ?? Date.now(),
    updatedAt: partial.updatedAt ?? Date.now(),
  };
}

describe('b23: Product Sorting & Voucher Duration Parsing', () => {
  describe('Helper: parseVoucherDays', () => {
    it('mengambil angka masa aktif setelah slash', () => {
      expect(parseVoucherDays('Tsel 10/28')).toBe(28);
      expect(parseVoucherDays('IM3 4/3')).toBe(3);
      expect(parseVoucherDays('Tsel 6/2')).toBe(2);
      expect(parseVoucherDays('Tsel 7/7')).toBe(7);
    });

    it('mendukung spasi di sekitar slash ("Tsel 10 / 28" -> 28)', () => {
      expect(parseVoucherDays('Tsel 10 / 28')).toBe(28);
      expect(parseVoucherDays('Tsel 10/ 28')).toBe(28);
      expect(parseVoucherDays('Tsel 10 /28')).toBe(28);
    });

    it('mengembalikan null jika tidak ada slash atau tidak ada angka setelah slash', () => {
      expect(parseVoucherDays('Tsel Segel')).toBeNull();
      expect(parseVoucherDays('Tsel Promo/')).toBeNull();
      expect(parseVoucherDays('Tsel Promo/hari')).toBeNull();
      expect(parseVoucherDays('')).toBeNull();
    });
  });

  describe('Helper: parseVoucherQuota', () => {
    it('mengambil angka kuota sebelum slash pertama', () => {
      expect(parseVoucherQuota('Tsel 10/28')).toBe(10);
      expect(parseVoucherQuota('Tsel 4/5')).toBe(4);
      expect(parseVoucherQuota('Tsel 11/5')).toBe(11);
      expect(parseVoucherQuota('IM3 4/3')).toBe(4);
    });

    it('mendukung kuota desimal dan spasi di sekitar slash', () => {
      expect(parseVoucherQuota('Tsel 1.5/3')).toBe(1.5);
      expect(parseVoucherQuota('Tsel 10 / 28')).toBe(10);
      expect(parseVoucherQuota('XL Xtra 30GB / 30')).toBe(30);
    });

    it('mengembalikan null jika tidak ada slash atau tidak ada angka sebelum slash', () => {
      expect(parseVoucherQuota('Perdana Segel')).toBeNull();
      expect(parseVoucherQuota('Voucher/30')).toBeNull();
    });
  });

  describe('compareProducts', () => {
    it('provider dikelompokkan & alfabetis (INDOSAT sebelum TELKOMSEL, case-insensitive)', () => {
      const p1 = makeProduct({ id: '1', operator: 'TELKOMSEL', name: 'Tsel 10/28' });
      const p2 = makeProduct({ id: '2', operator: 'indosat', name: 'IM3 4/3' });
      const p3 = makeProduct({ id: '3', operator: 'Telkomsel', name: 'Tsel 6/2' });

      // Indosat harus sebelum Telkomsel
      expect(compareProducts(p2, p1)).toBeLessThan(0);
      expect(compareProducts(p1, p2)).toBeGreaterThan(0);

      // 'telkomsel' vs 'Telkomsel' dianggap sama (group provider sama)
      // Karena p3 (2 hari) vs p1 (28 hari), p3 lebih dulu
      expect(compareProducts(p3, p1)).toBeLessThan(0);
    });

    it('hari diurutkan NUMERIK: 2, 5, 7, 28 (bukan leksikografis "10" < "2")', () => {
      const pDay2 = makeProduct({ id: '1', operator: 'TELKOMSEL', name: 'Tsel 6/2' });
      const pDay5 = makeProduct({ id: '2', operator: 'TELKOMSEL', name: 'Tsel 4/5' });
      const pDay7 = makeProduct({ id: '3', operator: 'TELKOMSEL', name: 'Tsel 7/7' });
      const pDay28 = makeProduct({ id: '4', operator: 'TELKOMSEL', name: 'Tsel 10/28' });

      const sorted = [pDay28, pDay7, pDay2, pDay5].sort(compareProducts);
      expect(sorted.map((p) => p.name)).toEqual([
        'Tsel 6/2',
        'Tsel 4/5',
        'Tsel 7/7',
        'Tsel 10/28',
      ]);
    });

    it('seri hari -> kuota menaik (4/5 sebelum 11/5); seri penuh -> nama alfabetis', () => {
      const p1 = makeProduct({ id: '1', operator: 'TELKOMSEL', name: 'Tsel 4/5' });
      const p2 = makeProduct({ id: '2', operator: 'TELKOMSEL', name: 'Tsel 11/5' });
      const p3a = makeProduct({ id: '3', operator: 'TELKOMSEL', name: 'Tsel 10/30 Alpha' });
      const p3b = makeProduct({ id: '4', operator: 'TELKOMSEL', name: 'Tsel 10/30 Beta' });

      expect(compareProducts(p1, p2)).toBeLessThan(0); // 4 < 11
      expect(compareProducts(p2, p1)).toBeGreaterThan(0);

      expect(compareProducts(p3a, p3b)).toBeLessThan(0); // 'Alpha' < 'Beta'
    });

    it('nama tanpa "/" diletakkan di AKHIR grup provider-nya', () => {
      const pWithSlash = makeProduct({ id: '1', operator: 'TELKOMSEL', name: 'Tsel 10/28' });
      const pNoSlash = makeProduct({ id: '2', operator: 'TELKOMSEL', name: 'Perdana Tsel Segel' });

      const sorted = [pNoSlash, pWithSlash].sort(compareProducts);
      expect(sorted.map((p) => p.name)).toEqual([
        'Tsel 10/28',
        'Perdana Tsel Segel',
      ]);
    });

    it('operator kosong diletakkan di grup PALING AKHIR setelah semua provider bernama', () => {
      const pNamed1 = makeProduct({ id: '1', operator: 'INDOSAT', name: 'IM3 4/3' });
      const pNamed2 = makeProduct({ id: '2', operator: 'TELKOMSEL', name: 'Tsel 6/2' });
      const pEmpty1 = makeProduct({ id: '3', operator: '', name: 'Voucher Universal 1/1' });
      const pEmpty2 = makeProduct({ id: '4', operator: undefined, name: 'Voucher Universal 2/2' });

      const sorted = [pEmpty1, pNamed2, pEmpty2, pNamed1].sort(compareProducts);
      expect(sorted[0].operator).toBe('INDOSAT');
      expect(sorted[1].operator).toBe('TELKOMSEL');
      // Produk dengan operator kosong di akhir
      expect(sorted[2].operator).toBe('');
      expect(sorted[3].operator).toBeUndefined();
    });

    it('mengurutkan data contoh dari screenshot user dengan persis', () => {
      // Data acak: Tsel 10/28, IM3 4/3, Tsel 7/7, Tsel 6/2, Tsel 11/5, Tsel 4/5
      const list: Product[] = [
        makeProduct({ id: '1', operator: 'TELKOMSEL', name: 'Tsel 10/28' }),
        makeProduct({ id: '2', operator: 'INDOSAT', name: 'IM3 4/3' }),
        makeProduct({ id: '3', operator: 'TELKOMSEL', name: 'Tsel 7/7' }),
        makeProduct({ id: '4', operator: 'TELKOMSEL', name: 'Tsel 6/2' }),
        makeProduct({ id: '5', operator: 'TELKOMSEL', name: 'Tsel 11/5' }),
        makeProduct({ id: '6', operator: 'TELKOMSEL', name: 'Tsel 4/5' }),
      ];

      const sorted = [...list].sort(compareProducts);
      expect(sorted.map((p) => p.name)).toEqual([
        'IM3 4/3',
        'Tsel 6/2',
        'Tsel 4/5',
        'Tsel 11/5',
        'Tsel 7/7',
        'Tsel 10/28',
      ]);
    });
  });
});
