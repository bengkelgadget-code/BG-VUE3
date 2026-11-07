import { TIMEZONE } from '../core/constants';

/**
 * Format integer Rupiah sesuai standar BUKU KONTER:
 * Positif: 'Rp 1.250.000'
 * Negatif: '−Rp 50.000' (tanda minus di depan Rp)
 * Nol: 'Rp 0'
 */
export function formatRupiah(amount: number, withPrefix: boolean = true): string {
  if (!Number.isFinite(amount)) return withPrefix ? 'Rp 0' : '0';

  const isNegative = amount < 0;
  const absInt = Math.abs(Math.round(amount));
  const formattedNumber = absInt.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (!withPrefix) {
    return isNegative ? `-${formattedNumber}` : formattedNumber;
  }

  return isNegative ? `−Rp ${formattedNumber}` : `Rp ${formattedNumber}`;
}

/**
 * Parse string menjadi integer Rupiah murni >= 0
 */
export function parseRupiah(val: string | number): number {
  if (typeof val === 'number') {
    return Math.max(0, Math.round(val));
  }
  if (!val) return 0;
  const clean = val.replace(/[^\d]/g, '');
  const parsed = parseInt(clean, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Format timestamp epoch ms ke format tanggal & waktu WITA (Asia/Makassar)
 */
export function formatTanggalWita(
  epochMs: number,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!epochMs) return '-';
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
  };
  return new Intl.DateTimeFormat('id-ID', defaultOptions).format(new Date(epochMs));
}

/**
 * Format timestamp epoch ms ke tanggal pendek WITA (e.g. '8 Nov')
 */
export function formatShortDate(epochMs: number): string {
  if (!epochMs) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE,
    day: 'numeric',
    month: 'short',
  }).format(new Date(epochMs));
}

/**
 * Format tanggal YYYY-MM-DD HH:mm WITA untuk ekspor CSV / log
 */
export function formatCsvDateTime(epochMs: number): string {
  if (!epochMs) return '';
  const d = new Date(epochMs);
  // Menggunakan formatter Intl dengan timezone WITA
  const formatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    partMap[p.type] = p.value;
  }
  return `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}`;
}
