import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import { AppError } from '../core/errors';

export interface BalanceDelta {
  accountId: string;
  delta: number; // int Rupiah, boleh negatif
  kind: 'pokok' | 'fee' | 'laba';
}

export class BalanceService {
  /**
   * Hitung delta saldo catatan untuk satu transaksi. MURNI (tanpa tulis DB).
   *
   * KEPUTUSAN TERKUNCI (user, 8 Nov 2026): Debit Rekening = potong dari nominal.
   * Untuk transfer / tarik tunai / topup_ewallet / ppob: nominal = N, fee = F:
   * - cash: hBeli = N, hJual = N + F.
   * - debit_rekening: hBeli = N - F, hJual = N.
   * Contoh terkunci: transfer Rp500.000, admin Rp5.000, Debit Rekening
   * -> hBeli Rp495.000, hJual Rp500.000, profit Rp5.000, bank sumber -Rp495.000, Kas +Rp500.000.
   */
  public computeDeltas(params: {
    layanan: string;
    sourceAccountId?: string;
    destAccountId?: string;
    paymentAccountId: string; // akun Kas atau akun pembayaran pelanggan
    nominal: number;
    modal: number;
    hargaJual: number;
    fee: number;
    feePaidBy: 'cash' | 'debit_rekening';
  }): BalanceDelta[] {
    const {
      layanan,
      sourceAccountId,
      destAccountId,
      paymentAccountId,
      nominal,
      modal,
      hargaJual,
      fee,
      feePaidBy,
    } = params;

    const deltas: BalanceDelta[] = [];

    // Hitung hBeli dan hJual untuk layanan jasa
    const hBeli = feePaidBy === 'debit_rekening' ? nominal - fee : nominal;
    const hJual = feePaidBy === 'debit_rekening' ? nominal : nominal + fee;

    switch (layanan) {
      case 'transfer':
      case 'topup_ewallet':
      case 'ppob': {
        if (!sourceAccountId) {
          throw new AppError(`Transaksi ${layanan} membutuhkan akun sumber dana.`);
        }
        // Sumber dana berkurang hBeli
        deltas.push({
          accountId: sourceAccountId,
          delta: -hBeli,
          kind: 'pokok',
        });
        // Akun pembayaran pelanggan bertambah hJual
        deltas.push({
          accountId: paymentAccountId,
          delta: hJual,
          kind: 'pokok',
        });
        break;
      }

      case 'tarik_tunai': {
        if (!sourceAccountId) {
          throw new AppError('Transaksi tarik tunai membutuhkan akun penerima transfer pelanggan.');
        }
        // Rekening konter menerima transfer dari pelanggan (+N)
        deltas.push({
          accountId: sourceAccountId,
          delta: nominal,
          kind: 'pokok',
        });
        // Kasir menyerahkan uang tunai ke pelanggan: -(N - F)
        // (Bila debit_rekening: pelanggan menerima N - F; bila cash: pelanggan menerima N dan membayar F tunai)
        deltas.push({
          accountId: paymentAccountId,
          delta: -(nominal - fee),
          kind: 'pokok',
        });
        break;
      }

      case 'pulsa':
      case 'data':
      case 'token_pln': {
        if (!sourceAccountId) {
          throw new AppError(`Transaksi ${layanan} membutuhkan akun server pulsa catatan.`);
        }
        // Akun Server Pulsa catatan berkurang modal (hanya catatan lokal)
        deltas.push({
          accountId: sourceAccountId,
          delta: -modal,
          kind: 'pokok',
        });
        // Akun pembayaran bertambah harga jual
        deltas.push({
          accountId: paymentAccountId,
          delta: hargaJual,
          kind: 'pokok',
        });
        break;
      }

      case 'voucher':
      case 'perdana':
      case 'aksesoris': {
        // Barang fisik: hanya akun pembayaran bertambah harga jual
        // Modal sudah keluar saat pembelian stok (pembelian_stok)
        deltas.push({
          accountId: paymentAccountId,
          delta: hargaJual,
          kind: 'pokok',
        });
        break;
      }

      case 'deposit_server':
      case 'deposit_provider': {
        if (!sourceAccountId || !destAccountId) {
          throw new AppError('Deposit catatan membutuhkan akun asal dan akun tujuan.');
        }
        // Sumber dana berkurang N
        deltas.push({
          accountId: sourceAccountId,
          delta: -nominal,
          kind: 'pokok',
        });
        // Saldo catatan server / provider bertambah N (BUKAN laba)
        deltas.push({
          accountId: destAccountId,
          delta: nominal,
          kind: 'pokok',
        });
        break;
      }

      case 'pindah_dana': {
        if (!sourceAccountId || !destAccountId) {
          throw new AppError('Pindah dana membutuhkan akun asal dan akun tujuan.');
        }
        deltas.push({
          accountId: sourceAccountId,
          delta: -nominal,
          kind: 'pokok',
        });
        deltas.push({
          accountId: destAccountId,
          delta: nominal,
          kind: 'pokok',
        });
        break;
      }

      case 'pembelian_stok': {
        if (!sourceAccountId) {
          throw new AppError('Pembelian stok membutuhkan akun sumber dana.');
        }
        deltas.push({
          accountId: sourceAccountId,
          delta: -nominal,
          kind: 'pokok',
        });
        break;
      }

      case 'operasional': {
        if (!sourceAccountId) {
          throw new AppError('Pengeluaran operasional membutuhkan akun sumber dana.');
        }
        deltas.push({
          accountId: sourceAccountId,
          delta: -nominal,
          kind: 'pokok',
        });
        break;
      }

      case 'pemasukan_lain': {
        deltas.push({
          accountId: paymentAccountId,
          delta: nominal,
          kind: 'pokok',
        });
        break;
      }

      default:
        throw new AppError(`Jenis layanan '${layanan}' tidak dikenal.`);
    }

    return deltas;
  }

  /**
   * Terapkan delta saldo ke tabel account_ledger
   * Multiplier 1 = simpan normal, -1 = void (membalik saldo persis)
   */
  public async applyDeltas(params: {
    transactionId: string;
    deltas: BalanceDelta[];
    multiplier?: number;
  }): Promise<void> {
    const mult = params.multiplier ?? 1;
    const now = Date.now();

    const records = params.deltas.map((d) => ({
      id: uuidv4(),
      accountId: d.accountId,
      transactionId: params.transactionId,
      kind: d.kind,
      delta: d.delta * mult,
      createdAt: now,
    }));

    await db.accountLedger.bulkAdd(records);
  }
}

export const balanceService = new BalanceService();
