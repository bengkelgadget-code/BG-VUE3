import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from '../db/database';
import { AppError } from '../core/errors';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config/supabase';

export const SYNC_TABLES = [
  'users',
  'accounts',
  'accountLedger',
  'products',
  'adminFeeRules',
  'transactions',
  'transactionItems',
  'shifts',
  'shiftHandovers',
  'stockMovements',
  'customers',
  'auditLogs',
  'appSettings',
  'brands',
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];

export class SupabaseSyncService {
  private client: SupabaseClient | null = null;

  private getUrl(): string {
    return (
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL) ||
      SUPABASE_URL
    );
  }

  private getKey(): string {
    return (
      (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
      SUPABASE_ANON_KEY
    );
  }

  public isConfigured(): boolean {
    const url = this.getUrl();
    const key = this.getKey();
    return Boolean(url && key);
  }

  public setCustomClient(client: SupabaseClient | null): void {
    this.client = client;
  }

  private async getClient(): Promise<SupabaseClient> {
    if (this.client) return this.client;

    const url = this.getUrl();
    const key = this.getKey();

    if (!url || !key) {
      throw new AppError('Kredensial Supabase belum dikonfigurasi.');
    }

    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
    return this.client;
  }

  public async testConnection(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { error } = await client.from('bk_sync').select('table_name').limit(1);
      if (error) {
        throw new AppError('Gagal sinkronisasi: ' + (error.message || 'Tabel bk_sync belum dibuat'));
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError('Gagal sinkronisasi: ' + msg);
    }
  }

  public async pushAll(): Promise<{ pushed: number; tombstoned: number; at: number }> {
    try {
      const client = await this.getClient();
      let pushed = 0;
      let tombstoned = 0;
      const nowIso = new Date().toISOString();

      for (const table of SYNC_TABLES) {
        const rows = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[table].toArray();

        // 1. Upsert data lokal dalam batch 100 baris
        if (rows.length > 0) {
          for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);
            const records = batch.map((row: unknown) => {
              const r = row as { id: string | number };
              return {
                table_name: table,
                row_id: String(r.id),
                data: row,
                updated_at: nowIso,
                deleted: false,
              };
            });

            const { error: upsertErr } = await client.from('bk_sync').upsert(records, {
              onConflict: 'table_name,row_id',
            });

            if (upsertErr) {
              throw new AppError('Gagal sinkronisasi: ' + upsertErr.message);
            }
            pushed += records.length;
          }
        }

        // 2. Tombstone: tandai deleted = true untuk baris di cloud yang sudah dihapus di lokal
        // Paging .range() 1000 baris agar tidak terpotong oleh batasan query Supabase (b10)
        let cloudRows: Array<{ row_id: string }> = [];
        let fromTomb = 0;
        const TOMB_PAGE_SIZE = 1000;

        while (true) {
          const { data, error: cloudErr } = await client
            .from('bk_sync')
            .select('row_id')
            .eq('table_name', table)
            .eq('deleted', false)
            .range(fromTomb, fromTomb + TOMB_PAGE_SIZE - 1);

          if (cloudErr) {
            throw new AppError('Gagal sinkronisasi: ' + cloudErr.message);
          }

          if (!data || data.length === 0) break;
          cloudRows = cloudRows.concat(data as Array<{ row_id: string }>);
          if (data.length < TOMB_PAGE_SIZE) break;
          fromTomb += TOMB_PAGE_SIZE;
        }

        const localIdSet = new Set(rows.map((r: unknown) => String((r as { id: string | number }).id)));
        const missingIds = (cloudRows || [])
          .map((c: unknown) => String((c as { row_id: string }).row_id))
          .filter((id: string) => !localIdSet.has(id));

        if (missingIds.length > 0) {
          for (let i = 0; i < missingIds.length; i += 100) {
            const chunk = missingIds.slice(i, i + 100);
            const { error: tombErr } = await client
              .from('bk_sync')
              .update({ deleted: true, updated_at: nowIso })
              .eq('table_name', table)
              .in('row_id', chunk);

            if (tombErr) {
              throw new AppError('Gagal sinkronisasi: ' + tombErr.message);
            }
            tombstoned += chunk.length;
          }
        }
      }

      const at = Date.now();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('buku_konter_sync_last_at', String(at));
      }

      return { pushed, tombstoned, at };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError('Gagal sinkronisasi: ' + msg);
    }
  }

  public async pullAll(): Promise<{ pulled: number; at: number }> {
    try {
      const client = await this.getClient();
      let allRecords: Array<{ table_name: string; row_id: string; data: unknown }> = [];
      let from = 0;
      const PAGE_SIZE = 1000;

      while (true) {
        const { data, error } = await client
          .from('bk_sync')
          .select('table_name, row_id, data')
          .eq('deleted', false)
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          throw new AppError('Gagal sinkronisasi: ' + error.message);
        }

        if (!data || data.length === 0) break;
        allRecords = allRecords.concat(data as Array<{ table_name: string; row_id: string; data: unknown }>);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      // Kelompokkan data berdasarkan table_name yang dikenal
      const groupedByTable: Record<string, unknown[]> = {};
      for (const rec of allRecords) {
        if (!groupedByTable[rec.table_name]) {
          groupedByTable[rec.table_name] = [];
        }
        let item = rec.data as Record<string, unknown>;
        if (rec.table_name === 'appSettings' && typeof item.id === 'string') {
          item = { ...item, id: Number(item.id) };
        }
        groupedByTable[rec.table_name].push(item);
      }

      // Masukkan ke Dexie dalam SATU transaksi atomik
      const tableList = SYNC_TABLES as unknown as string[];
      let actualPulled = 0;
      await db.transaction('rw', tableList, async () => {
        for (const table of SYNC_TABLES) {
          const targetTable = (db as unknown as Record<string, { clear: () => Promise<void>; bulkAdd: (items: unknown[]) => Promise<unknown> }>)[table];
          await targetTable.clear();
          const items = groupedByTable[table] || [];
          if (items.length > 0) {
            await targetTable.bulkAdd(items);
            actualPulled += items.length;
          }
        }
      });

      const at = Date.now();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('buku_konter_sync_last_at', String(at));
      }

      return { pulled: actualPulled, at };
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError('Gagal sinkronisasi: ' + msg);
    }
  }

  public async hasCloudData(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const { data, count, error } = await client
        .from('bk_sync')
        .select('table_name', { count: 'exact' })
        .eq('deleted', false)
        .limit(1);

      if (error) {
        throw new AppError('Gagal sinkronisasi: ' + error.message);
      }

      if (typeof count === 'number') {
        return count > 0;
      }
      return Boolean(data && data.length > 0);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new AppError('Gagal sinkronisasi: ' + msg);
    }
  }

  public async isLocalEmpty(): Promise<boolean> {
    const usersCount = await db.users.count();
    const txCount = await db.transactions.count();
    return usersCount === 0 && txCount === 0;
  }
}

export const supabaseSyncService = new SupabaseSyncService();
