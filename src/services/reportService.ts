import { db } from '../db/database';
import type { Product, Account } from '../db/types';

export interface CategoryTotal {
  label: string;
  total: number;
}

export interface PeriodTotal {
  period: number; // epoch ms awal hari
  totalIn: number;
  totalOut: number;
  laba: number;
}

export class ReportService {
  /**
   * Total masuk: hasil penjualan barang/digital + fee admin jasa.
   * Transfer/pindah dana/deposit TIDAK dihitung sebagai pemasukan.
   */
  public async totalIn(from: number, to: number, opts?: { shiftId?: string }): Promise<number> {
    const txs = await this.getFilteredTransactions(from, to, opts?.shiftId);
    let total = 0;

    for (const t of txs) {
      if (['pindah_dana', 'deposit_server', 'deposit_provider', 'pembelian_stok', 'operasional'].includes(t.layanan)) {
        continue;
      }
      if (t.layanan === 'pemasukan_lain') {
        total += t.nominal;
        continue;
      }
      // Layanan jasa: hanya fee yang merupakan pendapatan konter (nominal pokok adalah uang pelanggan yang diteruskan)
      if (['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(t.layanan)) {
        total += t.fee;
      } else {
        // Penjualan barang / pulsa: harga jual masuk
        total += t.nominal;
      }
    }
    return total;
  }

  /**
   * Total keluar: modal barang/pulsa yang terjual + biaya operasional konter.
   */
  public async totalOut(from: number, to: number, opts?: { shiftId?: string }): Promise<number> {
    const txs = await this.getFilteredTransactions(from, to, opts?.shiftId);
    let total = 0;

    for (const t of txs) {
      if (t.layanan === 'operasional') {
        total += t.nominal;
        continue;
      }
      if (['pindah_dana', 'deposit_server', 'deposit_provider', 'pemasukan_lain'].includes(t.layanan)) {
        continue;
      }
      // Ambil modal item jika ada
      const items = await db.transactionItems.where('transactionId').equals(t.id).toArray();
      for (const item of items) {
        total += item.modalSnapshot * item.qty;
      }
    }
    return total;
  }

  /**
   * Laba: sum(jual - modal) + sum(fee) - operasional
   */
  public async totalLaba(from: number, to: number, opts?: { shiftId?: string }): Promise<number> {
    const txs = await this.getFilteredTransactions(from, to, opts?.shiftId);
    let laba = 0;

    for (const t of txs) {
      if (t.layanan === 'operasional') {
        laba -= t.nominal;
        continue;
      }
      if (['pindah_dana', 'deposit_server', 'deposit_provider'].includes(t.layanan)) {
        continue;
      }
      if (t.layanan === 'pemasukan_lain') {
        laba += t.nominal;
        continue;
      }

      // Fee jasa
      laba += t.fee;

      // Selisih jual - modal dari barang / pulsa
      const items = await db.transactionItems.where('transactionId').equals(t.id).toArray();
      for (const item of items) {
        laba += (item.hargaJualSnapshot - item.modalSnapshot) * item.qty;
      }
    }

    return laba;
  }

  public async byLayanan(from: number, to: number): Promise<CategoryTotal[]> {
    const txs = await this.getFilteredTransactions(from, to);
    const map: Record<string, number> = {};

    for (const t of txs) {
      map[t.layanan] = (map[t.layanan] || 0) + 1;
    }

    return Object.entries(map).map(([label, total]) => ({ label, total }));
  }

  public async byProduct(from: number, to: number): Promise<CategoryTotal[]> {
    const txs = await this.getFilteredTransactions(from, to);
    const map: Record<string, number> = {};

    for (const t of txs) {
      const items = await db.transactionItems.where('transactionId').equals(t.id).toArray();
      for (const item of items) {
        map[item.productNameSnapshot] = (map[item.productNameSnapshot] || 0) + item.qty;
      }
    }

    return Object.entries(map)
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total);
  }

  public async trend(from: number, to: number): Promise<PeriodTotal[]> {
    const txs = await this.getFilteredTransactions(from, to);
    const dayMap: Record<number, PeriodTotal> = {};

    for (const t of txs) {
      const d = new Date(t.date);
      d.setHours(0, 0, 0, 0);
      const dayStart = d.getTime();

      if (!dayMap[dayStart]) {
        dayMap[dayStart] = { period: dayStart, totalIn: 0, totalOut: 0, laba: 0 };
      }

      const p = dayMap[dayStart]!;
      if (t.layanan === 'operasional') {
        p.totalOut += t.nominal;
        p.laba -= t.nominal;
      } else if (['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(t.layanan)) {
        p.totalIn += t.fee;
        p.laba += t.fee;
      } else if (t.layanan === 'pemasukan_lain') {
        p.totalIn += t.nominal;
        p.laba += t.nominal;
      } else if (!['pindah_dana', 'deposit_server', 'deposit_provider'].includes(t.layanan)) {
        p.totalIn += t.nominal;
        const items = await db.transactionItems.where('transactionId').equals(t.id).toArray();
        let modal = 0;
        for (const item of items) {
          modal += item.modalSnapshot * item.qty;
        }
        p.totalOut += modal;
        p.laba += t.nominal - modal;
      }
    }

    return Object.values(dayMap).sort((a, b) => a.period - b.period);
  }

  public async byKasir(from: number, to: number): Promise<CategoryTotal[]> {
    const txs = await this.getFilteredTransactions(from, to);
    const map: Record<string, number> = {};

    for (const t of txs) {
      const user = await db.users.get(t.userId);
      const name = user?.name || t.userId;
      map[name] = (map[name] || 0) + 1;
    }

    return Object.entries(map).map(([label, total]) => ({ label, total }));
  }

  public async lowStockProducts(): Promise<Product[]> {
    const list = await db.products.filter((p) => p.isActive && p.stock !== null).toArray();
    return list.filter((p) => (p.stock ?? 0) <= p.stockMin);
  }

  public async lowBalanceAccounts(): Promise<Account[]> {
    // Di MVP: akun kas dengan saldo < 50.000 atau server pulsa < 100.000
    const accounts = await db.accounts.filter((a) => a.isActive).toArray();
    const result: Account[] = [];

    for (const acc of accounts) {
      const ledgers = await db.accountLedger.where('accountId').equals(acc.id).toArray();
      const current = acc.initialBalance + ledgers.reduce((sum, l) => sum + l.delta, 0);
      if (current <= 100000) {
        result.push(acc);
      }
    }

    return result;
  }

  private async getFilteredTransactions(from: number, to: number, shiftId?: string) {
    let list = await db.transactions
      .filter((t) => t.date >= from && t.date <= to && t.status !== 'void')
      .toArray();

    if (shiftId) {
      list = list.filter((t) => t.shiftId === shiftId);
    }
    return list;
  }
}

export const reportService = new ReportService();
