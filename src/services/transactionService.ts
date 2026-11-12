import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Transaction, TransactionItem } from '../db/types';
import { AppError } from '../core/errors';
import { productService } from './productService';
import { balanceService } from './balanceService';
import { stockService } from './stockService';
import { authService } from './authService';
import { getWitaDateString } from '../utils/datePeriod';

export interface CartItemInput {
  productId: string;
  qty?: number;
  nominal?: number;
}

export interface TransactionInput {
  layanan: string;
  productId?: string;
  accountId?: string; // pembayaran / penerimaan
  sourceAccountId?: string;
  destAccountId?: string;
  nominal: number; // int Rupiah, > 0
  fee: number; // int Rupiah, >= 0
  feePaidBy: 'cash' | 'debit_rekening';
  feeRuleId?: string;
  feeManualOverride: boolean;
  paymentMethod: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  paymentStatus?: 'lunas' | 'hutang';
  date: number; // epoch ms (WITA)
  dateChangeReason?: string; // Alasan bila tanggal dikoreksi Owner/Admin
  note?: string;
  referenceNo?: string;
  photoPath?: string;
  customerId?: string; // WAJIB bila paymentStatus == 'hutang'
  cartItems?: CartItemInput[]; // keranjang multi-item
}

export interface EditTransactionInput {
  nominal?: number;
  fee?: number;
  note?: string;
  customerName?: string;
  layanan?: string;
  date?: number;
  userId?: string;
  status?: string;
}

export interface EditTransactionOptions {
  actorUserId: string;
  ownerPin?: string;
}

export class TransactionService {
  /**
   * Simpan transaksi secara atomik di database:
   * 1. Simpan baris transaksi
   * 2. Simpan snapshot modal & harga jual di transaction_items (kasir tidak menginput modal)
   * 3. Terapkan delta saldo catatan via balanceService
   * 4. Kurangi stok fisik jika kategori voucher/perdana/aksesoris
   * 5. Update saldo hutang pelanggan jika status bayar == 'hutang'
   */
  public async addTransaction(
    input: TransactionInput,
    opts: { actorUserId: string; shiftId: string }
  ): Promise<string> {
    if (!input.nominal || input.nominal <= 0 || !Number.isInteger(input.nominal)) {
      throw new AppError('Nominal transaksi harus bilangan bulat lebih besar dari Rp0.');
    }

    if (input.fee < 0 || !Number.isInteger(input.fee)) {
      throw new AppError('Biaya admin harus bilangan bulat >= Rp0.');
    }

    const paymentStatus = input.paymentStatus || 'lunas';
    if (paymentStatus === 'hutang') {
      if (!input.customerId) {
        throw new AppError('Transaksi dengan status Hutang wajib memilih atau mengisi nama pelanggan.');
      }
    }

    // 9 Nov 2026: Turunkan paymentAccountId otomatis dari cara bayar admin (feePaidBy)
    let paymentAccountId: string;
    const hasFeePaidBy = ['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(input.layanan);

    if (input.layanan !== 'tarik_tunai' && hasFeePaidBy && input.feePaidBy === 'debit_rekening') {
      if (!input.sourceAccountId) {
        throw new AppError(`Transaksi ${input.layanan} dengan Debit Rekening membutuhkan akun sumber dana.`);
      }
      paymentAccountId = input.sourceAccountId;
    } else {
      // Cash, tarik_tunai, atau layanan tanpa Bayar Admin (voucher, perdana, aksesoris, pulsa, data, token_pln, operasional, pindah_dana, deposit)
      const kasAccount = await db.accounts.where('type').equals('kas').first();
      if (!kasAccount) {
        throw new AppError('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');
      }
      paymentAccountId = kasAccount.id;
    }

    const transactionId = uuidv4();
    const now = Date.now();
    const date = input.date ?? now;

    // 1. Validasi: tanggal tidak boleh di masa depan
    if (date > now) {
      throw new AppError('Tanggal transaksi tidak boleh di masa depan.');
    }

    // 2. Validasi izin ubah tanggal: kasir tidak boleh ubah tanggal; owner/admin wajib isi alasan
    const actor = await db.users.get(opts.actorUserId);
    const isOwnerOrAdmin = actor ? (actor.role === 'owner' || actor.role === 'admin') : false;

    const todayWita = getWitaDateString(now);
    const txWita = getWitaDateString(date);
    const isDateDifferent = txWita !== todayWita;

    if (isDateDifferent || input.dateChangeReason) {
      if (!isOwnerOrAdmin) {
        throw new AppError('Kasir tidak diizinkan mengubah tanggal transaksi.');
      }
      if (!input.dateChangeReason || input.dateChangeReason.trim().length < 3) {
        throw new AppError('Alasan perubahan tanggal transaksi wajib diisi minimal 3 karakter.');
      }
    }

    // Ambil modal & jual snapshot jika transaksi memiliki produk
    let modal = 0;
    let hargaJual = input.nominal;
    let productNameSnapshot = input.layanan;

    const itemsToSave: TransactionItem[] = [];

    if (input.productId) {
      const product = await db.products.get(input.productId);
      if (!product) {
        throw new AppError('Produk master tidak ditemukan.');
      }
      const pricing = await productService.getModalAndPrice(input.productId);
      modal = pricing.modal;
      hargaJual = pricing.hargaJual;
      productNameSnapshot = product.name;

      itemsToSave.push({
        id: uuidv4(),
        transactionId,
        productId: input.productId,
        productNameSnapshot,
        qty: 1,
        modalSnapshot: modal,
        hargaJualSnapshot: hargaJual,
        subtotal: hargaJual,
      });
    } else if (input.cartItems && input.cartItems.length > 0) {
      // Keranjang multi-item
      let totalModal = 0;
      let totalJual = 0;

      for (const item of input.cartItems) {
        const product = await db.products.get(item.productId);
        if (!product) continue;
        const pricing = await productService.getModalAndPrice(item.productId);
        const qty = item.qty || 1;
        totalModal += pricing.modal * qty;
        totalJual += pricing.hargaJual * qty;

        itemsToSave.push({
          id: uuidv4(),
          transactionId,
          productId: item.productId,
          productNameSnapshot: product.name,
          qty,
          modalSnapshot: pricing.modal,
          hargaJualSnapshot: pricing.hargaJual,
          subtotal: pricing.hargaJual * qty,
        });
      }

      modal = totalModal;
      hargaJual = totalJual;
    }

    // Hitung delta saldo
    const deltas = balanceService.computeDeltas({
      layanan: input.layanan,
      sourceAccountId: input.sourceAccountId,
      destAccountId: input.destAccountId,
      paymentAccountId,
      nominal: input.nominal,
      modal,
      hargaJual,
      fee: input.fee,
      feePaidBy: input.feePaidBy,
    });

    const txRecord: Transaction = {
      id: transactionId,
      layanan: input.layanan,
      shiftId: opts.shiftId,
      userId: opts.actorUserId,
      accountId: paymentAccountId,
      sourceAccountId: input.sourceAccountId,
      destAccountId: input.destAccountId,
      nominal: input.nominal,
      fee: input.fee,
      feePaidBy: input.feePaidBy,
      feeRuleId: input.feeRuleId,
      feeManualOverride: input.feeManualOverride,
      paymentMethod: input.paymentMethod,
      paymentStatus,
      date,
      dateChangeReason: input.dateChangeReason?.trim(),
      note: input.note?.trim(),
      referenceNo: input.referenceNo?.trim(),
      photoPath: input.photoPath,
      customerId: input.customerId,
      status: 'ok',
      createdAt: now,
      updatedAt: now,
    };

    // Jalankan seluruh penyimpanan dalam Dexie transaction (atomik)
    await db.transaction(
      'rw',
      [
        db.transactions,
        db.transactionItems,
        db.accountLedger,
        db.products,
        db.stockMovements,
        db.customers,
        db.auditLogs,
      ],
      async () => {
        // 1. Simpan kepala transaksi
        await db.transactions.add(txRecord);

        // 2. Simpan item-item transaksi
        if (itemsToSave.length > 0) {
          await db.transactionItems.bulkAdd(itemsToSave);
        }

        // 3. Terapkan saldo mutasi (hanya jika transaksi statusnya bukan hutang tanpa penerimaan kas)
        // Jika hutang, uang belum masuk ke kasir; delta akun pembayaran ditahan atau masuk piutang
        // Tetapi untuk MVP: pergerakan sumber dana tetap terjadi (mis. pulsa terpotong dari server, atau uang transfer tetap keluar dari bank)
        // yang belum diterima kasir adalah sisi kasnya
        if (paymentStatus === 'hutang') {
          // Hanya delta sumber yang keluar
          const sourceDeltas = deltas.filter((d) => d.accountId === input.sourceAccountId);
          if (sourceDeltas.length > 0) {
            await balanceService.applyDeltas({ transactionId, deltas: sourceDeltas, multiplier: 1 });
          }

          // Tambah hutang ke akun customer
          const customer = await db.customers.get(input.customerId!);
          if (customer) {
            await db.customers.update(input.customerId!, {
              balanceHutang: customer.balanceHutang + input.nominal + (input.feePaidBy === 'cash' ? input.fee : 0),
            });
          }
        } else {
          // Status lunas: terapkan semua delta mutasi
          await balanceService.applyDeltas({ transactionId, deltas, multiplier: 1 });
        }

        // 4. Kurangi stok barang jika ada produk fisik
        for (const item of itemsToSave) {
          await stockService.adjustStock({
            productId: item.productId,
            qtyChange: -item.qty,
            reason: 'jual',
            transactionId,
            shiftId: opts.shiftId,
            actorUserId: opts.actorUserId,
          });
        }

        // 5. Audit log
        await db.auditLogs.add({
          id: uuidv4(),
          actorUserId: opts.actorUserId,
          action: 'tambah_transaksi',
          entityType: 'transaction',
          entityId: transactionId,
          detail: JSON.stringify({
            layanan: input.layanan,
            nominal: input.nominal,
            fee: input.fee,
            paymentStatus,
            dateChangeReason: input.dateChangeReason?.trim(),
          }),
          createdAt: now,
        });
      }
    );

    return transactionId;
  }

  /**
   * Batalkan transaksi (VOID) — BUKAN HAPUS.
   * Mengembalikan mutasi saldo (multiplier -1) dan mengembalikan stok fisik (+qty).
   * Matriks hak:
   * - Owner / Admin / Kepala Kasir: Ya, langsung (verifikasi PIN sendiri).
   * - Kasir: Hanya bila diapprove oleh Owner (verifikasi PIN Owner).
   */
  public async voidTransaction(
    transactionId: string,
    opts: {
      reason: string;
      actorUserId: string;
      pin?: string;
      adminPin?: string;
      ownerPin?: string;
    }
  ): Promise<void> {
    const actor = await db.users.get(opts.actorUserId);
    if (!actor) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    const trimmedReason = opts.reason?.trim();
    if (!trimmedReason || trimmedReason.length < 3) {
      throw new AppError('Alasan pembatalan (void) transaksi wajib diisi minimal 3 karakter.');
    }

    let approvedBy: string | undefined = undefined;

    if (actor.role === 'kasir') {
      const pinToVerify = (opts.ownerPin || opts.adminPin || opts.pin || '').trim();
      if (!pinToVerify) {
        throw new AppError('Persetujuan Owner (PIN Owner) wajib diisi untuk pembatalan oleh Kasir.');
      }
      const owner = await db.users.where('role').equals('owner').first();
      if (!owner) {
        throw new AppError('Akun Owner tidak ditemukan di sistem.');
      }
      const isOwnerPinValid = await authService.verifyPin(owner.id, pinToVerify);
      if (!isOwnerPinValid) {
        throw new AppError('PIN persetujuan Owner salah. Pembatalan transaksi ditolak.');
      }
      approvedBy = owner.id;
    } else if (actor.role === 'owner' || actor.role === 'admin' || actor.role === 'kepala_kasir') {
      const pinToVerify = (opts.pin || opts.adminPin || '').trim();
      if (!pinToVerify) {
        throw new AppError('PIN konfirmasi wajib diisi.');
      }
      const isPinValid = await authService.verifyPin(opts.actorUserId, pinToVerify);
      if (!isPinValid) {
        throw new AppError('PIN konfirmasi salah. Pembatalan transaksi ditolak.');
      }
    } else {
      throw new AppError('Role tidak memiliki hak untuk membatalkan (void) transaksi.');
    }

    const tx = await db.transactions.get(transactionId);
    if (!tx) {
      throw new AppError('Transaksi tidak ditemukan.');
    }

    if (tx.status === 'void') {
      throw new AppError('Transaksi ini sudah dibatalkan sebelumnya.');
    }

    const now = Date.now();
    const items = await db.transactionItems.where('transactionId').equals(transactionId).toArray();

    await db.transaction(
      'rw',
      [
        db.transactions,
        db.accountLedger,
        db.products,
        db.stockMovements,
        db.customers,
        db.auditLogs,
      ],
      async () => {
        // 1. Ubah status transaksi menjadi void (TIDAK PERNAH DIHAPUS)
        await db.transactions.update(transactionId, {
          status: 'void',
          voidReason: trimmedReason,
          voidBy: opts.actorUserId,
          voidAt: now,
          updatedAt: now,
        });

        // 2. Balik saldo ledger terkait
        const existingLedgers = await db.accountLedger.where('transactionId').equals(transactionId).toArray();
        if (existingLedgers.length > 0) {
          const reverseRecords = existingLedgers.map((l) => ({
            id: uuidv4(),
            accountId: l.accountId,
            transactionId,
            kind: l.kind,
            delta: -l.delta, // Balik arah delta
            note: `Void: ${trimmedReason}`,
            createdAt: now,
          }));
          await db.accountLedger.bulkAdd(reverseRecords);
        }

        // 3. Kembalikan stok fisik jika ada
        for (const item of items) {
          await stockService.adjustStock({
            productId: item.productId,
            qtyChange: item.qty, // +qty untuk mengembalikan
            reason: 'void',
            transactionId,
            actorUserId: opts.actorUserId,
          });
        }

        // 4. Koreksi hutang pelanggan jika transaksi asal berstatus hutang
        if (tx.paymentStatus === 'hutang' && tx.customerId) {
          const customer = await db.customers.get(tx.customerId);
          if (customer) {
            const debtAmount = tx.nominal + (tx.feePaidBy === 'cash' ? tx.fee : 0);
            await db.customers.update(tx.customerId, {
              balanceHutang: Math.max(0, customer.balanceHutang - debtAmount),
            });
          }
        }

        // 5. Jejak audit
        await db.auditLogs.add({
          id: uuidv4(),
          actorUserId: opts.actorUserId,
          action: 'void_transaksi',
          entityType: 'transaction',
          entityId: transactionId,
          detail: JSON.stringify({
            layanan: tx.layanan,
            nominal: tx.nominal,
            alasan: trimmedReason,
            ...(approvedBy ? { approvedBy } : {}),
          }),
          createdAt: now,
        });
      }
    );
  }

  /**
   * Koreksi / Edit data transaksi yang sudah diinput.
   * Field yang boleh diubah: nominal, fee, note, customerName.
   * Field terlarang: layanan, date, userId, status.
   * Transaksi void tidak boleh diedit.
   */
  public async editTransaction(
    transactionId: string,
    input: EditTransactionInput,
    opts: EditTransactionOptions
  ): Promise<void> {
    const actor = await db.users.get(opts.actorUserId);
    if (!actor) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    let approvedBy: string | undefined = undefined;

    if (actor.role === 'kasir') {
      const pinToVerify = (opts.ownerPin || '').trim();
      if (!pinToVerify) {
        throw new AppError('Persetujuan Owner (PIN Owner) wajib diisi untuk koreksi oleh Kasir.');
      }
      const owner = await db.users.where('role').equals('owner').first();
      if (!owner) {
        throw new AppError('Akun Owner tidak ditemukan di sistem.');
      }
      const isOwnerPinValid = await authService.verifyPin(owner.id, pinToVerify);
      if (!isOwnerPinValid) {
        throw new AppError('PIN persetujuan Owner salah. Koreksi transaksi ditolak.');
      }
      approvedBy = owner.id;
    } else if (actor.role !== 'owner' && actor.role !== 'admin' && actor.role !== 'kepala_kasir') {
      throw new AppError('Role tidak memiliki hak untuk mengedit transaksi.');
    }

    const tx = await db.transactions.get(transactionId);
    if (!tx) {
      throw new AppError('Transaksi tidak ditemukan.');
    }

    if (tx.status === 'void') {
      throw new AppError('Transaksi yang sudah dibatalkan (void) tidak dapat diedit.');
    }

    // Deteksi upaya modifikasi field terlarang
    if (input.layanan !== undefined && input.layanan !== tx.layanan) {
      throw new AppError('Jenis layanan transaksi tidak dapat diubah.');
    }
    if (input.date !== undefined && input.date !== tx.date) {
      throw new AppError('Tanggal transaksi tidak dapat diubah.');
    }
    if (input.userId !== undefined && input.userId !== tx.userId) {
      throw new AppError('Petugas pembuat transaksi tidak dapat diubah.');
    }
    if (input.status !== undefined && input.status !== tx.status) {
      throw new AppError('Status transaksi tidak dapat diubah melalui menu edit.');
    }

    const newNominal = input.nominal !== undefined ? input.nominal : tx.nominal;
    if (newNominal <= 0 || !Number.isFinite(newNominal)) {
      throw new AppError('Nominal transaksi harus berupa angka lebih dari 0.');
    }

    const newFee = input.fee !== undefined ? input.fee : tx.fee;
    if (newFee < 0 || !Number.isFinite(newFee)) {
      throw new AppError('Biaya admin tidak boleh negatif.');
    }

    const newNote = input.note !== undefined ? input.note.trim() : (tx.note || '');

    const now = Date.now();
    const isAmountChanged = newNominal !== tx.nominal || newFee !== tx.fee;

    await db.transaction(
      'rw',
      [
        db.transactions,
        db.transactionItems,
        db.accountLedger,
        db.customers,
        db.auditLogs,
      ],
      async () => {
        // 1. Update customer name bila ada perubahan
        let oldCustomerName: string | undefined = undefined;
        let updatedCustomerName: string | undefined = undefined;
        if (input.customerName !== undefined && tx.customerId) {
          const cust = await db.customers.get(tx.customerId);
          if (cust) {
            oldCustomerName = cust.name;
            const trimmedCustName = input.customerName.trim();
            if (trimmedCustName && trimmedCustName !== cust.name) {
              await db.customers.update(tx.customerId, { name: trimmedCustName });
              updatedCustomerName = trimmedCustName;
            }
          }
        }

        // 2. Balik saldo lama dan terapkan saldo baru bila nominal / fee berubah
        if (isAmountChanged) {
          // A. Balik ledger lama
          const existingLedgers = await db.accountLedger.where('transactionId').equals(transactionId).toArray();
          if (existingLedgers.length > 0) {
            const reverseRecords = existingLedgers.map((l) => ({
              id: uuidv4(),
              accountId: l.accountId,
              transactionId,
              kind: l.kind,
              delta: -l.delta,
              note: `Koreksi: balik transaksi lama`,
              createdAt: now,
            }));
            await db.accountLedger.bulkAdd(reverseRecords);
          }

          // B. Hitung modal dan hargaJual
          const items = await db.transactionItems.where('transactionId').equals(transactionId).toArray();
          let modal = 0;
          let hargaJual = newNominal;
          if (items.length > 0) {
            modal = items.reduce((sum, it) => sum + (it.modalSnapshot * it.qty), 0);
            hargaJual = items.reduce((sum, it) => sum + (it.hargaJualSnapshot * it.qty), 0);
          }

          // C. Hitung deltas baru
          let paymentAccountId = tx.accountId;
          if (!paymentAccountId) {
            const kasAccount = await db.accounts.where('type').equals('kas').first();
            paymentAccountId = kasAccount?.id || '';
          }

          const newDeltas = balanceService.computeDeltas({
            layanan: tx.layanan,
            sourceAccountId: tx.sourceAccountId,
            destAccountId: tx.destAccountId,
            paymentAccountId,
            nominal: newNominal,
            modal,
            hargaJual,
            fee: newFee,
            feePaidBy: tx.feePaidBy,
          });

          // D. Terapkan deltas baru
          if (tx.paymentStatus === 'hutang') {
            const sourceDeltas = newDeltas.filter((d) => d.accountId === tx.sourceAccountId);
            if (sourceDeltas.length > 0) {
              await balanceService.applyDeltas({ transactionId, deltas: sourceDeltas, multiplier: 1 });
            }
            if (tx.customerId) {
              const customer = await db.customers.get(tx.customerId);
              if (customer) {
                const oldDebt = tx.nominal + (tx.feePaidBy === 'cash' ? tx.fee : 0);
                const newDebt = newNominal + (tx.feePaidBy === 'cash' ? newFee : 0);
                await db.customers.update(tx.customerId, {
                  balanceHutang: Math.max(0, customer.balanceHutang - oldDebt + newDebt),
                });
              }
            }
          } else {
            await balanceService.applyDeltas({ transactionId, deltas: newDeltas, multiplier: 1 });
          }
        }

        // 3. Update data transaksi
        await db.transactions.update(transactionId, {
          nominal: newNominal,
          fee: newFee,
          note: newNote,
          feeManualOverride: input.fee !== undefined ? true : tx.feeManualOverride,
          updatedAt: now,
        });

        // 4. Jejak audit
        await db.auditLogs.add({
          id: uuidv4(),
          actorUserId: opts.actorUserId,
          action: 'edit_transaksi',
          entityType: 'transaction',
          entityId: transactionId,
          detail: JSON.stringify({
            old: {
              nominal: tx.nominal,
              fee: tx.fee,
              note: tx.note,
              customerName: oldCustomerName,
            },
            new: {
              nominal: newNominal,
              fee: newFee,
              note: newNote,
              customerName: updatedCustomerName ?? oldCustomerName,
            },
            ...(approvedBy ? { approvedBy } : {}),
          }),
          createdAt: now,
        });
      }
    );
  }

  public async listTransactions(params?: {
    from?: number;
    to?: number;
    layanan?: string;
    accountId?: string;
    shiftId?: string;
    status?: 'ok' | 'void';
    query?: string;
  }): Promise<Transaction[]> {
    let list = await db.transactions.toArray();

    if (params?.from) {
      list = list.filter((t) => t.date >= params.from!);
    }
    if (params?.to) {
      list = list.filter((t) => t.date <= params.to!);
    }
    if (params?.layanan) {
      list = list.filter((t) => t.layanan === params.layanan);
    }
    if (params?.accountId) {
      list = list.filter((t) => t.accountId === params.accountId || t.sourceAccountId === params.accountId);
    }
    if (params?.shiftId) {
      list = list.filter((t) => t.shiftId === params.shiftId);
    }
    if (params?.status) {
      list = list.filter((t) => t.status === params.status);
    }
    if (params?.query) {
      const q = params.query.toLowerCase();
      list = list.filter(
        (t) =>
          t.layanan.toLowerCase().includes(q) ||
          (t.note && t.note.toLowerCase().includes(q)) ||
          (t.referenceNo && t.referenceNo.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => b.date - a.date);
    return list;
  }

  public async getTransaction(id: string): Promise<Transaction | undefined> {
    return await db.transactions.get(id);
  }

  public async getItems(transactionId: string): Promise<TransactionItem[]> {
    return await db.transactionItems.where('transactionId').equals(transactionId).toArray();
  }
}

export const transactionService = new TransactionService();
