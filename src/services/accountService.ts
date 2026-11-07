import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Account, AccountLedger } from '../db/types';
import { AppError } from '../core/errors';
import { authService } from './authService';

export class AccountService {
  /**
   * Tambah akun saldo catatan baru.
   * Saldo awal (initialBalance) diinput manual oleh Owner/Admin dan disimpan
   * di kolom accounts.initialBalance. Bukan transaksi dan bukan baris ledger.
   */
  public async addAccount(params: {
    name: string;
    type: 'kas' | 'bank' | 'ewallet' | 'server_pulsa' | 'provider_app';
    initialBalance?: number;
    accountNo?: string;
    ownerName?: string;
    icon?: string;
    color?: string;
  }): Promise<string> {
    const trimmedName = params.name.trim();
    if (!trimmedName) {
      throw new AppError('Nama akun tidak boleh kosong.');
    }

    const initBal = Math.max(0, Math.round(params.initialBalance ?? 0));
    const now = Date.now();
    const id = uuidv4();

    const account: Account = {
      id,
      name: trimmedName,
      type: params.type,
      initialBalance: initBal,
      accountNo: params.accountNo?.trim() || undefined,
      ownerName: params.ownerName?.trim() || undefined,
      icon: params.icon || 'wallet',
      color: params.color || '#059669',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.accounts.add(account);
    return id;
  }

  public async updateAccount(
    id: string,
    patch: Partial<{
      name: string;
      accountNo: string;
      ownerName: string;
      icon: string;
      color: string;
      isActive: boolean;
    }>
  ): Promise<void> {
    const acc = await db.accounts.get(id);
    if (!acc) {
      throw new AppError('Akun tidak ditemukan.');
    }

    // initialBalance TIDAK BOLEH diubah lewat updateAccount
    await db.accounts.update(id, {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  /**
   * Hapus akun: tolak bila akun sudah memiliki riwayat mutasi di ledger atau transaksi
   */
  public async deleteAccount(id: string): Promise<void> {
    const ledgerCount = await db.accountLedger.where('accountId').equals(id).count();
    const txCount = await db.transactions
      .filter((t) => t.accountId === id || t.sourceAccountId === id || t.destAccountId === id)
      .count();
    const totalCount = ledgerCount + txCount;
    if (totalCount > 0) {
      throw new AppError(`Tidak dapat menghapus akun yang memiliki riwayat ${totalCount} transaksi/mutasi.`);
    }
    await db.accounts.delete(id);
  }

  public async getAccounts(params?: { activeOnly?: boolean }): Promise<Account[]> {
    const collection = db.accounts.toCollection();
    let list = await collection.toArray();
    if (params?.activeOnly) {
      list = list.filter((a) => a.isActive);
    }
    return list;
  }

  public async getAccount(id: string): Promise<Account | undefined> {
    return await db.accounts.get(id);
  }

  /**
   * Saldo = initialBalance + SUM(delta) dari account_ledger akun itu.
   * Tidak ada kolom balance di tabel accounts (mencegah drift).
   */
  public async getBalance(accountId: string): Promise<number> {
    const acc = await db.accounts.get(accountId);
    if (!acc) return 0;

    const ledgers = await db.accountLedger.where('accountId').equals(accountId).toArray();
    let sumDeltas = 0;
    for (const l of ledgers) {
      sumDeltas += l.delta;
    }

    return acc.initialBalance + sumDeltas;
  }

  public async getAllBalances(): Promise<Record<string, number>> {
    const accounts = await db.accounts.toArray();
    const result: Record<string, number> = {};

    for (const acc of accounts) {
      result[acc.id] = await this.getBalance(acc.id);
    }

    return result;
  }

  /**
   * Koreksi / rubah saldo manual. HANYA Owner/Admin.
   * Wajib alasan minimal 3 karakter. Menulis 1 baris ledger 'koreksi_manual' + audit log.
   */
  public async adjustBalanceManual(params: {
    accountId: string;
    delta: number; // int Rupiah, boleh negatif, != 0
    reason: string;
    actorUserId: string;
  }): Promise<void> {
    const actor = await db.users.get(params.actorUserId);
    if (!actor || !authService.canAdjustBalance(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang memiliki akses koreksi saldo manual.');
    }

    const trimmedReason = params.reason.trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      throw new AppError('Alasan koreksi saldo wajib diisi (minimal 3 karakter).');
    }

    if (params.delta === 0) {
      throw new AppError('Nominal selisih koreksi saldo tidak boleh Rp0.');
    }

    const acc = await db.accounts.get(params.accountId);
    if (!acc) {
      throw new AppError('Akun tidak ditemukan.');
    }

    const currentBalance = await this.getBalance(params.accountId);
    const targetBalance = currentBalance + params.delta;
    const now = Date.now();

    await db.transaction('rw', [db.accountLedger, db.auditLogs], async () => {
      // 1. Tulis baris mutasi ledger
      await db.accountLedger.add({
        id: uuidv4(),
        accountId: params.accountId,
        kind: 'koreksi_manual',
        delta: params.delta,
        note: trimmedReason,
        createdAt: now,
      });

      // 2. Tulis jejak audit log
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: params.actorUserId,
        action: 'koreksi_saldo',
        entityType: 'account',
        entityId: params.accountId,
        detail: JSON.stringify({
          accountName: acc.name,
          saldoSebelum: currentBalance,
          delta: params.delta,
          saldoSesudah: targetBalance,
          alasan: trimmedReason,
        }),
        createdAt: now,
      });
    });
  }

  public async getLedger(
    accountId: string,
    params?: { from?: number; to?: number }
  ): Promise<AccountLedger[]> {
    let list = await db.accountLedger.where('accountId').equals(accountId).toArray();
    if (params?.from) {
      list = list.filter((l) => l.createdAt >= params.from!);
    }
    if (params?.to) {
      list = list.filter((l) => l.createdAt <= params.to!);
    }
    list.sort((a, b) => b.createdAt - a.createdAt);
    return list;
  }
}

export const accountService = new AccountService();
