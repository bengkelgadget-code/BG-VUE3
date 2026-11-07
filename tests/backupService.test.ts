import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { backupService } from '../src/services/backupService';

describe('BackupService (Cadangan & Pemulihan Database)', () => {
  beforeEach(async () => {
    await db.users.clear();
    await db.accounts.clear();
    await db.transactions.clear();
    await db.products.clear();
    await db.adminFeeRules.clear();

    await db.users.add({
      id: 'owner-backup',
      name: 'Owner Backup Test',
      role: 'owner',
      pinHash: 'hash-pin',
      isActive: true,
      createdAt: Date.now(),
    });

    await db.accounts.add({
      id: 'acc-backup-1',
      name: 'Kas Cadangan',
      type: 'kas',
      initialBalance: 500000,
      icon: 'Wallet',
      color: '#10B981',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  });

  it('1. createBackup menghasilkan string JSON berisi struktur resmi BUKU KONTER', async () => {
    const backupJson = await backupService.createBackup();
    expect(backupJson).toBeDefined();

    const parsed = JSON.parse(backupJson);
    expect(parsed.app).toBe('BUKU KONTER');
    expect(parsed.version).toBe(1);
    expect(parsed.accounts.length).toBe(1);
    expect(parsed.accounts[0].name).toBe('Kas Cadangan');
  });

  it('2. restoreBackup berhasil memulihkan data ke tabel lokal', async () => {
    const backupJson = await backupService.createBackup();

    // Kosongkan database
    await db.accounts.clear();
    expect(await db.accounts.count()).toBe(0);

    // Pulihkan dari JSON
    await backupService.restoreBackup(backupJson);

    // Akun kembali ada
    const restoredAccounts = await db.accounts.toArray();
    expect(restoredAccounts.length).toBe(1);
    expect(restoredAccounts[0]?.name).toBe('Kas Cadangan');
  });

  it('3. restoreBackup menolak file JSON rusak atau bukan format BUKU KONTER', async () => {
    // 1. JSON rusak
    await expect(backupService.restoreBackup('Bukan json {[]')).rejects.toThrow(
      'File cadangan tidak valid (format JSON rusak).'
    );

    // 2. Format aplikasi lain
    const alienBackup = JSON.stringify({ app: 'APLIKASI_LAIN', version: 1 });
    await expect(backupService.restoreBackup(alienBackup)).rejects.toThrow(
      'File bukan cadangan resmi BUKU KONTER.'
    );
  });

  it('4. exportCsv menghasilkan format CSV transaksi dengan header yang benar', async () => {
    await db.transactions.add({
      id: 'tx-csv-1',
      layanan: 'transfer',
      shiftId: 'shift-1',
      userId: 'owner-backup',
      nominal: 100000,
      fee: 3000,
      feePaidBy: 'cash',
      paymentMethod: 'tunai',
      paymentStatus: 'lunas',
      status: 'ok',
      feeManualOverride: false,
      date: Date.now(),
      note: 'Transfer BCA Budi',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const csv = await backupService.exportCsv();
    expect(csv).toContain('Tanggal (WITA)');
    expect(csv).toContain('transfer');
    expect(csv).toContain('100000');
    expect(csv).toContain('Transfer BCA Budi');
  });
});
