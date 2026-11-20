import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { ProductCatalogEntry, ProductCategory } from '../db/types';
import { AppError } from '../core/errors';
import { authService } from './authService';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

/**
 * ID mitra "Bengkel Gadget" di database Server Pulsa.
 * Saat ini RLS anon membatasi pembacaan tabel mitras, sehingga ID belum dapat diatasi otomatis dari aplikasi.
 * Jangan pernah menggunakan ID tebakan!
 * Bila nanti ID sudah diverifikasi secara resmi atau RLS dibuka, cukup isi konstanta ini.
 */
export const BENGKEL_GADGET_MITRA_ID = '';

/**
 * Pemetaan kategori Supabase Server Pulsa ke kategori Buku Konter (b24 revisi 20 Nov 2026):
 * HANYA: Pulsa -> pulsa, PLN -> token_pln, Games -> game.
 * Lainnya (Data, E-Money, Masa Aktif, Pascabayar, dsb.) menghasilkan null (dilewati).
 */
export const SUPABASE_CATEGORY_MAP: Record<string, ProductCategory> = {
  pulsa: 'pulsa',
  pln: 'token_pln',
  token_pln: 'token_pln',
  games: 'game',
  game: 'game',
};

export function mapSupabaseCategory(raw?: string | null): ProductCategory | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return SUPABASE_CATEGORY_MAP[key] ?? null;
}

/**
 * Ekstrak angka denominasi terbesar dari nama produk (misal: "Telkomsel 125.000" -> 125000, "5.000" -> 5000).
 */
export function extractDenomination(productName: string): number {
  if (!productName) return 0;
  // Hapus titik pemisah ribuan di antara angka
  const normalized = productName.replace(/(\d)\.(\d)/g, '$1$2').replace(/(\d)\.(\d)/g, '$1$2');
  const matches = normalized.match(/\d+/g);
  if (!matches || matches.length === 0) return 0;
  const numbers = matches.map((m) => parseInt(m, 10)).filter((n) => !isNaN(n));
  return numbers.length > 0 ? Math.max(...numbers) : 0;
}

/**
 * Rumus harga efektif (mirror logika Server Pulsa §E.2 butir 3):
 * - modal = products.harga_modal
 * - jual = products.harga_jual + markup
 *   markup = markup kustom mitra_pricing bila ada;
 *   bila tidak ada dan kategori Pulsa: target = denominasi + 3.000 (<100rb) atau + 5.000 (>=100rb); markup = max(0, target - harga_jual);
 *   kategori lain tanpa markup kustom: markup = 0.
 * Tidak pernah throw, aman terhadap input aneh/kosong.
 */
export function computeEffectivePrices(
  base: {
    harga_modal?: number | null;
    harga_jual?: number | null;
    category?: string | null;
    product_name?: string | null;
  },
  customMarkup?: number | null
): { modal: number; jual: number } {
  const modal = Math.round(Number(base?.harga_modal) || 0);
  const baseJual = Math.round(Number(base?.harga_jual) || 0);

  let markup = 0;
  if (typeof customMarkup === 'number' && !isNaN(customMarkup)) {
    markup = Math.round(customMarkup);
  } else {
    const cat = (base?.category || '').toLowerCase().trim();
    if (cat === 'pulsa') {
      const denom = extractDenomination(base?.product_name || '');
      if (denom > 0) {
        const target = denom >= 100000 ? denom + 5000 : denom + 3000;
        markup = Math.max(0, target - baseJual);
      }
    }
  }

  const jual = baseJual + markup;
  return { modal, jual };
}

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
   */
  public async syncCatalog(opts: {
    actorUserId: string;
  }): Promise<{
    added: number;
    updated: number;
    deactivated: number;
    localUpdated: number;
    syncedAt: number;
    mitraResolved: boolean;
    notice?: string;
  }> {
    const actor = await db.users.get(opts.actorUserId);
    if (!actor || !authService.canManageMaster(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang berhak menyinkronkan katalog produk.');
    }

    const client = await this.getClient();

    // STRICT: SELECT SAJA — tidak pernah memanggil insert/update/delete/upsert ke Supabase
    // Mengambil kolom asli Server Pulsa dan hanya produk aktif (is_active = true)
    const { data, error } = await client
      .from('products')
      .select('sku_code, product_name, category, brand, harga_modal, harga_jual')
      .eq('is_active', true);

    if (error || !Array.isArray(data)) {
      throw new AppError(`Gagal membaca katalog Supabase: ${error?.message || 'Data tidak valid'}`);
    }

    // 2. Coba atasi ID mitra Bengkel Gadget tanpa menebak
    let bgMitraId = BENGKEL_GADGET_MITRA_ID;
    let mitraResolved = Boolean(bgMitraId);

    if (!bgMitraId) {
      try {
        const fromMitras = client.from('mitras');
        if (fromMitras && typeof fromMitras.select === 'function') {
          const sel = fromMitras.select('id, nama_mitra');
          const il = sel && typeof sel.ilike === 'function' ? sel.ilike('nama_mitra', '%Bengkel Gadget%') : null;
          const lim = il && typeof il.limit === 'function' ? il.limit(1) : il;
          if (lim) {
            const { data: mitraData, error: mitraError } = await lim;
            if (!mitraError && Array.isArray(mitraData) && mitraData.length > 0 && mitraData[0]?.id) {
              bgMitraId = String(mitraData[0].id);
              mitraResolved = true;
            }
          }
        }
      } catch {
        // Abaikan error RLS / mock
      }
    }

    // 3. Baca tabel mitra_pricing satu kali
    const markupBySku = new Map<string, number>();
    try {
      const fromPricing = client.from('mitra_pricing');
      if (fromPricing && typeof fromPricing.select === 'function') {
        const sel = fromPricing.select('mitra_id, product_sku, markup_amount');
        const query = bgMitraId && typeof sel?.eq === 'function' ? sel.eq('mitra_id', bgMitraId) : sel;
        const { data: pricingData, error: pricingError } = await (query as PromiseLike<{ data: unknown; error: unknown }>);
        if (!pricingError && Array.isArray(pricingData)) {
          for (const raw of pricingData) {
            const mp = raw as { mitra_id?: string; product_sku?: string; markup_amount?: number };
            if (bgMitraId && mp.mitra_id !== bgMitraId) continue;
            if (mp.product_sku && typeof mp.markup_amount === 'number') {
              markupBySku.set(String(mp.product_sku), Number(mp.markup_amount));
            }
          }
        }
      }
    } catch {
      // Abaikan error mock / pembacaan
    }

    const now = Date.now();
    let added = 0;
    let updated = 0;
    let deactivated = 0;

    const remoteIds = new Set<string>();

    for (const item of data) {
      const mappedCategory = mapSupabaseCategory(item.category);
      if (!mappedCategory) {
        // Lewati kategori yang tidak dicakup sementara (revisi 20 Nov 2026: hanya pulsa, token_pln, game)
        continue;
      }

      const itemId = String(item.sku_code);
      remoteIds.add(itemId);
      const existing = await db.productCatalogCache.get(itemId);

      const customMarkup = bgMitraId ? markupBySku.get(itemId) : undefined;
      const { modal, jual } = computeEffectivePrices(
        {
          harga_modal: item.harga_modal,
          harga_jual: item.harga_jual,
          category: mappedCategory,
          product_name: item.product_name,
        },
        customMarkup
      );

      const entry: ProductCatalogEntry = {
        id: itemId,
        name: String(item.product_name || ''),
        category: mappedCategory,
        operator: item.brand ? String(item.brand) : undefined,
        denomination: '',
        modal,
        hargaJual: jual,
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

    // 4. Perbarui harga produk lokal yang terhubung ke katalog (kategori pulsa, token_pln, game)
    let localUpdated = 0;
    const localProducts = await db.products.toArray();
    for (const lp of localProducts) {
      if (!lp.externalProductRef) continue;
      if (!['pulsa', 'token_pln', 'game'].includes(lp.category)) continue;

      const catEntry = await db.productCatalogCache.get(lp.externalProductRef);
      if (!catEntry || !catEntry.isActive) continue;

      const newModal = catEntry.modal ?? lp.modal;
      const newHargaJual = catEntry.hargaJual ?? lp.hargaJual;

      if (lp.modal !== newModal || lp.hargaJual !== newHargaJual) {
        const oldModal = lp.modal;
        const oldHargaJual = lp.hargaJual;
        await db.products.update(lp.id, {
          modal: newModal,
          hargaJual: newHargaJual,
          updatedAt: now,
        });
        localUpdated++;

        await db.auditLogs.add({
          id: uuidv4(),
          actorUserId: opts.actorUserId,
          action: 'update_harga_katalog',
          entityType: 'product',
          entityId: lp.id,
          detail: JSON.stringify({
            sku: lp.externalProductRef,
            modalLama: oldModal,
            modalBaru: newModal,
            jualLama: oldHargaJual,
            jualBaru: newHargaJual,
          }),
          createdAt: now,
        });
      }
    }

    this.lastSyncTimestamp = now;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('supabase_last_sync', String(now));
    }

    const notice = mitraResolved
      ? undefined
      : "Mitra 'Bengkel Gadget' tidak teratasi dari aplikasi (RLS) — harga memakai harga dasar + markup default Pulsa; markup kustom mitra belum diterapkan";

    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: opts.actorUserId,
      action: 'sync_katalog',
      entityType: 'product_catalog_cache',
      entityId: 'all',
      detail: JSON.stringify({ added, updated, deactivated, localUpdated, mitraResolved }),
      createdAt: now,
    });

    return { added, updated, deactivated, localUpdated, syncedAt: now, mitraResolved, notice };
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
