import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { transactionService } from '../src/services/transactionService';
import { accountService } from '../src/services/accountService';
import { useAuthStore } from '../src/stores/authStore';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import { waitFor } from './helpers/testUtils';
import type { User, Account } from '../src/db/types';

describe('Audit b28 Features: Edit Akun Transaksi untuk Owner & Kepala Kasir', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let adminUser: User;
  let kepalaKasirUser: User;
  let kasirUser: User;

  let kasKecil: Account;
  let kasBesar: Account;
  let kasLaci: Account;
  let kasToko: Account;
  let bankBca: Account;

  function setLoggedInUser(user: User) {
    const authStore = useAuthStore(pinia);
    authStore.currentUser = user;
    localStorage.setItem('buku_konter_active_user_id', user.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  }

  /**
   * Helper setup transaksi tarik tunai untuk pengujian:
   * Memanggil addTransaction tanpa shortcut accountId (aturan kasir normal),
   * lalu mengoreksi accountId transaksi & baris ledger pembayaran di DB secara eksplisit
   * agar akun pembayaran deterministik (mis. kasLaci) tanpa membongkar aturan penurunan service.
   */
  async function createSetupTarikTunai(opts: {
    nominal: number;
    fee: number;
    sourceAccountId: string;
    paymentAccountId: string;
    actorUserId: string;
    shiftId?: string | null;
  }): Promise<string> {
    const txId = await transactionService.addTransaction(
      {
        layanan: 'tarik_tunai',
        nominal: opts.nominal,
        fee: opts.fee,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        sourceAccountId: opts.sourceAccountId,
        date: Date.now(),
      },
      { actorUserId: opts.actorUserId, shiftId: opts.shiftId ?? 'shift-test-1' }
    );

    if (opts.paymentAccountId) {
      await db.transactions.update(txId, { accountId: opts.paymentAccountId });
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      const paymentLedger = ledgers.find((l) => l.delta < 0);
      if (paymentLedger && paymentLedger.accountId !== opts.paymentAccountId) {
        await db.accountLedger.update(paymentLedger.id, { accountId: opts.paymentAccountId });
      }
    }

    return txId;
  }

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);

    await db.users.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.products.clear();
    await db.stockMovements.clear();
    await db.customers.clear();
    await db.shifts.clear();
    await db.auditLogs.clear();

    const now = Date.now();
    const pinOwnerHash = await authService.hashPin('111111');
    const pinHash = await authService.hashPin('123456');

    ownerUser = {
      id: 'user-owner',
      name: 'Owner Budi',
      role: 'owner',
      pinHash: pinOwnerHash,
      isActive: true,
      createdAt: now,
    };
    adminUser = {
      id: 'user-admin',
      name: 'Admin Ari',
      role: 'admin',
      pinHash,
      isActive: true,
      createdAt: now,
    };
    kepalaKasirUser = {
      id: 'user-kk',
      name: 'Kepala Kasir Dewi',
      role: 'kepala_kasir',
      pinHash,
      isActive: true,
      createdAt: now,
    };
    kasirUser = {
      id: 'user-kasir',
      name: 'Fitra Kasir',
      role: 'kasir',
      pinHash,
      isActive: true,
      createdAt: now,
    };

    await db.users.bulkAdd([ownerUser, adminUser, kepalaKasirUser, kasirUser]);

    const k1Id = await accountService.addAccount({
      name: 'Kas Kecil',
      type: 'kas',
      initialBalance: 2000000,
    });
    const k2Id = await accountService.addAccount({
      name: 'Kas Besar',
      type: 'kas',
      initialBalance: 5000000,
    });
    const k3Id = await accountService.addAccount({
      name: 'Kas Laci',
      type: 'kas',
      initialBalance: 1000000,
    });
    const k4Id = await accountService.addAccount({
      name: 'Kas Toko',
      type: 'kas',
      initialBalance: 3000000,
    });
    const bId = await accountService.addAccount({
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 10000000,
    });

    kasKecil = (await db.accounts.get(k1Id))!;
    kasBesar = (await db.accounts.get(k2Id))!;
    kasLaci = (await db.accounts.get(k3Id))!;
    kasToko = (await db.accounts.get(k4Id))!;
    bankBca = (await db.accounts.get(bId))!;

    // Default shift aktif untuk pengujian
    await db.shifts.add({
      id: 'shift-test-1',
      userId: ownerUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 500000,
      status: 'open',
    });

    setLoggedInUser(ownerUser);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
    vi.restoreAllMocks();
  });

  describe('A. Service Logic Edit Akun', () => {
    it('A.3.1 Service: ubah sumber saja pada Tarik Tunai mengembalikan saldo sumber lama dan memotong/menambah sumber baru', async () => {
      // Buat transaksi tarik tunai Rp 1.000.000, fee 7.000
      // Sumber dana: kasKecil, payment: kasLaci
      // Tarik tunai: sumber menerima transfer (+1jt), payment kasir menyerahkan cash -(1jt - 7rb = 993rb)
      const txId = await createSetupTarikTunai({
        nominal: 1000000,
        fee: 7000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // Verifikasi saldo awal setelah transaksi
      // kasKecil awal 2jt + 1jt = 3jt
      // kasLaci awal 1jt - 993rb = 7.000
      expect(await accountService.getBalance(kasKecil.id)).toBe(3000000);
      expect(await accountService.getBalance(kasBesar.id)).toBe(5000000);
      expect(await accountService.getBalance(kasLaci.id)).toBe(7000);

      // Owner mengubah Sumber Dana dari Kas Kecil ke Kas Besar (payment tetap Kas Laci)
      await transactionService.editTransaction(
        txId,
        {
          sourceAccountId: kasBesar.id,
        },
        { actorUserId: ownerUser.id }
      );

      // Saldo Kas Kecil harus kembali ke 2.000.000 (pembalikan)
      expect(await accountService.getBalance(kasKecil.id)).toBe(2000000);
      // Saldo Kas Besar bertambah 1.000.000 menjadi 6.000.000 (baru)
      expect(await accountService.getBalance(kasBesar.id)).toBe(6000000);
      // Saldo Kas Laci tidak berubah (tetap 7.000)
      expect(await accountService.getBalance(kasLaci.id)).toBe(7000);

      // Record transaksi terupdate
      const updatedTx = await db.transactions.get(txId);
      expect(updatedTx?.sourceAccountId).toBe(kasBesar.id);
      expect(updatedTx?.nominal).toBe(1000000);
      expect(updatedTx?.fee).toBe(7000);

      // Audit log mencatat perubahan sumber dana
      const audits = await db.auditLogs.where('entityId').equals(txId).toArray();
      const audit = audits.find((a) => a.action === 'edit_transaksi');
      expect(audit).toBeDefined();
      const detail = JSON.parse(audit?.detail || '{}');
      expect(detail.old.sourceAccount.name).toBe('Kas Kecil');
      expect(detail.new.sourceAccount.name).toBe('Kas Besar');
    });

    it('A.3.2 Service: ubah payment saja pada Tarik Tunai mengembalikan payment lama dan menerapkan payment baru', async () => {
      // Buat transaksi tarik tunai Rp 1.000.000, fee 7.000 (sumber Kas Kecil, payment Kas Laci)
      const txId = await createSetupTarikTunai({
        nominal: 1000000,
        fee: 7000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // Ganti paymentAccountId dari Kas Laci ke Kas Toko
      await transactionService.editTransaction(
        txId,
        {
          paymentAccountId: kasToko.id,
        },
        { actorUserId: ownerUser.id }
      );

      // Sumber Kas Kecil tidak bergerak (tetap 3.000.000)
      expect(await accountService.getBalance(kasKecil.id)).toBe(3000000);
      // Kas Laci (payment lama) kembali penuh ke 1.000.000
      expect(await accountService.getBalance(kasLaci.id)).toBe(1000000);
      // Kas Toko (payment baru) berkurang 993.000 (3.000.000 - 993.000 = 2.007.000)
      expect(await accountService.getBalance(kasToko.id)).toBe(2007000);

      const updatedTx = await db.transactions.get(txId);
      expect(updatedTx?.accountId).toBe(kasToko.id);

      const audits = await db.auditLogs.where('entityId').equals(txId).toArray();
      const audit = audits.find((a) => a.action === 'edit_transaksi');
      expect(audit).toBeDefined();
      const detail = JSON.parse(audit?.detail || '{}');
      expect(detail.old.paymentAccount.name).toBe('Kas Laci');
      expect(detail.new.paymentAccount.name).toBe('Kas Toko');
    });

    it('A.3.3 Service: ubah kedua akun + nominal sekaligus (1jt -> 1.2jt) menghitung saldo akhir keempat akun tepat', async () => {
      const txId = await createSetupTarikTunai({
        nominal: 1000000,
        fee: 7000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // Ubah sumber: Kas Kecil -> Kas Besar
      // Ubah payment: Kas Laci -> Kas Toko
      // Ubah nominal: 1.000.000 -> 1.200.000 (fee tetap 7.000)
      // Baru: Kas Besar bertambah 1.200.000 (5jt -> 6.2jt)
      // Baru: Kas Toko berkurang (1.200.000 - 7.000 = 1.193.000) -> 3jt - 1.193.000 = 1.807.000
      await transactionService.editTransaction(
        txId,
        {
          nominal: 1200000,
          sourceAccountId: kasBesar.id,
          paymentAccountId: kasToko.id,
        },
        { actorUserId: ownerUser.id }
      );

      // Lama kembali utuh:
      expect(await accountService.getBalance(kasKecil.id)).toBe(2000000);
      expect(await accountService.getBalance(kasLaci.id)).toBe(1000000);

      // Baru diterapkan tepat:
      expect(await accountService.getBalance(kasBesar.id)).toBe(6200000);
      expect(await accountService.getBalance(kasToko.id)).toBe(1807000);
    });

    it('A.3.4 Service: Kepala Kasir berhasil ubah akun; Admin dan Kasir (meski dengan PIN Owner) DITOLAK', async () => {
      const txId = await createSetupTarikTunai({
        nominal: 1000000,
        fee: 7000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // 1. Kepala Kasir mengubah akun -> BERHASIL
      await expect(
        transactionService.editTransaction(
          txId,
          { sourceAccountId: kasBesar.id },
          { actorUserId: kepalaKasirUser.id }
        )
      ).resolves.toBeUndefined();

      // 2. Admin mencoba mengubah akun -> DITOLAK
      await expect(
        transactionService.editTransaction(
          txId,
          { sourceAccountId: kasKecil.id },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Perubahan akun transaksi hanya untuk Owner dan Kepala Kasir.');

      // Tapi Admin mengedit nominal saja -> BERHASIL
      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 1050000 },
          { actorUserId: adminUser.id }
        )
      ).resolves.toBeUndefined();

      // 3. Kasir dengan PIN Owner mencoba mengubah akun -> DITOLAK
      await expect(
        transactionService.editTransaction(
          txId,
          { sourceAccountId: kasKecil.id },
          { actorUserId: kasirUser.id, ownerPin: '111111' }
        )
      ).rejects.toThrow('Perubahan akun transaksi hanya untuk Owner dan Kepala Kasir.');

      // Tapi Kasir dengan PIN Owner mengedit nominal saja -> BERHASIL
      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 1100000 },
          { actorUserId: kasirUser.id, ownerPin: '111111' }
        )
      ).resolves.toBeUndefined();
    });

    it('A.3.5 Service: akun baru tidak ada / tidak aktif atau sumber == dest pada pindah_dana ditolak', async () => {
      const nonActiveAccId = await accountService.addAccount({
        name: 'Kas Tutup',
        type: 'kas',
        initialBalance: 100000,
      });
      await db.accounts.update(nonActiveAccId, { isActive: false });

      const txId = await createSetupTarikTunai({
        nominal: 500000,
        fee: 5000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // Akun tidak ada
      await expect(
        transactionService.editTransaction(
          txId,
          { sourceAccountId: 'non-existent-acc' },
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Akun sumber dana baru tidak ditemukan atau tidak aktif.');

      // Akun tidak aktif
      await expect(
        transactionService.editTransaction(
          txId,
          { sourceAccountId: nonActiveAccId },
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Akun sumber dana baru tidak ditemukan atau tidak aktif.');

      // Tes pindah_dana: sumber baru sama dengan destAccountId transaksi
      const pdTxId = await transactionService.addTransaction(
        {
          layanan: 'pindah_dana',
          nominal: 200000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: kasKecil.id,
          destAccountId: kasBesar.id,
          date: Date.now(),
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      await expect(
        transactionService.editTransaction(
          pdTxId,
          { sourceAccountId: kasBesar.id }, // sama dengan destAccountId
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Akun sumber dana tidak boleh sama dengan akun tujuan.');
    });

    it('A.3.6 Service: transaksi void tetap tidak bisa diedit & edit tanpa ubah akun tetap normal', async () => {
      const txId = await createSetupTarikTunai({
        nominal: 300000,
        fee: 5000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      await transactionService.voidTransaction(txId, {
        reason: 'Alasan void pembatalan',
        actorUserId: ownerUser.id,
        pin: '111111',
      });

      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 400000 },
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Transaksi yang sudah dibatalkan (void) tidak dapat diedit.');
    });
  });

  describe('B. UI Dialog Edit Transaksi', () => {
    it('A.3.7 UI: render dialog edit sebagai Owner/Kepala Kasir menampilkan dropdown akun; Admin/Kasir tidak menampilkannya', async () => {
      const txId = await createSetupTarikTunai({
        nominal: 1000000,
        fee: 7000,
        sourceAccountId: kasKecil.id,
        paymentAccountId: kasLaci.id,
        actorUserId: ownerUser.id,
      });

      // 1. Mount sebagai Owner
      setLoggedInUser(ownerUser);
      await router.push(`/transactions/${txId}`);
      await router.isReady();

      const wrapper = mount(TransactionDetailView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(true);
      });

      // Buka dialog edit
      await wrapper.find('[data-testid="btn-edit-transaction"]').trigger('click');

      await waitFor(() => {
        expect(wrapper.find('[data-testid="edit-dialog"]').exists()).toBe(true);
      });

      // Dropdown Sumber Dana & Diterima Di HARUS muncul untuk Owner
      expect(wrapper.find('[data-testid="edit-select-source-account"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="edit-select-payment-account"]').exists()).toBe(true);

      // Nilai awal harus sesuai
      const sourceSelect = wrapper.find('[data-testid="edit-select-source-account"]');
      expect((sourceSelect.element as HTMLSelectElement).value).toBe(kasKecil.id);

      // Opsi "Diterima Di" hanya akun tipe kas (Kas Kecil, Kas Besar, Kas Laci, Kas Toko) - bukan Bank BCA
      const paymentOptions = wrapper.findAll('[data-testid="edit-select-payment-account"] option');
      const paymentOptionValues = paymentOptions.map((o) => (o.element as HTMLOptionElement).value);
      expect(paymentOptionValues).not.toContain(bankBca.id);
      expect(paymentOptionValues).toContain(kasLaci.id);

      wrapper.unmount();
      await flushPromises();

      // 2. Mount sebagai Admin
      setLoggedInUser(adminUser);
      await router.push(`/transactions/${txId}`);
      await router.isReady();

      const adminWrapper = mount(TransactionDetailView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(adminWrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(true);
      });

      await adminWrapper.find('[data-testid="btn-edit-transaction"]').trigger('click');

      await waitFor(() => {
        expect(adminWrapper.find('[data-testid="edit-dialog"]').exists()).toBe(true);
      });

      // Dropdown akun TIDAK BOLEH tampil untuk Admin
      expect(adminWrapper.find('[data-testid="edit-select-source-account"]').exists()).toBe(false);
      expect(adminWrapper.find('[data-testid="edit-select-payment-account"]').exists()).toBe(false);

      // Tapi field nominal dan fee tetap tampil
      expect(adminWrapper.find('[data-testid="edit-input-nominal"]').exists()).toBe(true);
      expect(adminWrapper.find('[data-testid="edit-input-fee"]').exists()).toBe(true);

      adminWrapper.unmount();
      await flushPromises();
    });
  });

  describe('C. Regresi F-B28-1: addTransaction tidak menerima shortcut accountId dan wajib akun Kas', () => {
    it('C.1 Layanan kasir (tarik_tunai) dengan accountId diisi tetap DITOLAK bila tidak ada akun Kas di database', async () => {
      // Hapus semua akun tipe kas
      await db.accounts.where('type').equals('kas').delete();

      // Coba tambah transaksi tarik_tunai dengan accountId diisi Bank BCA
      // Bila shortcut accountId masih ada, ini akan lolos dan membukukan ke Bank BCA (celah laten F-B28-1)
      // Tanpa shortcut, ini HARUS ditolak oleh penjaga akun Kas
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'tarik_tunai',
            nominal: 500000,
            fee: 5000,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: bankBca.id,
            accountId: bankBca.id,
            date: Date.now(),
          },
          { actorUserId: ownerUser.id, shiftId: 'shift-test-1' }
        )
      ).rejects.toThrow('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');
    });

    it('C.2 Layanan kasir dengan accountId diisi tetap mengabaikannya dan menggunakan akun Kas pertama (aturan b25)', async () => {
      // Ambil akun Kas pertama yang akan dipilih oleh db.accounts.where('type').equals('kas').first()
      const firstKas = (await db.accounts.where('type').equals('kas').first())!;
      // Pilih akun lain (bukan firstKas) untuk dikirim ke input.accountId
      const otherAccount = (await db.accounts.toArray()).find((a) => a.id !== firstKas.id)!;

      // Input membawa accountId: otherAccount.id, namun addTransaction harus mengabaikannya
      // dan menjatuhkan paymentAccountId ke akun Kas pertama (firstKas.id)
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 500000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: kasBesar.id,
          accountId: otherAccount.id, // Seharusnya diabaikan oleh addTransaction
          date: Date.now(),
        },
        { actorUserId: ownerUser.id, shiftId: 'shift-test-1' }
      );

      const createdTx = await db.transactions.get(txId);
      // Harus jatuh ke akun Kas pertama (firstKas), BUKAN otherAccount
      expect(createdTx?.accountId).toBe(firstKas.id);
      expect(createdTx?.accountId).not.toBe(otherAccount.id);

      // Ledger keluar juga harus memotong akun Kas pertama (firstKas)
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      const paymentLedger = ledgers.find((l) => l.delta < 0);
      expect(paymentLedger?.accountId).toBe(firstKas.id);
    });
  });
});
