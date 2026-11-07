import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AppError } from '../core/errors';

export interface ReceivableSummary {
  customerId: string;
  customerName: string;
  totalHutang: number;
  oldestDate: number;
  phone?: string;
}

export class ReceivableService {
  /**
   * Daftar piutang per pelanggan (hanya pelanggan dengan balanceHutang > 0)
   */
  public async listReceivables(): Promise<ReceivableSummary[]> {
    const customers = await db.customers.toArray();
    const result: ReceivableSummary[] = [];

    for (const c of customers) {
      if (c.balanceHutang > 0) {
        // Cari tanggal transaksi hutang tertua
        const txList = await db.transactions
          .where('customerId')
          .equals(c.id)
          .filter((t) => t.paymentStatus === 'hutang' && t.status !== 'void')
          .sortBy('date');

        const oldestDate = txList.length > 0 && txList[0] ? txList[0].date : c.createdAt;

        result.push({
          customerId: c.id,
          customerName: c.name,
          totalHutang: c.balanceHutang,
          oldestDate,
          phone: c.phone,
        });
      }
    }

    result.sort((a, b) => a.oldestDate - b.oldestDate);
    return result;
  }

  /**
   * Pelunasan Penuh (MVP Simpel):
   * Pelanggan membayar seluruh sisa hutangnya sekaligus.
   * Cicilan / pelunasan sebagian DILARANG di MVP (v1.1).
   */
  public async markPaidFull(
    customerId: string,
    paidToAccountId: string,
    date: number,
    actorUserId: string = 'system'
  ): Promise<void> {
    const customer = await db.customers.get(customerId);
    if (!customer) {
      throw new AppError('Data pelanggan tidak ditemukan.');
    }

    const account = await db.accounts.get(paidToAccountId);
    if (!account) {
      throw new AppError('Akun penerima pembayaran tidak ditemukan.');
    }

    const totalToPay = customer.balanceHutang;
    if (totalToPay <= 0) {
      throw new AppError('Pelanggan ini tidak memiliki piutang tertunda.');
    }

    await db.transaction('rw', [db.customers, db.transactions, db.accountLedger, db.auditLogs], async () => {
      // 1. Update status semua transaksi hutang pelanggan ini menjadi lunas
      const debtTransactions = await db.transactions
        .where('customerId')
        .equals(customerId)
        .filter((t) => t.paymentStatus === 'hutang' && t.status !== 'void')
        .toArray();

      for (const tx of debtTransactions) {
        await db.transactions.update(tx.id, {
          paymentStatus: 'lunas',
          updatedAt: date,
        });
      }

      // 2. Set balanceHutang pelanggan menjadi 0
      await db.customers.update(customerId, {
        balanceHutang: 0,
      });

      // 3. Catat mutasi uang masuk ke akun penerima (Kas / Bank)
      await db.accountLedger.add({
        id: uuidv4(),
        accountId: paidToAccountId,
        kind: 'pokok',
        delta: totalToPay,
        note: `Pelunasan penuh piutang pelanggan ${customer.name}`,
        createdAt: date,
      });

      // 4. Jejak audit
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId,
        action: 'pelunasan_piutang_penuh',
        entityType: 'customer',
        entityId: customerId,
        detail: JSON.stringify({
          customerName: customer.name,
          jumlahLunas: totalToPay,
          paidToAccount: account.name,
          transactionCount: debtTransactions.length,
        }),
        createdAt: date,
      });
    });
  }
}

export const receivableService = new ReceivableService();
