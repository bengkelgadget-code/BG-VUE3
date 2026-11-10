import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../src/db/database';
import { supabaseSyncService, SYNC_TABLES } from '../src/services/supabaseSyncService';
import { AppError } from '../src/core/errors';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('SupabaseSyncService (b9: Koneksi Data ke Supabase)', () => {
  beforeEach(async () => {
    localStorage.clear();
    supabaseSyncService.setCustomClient(null);

    // Bersihkan semua tabel
    for (const table of SYNC_TABLES) {
      await (db as unknown as Record<string, { clear: () => Promise<void> }>)[table].clear();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. isConfigured & Resolusi Kredensial', () => {
    it('mengembalikan false bila kredensial kosong, dan true bila diisi di localStorage', () => {
      // Mock import.meta.env kosong
      const originalUrl = import.meta.env.VITE_SUPABASE_URL;
      const originalKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const envRecord = import.meta.env as unknown as Record<string, string | undefined>;
      delete envRecord.VITE_SUPABASE_URL;
      delete envRecord.VITE_SUPABASE_ANON_KEY;

      expect(supabaseSyncService.isConfigured()).toBe(false);

      localStorage.setItem('supabase_catalog_url', 'https://xyz.supabase.co');
      expect(supabaseSyncService.isConfigured()).toBe(false); // key masih kosong

      localStorage.setItem('supabase_catalog_key', 'anon-key-123');
      expect(supabaseSyncService.isConfigured()).toBe(true);

      // Restore
      if (originalUrl) envRecord.VITE_SUPABASE_URL = originalUrl;
      if (originalKey) envRecord.VITE_SUPABASE_ANON_KEY = originalKey;
    });

    it('pushAll & pullAll melempar AppError bila kredensial belum dikonfigurasi', async () => {
      const envRecord = import.meta.env as unknown as Record<string, string | undefined>;
      delete envRecord.VITE_SUPABASE_URL;
      delete envRecord.VITE_SUPABASE_ANON_KEY;

      await expect(supabaseSyncService.pushAll()).rejects.toThrow(AppError);
      await expect(supabaseSyncService.pushAll()).rejects.toThrow(
        /Kredensial Supabase belum dikonfigurasi/
      );

      await expect(supabaseSyncService.pullAll()).rejects.toThrow(AppError);
      await expect(supabaseSyncService.pullAll()).rejects.toThrow(
        /Kredensial Supabase belum dikonfigurasi/
      );
    });
  });

  describe('2. pushAll (Pengunggahan & Tombstone)', () => {
    it('mengunggah data per tabel (14 tabel) dengan onConflict table_name,row_id dan melakukan tombstone', async () => {
      // Isi data lokal di beberapa tabel
      await db.users.add({
        id: 'user-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      });
      await db.brands.add({
        id: 'brand-1',
        name: 'Telkomsel',
        createdAt: Date.now(),
      });
      await db.appSettings.put({
        id: 1,
        theme: 'light',
        shiftTolerance: 5000,
        biometricEnabled: false,
      });

      const upsertedRecords: Array<{
        table_name: string;
        row_id: string;
        data: Record<string, unknown>;
        deleted: boolean;
      }> = [];
      const updatedTombstones: Array<{
        updateData: { deleted: boolean; updated_at: string };
        field: string;
        val: unknown;
        inField: string;
        ids: string[];
      }> = [];

      const mockClient = {
        from: vi.fn((table: string) => {
          expect(table).toBe('bk_sync');
          return {
            upsert: vi.fn(async (records: Array<{
              table_name: string;
              row_id: string;
              data: Record<string, unknown>;
              deleted: boolean;
            }>, options?: { onConflict?: string }) => {
              expect(options?.onConflict).toBe('table_name,row_id');
              upsertedRecords.push(...records);
              return { error: null };
            }),
            select: vi.fn((_cols: string) => ({
              eq: vi.fn((field1: string, val1: unknown) => ({
                eq: vi.fn(async (_field2: string, _val2: unknown) => {
                  // Simulasi data cloud yang ada untuk tombstone check
                  if (field1 === 'table_name' && val1 === 'brands') {
                    // Di cloud ada brand-1 dan brand-deleted
                    return {
                      data: [{ row_id: 'brand-1' }, { row_id: 'brand-deleted' }],
                      error: null,
                    };
                  }
                  return { data: [], error: null };
                }),
              })),
            })),
            update: vi.fn((updateData: { deleted: boolean; updated_at: string }) => ({
              eq: vi.fn((field: string, val: unknown) => ({
                in: vi.fn(async (inField: string, ids: string[]) => {
                  updatedTombstones.push({ updateData, field, val, inField, ids });
                  return { error: null };
                }),
              })),
            })),
          };
        }),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClient);

      const result = await supabaseSyncService.pushAll();

      expect(result.pushed).toBe(3); // 1 user + 1 brand + 1 appSettings
      expect(result.tombstoned).toBe(1); // brand-deleted di-tombstone
      expect(result.at).toBeGreaterThan(0);

      // Verifikasi record yang di-upsert
      const userUpsert = upsertedRecords.find((r) => r.table_name === 'users');
      expect(userUpsert).toBeDefined();
      expect(userUpsert?.row_id).toBe('user-1');
      expect(userUpsert?.deleted).toBe(false);
      expect(userUpsert?.data.name).toBe('Owner');

      const brandUpsert = upsertedRecords.find((r) => r.table_name === 'brands');
      expect(brandUpsert).toBeDefined();
      expect(brandUpsert?.row_id).toBe('brand-1');

      // Verifikasi tombstone
      expect(updatedTombstones).toHaveLength(1);
      expect(updatedTombstones[0]?.ids).toEqual(['brand-deleted']);
      expect(updatedTombstones[0]?.updateData.deleted).toBe(true);

      // Verifikasi timestamp tersimpan di localStorage
      expect(localStorage.getItem('buku_konter_sync_last_at')).toBe(String(result.at));
    });
  });

  describe('3. pullAll (Penarikan Data & Penimpaan Atomik Dexie)', () => {
    it('mengganti isi tabel lokal secara atomik dan mengabaikan tabel yang tidak dikenal', async () => {
      // Isi data awal yang akan tertimpa
      await db.users.add({
        id: 'user-old',
        name: 'Old User',
        role: 'kasir',
        pinHash: 'old',
        isActive: true,
        createdAt: 1000,
      });

      const cloudData = [
        {
          table_name: 'users',
          row_id: 'user-cloud-1',
          data: {
            id: 'user-cloud-1',
            name: 'Cloud Owner',
            role: 'owner',
            pinHash: 'cloudhash',
            isActive: true,
            createdAt: 2000,
          },
        },
        {
          table_name: 'brands',
          row_id: 'brand-cloud-1',
          data: {
            id: 'brand-cloud-1',
            name: 'Axis',
            createdAt: 2000,
          },
        },
        {
          table_name: 'appSettings',
          row_id: '1',
          data: {
            id: '1', // string dari jsonb
            theme: 'dark',
            shiftTolerance: 10000,
            biometricEnabled: true,
          },
        },
        {
          table_name: 'tabel_masa_depan_tidak_dikenal',
          row_id: 'foo-1',
          data: { id: 'foo-1', something: 'bar' },
        },
      ];

      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              range: vi.fn(async (from: number) => {
                if (from === 0) {
                  return { data: cloudData, error: null };
                }
                return { data: [], error: null };
              }),
            })),
          })),
        })),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClient);

      const result = await supabaseSyncService.pullAll();
      expect(result.pulled).toBe(4);

      // Verifikasi users di lokal terbarui (old user terhapus, cloud owner ada)
      const users = await db.users.toArray();
      expect(users).toHaveLength(1);
      expect(users[0]?.id).toBe('user-cloud-1');
      expect(users[0]?.name).toBe('Cloud Owner');

      // Verifikasi brands di lokal
      const brands = await db.brands.toArray();
      expect(brands).toHaveLength(1);
      expect(brands[0]?.name).toBe('Axis');

      // Verifikasi appSettings id dinormalisasi ke number
      const settings = await db.appSettings.get(1);
      expect(settings?.theme).toBe('dark');
      expect(settings?.shiftTolerance).toBe(10000);
    });
  });

  describe('4. hasCloudData & isLocalEmpty', () => {
    it('hasCloudData mengembalikan true jika ada data cloud dan false jika kosong', async () => {
      const mockClientNotEmpty = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ count: 5, data: [{ table_name: 'users' }], error: null })),
            })),
          })),
        })),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClientNotEmpty);
      expect(await supabaseSyncService.hasCloudData()).toBe(true);

      const mockClientEmpty = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn(async () => ({ count: 0, data: [], error: null })),
            })),
          })),
        })),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClientEmpty);
      expect(await supabaseSyncService.hasCloudData()).toBe(false);
    });

    it('isLocalEmpty true bila users dan transactions kosong', async () => {
      expect(await supabaseSyncService.isLocalEmpty()).toBe(true);

      await db.users.add({
        id: 'u1',
        name: 'User 1',
        role: 'kasir',
        pinHash: 'h',
        isActive: true,
        createdAt: 1,
      });

      expect(await supabaseSyncService.isLocalEmpty()).toBe(false);
    });
  });

  describe('5. testConnection', () => {
    it('mengembalikan true bila koneksi berhasil', async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn(async () => ({ data: [{ table_name: 'users' }], error: null })),
          })),
        })),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClient);
      expect(await supabaseSyncService.testConnection()).toBe(true);
    });

    it('melempar AppError berbahasa Indonesia bila tabel belum ada / koneksi gagal', async () => {
      const mockClient = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            limit: vi.fn(async () => ({
              data: null,
              error: { message: 'relation "public.bk_sync" does not exist' },
            })),
          })),
        })),
      } as unknown as SupabaseClient;

      supabaseSyncService.setCustomClient(mockClient);
      await expect(supabaseSyncService.testConnection()).rejects.toThrow(
        /Gagal sinkronisasi: relation "public.bk_sync" does not exist/
      );
    });
  });
});
