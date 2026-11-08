import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { transactionService } from '../src/services/transactionService';
import { productService } from '../src/services/productService';
import { accountService } from '../src/services/accountService';
import { authService } from '../src/services/authService';

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

    // Setup users dengan hash PIN nyata (SHA-256)
    const adminPinHash = await authService.hashPin('123456');
    const ownerPinHash = await authService.hashPin('654321');
    const kasirPinHash = await authService.hashPin('111111');

    await db.users.bulkAdd([
      { id: 'admin-1', name: 'Admin Konter', role: 'admin', pinHash: adminPinHash, isActive: true, createdAt: Date.now() },
      { id: 'owner-1', name: 'Owner Konter', role: 'owner', pinHash: ownerPinHash, isActive: true, createdAt: Date.now() },
      { id: 'kasir-1', name: 'Kasir Shift', role: 'kasir', pinHash: kasirPinHash, isActive: true, createdAt: Date.now() },
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
      adminPin: '123456',
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

  it('void membalik saldo dan stok fisik, baris transaksi tetap ada berstatus void (TIDAK ADA DELETE)', async () => {
    // 1. Simpan saldo awal
    const initialKas = await accountService.getBalance(kasId);
    const initialStock = (await db.products.get(voucherId))?.stock ?? 0;

    // 2. Transaksi penjualan voucher tunai
    const txId = await transactionService.addTransaction(
      {
        layanan: 'voucher',
        accountId: kasId,
        nominal: 25000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        productId: voucherId,
        date: Date.now(),
      },
      { actorUserId: 'kasir-1', shiftId: 'shift-1' }
    );

    // Saldo kas bertambah 32.000 (sesuai snapshot master), stok berkurang 1
    expect(await accountService.getBalance(kasId)).toBe(initialKas + 32000);
    expect((await db.products.get(voucherId))?.stock).toBe(initialStock - 1);

    // 3. Void tanpa alasan yang valid (< 3 karakter) -> DITOLAK
    await expect(
      transactionService.voidTransaction(txId, {
        reason: 'ok',
        actorUserId: 'admin-1',
        adminPin: '123456',
      })
    ).rejects.toThrow('Alasan pembatalan (void) transaksi wajib diisi minimal 3 karakter');

    // 4. Void dengan alasan sah
    await transactionService.voidTransaction(txId, {
      reason: 'Pelanggan salah beli denominasi',
      actorUserId: 'admin-1',
      adminPin: '123456',
    });

    // 5. Saldo kas dan stok kembali persis seperti semula
    expect(await accountService.getBalance(kasId)).toBe(initialKas);
    expect((await db.products.get(voucherId))?.stock).toBe(initialStock);

    // 6. Baris transaksi tetap ada di database (bukan di-delete), berstatus 'void'
    const tx = await db.transactions.get(txId);
    expect(tx).toBeDefined();
    expect(tx?.status).toBe('void');
    expect(tx?.voidReason).toBe('Pelanggan salah beli denominasi');
  });

  describe('F1: Gate Void Transaksi (Role Owner/Admin + PIN Verification)', () => {
    it('kasir memanggil void -> ditolak dengan AppError', async () => {
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

      // Kasir mencoba void sendiri
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Kasir mencoba void',
          actorUserId: 'kasir-1',
          adminPin: '111111',
        })
      ).rejects.toThrow('Hanya Owner dan Admin yang memiliki akses membatalkan (void) transaksi.');

      const tx = await db.transactions.get(txId);
      expect(tx?.status).toBe('ok');
    });

    it('Owner/Admin dengan PIN salah -> ditolak, transaksi tidak berubah', async () => {
      const initialKas = await accountService.getBalance(kasId);
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

      // Admin dengan PIN salah
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Salah input transaksi',
          actorUserId: 'admin-1',
          adminPin: '999999', // PIN salah
        })
      ).rejects.toThrow('PIN konfirmasi Owner/Admin salah. Pembatalan transaksi ditolak.');

      const tx = await db.transactions.get(txId);
      expect(tx?.status).toBe('ok');
      expect(tx?.voidReason).toBeUndefined();
      expect(await accountService.getBalance(kasId)).toBe(initialKas + 32000);
    });

    it('Owner/Admin dengan PIN benar + alasan >= 3 karakter -> void berhasil, saldo/stok/piutang berbalik, audit tertulis', async () => {
      // Setup customer hutang
      const custId = 'cust-void-test';
      await db.customers.add({
        id: custId,
        name: 'Pelanggan Piutang Void',
        balanceHutang: 0,
        createdAt: Date.now(),
      });

      const initialKas = await accountService.getBalance(kasId);
      const initialStock = (await db.products.get(voucherId))?.stock ?? 0;

      // Buat transaksi hutang dengan voucher fisik
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
          paymentStatus: 'hutang',
          customerId: custId,
          date: Date.now(),
        },
        { actorUserId: 'kasir-1', shiftId: 'shift-1' }
      );

      // Pastikan piutang bertambah, stok berkurang
      expect((await db.customers.get(custId))?.balanceHutang).toBe(32000);
      expect((await db.products.get(voucherId))?.stock).toBe(initialStock - 1);

      // Owner melakukan void dengan PIN benar
      await transactionService.voidTransaction(txId, {
        reason: 'Dibatalkan oleh Owner karena salah denominasi',
        actorUserId: 'owner-1',
        adminPin: '654321', // PIN benar owner
      });

      // 1. Status transaksi jadi 'void' dan tercatat voidReason & voidBy
      const tx = await db.transactions.get(txId);
      expect(tx?.status).toBe('void');
      expect(tx?.voidReason).toBe('Dibatalkan oleh Owner karena salah denominasi');
      expect(tx?.voidBy).toBe('owner-1');

      // 2. Stok berbalik kembali ke awal
      expect((await db.products.get(voucherId))?.stock).toBe(initialStock);

      // 3. Piutang pelanggan berbalik berkurang
      expect((await db.customers.get(custId))?.balanceHutang).toBe(0);

      // 4. Saldo kas tetap konsisten
      expect(await accountService.getBalance(kasId)).toBe(initialKas);

      // 5. Jejak audit tertulis
      const audit = await db.auditLogs.where('entityId').equals(txId).toArray();
      const voidAudit = audit.find((a) => a.action === 'void_transaksi');
      expect(voidAudit).toBeDefined();
      expect(voidAudit?.actorUserId).toBe('owner-1');
    });
  });

  describe('F2: Koreksi Tanggal Transaksi oleh Owner/Admin dengan Alasan', () => {
    it('kasir tidak bisa mengubah tanggal transaksi -> ditolak dengan AppError', async () => {
      const yesterday = Date.now() - 24 * 3600 * 1000;
      await expect(
        transactionService.addTransaction(
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
            date: yesterday,
            dateChangeReason: 'Kasir mau catat tanggal kemarin',
          },
          { actorUserId: 'kasir-1', shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Kasir tidak diizinkan mengubah tanggal transaksi.');
    });

    it('tanggal transaksi di masa depan ditolak dengan AppError', async () => {
      const tomorrow = Date.now() + 24 * 3600 * 1000;
      await expect(
        transactionService.addTransaction(
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
            date: tomorrow,
            dateChangeReason: 'Transaksi besok',
          },
          { actorUserId: 'owner-1', shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Tanggal transaksi tidak boleh di masa depan.');
    });

    it('Owner mengubah tanggal tanpa alasan -> ditolak dengan AppError', async () => {
      const yesterday = Date.now() - 24 * 3600 * 1000;
      await expect(
        transactionService.addTransaction(
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
            date: yesterday,
          },
          { actorUserId: 'owner-1', shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Alasan perubahan tanggal transaksi wajib diisi minimal 3 karakter.');
    });

    it('Owner mengubah tanggal dengan alasan -> tersimpan beserta tanggal dan alasannya', async () => {
      const yesterday = Date.now() - 24 * 3600 * 1000;
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
          date: yesterday,
          dateChangeReason: 'Transaksi susulan kemarin sore yang belum sempat diinput',
        },
        { actorUserId: 'owner-1', shiftId: 'shift-1' }
      );

      const tx = await db.transactions.get(txId);
      expect(tx).toBeDefined();
      expect(tx?.date).toBe(yesterday);
      expect(tx?.dateChangeReason).toBe('Transaksi susulan kemarin sore yang belum sempat diinput');
    });
  });
});
