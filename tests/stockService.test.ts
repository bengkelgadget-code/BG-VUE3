import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { stockService } from '../src/services/stockService';
import { AppError } from '../src/core/errors';

describe('StockService (Kontrol Stok & Opname)', () => {
  const sampleProductId = 'prod-fisik-1';

  beforeEach(async () => {
    await db.products.clear();
    await db.stockMovements.clear();
    await db.users.clear();
    await db.auditLogs.clear();

    await db.users.add({
      id: 'owner-1',
      name: 'Owner Konter',
      role: 'owner',
      pinHash: 'hash-owner',
      isActive: true,
      createdAt: Date.now(),
    });

    await db.users.add({
      id: 'kasir-1',
      name: 'Kasir Toko',
      role: 'kasir',
      pinHash: 'hash-kasir',
      isActive: true,
      createdAt: Date.now(),
    });

    await db.products.add({
      id: sampleProductId,
      name: 'Voucher Telkomsel 10GB',
      category: 'voucher',
      modal: 35000,
      hargaJual: 40000,
      stock: 5,
      stockMin: 2,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('1. Penjualan mengurangi stok (-1)', async () => {
    await stockService.adjustStock({
      productId: sampleProductId,
      qtyChange: -1,
      reason: 'jual',
      actorUserId: 'kasir-1',
    });

    const currentStock = await stockService.getStock(sampleProductId);
    expect(currentStock).toBe(4);

    const movements = await db.stockMovements.where('productId').equals(sampleProductId).toArray();
    expect(movements.length).toBe(1);
    expect(movements[0]?.qtyChange).toBe(-1);
    expect(movements[0]?.reason).toBe('jual');
  });

  it('2. Void mengembalikan stok (+1)', async () => {
    await stockService.adjustStock({
      productId: sampleProductId,
      qtyChange: -1,
      reason: 'jual',
      actorUserId: 'kasir-1',
    });

    // Void
    await stockService.adjustStock({
      productId: sampleProductId,
      qtyChange: 1,
      reason: 'void',
      actorUserId: 'kasir-1',
    });

    const currentStock = await stockService.getStock(sampleProductId);
    expect(currentStock).toBe(5);

    const movements = await db.stockMovements
      .where('productId')
      .equals(sampleProductId)
      .sortBy('createdAt');
    expect(movements.length).toBe(2);
    expect(movements[1]?.reason).toBe('void');
  });

  it('3. Pengurangan melebihi stok yang tersedia ditolak (stok tidak boleh negatif)', async () => {
    await expect(
      stockService.adjustStock({
        productId: sampleProductId,
        qtyChange: -6, // Hanya ada 5
        reason: 'jual',
        actorUserId: 'kasir-1',
      })
    ).rejects.toThrow(AppError);

    // Stok tetap 5
    const stock = await stockService.getStock(sampleProductId);
    expect(stock).toBe(5);
  });

  it('4. Produk digital (stock = null) mengabaikan perubahan stok fisik tanpa error', async () => {
    const digitalId = 'prod-digital-1';
    await db.products.add({
      id: digitalId,
      name: 'Pulsa Telkomsel 10K',
      category: 'pulsa',
      modal: 10200,
      hargaJual: 12000,
      stock: null, // Digital
      stockMin: 0,
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await stockService.adjustStock({
      productId: digitalId,
      qtyChange: -1,
      reason: 'jual',
      actorUserId: 'kasir-1',
    });

    const digitalProd = await db.products.get(digitalId);
    expect(digitalProd?.stock).toBeNull();
  });

  it('5. Opname stok: hanya Owner/Admin yang diizinkan, kasir ditolak', async () => {
    // Kasir memanggil opname
    await expect(
      stockService.stockOpname({
        hitungFisik: { [sampleProductId]: 10 },
        actorUserId: 'kasir-1',
      })
    ).rejects.toThrow('Hanya Owner dan Admin yang berhak melakukan opname stok');

    // Owner memanggil opname
    await stockService.stockOpname({
      hitungFisik: { [sampleProductId]: 8 }, // Selisih +3
      actorUserId: 'owner-1',
    });

    const updatedStock = await stockService.getStock(sampleProductId);
    expect(updatedStock).toBe(8);

    const movements = await db.stockMovements.where('reason').equals('opname').toArray();
    expect(movements.length).toBe(1);
    expect(movements[0]?.qtyChange).toBe(3);

    const audit = await db.auditLogs.where('action').equals('opname').toArray();
    expect(audit.length).toBe(1);
  });
});
