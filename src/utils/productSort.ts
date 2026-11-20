import type { Product, Account, User, Customer, AdminFeeRule } from '../db/types';

/**
 * Urutan kategori Master Produk (b24):
 * pulsa -> token_pln -> game -> data -> voucher -> perdana -> aksesoris -> lainnya
 */
export const CATEGORY_ORDER: Record<string, number> = {
  pulsa: 1,
  token_pln: 2,
  game: 3,
  data: 4,
  voucher: 5,
  perdana: 6,
  aksesoris: 7,
  lainnya: 8,
};

/**
 * Urutan kelompok tipe akun (b24):
 * Kas -> Rekening Bank -> E-Wallet -> Server Pulsa -> Provider App
 */
export const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  kas: 1,
  bank: 2,
  ewallet: 3,
  server_pulsa: 4,
  provider_app: 5,
};

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  kas: 'KAS',
  bank: 'REKENING BANK',
  ewallet: 'E-WALLET',
  server_pulsa: 'SERVER PULSA',
  provider_app: 'PROVIDER APP',
};

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
 * Comparator untuk mengurutkan daftar produk di Master Produk:
 * 1. Kunci Utama: Kategori produk (b24)
 *    pulsa -> token_pln -> game -> data -> voucher -> perdana -> aksesoris -> lainnya
 * 2. Di dalam kategori yang sama, ikuti aturan b23:
 *    a. Provider (operator) alfabetis case-insensitive (operator kosong di akhir)
 *    b. Masa aktif (hari setelah "/") numerik menaik (2 < 5 < 7 < 28, tanpa "/" di akhir)
 *    c. Seri hari: kuota sebelum "/" numerik menaik (4/5 sebelum 11/5)
 *    d. Nama produk alfabetis case-insensitive
 *    e. ID produk deterministik fallback
 */
export function compareProducts(
  a: Pick<Product, 'name'> & Partial<Product>,
  b: Pick<Product, 'name'> & Partial<Product>
): number {
  // 1. Kategori (b24)
  const catRankA = CATEGORY_ORDER[a.category ?? ''] ?? 99;
  const catRankB = CATEGORY_ORDER[b.category ?? ''] ?? 99;
  if (catRankA !== catRankB) {
    return catRankA - catRankB;
  }

  // 2. Di dalam satu kategori: Provider (operator) (b23)
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

  // 3. Masa aktif (hari setelah "/")
  const rawDaysA = parseVoucherDays(a.name);
  const rawDaysB = parseVoucherDays(b.name);

  const daysA = rawDaysA !== null ? rawDaysA : Infinity;
  const daysB = rawDaysB !== null ? rawDaysB : Infinity;

  if (daysA !== daysB) {
    return daysA - daysB;
  }

  // 4. Seri (hari sama)
  // 4.a Kuota sebelum "/"
  const rawQuotaA = parseVoucherQuota(a.name);
  const rawQuotaB = parseVoucherQuota(b.name);

  const quotaA = rawQuotaA !== null ? rawQuotaA : Infinity;
  const quotaB = rawQuotaB !== null ? rawQuotaB : Infinity;

  if (quotaA !== quotaB) {
    return quotaA - quotaB;
  }

  // 4.b Nama produk alfabetis case-insensitive
  const nameComp = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  if (nameComp !== 0) {
    return nameComp;
  }

  // 4.c Deterministik fallback
  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * Comparator untuk mengurutkan Akun Saldo:
 * Kas -> Rekening Bank -> E-Wallet -> Server Pulsa -> Provider App
 * Di dalam tipe yang sama: alfabetis case-insensitive nama akun
 */
export function compareAccounts(
  a: Pick<Account, 'type' | 'name'> & Partial<Account>,
  b: Pick<Account, 'type' | 'name'> & Partial<Account>
): number {
  const rankA = ACCOUNT_TYPE_ORDER[a.type] ?? 99;
  const rankB = ACCOUNT_TYPE_ORDER[b.type] ?? 99;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const nameComp = (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  if (nameComp !== 0) return nameComp;
  return (a.id ?? '').localeCompare(b.id ?? '');
}

/**
 * Comparator untuk mengurutkan Petugas:
 * Owner paling atas, lalu alfabetis berdasarkan nama
 */
export function compareUsers(
  a: Pick<User, 'role' | 'name'> & Partial<User>,
  b: Pick<User, 'role' | 'name'> & Partial<User>
): number {
  if (a.role === 'owner' && b.role !== 'owner') return -1;
  if (a.role !== 'owner' && b.role === 'owner') return 1;
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
}

/**
 * Comparator untuk mengurutkan Pelanggan:
 * Alfabetis berdasarkan nama
 */
export function compareCustomers(
  a: Pick<Customer, 'name'> & Partial<Customer>,
  b: Pick<Customer, 'name'> & Partial<Customer>
): number {
  return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
}

/**
 * Comparator untuk mengurutkan Aturan Tarif:
 * Berdasarkan nominal awal menaik (minNom ASC)
 */
export function compareFeeRules(
  a: Pick<AdminFeeRule, 'minNom'> & Partial<AdminFeeRule>,
  b: Pick<AdminFeeRule, 'minNom'> & Partial<AdminFeeRule>
): number {
  return a.minNom - b.minNom;
}
