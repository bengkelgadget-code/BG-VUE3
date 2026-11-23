import { LAYANAN_DEFS } from './layanan';

export const APP_NAME = 'BUKU KONTER';
export const APP_VERSION = '0.2.0-b38';
export const APP_BUILD = 38;
export const TIMEZONE = 'Asia/Makassar'; // WITA (UTC+8)

export const SERVICE_CODES = {
  TRANSFER: 'transfer',
  TARIK_TUNAI: 'tarik_tunai',
  TOPUP_EWALLET: 'topup_ewallet',
  PULSA: 'pulsa',
  DATA: 'data',
  TOKEN_PLN: 'token_pln',
  GAME: 'game',
  VOUCHER: 'voucher',
  PERDANA: 'perdana',
  AKSESORIS: 'aksesoris',
  PPOB: 'ppob',
  DEPOSIT_SERVER: 'deposit_server',
  DEPOSIT_PROVIDER: 'deposit_provider',
  PINDAH_DANA: 'pindah_dana',
  PEMBELIAN_STOK: 'pembelian_stok',
  OPERASIONAL: 'operasional',
  PEMASUKAN_LAIN: 'pemasukan_lain',
  JASA_TRANSFER: 'jasa_transfer',
} as const;

export type ServiceCode = typeof SERVICE_CODES[keyof typeof SERVICE_CODES];

export const ACCOUNT_TYPES = {
  KAS: 'kas',
  BANK: 'bank',
  EWALLET: 'ewallet',
  SERVER_PULSA: 'server_pulsa',
  PROVIDER_APP: 'provider_app',
} as const;

export type AccountTypeCode = typeof ACCOUNT_TYPES[keyof typeof ACCOUNT_TYPES];

export const SERVICE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(LAYANAN_DEFS).map((def) => [def.code, def.label])
);

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  kas: 'Kas (Uang Tunai)',
  bank: 'Bank',
  ewallet: 'E-Wallet',
  server_pulsa: 'Server Pulsa (catatan)',
  provider_app: 'Aplikasi Provider (catatan)',
};

export const NOMINAL_LIMITS = {
  MIN: 1,
  MAX: 999_999_999_999,
  SUSPICIOUS_SERVICE_THRESHOLD: 10_000_000,
} as const;

export const DEFAULT_SHIFT_TOLERANCE = 5_000; // Rp5.000
