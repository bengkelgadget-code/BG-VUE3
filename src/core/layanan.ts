import type { Component } from 'vue';
import {
  ArrowRightLeft,
  Banknote,
  Landmark,
  Wallet,
  Receipt,
  Smartphone,
  Layers,
  Zap,
  Gamepad2,
  Ticket,
  Package,
  ArrowDownUp,
  Server,
  Radio,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from 'lucide-vue-next';

export interface LayananDef {
  code: string;
  label: string;                    // label di pilihan (aksesoris = 'ACC')
  group: 'penjualan' | 'transfer' | 'lainnya' | 'owner';
  icon: Component;                  // ikon lucide (import dari lucide-vue-next)
  keywords: string[];               // untuk pencarian di picker layanan
  productCategories: string[];      // kategori produk yang melekat; [] = tidak ada produk
  productSort: 'telecom' | 'token' | 'alpha' | 'brand-alpha' | 'none';
  hasFee: boolean;                  // tampil field Biaya Admin
  hasFeePaidBy: boolean;            // tampil toggle Bayar Admin Cash/Debit (TIDAK untuk tarik_tunai & jasa_transfer)
  needsSourceAccount: boolean;      // tampil field Sumber Dana
  sourceTypes: string[];            // tipe akun yang boleh jadi sumber (transfer/topup/ppob: bank/ewallet tanpa kas)
  paymentRule: 'kas' | 'kas-bank' | 'kas-mandiri' | 'none'; // aturan Diterima Di (b31); 'none' = tidak ada field Diterima Di
  needsReferenceNo: boolean;        // tampil field Nomor Tujuan / referensi
  referenceOptional: boolean;       // true hanya untuk pulsa
  supportsHutang: boolean;          // tampil toggle Lunas/Hutang
  touchesBalances: boolean;         // false hanya untuk jasa_transfer
  isOwnerOnly: boolean;             // true hanya untuk 5 layanan owner
  hasMargin: boolean;               // true hanya untuk paket data (b36)
}

export const LAYANAN_DEFS: Record<string, LayananDef> = {
  transfer: {
    code: 'transfer',
    label: 'Transfer',
    group: 'transfer',
    icon: ArrowRightLeft,
    keywords: ['tf', 'kirim uang', 'bank', 'trans', 'transfer'],
    productCategories: [],
    productSort: 'none',
    hasFee: true,
    hasFeePaidBy: true,
    needsSourceAccount: true,
    sourceTypes: ['bank', 'ewallet'], // T5: sumber transfer tidak boleh kas
    paymentRule: 'kas',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  tarik_tunai: {
    code: 'tarik_tunai',
    label: 'Tarik Tunai',
    group: 'transfer',
    icon: Banknote,
    keywords: ['tarik tunai', 'tarik', 'tunai', 'trans', 'cash out'],
    productCategories: [],
    productSort: 'none',
    hasFee: true,
    hasFeePaidBy: true,
    needsSourceAccount: true,
    sourceTypes: ['bank'], // T1: rekening terima transfer hanya bank
    paymentRule: 'none', // T1: tidak ada field 'Diterima Di'; kas pembayar mengisi paymentAccountId
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  topup_ewallet: {
    code: 'topup_ewallet',
    label: 'E-Wallet',
    group: 'transfer',
    icon: Wallet,
    keywords: ['dana', 'gopay', 'ovo', 'shopeepay', 'linkaja', 'ewallet', 'topup'],
    productCategories: [],
    productSort: 'none',
    hasFee: true,
    hasFeePaidBy: true,
    needsSourceAccount: true,
    sourceTypes: ['bank', 'ewallet'], // T5: sumber topup tidak boleh kas
    paymentRule: 'kas-mandiri',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  ppob: {
    code: 'ppob',
    label: 'Tagihan PPOB',
    group: 'transfer',
    icon: Receipt,
    keywords: ['ppob', 'tagihan', 'listrik pasca', 'pdam', 'bpjs', 'indihome'],
    productCategories: [],
    productSort: 'none',
    hasFee: true,
    hasFeePaidBy: true,
    needsSourceAccount: true,
    sourceTypes: ['bank', 'ewallet'], // T5: sumber ppob tidak boleh kas
    paymentRule: 'kas-mandiri',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  pulsa: {
    code: 'pulsa',
    label: 'Pulsa',
    group: 'penjualan',
    icon: Smartphone,
    keywords: ['pulsa', 'isi pulsa', 'reguler'],
    productCategories: ['pulsa'],
    productSort: 'telecom',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['server_pulsa'],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: true,
    referenceOptional: true, // B.4: no HP pulsa opsional
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  data: {
    code: 'data',
    label: 'Paket Data',
    group: 'penjualan',
    icon: Layers,
    keywords: ['data', 'kuota', 'paket internet', 'internet'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['server_pulsa', 'provider_app'],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: true,
  },
  token_pln: {
    code: 'token_pln',
    label: 'Token PLN',
    group: 'penjualan',
    icon: Zap,
    keywords: ['pln', 'token', 'listrik', 'token pln', 'stroom'],
    productCategories: ['token_pln'],
    productSort: 'token',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['server_pulsa'],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  game: {
    code: 'game',
    label: 'Game',
    group: 'penjualan',
    icon: Gamepad2,
    keywords: ['game', 'diamond', 'free fire', 'mobile legends', 'ml', 'ff', 'genshin', 'steam'],
    productCategories: ['game'],
    productSort: 'brand-alpha',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['server_pulsa'],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  voucher: {
    code: 'voucher',
    label: 'Voucher',
    group: 'penjualan',
    icon: Ticket,
    keywords: ['voucher fisik', 'kuota voucher', 'voucher', 'gesek'],
    productCategories: ['voucher'],
    productSort: 'telecom',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: false,
    sourceTypes: [],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  perdana: {
    code: 'perdana',
    label: 'Perdana',
    group: 'penjualan',
    icon: Package,
    keywords: ['kartu perdana', 'kartu', 'sim card', 'perdana', 'nomor baru'],
    productCategories: ['perdana'],
    productSort: 'telecom',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: false,
    sourceTypes: [],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  aksesoris: {
    code: 'aksesoris',
    label: 'ACC', // B.5: label ACC
    group: 'penjualan',
    icon: Package,
    keywords: ['acc', 'aksesoris', 'kabel', 'charger', 'casing', 'headset', 'tempered glass'],
    productCategories: ['aksesoris'],
    productSort: 'alpha',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: false,
    sourceTypes: [],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: true,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  jasa_transfer: {
    code: 'jasa_transfer',
    label: 'Jasa Transfer',
    group: 'transfer',
    icon: Landmark,
    keywords: ['jasa transfer', 'edc', 'transfer edc', 'kirim uang edc', 'jasa'],
    productCategories: [],
    productSort: 'none',
    hasFee: true,
    hasFeePaidBy: false,
    needsSourceAccount: false,
    sourceTypes: [],
    paymentRule: 'none',
    needsReferenceNo: true,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: false,
    isOwnerOnly: false,
    hasMargin: false,
  },
  pindah_dana: {
    code: 'pindah_dana',
    label: 'Pindah Dana',
    group: 'owner',
    icon: ArrowDownUp,
    keywords: ['pindah dana', 'mutasi kas', 'tarik kas', 'setor bank'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['kas', 'bank', 'ewallet', 'server_pulsa', 'provider_app'],
    paymentRule: 'none',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: true,
    hasMargin: false,
  },
  deposit_server: {
    code: 'deposit_server',
    label: 'Deposit Server',
    group: 'owner',
    icon: Server,
    keywords: ['deposit server', 'isi saldo server', 'topup server'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['bank'],
    paymentRule: 'none',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: true,
    hasMargin: false,
  },
  deposit_provider: {
    code: 'deposit_provider',
    label: 'Deposit Provider',
    group: 'owner',
    icon: Radio,
    keywords: ['deposit provider', 'digipos', 'rita', 'siDOMPUL', 'simple'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['bank'],
    paymentRule: 'none',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: true,
    hasMargin: false,
  },
  pembelian_stok: {
    code: 'pembelian_stok',
    label: 'Pembelian Stok',
    group: 'owner',
    icon: ShoppingBag,
    keywords: ['pembelian stok', 'beli barang', 'kulakan', 'stok aksesoris'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['kas', 'bank', 'ewallet', 'server_pulsa', 'provider_app'],
    paymentRule: 'none',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: true,
    hasMargin: false,
  },
  operasional: {
    code: 'operasional',
    label: 'Operasional',
    group: 'owner',
    icon: TrendingDown,
    keywords: ['operasional', 'biaya', 'beban', 'pengeluaran', 'listrik toko', 'gaji'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: true,
    sourceTypes: ['kas', 'bank', 'ewallet', 'server_pulsa', 'provider_app'],
    paymentRule: 'none',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
  pemasukan_lain: {
    code: 'pemasukan_lain',
    label: 'Pemasukan Lain',
    group: 'lainnya',
    icon: TrendingUp,
    keywords: ['pemasukan lain', 'pendapatan lain', 'income', 'lain-lain'],
    productCategories: [],
    productSort: 'none',
    hasFee: false,
    hasFeePaidBy: false,
    needsSourceAccount: false,
    sourceTypes: [],
    paymentRule: 'kas-mandiri',
    needsReferenceNo: false,
    referenceOptional: false,
    supportsHutang: false,
    touchesBalances: true,
    isOwnerOnly: false,
    hasMargin: false,
  },
};

/**
 * Urutan baku picker layanan staf (13 layanan):
 * transfer -> tarik_tunai -> topup_ewallet -> ppob -> pulsa -> data -> token_pln -> game -> voucher -> perdana -> aksesoris -> jasa_transfer -> pemasukan_lain
 */
const STAFF_SERVICE_ORDER = [
  'transfer',
  'tarik_tunai',
  'topup_ewallet',
  'ppob',
  'pulsa',
  'data',
  'token_pln',
  'game',
  'voucher',
  'perdana',
  'aksesoris',
  'jasa_transfer',
  'pemasukan_lain',
  'operasional',
];

const OWNER_SERVICE_ORDER = [
  'pindah_dana',
  'deposit_server',
  'deposit_provider',
  'pembelian_stok',
  'operasional',
];

export function getLayananDef(code: string): LayananDef | undefined {
  return LAYANAN_DEFS[code];
}

export function staffLayanan(): LayananDef[] {
  return STAFF_SERVICE_ORDER
    .map((code) => LAYANAN_DEFS[code])
    .filter((def): def is LayananDef => Boolean(def && !def.isOwnerOnly));
}

export function ownerLayanan(): LayananDef[] {
  return OWNER_SERVICE_ORDER
    .map((code) => LAYANAN_DEFS[code])
    .filter((def): def is LayananDef => Boolean(def));
}

export function layananByGroup(group: LayananDef['group']): LayananDef[] {
  return Object.values(LAYANAN_DEFS).filter((def) => def.group === group);
}

export function productCategoriesForLayanan(code: string): string[] {
  return LAYANAN_DEFS[code]?.productCategories ?? [];
}

export function paymentRuleForLayanan(code: string): LayananDef['paymentRule'] {
  return LAYANAN_DEFS[code]?.paymentRule ?? 'none';
}

export function sourceTypesForLayanan(code: string): string[] {
  return LAYANAN_DEFS[code]?.sourceTypes ?? [];
}
