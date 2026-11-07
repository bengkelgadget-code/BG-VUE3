import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../src/db/database';
import { catalogService } from '../src/services/catalogService';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('CatalogService (Sinkronisasi Read-Only Katalog Supabase)', () => {
  beforeEach(async () => {
    await db.productCatalogCache.clear();
    await db.users.clear();
    await db.auditLogs.clear();

    await db.users.add({
      id: 'owner-sync',
      name: 'Owner Toko',
      role: 'owner',
      pinHash: 'hash',
      isActive: true,
      createdAt: Date.now(),
    });

    await db.users.add({
      id: 'kasir-sync',
      name: 'Kasir Toko',
      role: 'kasir',
      pinHash: 'hash',
      isActive: true,
      createdAt: Date.now(),
    });
  });

  it('1. syncCatalog membaca Supabase via SELECT dan mengisi product_catalog_cache secara read-only', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'SP-PLN-20K',
          name: 'Token PLN 20.000',
          category: 'token_pln',
          operator: 'PLN',
          denomination: '20.000',
        },
        {
          id: 'SP-TSEL-10K',
          name: 'Pulsa Telkomsel 10.000',
          category: 'pulsa',
          operator: 'Telkomsel',
          denomination: '10.000',
        },
      ],
      error: null,
    });

    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    const fakeClient = {
      from: mockFrom,
    } as unknown as SupabaseClient;

    catalogService.setCustomClient(fakeClient);

    const result = await catalogService.syncCatalog({ actorUserId: 'owner-sync' });

    expect(result.added).toBe(2);
    expect(result.updated).toBe(0);
    expect(mockFrom).toHaveBeenCalledWith('products');
    expect(mockSelect).toHaveBeenCalledWith('id, name, category, operator, denomination');

    // Cek data di Dexie
    const cached = await db.productCatalogCache.toArray();
    expect(cached.length).toBe(2);
    expect(cached[0]?.name).toBe('Token PLN 20.000');
    expect(cached[1]?.name).toBe('Pulsa Telkomsel 10.000');
  });

  it('2. Sinkronisasi dua kali tidak menduplikasi entri dan memperbarui data', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'SP-PLN-20K',
          name: 'Token PLN 20.000 (Updated)',
          category: 'token_pln',
          operator: 'PLN',
          denomination: '20.000',
        },
      ],
      error: null,
    });

    const fakeClient = {
      from: () => ({ select: mockSelect }),
    } as unknown as SupabaseClient;

    catalogService.setCustomClient(fakeClient);

    // Sync 1
    await catalogService.syncCatalog({ actorUserId: 'owner-sync' });
    // Sync 2
    const result2 = await catalogService.syncCatalog({ actorUserId: 'owner-sync' });

    expect(result2.added).toBe(0);
    expect(result2.updated).toBe(1);

    const cached = await db.productCatalogCache.toArray();
    expect(cached.length).toBe(1);
    expect(cached[0]?.name).toBe('Token PLN 20.000 (Updated)');
  });

  it('3. Kasir dilarang memicu sinkronisasi katalog Supabase', async () => {
    await expect(
      catalogService.syncCatalog({ actorUserId: 'kasir-sync' })
    ).rejects.toThrow('Hanya Owner dan Admin yang berhak menyinkronkan katalog produk');
  });
});
