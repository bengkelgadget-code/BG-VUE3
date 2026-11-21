import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { shiftService } from '../src/services/shiftService';
import { accountService } from '../src/services/accountService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import ShiftCloseView from '../src/views/ShiftCloseView.vue';
import { waitFor } from './helpers/testUtils';
import type { User, Account, Transaction } from '../src/db/types';

describe('Audit b34 Features: Label Tarik Tunai, Fallback Rekening Terima & Perbaikan Tutup Shift', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;

  let accKasKecil: Account;
  let accKasBesar: Account;
  let accBankBri: Account;
  let accBankBca: Account;

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
    await db.productCatalogCache.clear();
    await db.brands.clear();
    await db.auditLogs.clear();
    vi.restoreAllMocks();

    const now = Date.now();
    const pinOwnerHash = await authService.hashPin('111111');
    const pinKasirHash = await authService.hashPin('123456');

    ownerUser = {
      id: 'owner-1',
      name: 'Owner Konter',
      role: 'owner',
      pinHash: pinOwnerHash,
      isActive: true,
      createdAt: now,
    };
    kasirUser = {
      id: 'kasir-1',
      name: 'Kasir Fitra',
      role: 'kasir',
      pinHash: pinKasirHash,
      isActive: true,
      createdAt: now,
    };
    await db.users.bulkAdd([ownerUser, kasirUser]);

    accKasKecil = {
      id: 'acc-kas-kecil',
      name: 'Kas Kecil',
      type: 'kas',
      initialBalance: 500000,
      isActive: true,
      icon: 'cash',
      color: 'emerald',
      createdAt: now,
      updatedAt: now,
    };
    accKasBesar = {
      id: 'acc-kas-besar',
      name: 'Kas Besar',
      type: 'kas',
      initialBalance: 2000000,
      isActive: true,
      icon: 'cash',
      color: 'emerald',
      createdAt: now,
      updatedAt: now,
    };
    accBankBri = {
      id: 'acc-bank-bri',
      name: 'Bank BRI',
      type: 'bank',
      initialBalance: 3000000,
      isActive: true,
      icon: 'bank',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    };
    accBankBca = {
      id: 'acc-bank-bca',
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 5000000,
      isActive: true,
      icon: 'bank',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.bulkAdd([accKasKecil, accKasBesar, accBankBri, accBankBca]);

    const authStore = useAuthStore(pinia);
    authStore.currentUser = ownerUser;
    localStorage.setItem('buku_konter_active_user_id', ownerUser.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(ownerUser);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  describe('C.1: Detail Tarik Tunai (TransactionDetailView.vue)', () => {
    it('menampilkan "Rekening Terima Transfer: BRI" dan "Sumber Dana: Kas Kecil" pada transaksi tarik_tunai', async () => {
      const now = Date.now();
      const txTarik: Transaction = {
        id: 'tx-tarik-1',
        shiftId: 'shift-1',
        userId: kasirUser.id,
        layanan: 'tarik_tunai',
        sourceAccountId: accBankBri.id, // bank yang menerima transfer
        accountId: accKasKecil.id, // kas yang membayarkan uang tunai
        nominal: 1000000,
        fee: 7000,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: now,
        status: 'ok',
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(txTarik);

      await router.push(`/transactions/${txTarik.id}`);
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
        expect(wrapper.text()).toContain('Bank BRI');
        expect(wrapper.text()).toContain('Kas Kecil');
      });

      // Cari baris-baris detail
      const rows = wrapper.findAll('.detail-row');
      const rowTexts = rows.map((r) => {
        const label = r.find('.d-label').text();
        const val = r.find('.d-val').text();
        return `${label}: ${val}`;
      });

      // Harus ada "Rekening Terima Transfer: Bank BRI"
      expect(rowTexts).toContain('Rekening Terima Transfer: Bank BRI');
      // Harus ada "Sumber Dana: Kas Kecil"
      expect(rowTexts).toContain('Sumber Dana: Kas Kecil');

      // TIDAK boleh ada "Sumber Dana: Bank BRI" atau "Diterima Di: Kas Kecil"
      expect(rowTexts).not.toContain('Sumber Dana: Bank BRI');
      expect(rowTexts).not.toContain('Diterima Di: Kas Kecil');
      expect(rowTexts.some((t) => t.startsWith('Diterima Di:'))).toBe(false);
    });

    it('layanan lain (seperti transfer) tetap memakai label lama ("Sumber Dana" & "Diterima Di")', async () => {
      const now = Date.now();
      const txTransfer: Transaction = {
        id: 'tx-transfer-1',
        shiftId: 'shift-1',
        userId: kasirUser.id,
        layanan: 'transfer',
        sourceAccountId: accBankBca.id, // sumber transfer bank
        accountId: accKasKecil.id, // kas menerima pembayaran dari pelanggan
        nominal: 500000,
        fee: 5000,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: now,
        status: 'ok',
        createdAt: now,
        updatedAt: now,
      };
      await db.transactions.add(txTransfer);

      await router.push(`/transactions/${txTransfer.id}`);
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
        expect(wrapper.text()).toContain('Bank BCA');
        expect(wrapper.text()).toContain('Kas Kecil');
      });

      const rows = wrapper.findAll('.detail-row');
      const rowTexts = rows.map((r) => {
        const label = r.find('.d-label').text();
        const val = r.find('.d-val').text();
        return `${label}: ${val}`;
      });

      // Transfer: Sumber Dana = Bank BCA, Diterima Di = Kas Kecil
      expect(rowTexts).toContain('Sumber Dana: Bank BCA');
      expect(rowTexts).toContain('Diterima Di: Kas Kecil');
      expect(rowTexts.some((t) => t.startsWith('Rekening Terima Transfer:'))).toBe(false);
    });
  });

  describe('C.2: Fallback onMounted Tarik Tunai (AddTransactionView.vue)', () => {
    it('buka form dengan ?type=tarik_tunai mengisi field "Rekening Terima" dengan rekening bank, bukan kas', async () => {
      const authStore = useAuthStore(pinia);
      authStore.currentUser = kasirUser;
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(kasirUser);

      // Pastikan ada shift aktif untuk kasirUser agar form transaksi tampil
      await db.shifts.add({
        id: 'shift-kasir-open',
        userId: kasirUser.id,
        openedAt: Date.now(),
        saldoAwalSistem: {},
        kasAwalFisik: 500000,
        status: 'open',
      });

      await router.push('/transactions/add?type=tarik_tunai');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-dropdown-trigger"]').exists()).toBe(true);
      });

      // Pastikan layanan terpilih adalah tarik_tunai
      const vm = wrapper.vm as unknown as {
        layanan: string;
        paymentAccountId: string;
        sourceAccountId: string;
      };
      expect(vm.layanan).toBe('tarik_tunai');

      // Sumber Dana tarik tunai (paymentAccountId) harus akun kas
      expect([accKasKecil.id, accKasBesar.id]).toContain(vm.paymentAccountId);

      // Rekening Terima Transfer tarik tunai (sourceAccountId) harus rekening bank (Bank BRI / Bank BCA), bukan akun kas
      expect([accBankBri.id, accBankBca.id]).toContain(vm.sourceAccountId);
      expect(vm.sourceAccountId).not.toBe(accKasKecil.id);
      expect(vm.sourceAccountId).not.toBe(accKasBesar.id);
      expect(vm.sourceAccountId).not.toBe('');
    });
  });

  describe('C.3: Perbaikan Tutup Shift (shiftService.ts & ShiftCloseView.vue)', () => {
    it('tutup shift dengan semua selisih 0 berhasil dan ringkasan benar', async () => {
      const now = Date.now();
      const shiftId = 'shift-test-1';
      await db.shifts.add({
        id: shiftId,
        userId: ownerUser.id,
        openedAt: now - 3600000,
        saldoAwalSistem: {
          [accKasKecil.id]: 500000,
          [accKasBesar.id]: 2000000,
          [accBankBri.id]: 3000000,
          [accBankBca.id]: 5000000,
        },
        kasAwalFisik: 500000,
        status: 'open',
      });

      const balances = await accountService.getAllBalances();
      const hitungFisik: Record<string, number> = {};
      for (const [id, bal] of Object.entries(balances)) {
        hitungFisik[id] = bal;
      }

      const summary = await shiftService.closeShift({
        shiftId,
        hitungFisik,
        penjelasanSelisih: {},
        actorUserId: ownerUser.id,
      });

      expect(summary.shiftId).toBe(shiftId);
      for (const [, diff] of Object.entries(summary.selisih)) {
        expect(diff).toBe(0);
      }

      const closed = await db.shifts.get(shiftId);
      expect(closed?.status).toBe('closed');
      expect(closed?.closedAt).toBeDefined();
    });

    it('stub shiftService.getSummary melempar error -> closeShift tetap resolve dan shift tetap closed dengan ringkasan fallback', async () => {
      const now = Date.now();
      const shiftId = 'shift-test-fallback';
      await db.shifts.add({
        id: shiftId,
        userId: ownerUser.id,
        openedAt: now - 3600000,
        saldoAwalSistem: {
          [accKasKecil.id]: 500000,
        },
        kasAwalFisik: 500000,
        status: 'open',
      });

      // Tambahkan transaksi untuk memverifikasi perhitungan inline fallback
      await db.transactions.add({
        id: 'tx-summary-1',
        shiftId,
        userId: ownerUser.id,
        layanan: 'transfer',
        sourceAccountId: accBankBca.id,
        accountId: accKasKecil.id,
        nominal: 200000,
        fee: 5000,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: now - 1000,
        status: 'ok',
        createdAt: now - 1000,
        updatedAt: now - 1000,
      });

      // Spy on getSummary to simulate unexpected failure after Dexie commit
      vi.spyOn(shiftService, 'getSummary').mockRejectedValueOnce(
        new Error('Simulated failure inside getSummary')
      );

      const balances = await accountService.getAllBalances();
      const hitungFisik: Record<string, number> = {
        [accKasKecil.id]: balances[accKasKecil.id] ?? 500000,
        [accKasBesar.id]: balances[accKasBesar.id] ?? 2000000,
        [accBankBri.id]: balances[accBankBri.id] ?? 3000000,
        [accBankBca.id]: balances[accBankBca.id] ?? 5000000,
      };

      // closeShift MUST resolve successfully despite getSummary failure
      const summary = await shiftService.closeShift({
        shiftId,
        hitungFisik,
        penjelasanSelisih: {},
        actorUserId: ownerUser.id,
      });

      expect(summary).toBeDefined();
      expect(summary.shiftId).toBe(shiftId);
      expect(summary.totalTransaksi).toBe(1);
      expect(summary.totalLaba).toBe(5000);

      const closed = await db.shifts.get(shiftId);
      expect(closed?.status).toBe('closed');
    });

    it('mount ShiftCloseView: jika closeShift menolak dengan Error("boom"), banner menampilkan pesan asli, BUKAN teks generik', async () => {
      const now = Date.now();
      const shiftId = 'shift-test-view-error';
      await db.shifts.add({
        id: shiftId,
        userId: ownerUser.id,
        openedAt: now - 3600000,
        saldoAwalSistem: {},
        kasAwalFisik: 500000,
        status: 'open',
      });

      // Mock closeShift rejection with an explicit Error
      vi.spyOn(shiftService, 'closeShift').mockRejectedValueOnce(new Error('boom'));

      await router.push('/shifts/close');
      await router.isReady();

      const wrapper = mount(ShiftCloseView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('form.close-form').exists()).toBe(true);
      });

      // Trigger submit
      await wrapper.find('form.close-form').trigger('submit.prevent');

      await waitFor(() => {
        expect(wrapper.find('.error-banner').exists()).toBe(true);
      });

      const bannerText = wrapper.find('.error-banner').text();
      expect(bannerText).toContain('boom');
      expect(bannerText).not.toContain('Gagal menutup shift. Periksa kembali penjelasan selisih.');
    });

    it('mount ShiftCloseView: jika closeShift gagal namun status shift di DB sudah closed, redirect ke /shifts dan tidak menampilkan error generik', async () => {
      const now = Date.now();
      const shiftId = 'shift-test-view-already-closed';
      await db.shifts.add({
        id: shiftId,
        userId: ownerUser.id,
        openedAt: now - 3600000,
        saldoAwalSistem: {},
        kasAwalFisik: 500000,
        status: 'open',
      });

      // Mock closeShift so it marks the shift closed in DB then throws
      vi.spyOn(shiftService, 'closeShift').mockImplementationOnce(async () => {
        await db.shifts.update(shiftId, { status: 'closed' });
        throw new Error('Network error after commit');
      });

      const replaceSpy = vi.spyOn(router, 'replace');

      await router.push('/shifts/close');
      await router.isReady();

      const wrapper = mount(ShiftCloseView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('form.close-form').exists()).toBe(true);
      });

      await wrapper.find('form.close-form').trigger('submit.prevent');

      await waitFor(() => {
        expect(replaceSpy).toHaveBeenCalledWith('/shifts');
      });
      const banner = wrapper.find('.error-banner');
      if (banner.exists()) {
        expect(banner.text()).not.toContain('Gagal menutup shift. Periksa kembali penjelasan selisih.');
      }
    });
  });
});
