import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { balanceService } from '../src/services/balanceService';

describe('BalanceService (Perhitungan Delta Saldo Catatan)', () => {
  beforeEach(async () => {
    await db.accountLedger.clear();
  });

  it('Transfer dengan admin Cash: sumber -500.000, Kas +505.000', () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'transfer',
      sourceAccountId: 'bank-bca',
      paymentAccountId: 'kas-laci',
      nominal: 500000,
      fee: 5000,
      feePaidBy: 'cash',
      modal: 0,
      hargaJual: 0,
    });

    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.accountId === 'bank-bca')?.delta).toBe(-500000);
    expect(deltas.find((d) => d.accountId === 'kas-laci')?.delta).toBe(505000);
  });

  it('Transfer dengan Debit Rekening — computeDeltas dengan paymentAccountId eksplisit (kas): sumber -495.000, Kas +500.000', () => {
    // Catatan: Sejak b4, alur end-to-end di transactionService secara otomatis menurunkan paymentAccountId
    // ke rekening sumber (sehingga Bank net +5.000 dan Kas tidak berubah). Unit test computeDeltas ini
    // memverifikasi rumus matematika murni bila paymentAccountId dioper terpisah secara eksplisit.
    // transfer Rp500.000, fee Rp5.000, Debit Rekening -> hBeli = Rp495.000, hJual = Rp500.000
    const deltas = balanceService.computeDeltas({
      layanan: 'transfer',
      sourceAccountId: 'bank-bca',
      paymentAccountId: 'kas-laci',
      nominal: 500000,
      fee: 5000,
      feePaidBy: 'debit_rekening',
      modal: 0,
      hargaJual: 0,
    });

    expect(deltas).toHaveLength(2);
    // Sumber dana bank berkurang Rp495.000 (BUKAN Rp505.000)
    expect(deltas.find((d) => d.accountId === 'bank-bca')?.delta).toBe(-495000);
    // Kas pelanggan membayar nominal pokok Rp500.000
    expect(deltas.find((d) => d.accountId === 'kas-laci')?.delta).toBe(500000);
  });

  it('Tarik Tunai: bank sumber +100.000, Kas diserahkan -(100.000 - 5.000) = -95.000', () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'tarik_tunai',
      sourceAccountId: 'bank-bca',
      paymentAccountId: 'kas-laci',
      nominal: 100000,
      fee: 5000,
      feePaidBy: 'cash',
      modal: 0,
      hargaJual: 0,
    });

    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.accountId === 'bank-bca')?.delta).toBe(100000);
    expect(deltas.find((d) => d.accountId === 'kas-laci')?.delta).toBe(-95000);
  });

  it('Pulsa: server pulsa catatan -24.500 (modal), Kas +27.000 (jual)', () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'pulsa',
      sourceAccountId: 'server-pulsa',
      paymentAccountId: 'kas-laci',
      nominal: 25000,
      fee: 0,
      feePaidBy: 'cash',
      modal: 24500,
      hargaJual: 27000,
    });

    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.accountId === 'server-pulsa')?.delta).toBe(-24500);
    expect(deltas.find((d) => d.accountId === 'kas-laci')?.delta).toBe(27000);
  });

  it('Voucher: hanya Kas +32.000 (modal M tidak memotong akun saat jual)', () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'voucher',
      paymentAccountId: 'kas-laci',
      nominal: 32000,
      fee: 0,
      feePaidBy: 'cash',
      modal: 28000,
      hargaJual: 32000,
    });

    expect(deltas).toHaveLength(1);
    expect(deltas[0]?.accountId).toBe('kas-laci');
    expect(deltas[0]?.delta).toBe(32000);
  });

  it('Pindah Dana & Deposit Server: mutasi saldo internal antar akun', () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'pindah_dana',
      sourceAccountId: 'kas-laci',
      destAccountId: 'bank-bca',
      paymentAccountId: 'kas-laci',
      nominal: 1000000,
      fee: 0,
      feePaidBy: 'cash',
      modal: 0,
      hargaJual: 0,
    });

    expect(deltas).toHaveLength(2);
    expect(deltas.find((d) => d.accountId === 'kas-laci')?.delta).toBe(-1000000);
    expect(deltas.find((d) => d.accountId === 'bank-bca')?.delta).toBe(1000000);
  });

  it('applyDeltas dengan multiplier -1 membalikkan mutasi secara persis (untuk void)', async () => {
    const deltas = balanceService.computeDeltas({
      layanan: 'transfer',
      sourceAccountId: 'bank-bca',
      paymentAccountId: 'kas-laci',
      nominal: 500000,
      fee: 5000,
      feePaidBy: 'debit_rekening',
      modal: 0,
      hargaJual: 0,
    });

    // 1. Simpan normal (multiplier 1)
    await balanceService.applyDeltas({ transactionId: 'tx-1', deltas, multiplier: 1 });
    let ledgers = await db.accountLedger.toArray();
    expect(ledgers).toHaveLength(2);
    expect(ledgers.find((l) => l.accountId === 'bank-bca')?.delta).toBe(-495000);
    expect(ledgers.find((l) => l.accountId === 'kas-laci')?.delta).toBe(500000);

    // 2. Void transaksi (multiplier -1)
    await balanceService.applyDeltas({ transactionId: 'tx-1', deltas, multiplier: -1 });
    ledgers = await db.accountLedger.toArray();
    expect(ledgers).toHaveLength(4);

    const bankTotal = ledgers
      .filter((l) => l.accountId === 'bank-bca')
      .reduce((sum, l) => sum + l.delta, 0);
    const kasTotal = ledgers
      .filter((l) => l.accountId === 'kas-laci')
      .reduce((sum, l) => sum + l.delta, 0);

    // Total delta bersih setelah void harus Rp0
    expect(bankTotal).toBe(0);
    expect(kasTotal).toBe(0);
  });
});
