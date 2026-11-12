import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Product, NewProduct, ProductCatalogEntry } from '../db/types';
import { AppError } from '../core/errors';
import { authService } from './authService';

export class ProductService {
  private async checkAdminAccess(actorUserId: string): Promise<void> {
    const actor = await db.users.get(actorUserId);
    if (!actor || !authService.canManageMaster(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang memiliki akses mengelola Master Produk.');
    }
  }

  public async addProduct(product: NewProduct, opts: { actorUserId: string }): Promise<string> {
    await this.checkAdminAccess(opts.actorUserId);

    const name = product.name?.trim();
    if (!name) {
      throw new AppError('Nama produk wajib diisi.');
    }

    if (product.modal < 0 || !Number.isInteger(product.modal)) {
      throw new AppError('Modal produk harus bilangan bulat positif.');
    }

    if (product.hargaJual < 0 || !Number.isInteger(product.hargaJual)) {
      throw new AppError('Harga jual produk harus bilangan bulat positif.');
    }

    const id = uuidv4();
    const now = Date.now();

    const isPhysical =
      product.category === 'voucher' ||
      product.category === 'perdana' ||
      product.category === 'aksesoris';

    const stock = isPhysical ? Math.max(0, Math.round(product.stock ?? 0)) : null;

    const newProd: Product = {
      ...product,
      id,
      name,
      stock,
      stockMin: product.stockMin ?? 0,
      isActive: product.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await db.products.add(newProd);

    // Jejak audit
    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: opts.actorUserId,
      action: 'tambah_produk_master',
      entityType: 'product',
      entityId: id,
      detail: JSON.stringify({ name: newProd.name, modal: newProd.modal, hargaJual: newProd.hargaJual }),
      createdAt: now,
    });

    return id;
  }

  public async createProductFromCatalog(
    catalogId: string,
    params: { modal: number; hargaJual: number; stockMin?: number },
    opts: { actorUserId: string }
  ): Promise<string> {
    await this.checkAdminAccess(opts.actorUserId);

    const catalogEntry = await db.productCatalogCache.get(catalogId);
    if (!catalogEntry) {
      throw new AppError('Entri katalog tidak ditemukan di cache.');
    }

    return await this.addProduct(
      {
        name: catalogEntry.name,
        category: catalogEntry.category,
        operator: catalogEntry.operator,
        denomination: catalogEntry.denomination,
        externalProductRef: catalogEntry.id,
        modal: params.modal,
        hargaJual: params.hargaJual,
        stock: null, // digital
        stockMin: params.stockMin ?? 0,
        isActive: true,
      },
      opts
    );
  }

  public async listCatalogProducts(params?: { category?: string; query?: string }): Promise<ProductCatalogEntry[]> {
    let list = await db.productCatalogCache.filter((c) => c.isActive).toArray();
    if (params?.category) {
      list = list.filter((c) => c.category === params.category);
    }
    if (params?.query) {
      const q = params.query.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    return list;
  }

  public async updateProduct(
    id: string,
    patch: Partial<NewProduct>,
    opts: { actorUserId: string }
  ): Promise<void> {
    await this.checkAdminAccess(opts.actorUserId);

    const existing = await db.products.get(id);
    if (!existing) {
      throw new AppError('Produk tidak ditemukan.');
    }

    if (patch.name !== undefined) {
      const name = patch.name.trim();
      if (!name) {
        throw new AppError('Nama produk wajib diisi.');
      }
      patch.name = name;
    }

    if (patch.modal !== undefined && (patch.modal < 0 || !Number.isInteger(patch.modal))) {
      throw new AppError('Modal produk harus bilangan bulat positif.');
    }

    if (patch.hargaJual !== undefined && (patch.hargaJual < 0 || !Number.isInteger(patch.hargaJual))) {
      throw new AppError('Harga jual produk harus bilangan bulat positif.');
    }

    if (patch.stockMin !== undefined && patch.stockMin !== null && (patch.stockMin < 0 || !Number.isInteger(patch.stockMin))) {
      throw new AppError('Batas minimum stok harus bilangan bulat positif.');
    }

    const cat = patch.category ?? existing.category;
    const isPhysical = cat === 'voucher' || cat === 'perdana' || cat === 'aksesoris';
    let stock = patch.stock !== undefined ? patch.stock : existing.stock;
    if (isPhysical) {
      stock = stock !== null && stock !== undefined ? Math.max(0, Math.round(stock)) : 0;
    } else {
      stock = null;
    }

    const now = Date.now();
    await db.products.update(id, {
      ...patch,
      stock,
      updatedAt: now,
    });

    // Audit perubahan modal atau harga jual
    if (patch.modal !== undefined && patch.modal !== existing.modal) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_modal',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldModal: existing.modal, newModal: patch.modal }),
        createdAt: now,
      });
    }

    if (patch.hargaJual !== undefined && patch.hargaJual !== existing.hargaJual) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_harga_jual',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldJual: existing.hargaJual, newJual: patch.hargaJual }),
        createdAt: now,
      });
    }

    if (patch.name !== undefined && patch.name !== existing.name) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_produk_master',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldName: existing.name, newName: patch.name }),
        createdAt: now,
      });
    }

    if (patch.category !== undefined && patch.category !== existing.category) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_kategori_produk',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldCategory: existing.category, newCategory: patch.category }),
        createdAt: now,
      });
    }

    if (patch.operator !== undefined && patch.operator !== existing.operator) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_operator_produk',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldOperator: existing.operator, newOperator: patch.operator }),
        createdAt: now,
      });
    }

    if (patch.stock !== undefined && patch.stock !== existing.stock) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_stok_master',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldStock: existing.stock, newStock: patch.stock }),
        createdAt: now,
      });
    }

    if (patch.stockMin !== undefined && patch.stockMin !== existing.stockMin) {
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'ubah_stok_min_master',
        entityType: 'product',
        entityId: id,
        detail: JSON.stringify({ oldStockMin: existing.stockMin, newStockMin: patch.stockMin }),
        createdAt: now,
      });
    }
  }

  public async deleteProduct(id: string, opts: { actorUserId: string }): Promise<void> {
    await this.checkAdminAccess(opts.actorUserId);

    const existing = await db.products.get(id);
    if (!existing) {
      throw new AppError('Produk tidak ditemukan.');
    }

    await db.products.delete(id);

    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: opts.actorUserId,
      action: 'hapus_produk_master',
      entityType: 'product',
      entityId: id,
      detail: JSON.stringify({ name: existing.name, category: existing.category }),
      createdAt: Date.now(),
    });
  }

  public async deactivateProduct(id: string, opts: { actorUserId: string }): Promise<void> {
    await this.checkAdminAccess(opts.actorUserId);
    await db.products.update(id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  }

  public async listProducts(params?: {
    category?: string;
    activeOnly?: boolean;
    query?: string;
  }): Promise<Product[]> {
    let list = await db.products.toArray();
    if (params?.activeOnly) {
      list = list.filter((p) => p.isActive);
    }
    if (params?.category) {
      list = list.filter((p) => p.category === params.category);
    }
    if (params?.query) {
      const q = params.query.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }

  public async getProduct(id: string): Promise<Product | undefined> {
    return await db.products.get(id);
  }

  /**
   * Ambil modal + jual saat ini dari master — hanya dipakai backend / TransactionService.
   * Kasir TIDAK PERNAH memanggil ini dari UI untuk menampilkan modal.
   */
  public async getModalAndPrice(productId: string): Promise<{ modal: number; hargaJual: number }> {
    const p = await db.products.get(productId);
    if (!p) {
      throw new AppError('Produk tidak ditemukan di master.');
    }
    return {
      modal: p.modal,
      hargaJual: p.hargaJual,
    };
  }
}

export const productService = new ProductService();
