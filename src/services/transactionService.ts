import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Transaction, TransactionItem } from '../db/types';
import { AppError } from '../core/errors';
import { productService } from './productService';
import { balanceService, type BalanceDelta } from './balanceService';
import { stockService } from './stockService';
import { authService } from './authService';
import { accountService } from './accountService';
import { getWitaDateString } from '../utils/datePeriod';

export interface CartItemInput {
  productId: string;
  qty?: number;
  nominal?: number;
}

export interface TransactionInput {
  layanan: string;
  productId?: string;
  accountId?: string; // pembayaran / penerimaan (diabaikan, jangan gunakan)
  sourceAccountId?: string;
  destAccountId?: string;
  paymentAccountId?: string; // b31: dropdown Diterima Di manual
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
  sourceAccountId?: string;
  paymentAccountId?: string;
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
    opts: { actorUserId: string; shiftId?: string | null }
  ): Promise<string> {
    if (!input.nominal || input.nominal <= 0 || !Number.isInteger(input.nominal)) {
      throw new AppError('Nominal transaksi harus bilangan bulat lebih besar dari Rp0.');
    }

    if (input.fee < 0 || !Number.isInteger(input.fee)) {
      throw new AppError('Biaya admin harus bilangan bulat >= Rp0.');
    }

    const isOwnerService = [
      'pindah_dana',
      'deposit_server',
      'deposit_provider',
      'pembelian_stok',
      'operasional',
    ].includes(input.layanan);

    if (!opts.shiftId && !isOwnerService) {
      throw new AppError('Transaksi kasir membutuhkan shift aktif.');
    }

    // Kunci otorisasi: Pindah Dana, Deposit Server, dan Deposit Provider hanya untuk Owner
    const actor = await db.users.get(opts.actorUserId);
    const ownerOnlyServices = ['pindah_dana', 'deposit_server', 'deposit_provider'];
    if (ownerOnlyServices.includes(input.layanan) && actor?.role !== 'owner') {
      throw new AppError('Layanan ini hanya untuk Owner. Gunakan halaman Transaksi Owner.');
    }

    const paymentStatus = input.paymentStatus || 'lunas';
    if (paymentStatus === 'hutang') {
      if (!input.customerId) {
        throw new AppError('Transaksi dengan status Hutang wajib memilih atau mengisi nama pelanggan.');
      }
    }

    // Validasi dan penurunan akun (lewati jika jasa_transfer)
    let paymentAccountId: string | undefined = undefined;

    if (input.layanan !== 'jasa_transfer') {
      // Validasi akun Tarik Tunai (b30)
      if (input.layanan === 'tarik_tunai' && input.sourceAccountId) {
        const srcAcc = await db.accounts.get(input.sourceAccountId);
        if (!srcAcc || (srcAcc.type !== 'kas' && srcAcc.type !== 'bank')) {
          throw new AppError('Sumber dana Tarik Tunai hanya Kas atau Rekening Bank.');
        }
      }

      // b31: Jika input.paymentAccountId diisi, validasi dan pakai itu (lewati penurunan)
      if (input.paymentAccountId) {
        const payAcc = await db.accounts.get(input.paymentAccountId);
        if (!payAcc || !payAcc.isActive) {
          throw new AppError('Akun pembayaran tidak ditemukan atau tidak aktif.');
        }
        if (input.layanan === 'transfer') {
          if (payAcc.type !== 'kas') {
            throw new AppError('Diterima Di Transfer hanya Kas Kecil atau Kas Besar.');
          }
        } else if (input.layanan === 'tarik_tunai') {
          if (payAcc.type !== 'kas' && payAcc.type !== 'bank') {
            throw new AppError('Diterima Di Tarik Tunai hanya Kas atau Rekening Bank.');
          }
        } else {
          const isMandiri = payAcc.type === 'bank' && payAcc.name.toLowerCase().includes('mandiri');
          if (payAcc.type !== 'kas' && !isMandiri) {
            throw new AppError('Diterima Di hanya Kas atau QR Mandiri (Rekening Mandiri).');
          }
        }
        paymentAccountId = payAcc.id;
      } else {
        // 9 Nov 2026: Turunkan paymentAccountId otomatis dari cara bayar admin (feePaidBy)
        const hasFeePaidBy = ['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(input.layanan);

        if (input.layanan !== 'tarik_tunai' && hasFeePaidBy && input.feePaidBy === 'debit_rekening') {
          if (!input.sourceAccountId) {
            throw new AppError(`Transaksi ${input.layanan} dengan Debit Rekening membutuhkan akun sumber dana.`);
          }
          paymentAccountId = input.sourceAccountId;
        } else if (isOwnerService) {
          // Layanan Owner: gunakan Kas jika ada, atau sourceAccountId, atau akun aktif pertama
          const kasAccount = await db.accounts.where('type').equals('kas').first();
          if (kasAccount) {
            paymentAccountId = kasAccount.id;
          } else if (input.sourceAccountId) {
            paymentAccountId = input.sourceAccountId;
          } else {
            const firstActive = await db.accounts.filter((a) => a.isActive).first();
            if (!firstActive) {
              throw new AppError('Belum ada akun aktif. Tambahkan akun terlebih dahulu.');
            }
            paymentAccountId = firstActive.id;
          }
        } else {
          // Layanan Kasir (Cash, tarik_tunai, atau layanan tanpa Bayar Admin): WAJIB ada akun Kas (perilaku b23)
          const kasAccount = await db.accounts.where('type').equals('kas').first();
          if (!kasAccount) {
            throw new AppError('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');
          }
          paymentAccountId = kasAccount.id;
        }
      }
    }

    const transactionId = uuidv4();
    const now = Date.now();
    const date = input.date ?? now;

    // 1. Validasi: tanggal tidak boleh di masa depan
    if (date > now) {
      throw new AppError('Tanggal transaksi tidak boleh di masa depan.');
    }

    // 2. Validasi izin ubah tanggal: kasir tidak boleh ubah tanggal; owner/admin wajib isi alasan
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
    const rawItems = (input as { cartItems?: CartItemInput[]; items?: CartItemInput[] }).cartItems ||
      (input as { cartItems?: CartItemInput[]; items?: CartItemInput[] }).items;

    if (rawItems && rawItems.length > 0) {
      // Keranjang multi-item / pembelian_stok
      let totalModal = 0;
      let totalJual = 0;

      for (const item of rawItems) {
        const resolved = await productService.resolveSaleProduct(item.productId);
        if (!resolved) continue;
        const qty = item.qty || 1;

        let itemSubtotal: number;
        let itemModalSnapshot: number;
        let itemHargaJualSnapshot: number;

        if (input.layanan === 'pembelian_stok' && typeof item.nominal === 'number') {
          // b25: subtotal = item.nominal (harga beli baris itu, persis — JANGAN pakai hargaJualSnapshot * qty).
          // modalSnapshot = Math.round(item.nominal / qty) (harga beli per pcs, hanya untuk tampilan;
          // sumber kebenaran biaya beli adalah subtotal + nominal transaksi).
          // hargaJualSnapshot tetap harga jual master (referensi).
          itemSubtotal = item.nominal;
          itemModalSnapshot = Math.round(item.nominal / qty);
          itemHargaJualSnapshot = resolved.hargaJual;
          totalModal += item.nominal;
          totalJual += resolved.hargaJual * qty;
        } else {
          itemSubtotal = resolved.hargaJual * qty;
          itemModalSnapshot = resolved.modal;
          itemHargaJualSnapshot = resolved.hargaJual;
          totalModal += resolved.modal * qty;
          totalJual += resolved.hargaJual * qty;
        }

        itemsToSave.push({
          id: uuidv4(),
          transactionId,
          productId: item.productId,
          productNameSnapshot: resolved.name,
          qty,
          modalSnapshot: itemModalSnapshot,
          hargaJualSnapshot: itemHargaJualSnapshot,
          subtotal: itemSubtotal,
        });
      }

      modal = totalModal;
      hargaJual = totalJual;
    } else if (input.productId) {
      const resolved = await productService.resolveSaleProduct(input.productId);
      if (!resolved) {
        throw new AppError('Produk master tidak ditemukan.');
      }
      modal = resolved.modal;
      hargaJual = resolved.hargaJual;
      productNameSnapshot = resolved.name;

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
    }

    // Hitung delta saldo
    let effectiveSourceAccountId: string | undefined = undefined;
    let deltas: BalanceDelta[] = [];

    if (input.layanan !== 'jasa_transfer') {
      effectiveSourceAccountId = input.sourceAccountId || (isOwnerService ? (input as unknown as { paymentAccountId?: string }).paymentAccountId : undefined);
      deltas = balanceService.computeDeltas({
        layanan: input.layanan,
        sourceAccountId: effectiveSourceAccountId,
        destAccountId: input.destAccountId,
        paymentAccountId: paymentAccountId!,
        nominal: input.nominal,
        modal,
        hargaJual,
        fee: input.fee,
        feePaidBy: input.feePaidBy,
      });

      // Validasi saldo akun sumber: saldo tidak boleh minus akibat transaksi ini
      if (effectiveSourceAccountId) {
        const sourceBalance = await accountService.getBalance(effectiveSourceAccountId);
        const outgoingDelta = deltas
          .filter((d) => d.accountId === effectiveSourceAccountId && d.delta < 0)
          .reduce((sum, d) => sum + Math.abs(d.delta), 0);
        if (outgoingDelta > 0 && sourceBalance < outgoingDelta) {
          throw new AppError('Saldo akun sumber tidak mencukupi.');
        }
      }
    }

    const txRecord: Transaction = {
      id: transactionId,
      layanan: input.layanan,
      shiftId: opts.shiftId || null,
      userId: opts.actorUserId,
      accountId: input.layanan === 'jasa_transfer' ? undefined : paymentAccountId,
      sourceAccountId: input.layanan === 'jasa_transfer' ? undefined : effectiveSourceAccountId,
      destAccountId: input.layanan === 'jasa_transfer' ? undefined : input.destAccountId,
      nominal: input.nominal,
      fee: input.fee,
      feePaidBy: input.feePaidBy,
      feeRuleId: input.feeRuleId,
      feeManualOverride: input.feeManualOverride,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.layanan === 'jasa_transfer' ? 'lunas' : paymentStatus,
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
        db.productCatalogCache,
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

        // 3. Terapkan saldo mutasi (hanya jika transaksi bukan jasa_transfer dan statusnya bukan hutang tanpa penerimaan kas)
        if (input.layanan !== 'jasa_transfer') {
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
        }

        // 4. Perbarui stok barang jika ada produk fisik
        for (const item of itemsToSave) {
          const product = await db.products.get(item.productId);
          if (!product || product.stock === null) continue;
          const isPurchase = input.layanan === 'pembelian_stok';
          await stockService.adjustStock({
            productId: item.productId,
            qtyChange: isPurchase ? item.qty : -item.qty,
            reason: isPurchase ? 'pembelian_stok' : 'jual',
            transactionId,
            shiftId: opts.shiftId || undefined,
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
      const pinToVerify = (opts.ownerPin || '').trim();
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
    } else if (authService.canVoidTransaction(actor.role)) {
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
        db.productCatalogCache,
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
          const product = await db.products.get(item.productId);
          if (!product || product.stock === null) continue;
          const isPurchase = tx.layanan === 'pembelian_stok';
          await stockService.adjustStock({
            productId: item.productId,
            qtyChange: isPurchase ? -item.qty : item.qty, // pembelian_stok dibatalkan -> kurangi stok (-qty); penjualan dibatalkan -> kembalikan stok (+qty)
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
    } else if (!authService.canEditTransaction(actor.role)) {
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

    if (tx.layanan === 'jasa_transfer' && (input.sourceAccountId || input.paymentAccountId)) {
      throw new AppError('Jasa Transfer tidak menggunakan akun.');
    }

    // Kunci otorisasi perubahan akun: hanya untuk Owner dan Kepala Kasir
    const isSourceChanged = input.sourceAccountId !== undefined && input.sourceAccountId !== tx.sourceAccountId;
    const isPaymentChanged = input.paymentAccountId !== undefined && input.paymentAccountId !== tx.accountId;
    const isAccountChanged = isSourceChanged || isPaymentChanged;

    if (isAccountChanged) {
      if (actor.role !== 'owner' && actor.role !== 'kepala_kasir') {
        throw new AppError('Perubahan akun transaksi hanya untuk Owner dan Kepala Kasir.');
      }

      // Validasi akun sumber baru jika berubah
      if (isSourceChanged) {
        if (!input.sourceAccountId) {
          throw new AppError('Akun sumber dana baru tidak boleh kosong.');
        }
        const srcAcc = await db.accounts.get(input.sourceAccountId);
        if (!srcAcc || !srcAcc.isActive) {
          throw new AppError('Akun sumber dana baru tidak ditemukan atau tidak aktif.');
        }
        if (tx.layanan === 'tarik_tunai' && srcAcc.type !== 'kas' && srcAcc.type !== 'bank') {
          throw new AppError('Sumber dana Tarik Tunai hanya Kas atau Rekening Bank.');
        }
        if (tx.layanan === 'pindah_dana' && input.sourceAccountId === tx.destAccountId) {
          throw new AppError('Akun sumber dana tidak boleh sama dengan akun tujuan.');
        }
      }

      // Validasi akun pembayaran baru jika berubah
      if (isPaymentChanged) {
        if (!input.paymentAccountId) {
          throw new AppError('Akun pembayaran baru tidak boleh kosong.');
        }
        const payAcc = await db.accounts.get(input.paymentAccountId);
        if (!payAcc || !payAcc.isActive) {
          throw new AppError('Akun pembayaran baru tidak ditemukan atau tidak aktif.');
        }
        if (tx.layanan === 'transfer') {
          if (payAcc.type !== 'kas') {
            throw new AppError('Diterima Di Transfer hanya Kas Kecil atau Kas Besar.');
          }
        } else if (tx.layanan === 'tarik_tunai') {
          if (payAcc.type !== 'kas' && payAcc.type !== 'bank') {
            throw new AppError('Diterima Di Tarik Tunai hanya Kas atau Rekening Bank.');
          }
        } else {
          const isMandiri = payAcc.type === 'bank' && payAcc.name.toLowerCase().includes('mandiri');
          if (payAcc.type !== 'kas' && !isMandiri) {
            throw new AppError('Diterima Di hanya Kas atau QR Mandiri (Rekening Mandiri).');
          }
        }
      }
    }

    // Data nama akun lama & baru untuk jejak audit
    let oldSourceAccountName: string | undefined;
    let newSourceAccountName: string | undefined;
    if (isSourceChanged) {
      if (tx.sourceAccountId) {
        const oldAcc = await db.accounts.get(tx.sourceAccountId);
        oldSourceAccountName = oldAcc?.name;
      }
      if (input.sourceAccountId) {
        const newAcc = await db.accounts.get(input.sourceAccountId);
        newSourceAccountName = newAcc?.name;
      }
    }

    let oldPaymentAccountName: string | undefined;
    let newPaymentAccountName: string | undefined;
    if (isPaymentChanged) {
      if (tx.accountId) {
        const oldAcc = await db.accounts.get(tx.accountId);
        oldPaymentAccountName = oldAcc?.name;
      }
      if (input.paymentAccountId) {
        const newAcc = await db.accounts.get(input.paymentAccountId);
        newPaymentAccountName = newAcc?.name;
      }
    }

    const effectiveSourceAccountId = input.sourceAccountId !== undefined ? input.sourceAccountId : tx.sourceAccountId;
    let effectivePaymentAccountId = input.paymentAccountId !== undefined ? input.paymentAccountId : tx.accountId;
    if (!effectivePaymentAccountId) {
      const kasAccount = await db.accounts.where('type').equals('kas').first();
      effectivePaymentAccountId = kasAccount?.id || '';
    }

    const newNominal = input.nominal !== undefined ? input.nominal : tx.nominal;
    if (newNominal <= 0 || !Number.isFinite(newNominal)) {
      throw new AppError('Nominal transaksi harus berupa angka lebih dari 0.');
    }

    if (newNominal !== tx.nominal) {
      const existingItems = await db.transactionItems.where('transactionId').equals(transactionId).toArray();
      if (existingItems.length > 1) {
        throw new AppError('Transaksi multi-item tidak dapat diubah nominalnya. Silakan batalkan (void) dan catat ulang transaksi.');
      }
    }

    const newFee = input.fee !== undefined ? input.fee : tx.fee;
    if (newFee < 0 || !Number.isFinite(newFee)) {
      throw new AppError('Biaya admin tidak boleh negatif.');
    }

    const newNote = input.note !== undefined ? input.note.trim() : (tx.note || '');

    const now = Date.now();
    const isAmountChanged = newNominal !== tx.nominal || newFee !== tx.fee;
    const shouldRebalance = isAmountChanged || isAccountChanged;

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

        // 2. Balik saldo lama dan terapkan saldo baru bila nominal / fee / akun berubah
        if (tx.layanan !== 'jasa_transfer' && shouldRebalance) {
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
            if (items.length === 1 && newNominal !== tx.nominal) {
              const singleItem = items[0];
              const newPrice = Math.round(newNominal / singleItem.qty);
              // (b21-A) subtotal ikut diperbarui agar sama dengan nominal baru.
              // (b21-B) subtotal disetel ke newNominal persis — bukan newPrice * qty —
              // supaya total tidak bergeser akibat pembulatan harga per-unit.
              if (tx.layanan === 'pembelian_stok') {
                await db.transactionItems.update(singleItem.id, {
                  modalSnapshot: newPrice,
                  subtotal: newNominal,
                });
                singleItem.modalSnapshot = newPrice;
                singleItem.subtotal = newNominal;
              } else {
                await db.transactionItems.update(singleItem.id, {
                  hargaJualSnapshot: newPrice,
                  subtotal: newNominal,
                });
                singleItem.hargaJualSnapshot = newPrice;
                singleItem.subtotal = newNominal;
              }
            }
            modal = items.reduce((sum, it) => sum + (it.modalSnapshot * it.qty), 0);
            // (b21-B) Untuk transaksi 1 item yang nominalnya diubah, hargaJual
            // diambil langsung dari newNominal — bukan dari newPrice * qty yang
            // dibulatkan — supaya kas bergerak tepat sebesar nominal baru
            // (contoh: 35.000 / qty 3 tidak boleh jadi 35.001).
            if (items.length === 1 && newNominal !== tx.nominal) {
              hargaJual = newNominal;
            } else {
              hargaJual = items.reduce((sum, it) => sum + (it.hargaJualSnapshot * it.qty), 0);
            }
          }

          // C. Hitung deltas baru dengan akun efektif (baru bila diubah)
          const newDeltas = balanceService.computeDeltas({
            layanan: tx.layanan,
            sourceAccountId: effectiveSourceAccountId,
            destAccountId: tx.destAccountId,
            paymentAccountId: effectivePaymentAccountId,
            nominal: newNominal,
            modal,
            hargaJual,
            fee: newFee,
            feePaidBy: tx.feePaidBy,
          });

          // D. Terapkan deltas baru
          if (tx.paymentStatus === 'hutang') {
            const sourceDeltas = newDeltas.filter((d) => d.accountId === effectiveSourceAccountId);
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
        const updatePayload: Partial<Transaction> = {
          nominal: newNominal,
          fee: newFee,
          note: newNote,
          feeManualOverride: input.fee !== undefined ? true : tx.feeManualOverride,
          updatedAt: now,
        };
        if (tx.layanan !== 'jasa_transfer') {
          if (isSourceChanged) {
            updatePayload.sourceAccountId = input.sourceAccountId;
          }
          if (isPaymentChanged) {
            updatePayload.accountId = input.paymentAccountId;
          }
        }
        await db.transactions.update(transactionId, updatePayload);

        // 4. Jejak audit
        const oldAuditDetail: Record<string, unknown> = {
          nominal: tx.nominal,
          fee: tx.fee,
          note: tx.note,
          customerName: oldCustomerName,
        };
        const newAuditDetail: Record<string, unknown> = {
          nominal: newNominal,
          fee: newFee,
          note: newNote,
          customerName: updatedCustomerName ?? oldCustomerName,
        };

        if (isSourceChanged) {
          oldAuditDetail.sourceAccount = { id: tx.sourceAccountId, name: oldSourceAccountName };
          newAuditDetail.sourceAccount = { id: input.sourceAccountId, name: newSourceAccountName };
        }
        if (isPaymentChanged) {
          oldAuditDetail.paymentAccount = { id: tx.accountId, name: oldPaymentAccountName };
          newAuditDetail.paymentAccount = { id: input.paymentAccountId, name: newPaymentAccountName };
        }

        await db.auditLogs.add({
          id: uuidv4(),
          actorUserId: opts.actorUserId,
          action: 'edit_transaksi',
          entityType: 'transaction',
          entityId: transactionId,
          detail: JSON.stringify({
            old: oldAuditDetail,
            new: newAuditDetail,
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
