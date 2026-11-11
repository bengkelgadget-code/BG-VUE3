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

  it('1. syncCatalog membaca Supabase via SELECT kolom asli Server Pulsa dan mengisi product_catalog_cache secara read-only', async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: [
        {
          sku_code: 'SP-PLN-20K',
          product_name: 'Token PLN 20.000',
          category: 'token_pln',
          brand: 'PLN',
          is_active: true,
        },
        {
          sku_code: 'SP-TSEL-10K',
          product_name: 'Pulsa Telkomsel 10.000',
          category: 'pulsa',
          brand: 'Telkomsel',
          is_active: true,
        },
      ],
      error: null,
    });

    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq,
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
    expect(mockSelect).toHaveBeenCalledWith('sku_code, product_name, category, brand');
    expect(mockEq).toHaveBeenCalledWith('is_active', true);

    // Cek data di Dexie
    const cached = await db.productCatalogCache.toArray();
    expect(cached.length).toBe(2);
    expect(cached[0]?.id).toBe('SP-PLN-20K');
    expect(cached[0]?.name).toBe('Token PLN 20.000');
    expect(cached[0]?.operator).toBe('PLN');
    expect(cached[0]?.denomination).toBe('');

    expect(cached[1]?.id).toBe('SP-TSEL-10K');
    expect(cached[1]?.name).toBe('Pulsa Telkomsel 10.000');
    expect(cached[1]?.operator).toBe('Telkomsel');
    expect(cached[1]?.denomination).toBe('');
  });

  it('2. Sinkronisasi dua kali tidak menduplikasi entri dan memperbarui data', async () => {
    const mockEq = vi.fn().mockResolvedValue({
      data: [
        {
          sku_code: 'SP-PLN-20K',
          product_name: 'Token PLN 20.000 (Updated)',
          category: 'token_pln',
          brand: 'PLN',
          is_active: true,
        },
      ],
      error: null,
    });

    const fakeClient = {
      from: () => ({ select: () => ({ eq: mockEq }) }),
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
    expect(cached[0]?.id).toBe('SP-PLN-20K');
    expect(cached[0]?.name).toBe('Token PLN 20.000 (Updated)');
    expect(cached[0]?.denomination).toBe('');
  });

  it('3. Kasir dilarang memicu sinkronisasi katalog Supabase', async () => {
    await expect(
      catalogService.syncCatalog({ actorUserId: 'kasir-sync' })
    ).rejects.toThrow('Hanya Owner dan Admin yang berhak menyinkronkan katalog produk');
  });

  it('4. syncCatalog memfilter baris is_active = true dan memetakan kolom asli ke cache', async () => {
    const mockEq = vi.fn().mockImplementation((col: string, val: unknown) => {
      // Simulasikan database hanya mengembalikan baris yang memenuhi is_active = true
      const rawRows = [
        {
          sku_code: 'PULSA-INDOSAT-5K',
          product_name: 'Indosat 5.000',
          category: 'pulsa',
          brand: 'Indosat',
          is_active: true,
        },
        {
          sku_code: 'PULSA-AXIS-5K',
          product_name: 'Axis 5.000 (Nonaktif)',
          category: 'pulsa',
          brand: 'Axis',
          is_active: false,
        },
      ];
      const filtered = col === 'is_active' ? rawRows.filter((r) => r.is_active === val) : rawRows;
      return Promise.resolve({ data: filtered, error: null });
    });

    const fakeClient = {
      from: (table: string) => {
        expect(table).toBe('products');
        return {
          select: (cols: string) => {
            expect(cols).toBe('sku_code, product_name, category, brand');
            return { eq: mockEq };
          },
        };
      },
    } as unknown as SupabaseClient;

    catalogService.setCustomClient(fakeClient);

    const result = await catalogService.syncCatalog({ actorUserId: 'owner-sync' });
    expect(result.added).toBe(1);

    const cached = await db.productCatalogCache.toArray();
    expect(cached.length).toBe(1);
    expect(cached[0]?.id).toBe('PULSA-INDOSAT-5K');
    expect(cached[0]?.name).toBe('Indosat 5.000');
    expect(cached[0]?.operator).toBe('Indosat');
    expect(cached[0]?.denomination).toBe('');
    expect(cached[0]?.isActive).toBe(true);

    const nonActive = await db.productCatalogCache.get('PULSA-AXIS-5K');
    expect(nonActive).toBeUndefined();
  });
});
