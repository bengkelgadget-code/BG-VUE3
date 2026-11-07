import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AppError } from '../core/errors';

export interface ReceivableSummary {
  customerId: string;
  customerName: string;
  totalHutang: number;
  oldestDate: number;
  debtAgeDays: number;
  phone?: string;
}

export class ReceivableService {
  /**
   * Daftar piutang per pelanggan (hanya pelanggan dengan balanceHutang > 0)
   */
  public async listReceivables(): Promise<ReceivableSummary[]> {
    const customers = await db.customers.toArray();
    const result: ReceivableSummary[] = [];
    const now = Date.now();

    for (const c of customers) {
      if (c.balanceHutang > 0) {
        // Cari tanggal transaksi hutang tertua
        const txList = await db.transactions
          .where('customerId')
          .equals(c.id)
          .filter((t) => t.paymentStatus === 'hutang' && t.status !== 'void')
          .sortBy('date');

        const oldestDate = txList.length > 0 && txList[0] ? txList[0].date : c.createdAt;
        const diffMs = Math.max(0, now - oldestDate);
        const debtAgeDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        result.push({
          customerId: c.id,
          customerName: c.name,
          totalHutang: c.balanceHutang,
          oldestDate,
          debtAgeDays,
          phone: c.phone,
        });
      }
    }

    result.sort((a, b) => a.oldestDate - b.oldestDate);
    return result;
  }

  /**
   * Pelunasan Sebagian / Cicilan (Fase 2 - v1.1):
   * Pelanggan membayar sebagian nominal hutang.
   */
  public async payPartial(
    customerId: string,
    paidAmount: number,
    paidToAccountId: string,
    date: number,
    actorUserId: string = 'system'
  ): Promise<{ remainingDebt: number }> {
    const customer = await db.customers.get(customerId);
    if (!customer) {
      throw new AppError('Data pelanggan tidak ditemukan.');
    }
    const account = await db.accounts.get(paidToAccountId);
    if (!account) {
      throw new AppError('Akun penerima pembayaran tidak ditemukan.');
    }
    if (paidAmount <= 0 || !Number.isInteger(paidAmount)) {
      throw new AppError('Nominal pembayaran cicilan harus bilangan bulat > 0.');
    }
    if (paidAmount > customer.balanceHutang) {
      throw new AppError(`Nominal pembayaran melebihi total hutang (${customer.balanceHutang}).`);
    }

    const remainingDebt = customer.balanceHutang - paidAmount;

    await db.transaction('rw', [db.customers, db.accountLedger, db.auditLogs], async () => {
      await db.customers.update(customerId, {
        balanceHutang: remainingDebt,
      });

      await db.accountLedger.add({
        id: uuidv4(),
        accountId: paidToAccountId,
        kind: 'pokok',
        delta: paidAmount,
        note: `Cicilan piutang pelanggan ${customer.name} (sisa: Rp ${remainingDebt.toLocaleString('id-ID')})`,
        createdAt: date,
      });

      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId,
        action: 'cicilan_piutang',
        entityType: 'customer',
        entityId: customerId,
        detail: JSON.stringify({
          customerName: customer.name,
          bayar: paidAmount,
          sisa: remainingDebt,
          paidToAccount: account.name,
        }),
        createdAt: date,
      });
    });

    return { remainingDebt };
  }

  /**
   * Buat tautan pengingat WhatsApp
   */
  public generateWhatsAppReminder(summary: ReceivableSummary, counterName: string = 'Buku Konter'): string {
    const phone = (summary.phone || '').replace(/[^\d]/g, '');
    let formattedPhone = phone;
    if (phone.startsWith('08')) {
      formattedPhone = '628' + phone.substring(2);
    }
    const text = encodeURIComponent(
      `Halo Kak ${summary.customerName}, salam dari ${counterName}.\n` +
      `Mengingatkan catatan piutang sebesar Rp ${summary.totalHutang.toLocaleString('id-ID')} (sudah ${summary.debtAgeDays} hari).\n` +
      `Bisa dilunasi langsung di konter atau via transfer. Terima kasih banyak ya Kak!`
    );
    return `https://wa.me/${formattedPhone}?text=${text}`;
  }

  /**
   * Pelunasan Penuh:
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
