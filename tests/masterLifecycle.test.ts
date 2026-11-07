import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { accountService } from '../src/services/accountService';
import { productService } from '../src/services/productService';
import { customerService } from '../src/services/customerService';
import { transactionService } from '../src/services/transactionService';
import { AppError } from '../src/core/errors';

describe('Fase 1 Acceptance Test: Master Data Lifecycle & Constraints', () => {
  beforeEach(async () => {
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.products.clear();
    await db.customers.clear();
    await db.adminFeeRules.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.shifts.clear();
    await db.users.clear();

    await db.users.add({
      id: 'owner-test',
      name: 'Owner Test',
      role: 'owner',
      pinHash: 'hash-owner',
      isActive: true,
      createdAt: Date.now(),
    });
    await db.users.add({
      id: 'kasir-test',
      name: 'Kasir Test',
      role: 'kasir',
      pinHash: 'hash-kasir',
      isActive: true,
      createdAt: Date.now(),
    });
  });

  it('1. Install baru: semua master tabel lokal harus benar-benar kosong', async () => {
    const accCount = await db.accounts.count();
    const prodCount = await db.products.count();
    const custCount = await db.customers.count();
    const ruleCount = await db.adminFeeRules.count();

    expect(accCount).toBe(0);
    expect(prodCount).toBe(0);
    expect(custCount).toBe(0);
    expect(ruleCount).toBe(0);
  });

  it('2. Buat akun, produk, pelanggan, dan tarif via service, lalu pakai di transaksi', async () => {
    // Buat Akun
    const accId = await accountService.addAccount({
      name: 'Kas Toko',
      type: 'kas',
      initialBalance: 500000,
      icon: 'Wallet',
      color: '#10B981',
    });
    expect(accId).toBeDefined();

    // Verifikasi saldo awal dihitung lewat agregasi
    const balance = await accountService.getBalance(accId);
    expect(balance).toBe(500000);

    // Buat Produk
    const prodId = await productService.addProduct(
      {
        name: 'Voucher Telkomsel 5GB',
        category: 'voucher',
        modal: 25000,
        hargaJual: 30000,
        stock: 10,
        stockMin: 2,
        isActive: true,
      },
      { actorUserId: 'owner-test' }
    );
    expect(prodId).toBeDefined();

    // Buat Pelanggan
    const custId = await customerService.addCustomer(
      {
        name: 'Budi Santoso',
        phone: '08123456789',
        isActive: true,
      },
      { actorUserId: 'owner-test' }
    );
    expect(custId).toBeDefined();

    // Buat Shift aktif
    await db.shifts.add({
      id: 'shift-1',
      userId: 'kasir-test',
      openedAt: Date.now(),
      saldoAwalSistem: {},
      kasAwalFisik: 500000,
      status: 'open',
    });

    // Lakukan Transaksi penjualan voucher
    const txId = await transactionService.addTransaction(
      {
        layanan: 'voucher',
        accountId: accId,
        nominal: 30000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
        productId: prodId,
      },
      { actorUserId: 'kasir-test', shiftId: 'shift-1' }
    );

    expect(txId).toBeDefined();

    // Cek saldo kas toko bertambah 30.000 menjadi 530.000
    const newBalance = await accountService.getBalance(accId);
    expect(newBalance).toBe(530000);

    // Cek stok produk berkurang dari 10 menjadi 9
    const prod = await productService.getProduct(prodId);
    expect(prod?.stock).toBe(9);
  });

  it('3. Hapus akun yang memiliki transaksi harus ditolak', async () => {
    const accId = await accountService.addAccount({
      name: 'Bank Mandiri',
      type: 'bank',
      initialBalance: 1000000,
      icon: 'CreditCard',
      color: '#2563EB',
    });

    await db.transactions.add({
      id: 'tx-existing',
      layanan: 'transfer',
      shiftId: 'shift-test',
      userId: 'kasir-test',
      accountId: accId,
      nominal: 100000,
      fee: 2500,
      feePaidBy: 'cash',
      paymentMethod: 'transfer',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await expect(accountService.deleteAccount(accId)).rejects.toThrow(AppError);
  });

  it('4. Nonaktifkan pelanggan yang memiliki hutang aktif harus ditolak', async () => {
    const custId = await customerService.addCustomer(
      {
        name: 'Pelanggan Berhutang',
        isActive: true,
      },
      { actorUserId: 'owner-test' }
    );

    // Update balance hutang pelanggan
    await db.customers.update(custId, { balanceHutang: 50000 });

    await expect(
      customerService.deactivateCustomer(custId, { actorUserId: 'owner-test' })
    ).rejects.toThrow(AppError);
  });

  it('5. Kasir memanggil operasi kelola master produk atau ubah saldo manual ditolak oleh service', async () => {
    await expect(
      productService.addProduct(
        {
          name: 'Ilegal Item',
          category: 'aksesoris',
          modal: 1000,
          hargaJual: 2000,
          stock: 1,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: 'kasir-test' }
      )
    ).rejects.toThrow('Hanya Owner dan Admin yang memiliki akses mengelola Master Produk');

    const accId = await accountService.addAccount({
      name: 'Kas',
      type: 'kas',
      initialBalance: 0,
      icon: 'Wallet',
      color: '#10B981',
    });

    await expect(
      accountService.adjustBalanceManual({
        accountId: accId,
        delta: 100000,
        reason: 'Koreksi Kasir',
        actorUserId: 'kasir-test',
      })
    ).rejects.toThrow('Hanya Owner dan Admin yang memiliki akses koreksi saldo manual');
  });
});
