import { TIMEZONE } from '../core/constants';

export interface PeriodRange {
  from: number; // epoch ms (inklusif)
  to: number; // epoch ms (inklusif)
  label: string;
  prevFrom: number;
  prevTo: number;
  prevLabel: string;
}

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000; // UTC+8

/**
 * Mengambil tanggal dalam format YYYY-MM-DD WITA dari epoch ms
 */
export function getWitaDateString(epochMs: number): string {
  const witaDate = new Date(epochMs + WITA_OFFSET_MS);
  const y = witaDate.getUTCFullYear();
  const m = String(witaDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(witaDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse string YYYY-MM-DD menjadi epoch ms jam 12:00:00 WITA (tengah hari)
 */
export function parseWitaDateToEpoch(dateStr: string): number {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10);
  const d = parseInt(parts[2] || '1', 10);
  return Date.UTC(y, m - 1, d, 12, 0, 0, 0) - WITA_OFFSET_MS;
}

/**
 * Mengambil tanggal hari ini dalam format YYYY-MM-DD WITA
 */
export function getTodayWitaString(): string {
  return getWitaDateString(Date.now());
}

/**
 * Mengambil bulan saat ini dalam format YYYY-MM WITA
 */
export function getCurrentMonthWitaString(): string {
  const now = new Date();
  const witaDate = new Date(now.getTime() + WITA_OFFSET_MS);
  const y = witaDate.getUTCFullYear();
  const m = String(witaDate.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Menghitung rentang waktu harian WITA (00:00:00.000 - 23:59:59.999 WITA).
 * Termasuk rentang hari kemarin untuk perbandingan selisih.
 */
export function getDailyPeriodRange(dateStr: string): PeriodRange {
  // dateStr: 'YYYY-MM-DD'
  const parts = dateStr.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10);
  const d = parseInt(parts[2] || '1', 10);

  const from = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - WITA_OFFSET_MS;
  const to = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - WITA_OFFSET_MS;

  // Hari kemarin
  const prevDate = new Date(Date.UTC(y, m - 1, d - 1));
  const py = prevDate.getUTCFullYear();
  const pm = prevDate.getUTCMonth() + 1;
  const pd = prevDate.getUTCDate();

  const prevFrom = Date.UTC(py, pm - 1, pd, 0, 0, 0, 0) - WITA_OFFSET_MS;
  const prevTo = Date.UTC(py, pm - 1, pd, 23, 59, 59, 999) - WITA_OFFSET_MS;

  const labelFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return {
    from,
    to,
    label: labelFormatter.format(new Date(from + 4 * 3600 * 1000)), // mid-day
    prevFrom,
    prevTo,
    prevLabel: labelFormatter.format(new Date(prevFrom + 4 * 3600 * 1000)),
  };
}

/**
 * Menghitung rentang waktu bulanan WITA (awal bulan 00:00:00 hingga akhir bulan 23:59:59.999 WITA).
 * Termasuk rentang bulan sebelumnya untuk perbandingan selisih.
 * Mendukung tahun kabisat (Februari 29 hari) dan pergantian tahun (Desember -> Januari).
 */
export function getMonthlyPeriodRange(yearMonthStr: string): PeriodRange {
  // yearMonthStr: 'YYYY-MM'
  const parts = yearMonthStr.split('-');
  const y = parseInt(parts[0] || '2026', 10);
  const m = parseInt(parts[1] || '1', 10); // 1-12

  // Jumlah hari dalam bulan m
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

  const from = Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - WITA_OFFSET_MS;
  const to = Date.UTC(y, m - 1, daysInMonth, 23, 59, 59, 999) - WITA_OFFSET_MS;

  // Bulan sebelumnya
  let py = y;
  let pm = m - 1;
  if (pm < 1) {
    pm = 12;
    py = y - 1;
  }
  const daysInPrevMonth = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const prevFrom = Date.UTC(py, pm - 1, 1, 0, 0, 0, 0) - WITA_OFFSET_MS;
  const prevTo = Date.UTC(py, pm - 1, daysInPrevMonth, 23, 59, 59, 999) - WITA_OFFSET_MS;

  const monthFormatter = new Intl.DateTimeFormat('id-ID', {
    timeZone: TIMEZONE,
    month: 'long',
    year: 'numeric',
  });

  return {
    from,
    to,
    label: monthFormatter.format(new Date(from + 86400000 * 5)),
    prevFrom,
    prevTo,
    prevLabel: monthFormatter.format(new Date(prevFrom + 86400000 * 5)),
  };
}
