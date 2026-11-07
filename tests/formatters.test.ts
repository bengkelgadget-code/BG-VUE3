import { describe, it, expect } from 'vitest';
import { formatRupiah, parseRupiah, formatTanggalWita, formatCsvDateTime } from '../src/utils/format';

describe('Formatters Rupiah & Tanggal WITA', () => {
  it('harus memformat nominal positif dengan Rp dan pemisah ribuan titik', () => {
    expect(formatRupiah(1250000)).toBe('Rp 1.250.000');
    expect(formatRupiah(500000)).toBe('Rp 500.000');
    expect(formatRupiah(5000)).toBe('Rp 5.000');
    expect(formatRupiah(0)).toBe('Rp 0');
  });

  it('harus memformat nominal negatif dengan tanda minus di depan Rp', () => {
    // Standard PRD §8.3: −Rp 50.000
    expect(formatRupiah(-50000)).toBe('−Rp 50.000');
    expect(formatRupiah(-1250000)).toBe('−Rp 1.250.000');
  });

  it('harus memformat nominal tanpa prefix Rp jika diminta', () => {
    expect(formatRupiah(1250000, false)).toBe('1.250.000');
    expect(formatRupiah(-50000, false)).toBe('-50.000');
  });

  it('harus mem-parse string Rupiah menjadi integer Rupiah murni', () => {
    expect(parseRupiah('Rp 1.250.000')).toBe(1250000);
    expect(parseRupiah('500.000')).toBe(500000);
    expect(parseRupiah('Rp 0')).toBe(0);
    expect(parseRupiah('')).toBe(0);
    expect(parseRupiah('Rp 5.123.456')).toBe(5123456);
  });

  it('harus memformat tanggal dalam zona waktu WITA (Asia/Makassar, UTC+8)', () => {
    // 2026-11-08T00:00:00Z = 2026-11-08 08:00 WITA
    const epoch = Date.UTC(2026, 10, 8, 0, 0, 0);
    const formatted = formatTanggalWita(epoch);
    expect(formatted).toContain('08.00'); // ID locale uses dot or colon for time
    expect(formatted).toContain('2026');

    const csvFormatted = formatCsvDateTime(epoch);
    expect(csvFormatted).toBe('2026-11-08 08:00');
  });
});
