import { db } from '../db/database';
import { formatCsvDateTime } from '../utils/format';
import { AppError } from '../core/errors';

export class BackupService {
  /**
   * Export CSV transaksi:
   * Tanggal, Layanan, Nominal, Fee, BayarAdmin, Status, Petugas, Catatan
   */
  public async exportCsv(params?: { from?: number; to?: number }): Promise<string> {
    let txs = await db.transactions.toArray();
    if (params?.from) txs = txs.filter((t) => t.date >= params.from!);
    if (params?.to) txs = txs.filter((t) => t.date <= params.to!);

    txs.sort((a, b) => b.date - a.date);

    const headers = [
      'ID',
      'Tanggal (WITA)',
      'Layanan',
      'Nominal',
      'Fee',
      'BayarAdmin',
      'MetodeBayar',
      'StatusBayar',
      'Status',
      'Petugas',
      'NoReferensi',
      'Catatan',
    ];

    const rows = await Promise.all(
      txs.map(async (t) => {
        const user = await db.users.get(t.userId);
        return [
          t.id,
          formatCsvDateTime(t.date),
          t.layanan,
          t.nominal.toString(),
          t.fee.toString(),
          t.feePaidBy,
          t.paymentMethod,
          t.paymentStatus,
          t.status.toUpperCase(),
          user?.name || t.userId,
          t.referenceNo || '',
          (t.note || '').replace(/"/g, '""'),
        ]
          .map((cell) => `"${cell}"`)
          .join(',');
      })
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Export master produk & tarif admin ke CSV
   */
  public async exportMastersCsv(): Promise<string> {
    const products = await db.products.toArray();
    const headers = ['ID', 'Nama', 'Kategori', 'Operator', 'Denominasi', 'Modal', 'HargaJual', 'Stok', 'Status'];

    const rows = products.map((p) =>
      [
        p.id,
        p.name,
        p.category,
        p.operator || '',
        p.denomination || '',
        p.modal.toString(),
        p.hargaJual.toString(),
        (p.stock ?? 0).toString(),
        p.isActive ? 'AKTIF' : 'NONAKTIF',
      ]
        .map((cell) => `"${cell}"`)
        .join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Backup lokal: JSON export seluruh tabel Dexie
   */
  public async createBackup(): Promise<string> {
    const backupData = {
      app: 'BUKU KONTER',
      version: 1,
      createdAt: Date.now(),
      users: await db.users.toArray(),
      accounts: await db.accounts.toArray(),
      accountLedger: await db.accountLedger.toArray(),
      products: await db.products.toArray(),
      adminFeeRules: await db.adminFeeRules.toArray(),
      transactions: await db.transactions.toArray(),
      transactionItems: await db.transactionItems.toArray(),
      shifts: await db.shifts.toArray(),
      shiftHandovers: await db.shiftHandovers.toArray(),
      stockMovements: await db.stockMovements.toArray(),
      customers: await db.customers.toArray(),
      auditLogs: await db.auditLogs.toArray(),
      appSettings: await db.appSettings.toArray(),
    };

    return JSON.stringify(backupData, null, 2);
  }

  /**
   * Restore backup: validasi dan timpa data
   */
  public async restoreBackup(jsonContent: string): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(jsonContent);
    } catch {
      throw new AppError('File cadangan tidak valid (format JSON rusak).');
    }

    if (data['app'] !== 'BUKU KONTER' || !data['version']) {
      throw new AppError('File bukan cadangan resmi BUKU KONTER.');
    }

    await db.transaction(
      'rw',
      [
        db.users,
        db.accounts,
        db.accountLedger,
        db.products,
        db.adminFeeRules,
        db.transactions,
        db.transactionItems,
        db.shifts,
        db.shiftHandovers,
        db.stockMovements,
        db.customers,
        db.auditLogs,
        db.appSettings,
      ],
      async () => {
        if (Array.isArray(data['users'])) {
          await db.users.clear();
          await db.users.bulkAdd(data['users']);
        }
        if (Array.isArray(data['accounts'])) {
          await db.accounts.clear();
          await db.accounts.bulkAdd(data['accounts']);
        }
        if (Array.isArray(data['accountLedger'])) {
          await db.accountLedger.clear();
          await db.accountLedger.bulkAdd(data['accountLedger']);
        }
        if (Array.isArray(data['products'])) {
          await db.products.clear();
          await db.products.bulkAdd(data['products']);
        }
        if (Array.isArray(data['adminFeeRules'])) {
          await db.adminFeeRules.clear();
          await db.adminFeeRules.bulkAdd(data['adminFeeRules']);
        }
        if (Array.isArray(data['transactions'])) {
          await db.transactions.clear();
          await db.transactions.bulkAdd(data['transactions']);
        }
        if (Array.isArray(data['transactionItems'])) {
          await db.transactionItems.clear();
          await db.transactionItems.bulkAdd(data['transactionItems']);
        }
        if (Array.isArray(data['shifts'])) {
          await db.shifts.clear();
          await db.shifts.bulkAdd(data['shifts']);
        }
        if (Array.isArray(data['shiftHandovers'])) {
          await db.shiftHandovers.clear();
          await db.shiftHandovers.bulkAdd(data['shiftHandovers']);
        }
        if (Array.isArray(data['stockMovements'])) {
          await db.stockMovements.clear();
          await db.stockMovements.bulkAdd(data['stockMovements']);
        }
        if (Array.isArray(data['customers'])) {
          await db.customers.clear();
          await db.customers.bulkAdd(data['customers']);
        }
        if (Array.isArray(data['auditLogs'])) {
          await db.auditLogs.clear();
          await db.auditLogs.bulkAdd(data['auditLogs']);
        }
        if (Array.isArray(data['appSettings'])) {
          await db.appSettings.clear();
          await db.appSettings.bulkAdd(data['appSettings']);
        }
      }
    );
  }
}

export const backupService = new BackupService();
