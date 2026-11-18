import type { Product } from '../db/types';

/**
 * Mengambil angka masa aktif (hari) dari nama produk (angka setelah '/' pertama).
 * Contoh: "Tsel 10/28" -> 28, "Tsel 10 / 28" -> 28, "IM3 4/3" -> 3.
 * Mengembalikan null bila tidak ada '/' atau tidak ada angka setelah '/'.
 */
export function parseVoucherDays(name: string): number | null {
  if (!name) return null;
  const match = name.match(/\/\s*(\d+)/);
  if (!match || !match[1]) return null;
  const num = parseInt(match[1], 10);
  return isNaN(num) ? null : num;
}

/**
 * Mengambil angka kuota dari nama produk (angka sebelum '/' pertama).
 * Contoh: "Tsel 10/28" -> 10, "Tsel 4/5" -> 4, "Tsel 11/5" -> 11.
 * Mengembalikan null bila tidak ada '/' atau tidak ada angka sebelum '/'.
 */
export function parseVoucherQuota(name: string): number | null {
  if (!name) return null;
  const slashIndex = name.indexOf('/');
  if (slashIndex === -1) return null;
  const beforeSlash = name.slice(0, slashIndex);
  const match = beforeSlash.match(/(\d+(?:\.\d+)?)[^\d]*$/);
  if (!match || !match[1]) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

/**
 * Comparator untuk mengurutkan daftar produk di Master Produk (b23):
 * 1. Provider (operator) terlebih dahulu:
 *    - Alfabetis, case-insensitive (localeCompare dengan sensitivity: 'base').
 *    - Operator kosong / tidak terisi diletakkan di grup paling akhir.
 * 2. Masa aktif (hari setelah '/'):
 *    - Numerik menaik (2 < 5 < 7 < 28).
 *    - Tanpa '/' atau tanpa angka setelah '/': hari = Infinity (di akhir grup provider).
 * 3. Seri (hari sama):
 *    a. Angka sebelum '/' (kuota), numerik menaik (4/5 sebelum 11/5).
 *    b. Bila kuota sama atau tidak ada '/': nama produk alfabetis case-insensitive.
 *    c. ID produk untuk urutan yang 100% deterministik.
 */
export function compareProducts(a: Product, b: Product): number {
  // 1. Provider (operator)
  const opA = (a.operator ?? '').trim();
  const opB = (b.operator ?? '').trim();

  const hasOpA = opA.length > 0;
  const hasOpB = opB.length > 0;

  if (hasOpA && !hasOpB) {
    return -1; // a ada operator, b kosong -> a lebih dulu
  }
  if (!hasOpA && hasOpB) {
    return 1; // a kosong, b ada operator -> a di belakang
  }
  if (hasOpA && hasOpB) {
    const opComp = opA.localeCompare(opB, undefined, { sensitivity: 'base' });
    if (opComp !== 0) {
      return opComp;
    }
  }

  // 2. Masa aktif (hari setelah "/")
  const rawDaysA = parseVoucherDays(a.name);
  const rawDaysB = parseVoucherDays(b.name);

  const daysA = rawDaysA !== null ? rawDaysA : Infinity;
  const daysB = rawDaysB !== null ? rawDaysB : Infinity;

  if (daysA !== daysB) {
    return daysA - daysB;
  }

  // 3. Seri (hari sama)
  // 3.a Kuota sebelum "/"
  const rawQuotaA = parseVoucherQuota(a.name);
  const rawQuotaB = parseVoucherQuota(b.name);

  const quotaA = rawQuotaA !== null ? rawQuotaA : Infinity;
  const quotaB = rawQuotaB !== null ? rawQuotaB : Infinity;

  if (quotaA !== quotaB) {
    return quotaA - quotaB;
  }

  // 3.b Nama produk alfabetis case-insensitive
  const nameComp = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  if (nameComp !== 0) {
    return nameComp;
  }

  // 3.c Deterministik fallback
  return (a.id ?? '').localeCompare(b.id ?? '');
}
