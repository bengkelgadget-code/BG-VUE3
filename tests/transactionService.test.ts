import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { transactionService } from '../src/services/transactionService';
import { productService } from '../src/services/productService';
import { accountService } from '../src/services/accountService';

describe('TransactionService (Transaksi Inti, Snapshot, Void & Hutang)', () => {
  let kasId: string;
  let bankId: string;
  let serverId: string;
  let voucherId: string;

  beforeEach(async () => {
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.products.clear();
    await db.stockMovements.clear();
    await db.customers.clear();
    await db.auditLogs.clear();
    await db.users.clear();

    // Setup users
    await db.users.bulkAdd([
      { id: 'admin-1', name: 'Admin Konter', role: 'admin', pinHash: 'hash1', isActive: true, createdAt: Date.now() },
      { id: 'owner-1', name: 'Owner Konter', role: 'owner', pinHash: 'hash2', isActive: true, createdAt: Date.now() },
      { id: 'kasir-1', name: 'Kasir Shift', role: 'kasir', pinHash: 'hash3', isActive: true, createdAt: Date.now() },
    ]);

    // Setup akun dasar
    kasId = await accountService.addAccount({
      name: 'Kas Tunai Laci',
      type: 'kas',
      initialBalance: 750000,
    });

    bankId = await accountService.addAccount({
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 10000000,
    });

    serverId = await accountService.addAccount({
      name: 'Server Pulsa (catatan)',
      type: 'server_pulsa',
      initialBalance: 2000000,
    });

    // Setup produk voucher (stok 10)
    voucherId = await productService.addProduct(
      {
        name: 'Voucher Telkomsel 10GB',
        category: 'voucher',
        operator: 'Telkomsel',
        denomination: '10GB',
        modal: 28000,
        hargaJual: 32000,
        stock: 10,
        stockMin: 2,
        isActive: true,
      },
      { actorUserId: 'admin-1' }
    );
  });

  it('harus menyimpan snapshot modal dan jual dari master, bukan dari input kasir', async () => {
    const txId = await transactionService.addTransaction(
      {
        layanan: 'voucher',
        productId: voucherId,
        accountId: kasId,
        nominal: 32000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    const items = await transactionService.getItems(txId);
    expect(items).toHaveLength(1);
    expect(items[0]?.modalSnapshot).toBe(28000); // Diambil dari master produk
    expect(items[0]?.hargaJualSnapshot).toBe(32000);

    // Stok berkurang 1 (dari 10 menjadi 9)
    const currentStock = await productService.getProduct(voucherId);
    expect(currentStock?.stock).toBe(9);

    // Kas bertambah Rp32.000 (750.000 -> 782.000)
    const saldoKas = await accountService.getBalance(kasId);
    expect(saldoKas).toBe(782000);
  });

  it('perubahan modal di master lokal di masa depan tidak boleh mengubah snapshot transaksi lama', async () => {
    // 1. Buat transaksi pertama saat modal Rp28.000
    const txId = await transactionService.addTransaction(
      {
        layanan: 'voucher',
        productId: voucherId,
        accountId: kasId,
        nominal: 32000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    // 2. Owner mengubah modal master menjadi Rp30.000
    await productService.updateProduct(voucherId, { modal: 30000 }, { actorUserId: 'owner-1' });

    // 3. Verifikasi snapshot transaksi lama tetap Rp28.000
    const oldItems = await transactionService.getItems(txId);
    expect(oldItems[0]?.modalSnapshot).toBe(28000);
  });

  it('voidTransaction (BUKAN HAPUS): status jadi void, saldo & stok kembali, baris tetap ada di DB', async () => {
    const txId = await transactionService.addTransaction(
      {
        layanan: 'voucher',
        productId: voucherId,
        accountId: kasId,
        nominal: 32000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    // Void transaksi
    await transactionService.voidTransaction(txId, {
      reason: 'Pelanggan salah pilih kuota',
      actorUserId: 'admin-1',
    });

    // 1. Transaksi masih ada di database tapi statusnya 'void' (tidak di-hard-delete)
    const tx = await transactionService.getTransaction(txId);
    expect(tx).toBeDefined();
    expect(tx?.status).toBe('void');
    expect(tx?.voidReason).toBe('Pelanggan salah pilih kuota');

    // 2. Stok kembali menjadi 10
    const prod = await productService.getProduct(voucherId);
    expect(prod?.stock).toBe(10);

    // 3. Saldo Kas kembali menjadi saldo awal Rp750.000
    const saldoKas = await accountService.getBalance(kasId);
    expect(saldoKas).toBe(750000);
  });

  it('transaksi transfer Rp500.000 Debit Rekening: bank -Rp495.000, Kas +Rp500.000', async () => {
    await transactionService.addTransaction(
      {
        layanan: 'transfer',
        sourceAccountId: bankId,
        accountId: kasId,
        nominal: 500000,
        fee: 5000,
        feePaidBy: 'debit_rekening',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    // Bank keluar Rp495.000 (10.000.000 -> 9.505.000)
    const saldoBank = await accountService.getBalance(bankId);
    expect(saldoBank).toBe(9505000);

    // Kas masuk Rp500.000 (750.000 -> 1.250.000)
    const saldoKas = await accountService.getBalance(kasId);
    expect(saldoKas).toBe(1250000);
  });

  it('transaksi hutang wajib memilih pelanggan, dan menambah balanceHutang pelanggan', async () => {
    // 1. Tanpa customerId -> ditolak
    await expect(
      transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 100000,
          fee: 3000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'hutang',
          date: Date.now(),
        },
        { actorUserId: 'kasir-1', shiftId: 'shift-1' }
      )
    ).rejects.toThrow('Transaksi dengan status Hutang wajib');

    // 2. Dengan customerId -> berhasil dan saldo hutang pelanggan bertambah
    const custId = 'cust-test-1';
    await db.customers.add({
      id: custId,
      name: 'Pelanggan Bon',
      balanceHutang: 0,
      createdAt: Date.now(),
    });

    await transactionService.addTransaction(
      {
        layanan: 'pulsa',
        sourceAccountId: serverId,
        accountId: kasId,
        nominal: 50000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'hutang',
        customerId: custId,
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    const cust = await db.customers.get(custId);
    expect(cust?.balanceHutang).toBe(50000);
  });
});
