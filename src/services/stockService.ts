import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AppError } from '../core/errors';
import { authService } from './authService';

export class StockService {
  /**
   * Ubah stok produk fisik (voucher/perdana/aksesoris).
   * qtyChange: -1 saat jual, +1 saat void/pembelian/opname.
   * Stok TIDAK PERNAH negatif secara diam-diam.
   */
  public async adjustStock(params: {
    productId: string;
    qtyChange: number;
    reason: 'jual' | 'void' | 'pembelian_stok' | 'opname' | 'koreksi';
    transactionId?: string;
    shiftId?: string;
    actorUserId: string;
  }): Promise<void> {
    const product = await db.products.get(params.productId);
    if (!product) {
      throw new AppError('Produk tidak ditemukan.');
    }

    if (product.stock === null) {
      // Produk digital (pulsa/data/token) tidak memakai stok fisik
      return;
    }

    const currentStock = product.stock ?? 0;
    const newStock = currentStock + params.qtyChange;

    if (newStock < 0) {
      throw new AppError(`Stok produk '${product.name}' tidak mencukupi (tersedia: ${currentStock}).`);
    }

    const now = Date.now();

    await db.transaction('rw', [db.products, db.stockMovements], async () => {
      await db.products.update(params.productId, {
        stock: newStock,
        updatedAt: now,
      });

      await db.stockMovements.add({
        id: uuidv4(),
        productId: params.productId,
        qtyChange: params.qtyChange,
        reason: params.reason,
        transactionId: params.transactionId,
        shiftId: params.shiftId,
        actorUserId: params.actorUserId,
        createdAt: now,
      });
    });
  }

  public async getStock(productId: string): Promise<number> {
    const product = await db.products.get(productId);
    return product?.stock ?? 0;
  }

  public async stockOpname(params: {
    hitungFisik: Record<string, number>;
    actorUserId: string;
  }): Promise<void> {
    const actor = await db.users.get(params.actorUserId);
    if (!actor || !authService.canManageMaster(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang berhak melakukan opname stok.');
    }

    const now = Date.now();

    for (const [productId, fisik] of Object.entries(params.hitungFisik)) {
      const product = await db.products.get(productId);
      if (!product || product.stock === null) continue;

      const diff = fisik - (product.stock ?? 0);
      if (diff !== 0) {
        await db.transaction('rw', [db.products, db.stockMovements, db.auditLogs], async () => {
          await db.products.update(productId, {
            stock: fisik,
            updatedAt: now,
          });

          await db.stockMovements.add({
            id: uuidv4(),
            productId,
            qtyChange: diff,
            reason: 'opname',
            actorUserId: params.actorUserId,
            createdAt: now,
          });

          await db.auditLogs.add({
            id: uuidv4(),
            actorUserId: params.actorUserId,
            action: 'opname',
            entityType: 'product',
            entityId: productId,
            detail: JSON.stringify({
              productName: product.name,
              stokSebelum: product.stock,
              stokSesudah: fisik,
              selisih: diff,
            }),
            createdAt: now,
          });
        });
      }
    }
  }
}

export const stockService = new StockService();
