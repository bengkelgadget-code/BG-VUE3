import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { ProductCatalogEntry } from '../db/types';
import { AppError } from '../core/errors';
import { authService } from './authService';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

export class CatalogService {
  private client: SupabaseClient | null = null;
  private lastSyncTimestamp = 0;

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;

    const url =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
      SUPABASE_URL;

    const key =
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
      SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new AppError(
        'Kredensial Supabase Server Pulsa belum dikonfigurasi. Anda tetap dapat menggunakan form Master Produk secara manual tanpa sinkronisasi.'
      );
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
    return this.client;
  }

  public setCustomClient(client: SupabaseClient): void {
    this.client = client;
  }

  /**
   * Ambil katalog produk Server Pulsa dari Supabase (SELECT saja) dan simpan ke product_catalog_cache.
   * TIDAK PERNAH menulis ke Supabase.
   * TIDAK PERNAH mengubah tabel products.
   */
  public async syncCatalog(opts: {
    actorUserId: string;
  }): Promise<{ added: number; updated: number; deactivated: number; syncedAt: number }> {
    const actor = await db.users.get(opts.actorUserId);
    if (!actor || !authService.canManageMaster(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang berhak menyinkronkan katalog produk.');
    }

    const client = await this.getClient();

    // STRICT: SELECT SAJA — tidak pernah memanggil insert/update/delete/upsert ke Supabase
    // Mengambil kolom asli Server Pulsa dan hanya produk aktif (is_active = true)
    const { data, error } = await client
      .from('products')
      .select('sku_code, product_name, category, brand')
      .eq('is_active', true);

    if (error || !Array.isArray(data)) {
      throw new AppError(`Gagal membaca katalog Supabase: ${error?.message || 'Data tidak valid'}`);
    }

    const now = Date.now();
    let added = 0;
    let updated = 0;
    let deactivated = 0;

    const remoteIds = new Set<string>();

    for (const item of data) {
      const itemId = String(item.sku_code);
      remoteIds.add(itemId);
      const existing = await db.productCatalogCache.get(itemId);

      // Catatan: Tabel products Server Pulsa tidak memiliki kolom denominasi;
      // denomination diisi '' (string kosong).
      // DILARANG KERAS mengambil harga_modal/harga_jual dari Server Pulsa;
      // modal & harga jual produk diatur manual oleh Owner/Admin di master lokal Buku Konter.
      const entry: ProductCatalogEntry = {
        id: itemId,
        name: String(item.product_name || ''),
        category: (item.category as 'pulsa' | 'data' | 'token_pln' | 'lainnya') || 'lainnya',
        operator: item.brand ? String(item.brand) : undefined,
        denomination: '',
        isActive: true,
        updatedAt: now,
      };

      if (!existing) {
        await db.productCatalogCache.add(entry);
        added++;
      } else {
        await db.productCatalogCache.update(entry.id, entry);
        updated++;
      }
    }

    // Tandai entri lokal yang sudah tidak ada di Supabase sebagai nonaktif
    const allLocal = await db.productCatalogCache.toArray();
    for (const localEntry of allLocal) {
      if (!remoteIds.has(localEntry.id) && localEntry.isActive) {
        await db.productCatalogCache.update(localEntry.id, { isActive: false, updatedAt: now });
        deactivated++;
      }
    }

    this.lastSyncTimestamp = now;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('supabase_last_sync', String(now));
    }

    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: opts.actorUserId,
      action: 'sync_katalog',
      entityType: 'product_catalog_cache',
      entityId: 'all',
      detail: JSON.stringify({ added, updated, deactivated }),
      createdAt: now,
    });

    return { added, updated, deactivated, syncedAt: now };
  }

  public async getLastSyncAt(): Promise<number> {
    if (this.lastSyncTimestamp) return this.lastSyncTimestamp;
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('supabase_last_sync');
      if (saved) return parseInt(saved, 10) || 0;
    }
    return 0;
  }

  public async listCatalog(params?: {
    category?: string;
    activeOnly?: boolean;
    query?: string;
  }): Promise<ProductCatalogEntry[]> {
    let list = await db.productCatalogCache.toArray();
    if (params?.activeOnly) {
      list = list.filter((e) => e.isActive);
    }
    if (params?.category) {
      list = list.filter((e) => e.category === params.category);
    }
    if (params?.query) {
      const q = params.query.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q));
    }
    return list;
  }
}

export const catalogService = new CatalogService();
