import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { receivableService } from '../src/services/receivableService';
import { accountService } from '../src/services/accountService';
import { AppError } from '../src/core/errors';

describe('ReceivableService (Hutang Versi Simpel MVP)', () => {
  beforeEach(async () => {
    await db.customers.clear();
    await db.transactions.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.auditLogs.clear();
  });

  it('harus menampilkan pelanggan dengan hutang di daftar piutang', async () => {
    // 1. Buat pelanggan
    const custId = 'cust-1';
    await db.customers.add({
      id: custId,
      name: 'Pelanggan Langganan',
      phone: '08123456789',
      balanceHutang: 50000,
      createdAt: Date.now() - 3600000,
    });

    // 2. Buat transaksi hutang
    await db.transactions.add({
      id: 'tx-debt-1',
      layanan: 'pulsa',
      shiftId: 'shift-1',
      userId: 'user-1',
      nominal: 50000,
      fee: 0,
      feePaidBy: 'cash',
      feeManualOverride: false,
      paymentMethod: 'tunai',
      paymentStatus: 'hutang',
      date: Date.now() - 3600000,
      customerId: custId,
      status: 'ok',
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
    });

    const list = await receivableService.listReceivables();
    expect(list).toHaveLength(1);
    expect(list[0]?.customerName).toBe('Pelanggan Langganan');
    expect(list[0]?.totalHutang).toBe(50000);
  });

  it('Lunas Penuh (markPaidFull): menutup piutang, menambah saldo kas, dan mencatat audit', async () => {
    const kasId = await accountService.addAccount({
      name: 'Kas Tunai Laci',
      type: 'kas',
      initialBalance: 100000,
    });

    const custId = 'cust-2';
    await db.customers.add({
      id: custId,
      name: 'Pak Budi',
      phone: '0811112222',
      balanceHutang: 75000,
      createdAt: Date.now() - 7200000,
    });

    await db.transactions.add({
      id: 'tx-debt-2',
      layanan: 'transfer',
      shiftId: 'shift-1',
      userId: 'user-1',
      nominal: 75000,
      fee: 0,
      feePaidBy: 'cash',
      feeManualOverride: false,
      paymentMethod: 'tunai',
      paymentStatus: 'hutang',
      date: Date.now() - 7200000,
      customerId: custId,
      status: 'ok',
      createdAt: Date.now() - 7200000,
      updatedAt: Date.now() - 7200000,
    });

    // Jalankan pelunasan penuh
    await receivableService.markPaidFull(custId, kasId, Date.now(), 'user-admin');

    // 1. Piutang pelanggan jadi 0 dan hilang dari daftar aktif
    const activeDebts = await receivableService.listReceivables();
    expect(activeDebts).toHaveLength(0);

    const cust = await db.customers.get(custId);
    expect(cust?.balanceHutang).toBe(0);

    // 2. Status transaksi berubah menjadi 'lunas'
    const tx = await db.transactions.get('tx-debt-2');
    expect(tx?.paymentStatus).toBe('lunas');

    // 3. Saldo Kas bertambah 75.000 (dari 100.000 menjadi 175.000)
    const saldoKas = await accountService.getBalance(kasId);
    expect(saldoKas).toBe(175000);

    // 4. Jejak audit log ada
    const logs = await db.auditLogs.where({ entityId: custId }).toArray();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.action).toBe('pelunasan_piutang_penuh');
  });

  it('harus menolak pelunasan jika pelanggan tidak memiliki hutang', async () => {
    const custId = 'cust-3';
    await db.customers.add({
      id: custId,
      name: 'Non Hutang',
      balanceHutang: 0,
      createdAt: Date.now(),
    });

    const kasId = await accountService.addAccount({
      name: 'Kas',
      type: 'kas',
      initialBalance: 0,
    });

    await expect(
      receivableService.markPaidFull(custId, kasId, Date.now())
    ).rejects.toThrow(AppError);
  });
});
