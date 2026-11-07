import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { reportService } from '../src/services/reportService';
import {
  getDailyPeriodRange,
  getMonthlyPeriodRange,
} from '../src/utils/datePeriod';

describe('Dashboard Interaktif Harian & Bulanan (PROMPT Test Wajib)', () => {
  beforeEach(async () => {
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.users.clear();
    await db.accounts.clear();
  });

  it('1. Batas bulan & tahun kabisat (29 Feb 2028) & pergantian tahun Desember -> Januari', () => {
    // Uji Februari tahun kabisat 2028
    const leapFeb = getMonthlyPeriodRange('2028-02');
    const leapEndDate = new Date(leapFeb.to + 8 * 3600 * 1000); // Back to WITA
    expect(leapEndDate.getUTCDate()).toBe(29);
    expect(leapEndDate.getUTCMonth() + 1).toBe(2);

    // Uji Februari bukan kabisat 2026
    const nonLeapFeb = getMonthlyPeriodRange('2026-02');
    const nonLeapEndDate = new Date(nonLeapFeb.to + 8 * 3600 * 1000);
    expect(nonLeapEndDate.getUTCDate()).toBe(28);

    // Uji pergantian tahun: Januari 2027 memiliki bulan sebelumnya Desember 2026
    const jan2027 = getMonthlyPeriodRange('2027-01');
    const prevStartDate = new Date(jan2027.prevFrom + 8 * 3600 * 1000);
    const prevEndDate = new Date(jan2027.prevTo + 8 * 3600 * 1000);
    expect(prevStartDate.getUTCFullYear()).toBe(2026);
    expect(prevStartDate.getUTCMonth() + 1).toBe(12);
    expect(prevStartDate.getUTCDate()).toBe(1);
    expect(prevEndDate.getUTCDate()).toBe(31);
  });

  it('2. Agregasi harian: transaksi 8 Nov hanya masuk ke 8 Nov, tidak bocor ke 7 atau 9 Nov', async () => {
    const range8Nov = getDailyPeriodRange('2026-11-08');

    // Transaksi 7 Nov 23:59:00 WITA (1 menit sebelum 8 Nov)
    const time7Nov = range8Nov.from - 60000;
    // Transaksi 8 Nov 12:00:00 WITA (siang hari)
    const time8Nov = range8Nov.from + 12 * 3600 * 1000;
    // Transaksi 9 Nov 00:01:00 WITA (1 menit setelah 8 Nov)
    const time9Nov = range8Nov.to + 60000;

    // Tambah transaksi 7 Nov
    await db.transactions.add({
      id: 'tx-7nov',
      layanan: 'transfer',
      shiftId: 's1',
      userId: 'u1',
      nominal: 100000,
      fee: 2500,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: time7Nov,
      createdAt: time7Nov,
      updatedAt: time7Nov,
    });

    // Tambah transaksi 8 Nov
    await db.transactions.add({
      id: 'tx-8nov',
      layanan: 'pulsa',
      shiftId: 's1',
      userId: 'u1',
      nominal: 50000,
      fee: 0,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: time8Nov,
      createdAt: time8Nov,
      updatedAt: time8Nov,
    });

    // Tambah transaksi 9 Nov
    await db.transactions.add({
      id: 'tx-9nov',
      layanan: 'tarik_tunai',
      shiftId: 's1',
      userId: 'u1',
      nominal: 200000,
      fee: 5000,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: time9Nov,
      createdAt: time9Nov,
      updatedAt: time9Nov,
    });

    // Query 8 Nov
    const totalIn = await reportService.totalIn(range8Nov.from, range8Nov.to);
    const count = await reportService.transactionCount(range8Nov.from, range8Nov.to);

    // Hanya transaksi pulsa 8 Nov yang masuk (50.000)
    expect(count).toBe(1);
    expect(totalIn).toBe(50000);
  });

  it('3. Agregasi bulanan: transaksi 31 Okt tidak masuk ke November; transaksi 1 Nov masuk', async () => {
    const rangeNov = getMonthlyPeriodRange('2026-11');

    // 31 Okt 23:59:00 WITA
    const time31Okt = rangeNov.from - 60000;
    // 1 Nov 00:05:00 WITA
    const time1Nov = rangeNov.from + 300000;

    await db.transactions.add({
      id: 'tx-okt',
      layanan: 'transfer',
      shiftId: 's1',
      userId: 'u1',
      nominal: 300000,
      fee: 3000,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: time31Okt,
      createdAt: time31Okt,
      updatedAt: time31Okt,
    });

    await db.transactions.add({
      id: 'tx-nov',
      layanan: 'voucher',
      shiftId: 's1',
      userId: 'u1',
      nominal: 25000,
      fee: 0,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: time1Nov,
      createdAt: time1Nov,
      updatedAt: time1Nov,
    });

    const count = await reportService.transactionCount(rangeNov.from, rangeNov.to);
    const totalIn = await reportService.totalIn(rangeNov.from, rangeNov.to);

    expect(count).toBe(1);
    expect(totalIn).toBe(25000);
  });

  it('4. Periode kosong -> semua indikator 0, tidak error', async () => {
    const emptyRange = getDailyPeriodRange('2020-01-01');

    const totalIn = await reportService.totalIn(emptyRange.from, emptyRange.to);
    const totalOut = await reportService.totalOut(emptyRange.from, emptyRange.to);
    const totalLaba = await reportService.totalLaba(emptyRange.from, emptyRange.to);
    const count = await reportService.transactionCount(emptyRange.from, emptyRange.to);
    const byLayanan = await reportService.byLayanan(emptyRange.from, emptyRange.to);

    expect(totalIn).toBe(0);
    expect(totalOut).toBe(0);
    expect(totalLaba).toBe(0);
    expect(count).toBe(0);
    expect(byLayanan).toHaveLength(0);
  });

  it('5. Donat per layanan memakai data byLayanan periode yang dipilih (bukan data semua waktu)', async () => {
    const range8Nov = getDailyPeriodRange('2026-11-08');

    // Transaksi di 8 Nov: 2 voucher
    await db.transactions.add({
      id: 'tx-v1',
      layanan: 'voucher',
      shiftId: 's1',
      userId: 'u1',
      nominal: 10000,
      fee: 0,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: range8Nov.from + 3600000,
      createdAt: range8Nov.from + 3600000,
      updatedAt: range8Nov.from + 3600000,
    });

    // Transaksi di hari lain (bukan 8 Nov): 1 transfer
    await db.transactions.add({
      id: 'tx-t1',
      layanan: 'transfer',
      shiftId: 's1',
      userId: 'u1',
      nominal: 500000,
      fee: 5000,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: range8Nov.from - 86400000, // Kemarin
      createdAt: range8Nov.from - 86400000,
      updatedAt: range8Nov.from - 86400000,
    });

    const breakdown8Nov = await reportService.byLayanan(range8Nov.from, range8Nov.to);

    // Hanya voucher yang ada di 8 Nov
    expect(breakdown8Nov.length).toBe(1);
    expect(breakdown8Nov[0]?.label).toBe('voucher');
    expect(breakdown8Nov[0]?.total).toBe(1);

    // Transfer tidak masuk ke 8 Nov
    const transferEntry = breakdown8Nov.find((b) => b.label === 'transfer');
    expect(transferEntry).toBeUndefined();
  });
});
