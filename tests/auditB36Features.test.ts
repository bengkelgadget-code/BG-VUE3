import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'node:fs';
import path from 'node:path';
import router from '../src/router';
import { db } from '../src/db/database';
import { LAYANAN_DEFS } from '../src/core/layanan';
import { transactionService } from '../src/services/transactionService';
import { reportService } from '../src/services/reportService';
import { accountService } from '../src/services/accountService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import TransactionsView from '../src/views/TransactionsView.vue';
import { getTodayWitaString, parseWitaDateToEpoch } from '../src/utils/datePeriod';
import { waitFor } from './helpers/testUtils';
import type { User, Account } from '../src/db/types';

describe('Audit b36 Features: Paket Data Provider, Sticky Footer Keyboard, Filter Tanggal', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;
  let accKasKecil: Account;
  let accDigipos: Account;
  let accServerPulsa: Account;
  let accBankBri: Account;

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
    accDigipos = {
      id: 'acc-digipos',
      name: 'Digipos Telkomsel',
      type: 'provider_app',
      initialBalance: 1000000,
      isActive: true,
      icon: 'radio',
      color: 'red',
      createdAt: now,
      updatedAt: now,
    };
    accServerPulsa = {
      id: 'acc-server-pulsa',
      name: 'Server Pulsa Catatan',
      type: 'server_pulsa',
      initialBalance: 2000000,
      isActive: true,
      icon: 'server',
      color: 'purple',
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
    await db.accounts.bulkAdd([accKasKecil, accDigipos, accServerPulsa, accBankBri]);

    // Buka shift untuk kasir
    await db.shifts.add({
      id: 'shift-1',
      userId: kasirUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 500000,
      status: 'open',
    });

    const authStore = useAuthStore(pinia);
    authStore.currentUser = kasirUser;
    localStorage.setItem('buku_konter_active_user_id', kasirUser.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(kasirUser);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  // --------------------------------------------------------------------------
  // Bagian A: Paket Data via Provider App + Margin Manual
  // --------------------------------------------------------------------------
  describe('A.1 Registry Layanan (layanan.ts)', () => {
    it('A.4.1 def data: productCategories [], sourceTypes [server_pulsa, provider_app], needsReferenceNo false, hasMargin true', () => {
      const dataDef = LAYANAN_DEFS['data'];
      expect(dataDef).toBeDefined();
      expect(dataDef.productCategories).toEqual([]);
      expect(dataDef.productSort).toBe('none');
      expect(dataDef.needsReferenceNo).toBe(false);
      expect(dataDef.sourceTypes).toEqual(['server_pulsa', 'provider_app']);
      expect(dataDef.hasMargin).toBe(true);

      // Pastikan 17 layanan lainnya memiliki hasMargin === false
      const allCodes = Object.keys(LAYANAN_DEFS);
      expect(allCodes.length).toBe(18);
      for (const code of allCodes) {
        if (code !== 'data') {
          expect(LAYANAN_DEFS[code]?.hasMargin).toBe(false);
        }
      }

      // Regresi pulsa/token_pln/game: tidak berubah
      expect(LAYANAN_DEFS['pulsa'].sourceTypes).toEqual(['server_pulsa']);
      expect(LAYANAN_DEFS['pulsa'].productCategories).toEqual(['pulsa']);
      expect(LAYANAN_DEFS['pulsa'].needsReferenceNo).toBe(true);
      expect(LAYANAN_DEFS['token_pln'].sourceTypes).toEqual(['server_pulsa']);
      expect(LAYANAN_DEFS['game'].sourceTypes).toEqual(['server_pulsa']);
    });
  });

  describe('A.2 Service & Perhitungan Saldo/Laba (transactionService.ts & reportService.ts)', () => {
    it('A.4.2 jual data nominal 50.000 margin 5.000 sumber Digipos (provider_app) -> saldo Digipos -45.000, Kas +50.000, margin 5.000, laba laporan 5.000', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'data',
          nominal: 50000,
          margin: 5000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accDigipos.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Verifikasi record tersimpan
      const tx = await db.transactions.get(txId);
      expect(tx).toBeDefined();
      expect(tx?.nominal).toBe(50000);
      expect(tx?.margin).toBe(5000);

      // Verifikasi TIDAK ada baris transaction_items
      const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
      expect(items.length).toBe(0);

      // Saldo sumber (Digipos) berkurang modal = 50.000 - 5.000 = 45.000 -> 1.000.000 - 45.000 = 955.000
      const digiposBalance = await accountService.getBalance(accDigipos.id);
      expect(digiposBalance).toBe(1000000 - 45000);

      // Saldo pembayaran (Kas Kecil) bertambah 50.000 -> 500.000 + 50.000 = 550.000
      const kasBalance = await accountService.getBalance(accKasKecil.id);
      expect(kasBalance).toBe(500000 + 50000);

      // Laba di laporan bertambah 5.000
      const from = Date.now() - 3600000;
      const to = Date.now() + 3600000;
      const totalLaba = await reportService.totalLaba(from, to);
      expect(totalLaba).toBe(5000);

      const totalOut = await reportService.totalOut(from, to);
      expect(totalOut).toBe(45000);
    });

    it('A.4.2 sumber server_pulsa tetap bisa untuk data', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'data',
          nominal: 30000,
          margin: 3000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accServerPulsa.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );
      const tx = await db.transactions.get(txId);
      expect(tx?.margin).toBe(3000);

      const serverBalance = await accountService.getBalance(accServerPulsa.id);
      expect(serverBalance).toBe(2000000 - 27000);
    });

    it('A.4.2 validasi margin: > nominal ditolak, negatif ditolak, sumber non-provider/server ditolak', async () => {
      // Margin > nominal
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'data',
            nominal: 50000,
            margin: 60000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accDigipos.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Margin tidak boleh lebih besar dari nominal.');

      // Margin < 0
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'data',
            nominal: 50000,
            margin: -1000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accDigipos.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Margin tidak boleh negatif.');

      // Sumber bertipe bank ditolak
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'data',
            nominal: 50000,
            margin: 5000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accBankBri.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Sumber dana Paket Data hanya Server Pulsa atau Aplikasi Provider.');
    });

    it('A.4.4 Edit: ubah margin transaksi data 5.000 -> 7.000 merebalance saldo sumber dan laba laporan', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'data',
          nominal: 50000,
          margin: 5000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accDigipos.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Edit margin menjadi 7.000 (modal berkurang dari 45.000 menjadi 43.000)
      await transactionService.editTransaction(
        txId,
        { margin: 7000 },
        { actorUserId: ownerUser.id }
      );

      const tx = await db.transactions.get(txId);
      expect(tx?.margin).toBe(7000);

      // Saldo Digipos: modal baru 43.000 -> 1.000.000 - 43.000 = 957.000
      const digiposBalance = await accountService.getBalance(accDigipos.id);
      expect(digiposBalance).toBe(1000000 - 43000);

      // Laba laporan terupdate ke 7.000
      const from = Date.now() - 3600000;
      const to = Date.now() + 3600000;
      const totalLaba = await reportService.totalLaba(from, to);
      expect(totalLaba).toBe(7000);
    });

    it('A.4.5 Regresi: jual pulsa tetap wajib sumber server_pulsa saja; provider_app ditolak', async () => {
      // Jual pulsa dengan provider_app ditolak
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'pulsa',
            nominal: 25000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accDigipos.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Sumber dana Pulsa hanya Server Pulsa.');
    });
  });

  describe('A.3 Form & UI (AddTransactionView.vue & TransactionDetailView.vue)', () => {
    it('A.4.3 Form AddTransactionView: pilih data -> tidak ada No Tujuan & picker produk digital, ada field margin; submit berhasil', async () => {
      await router.push('/transactions/add');
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
        expect(wrapper.find('[data-testid="service-dropdown"]').exists()).toBe(true);
      });

      // Pilih layanan Paket Data
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-option-data"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="service-option-data"]').trigger('click');
      await flushPromises();

      // 1. Field No Tujuan tidak ada
      expect(wrapper.find('input[type="tel"]').exists()).toBe(false);
      // 2. Picker produk digital tidak ada
      expect(wrapper.find('[data-testid="select-digital-product"]').exists()).toBe(false);
      // 3. Field margin ada
      const marginInput = wrapper.find('[data-testid="input-margin"]');
      expect(marginInput.exists()).toBe(true);

      // Isi nominal 50.000 dan margin 5.000
      const moneyInputComp = wrapper.findComponent({ name: 'MoneyInput' });
      await moneyInputComp.vm.$emit('update:modelValue', 50000);
      await marginInput.setValue('5000');
      await flushPromises();

      // Footer simpan muncul
      const saveFooter = wrapper.find('[data-testid="sticky-footer-bar"]');
      expect(saveFooter.exists()).toBe(true);

      // Submit form
      const submitBtn = wrapper.find('.btn-submit-tx');
      expect(submitBtn.exists()).toBe(true);
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      // Verifikasi transaksi tersimpan
      await waitFor(async () => {
        const allTxs = await db.transactions.toArray();
        const dataTx = allTxs.find((t) => t.layanan === 'data');
        expect(dataTx).toBeDefined();
        expect(dataTx?.nominal).toBe(50000);
        expect(dataTx?.margin).toBe(5000);
      });
    });

    it('A.4.4 Detail & Edit TransactionDetailView: render detail transaksi data menampilkan Margin & Modal', async () => {
      const now = Date.now();
      const txId = await transactionService.addTransaction(
        {
          layanan: 'data',
          nominal: 50000,
          margin: 5000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accDigipos.id,
          paymentAccountId: accKasKecil.id,
          date: now,
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      const authStore = useAuthStore(pinia);
      authStore.currentUser = ownerUser;

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
        expect(wrapper.find('[data-testid="detail-margin-row"]').exists()).toBe(true);
      });

      expect(wrapper.find('[data-testid="detail-margin-row"]').text()).toContain('Rp 5.000');
      expect(wrapper.find('[data-testid="detail-modal-row"]').text()).toContain('Rp 45.000');

      // Buka dialog edit
      await wrapper.find('[data-testid="btn-edit-transaction"]').trigger('click');
      await waitFor(() => {
        expect(wrapper.find('[data-testid="edit-dialog"]').exists()).toBe(true);
      });

      // Field margin ada di dialog edit
      const editMarginInput = wrapper.find('[data-testid="edit-input-margin"]');
      expect(editMarginInput.exists()).toBe(true);
      expect((editMarginInput.element as HTMLInputElement).value).toBe('5000');

      // Ubah margin menjadi 8.000
      await editMarginInput.setValue('8000');
      await wrapper.find('[data-testid="btn-submit-edit"]').trigger('click');

      await waitFor(async () => {
        const updatedTx = await db.transactions.get(txId);
        expect(updatedTx?.margin).toBe(8000);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Bagian B: Popup Simpan Tidak Menutupi Field Aktif
  // --------------------------------------------------------------------------
  describe('B. Keyboard-Aware Sticky Footer & Auto-Scroll (AddTransactionView.vue)', () => {
    it('B.2.1 index.html mengandung interactive-widget=resizes-content', () => {
      const htmlPath = path.resolve(process.cwd(), 'index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      expect(htmlContent).toContain('interactive-widget=resizes-content');
      expect(htmlContent).toContain('viewport-fit=cover');
    });

    it('B.2.2 CSS .sticky-footer mengandung keyboard-inset-height dan ada aturan .keyboard-open', () => {
      const viewPath = path.resolve(process.cwd(), 'src/views/AddTransactionView.vue');
      const viewContent = fs.readFileSync(viewPath, 'utf8');
      expect(viewContent).toContain('keyboard-inset-height');
      expect(viewContent).toContain('.keyboard-open .sticky-footer');
      expect(viewContent).toContain('scroll-margin-bottom: 180px');
      expect(viewContent).toContain('padding-bottom: 200px');
    });

    it('B.2.3 Collision check: elemen bertabrakan dengan footer memanggil scrollIntoView; elemen terlihat tidak memanggil', async () => {
      await router.push('/transactions/add');
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
        expect(wrapper.find('[data-testid="service-dropdown"]').exists()).toBe(true);
      });

      // Set nominal agar footer muncul
      const moneyInputComp = wrapper.findComponent({ name: 'MoneyInput' });
      await moneyInputComp.vm.$emit('update:modelValue', 25000);
      await flushPromises();

      const footer = wrapper.find('[data-testid="sticky-footer-bar"]').element;
      vi.spyOn(footer, 'getBoundingClientRect').mockReturnValue({
        top: 600,
        bottom: 660,
        left: 0,
        right: 400,
        width: 400,
        height: 60,
        x: 0,
        y: 600,
        toJSON: () => {},
      });

      const noteInput = wrapper.find('input[type="tel"]'); // input tujuan/referensi
      if (noteInput.exists()) {
        const scrollSpy = vi.fn();
        noteInput.element.scrollIntoView = scrollSpy;

        // Kasus 1: Input bertabrakan dengan footer (bottom = 620 >= footer.top - 10 = 590)
        vi.spyOn(noteInput.element, 'getBoundingClientRect').mockReturnValue({
          top: 570,
          bottom: 620,
          left: 0,
          right: 400,
          width: 400,
          height: 50,
          x: 0,
          y: 570,
          toJSON: () => {},
        });

        await noteInput.trigger('focusin');
        await flushPromises();
        expect(scrollSpy).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });

        // Kasus 2: Input tidak bertabrakan (bottom = 400 < footer.top - 10 = 590)
        scrollSpy.mockClear();
        vi.spyOn(noteInput.element, 'getBoundingClientRect').mockReturnValue({
          top: 350,
          bottom: 400,
          left: 0,
          right: 400,
          width: 400,
          height: 50,
          x: 0,
          y: 350,
          toJSON: () => {},
        });

        await noteInput.trigger('focusin');
        await flushPromises();
        expect(scrollSpy).not.toHaveBeenCalled();
      }
    });

    it('B.2.4 Regresi: footer muncul hanya bila nominal > 0', async () => {
      await router.push('/transactions/add');
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
        expect(wrapper.find('[data-testid="service-dropdown"]').exists()).toBe(true);
      });

      // Awal buka: nominal 0 -> footer tidak ada
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(false);

      // Isi nominal -> footer muncul
      const moneyInputComp = wrapper.findComponent({ name: 'MoneyInput' });
      await moneyInputComp.vm.$emit('update:modelValue', 25000);
      await flushPromises();
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Bagian C: Filter Tanggal di Riwayat Transaksi (TransactionsView.vue)
  // --------------------------------------------------------------------------
  describe('C. Filter Tanggal di Riwayat Transaksi (TransactionsView.vue)', () => {
    let todayEpoch: number;
    let yesterdayEpoch: number;
    let lastWeekEpoch: number;
    let todayWitaStr: string;
    let yesterdayWitaStr: string;

    beforeEach(async () => {
      todayWitaStr = getTodayWitaString();
      todayEpoch = parseWitaDateToEpoch(todayWitaStr);

      const parts = todayWitaStr.split('-');
      const y = parseInt(parts[0] || '2026', 10);
      const m = parseInt(parts[1] || '1', 10);
      const d = parseInt(parts[2] || '1', 10);

      const yesterdayDate = new Date(Date.UTC(y, m - 1, d - 1));
      yesterdayWitaStr = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getUTCDate()).padStart(2, '0')}`;
      yesterdayEpoch = parseWitaDateToEpoch(yesterdayWitaStr);
      lastWeekEpoch = todayEpoch - 7 * 86400 * 1000;

      // Seed 3 transaksi: hari ini (pulsa & data), kemarin (transfer), minggu lalu (operasional)
      await db.transactions.bulkAdd([
        {
          id: 'tx-today-pulsa',
          layanan: 'pulsa',
          nominal: 20000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: todayEpoch,
          shiftId: 'shift-1',
          userId: kasirUser.id,
          status: 'ok',
          createdAt: todayEpoch,
          updatedAt: todayEpoch,
        },
        {
          id: 'tx-today-data',
          layanan: 'data',
          nominal: 50000,
          margin: 5000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: todayEpoch,
          shiftId: 'shift-1',
          userId: kasirUser.id,
          status: 'ok',
          createdAt: todayEpoch,
          updatedAt: todayEpoch,
        },
        {
          id: 'tx-yesterday-tf',
          layanan: 'transfer',
          nominal: 100000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: yesterdayEpoch,
          shiftId: 'shift-1',
          userId: kasirUser.id,
          status: 'ok',
          createdAt: yesterdayEpoch,
          updatedAt: yesterdayEpoch,
        },
        {
          id: 'tx-lastweek-op',
          layanan: 'operasional',
          nominal: 15000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: lastWeekEpoch,
          shiftId: 'shift-1',
          userId: kasirUser.id,
          status: 'ok',
          createdAt: lastWeekEpoch,
          updatedAt: lastWeekEpoch,
        },
      ]);
    });

    it('C.2.1 Default: buka riwayat -> filter default hari ini, hanya transaksi hari ini yang tampil', async () => {
      await router.push('/transactions');
      await router.isReady();

      const wrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="filter-date-input"]').exists()).toBe(true);
      });

      const dateInput = wrapper.find<HTMLInputElement>('[data-testid="filter-date-input"]');
      expect(dateInput.element.value).toBe(todayWitaStr);

      // Hanya 2 transaksi hari ini yang muncul (tx-today-pulsa & tx-today-data)
      const txCards = wrapper.findAll('.tx-card');
      expect(txCards.length).toBe(2);
      expect(wrapper.text()).toContain('PULSA');
      expect(wrapper.text()).toContain('DATA');
      expect(wrapper.text()).not.toContain('TRANSFER');
      expect(wrapper.text()).not.toContain('OPERASIONAL');
    });

    it('C.2.2 Pilih tanggal kemarin -> hanya transaksi kemarin yang tampil', async () => {
      await router.push('/transactions');
      await router.isReady();

      const wrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="filter-date-input"]').exists()).toBe(true);
      });

      const dateInput = wrapper.find<HTMLInputElement>('[data-testid="filter-date-input"]');
      await dateInput.setValue(yesterdayWitaStr);
      await flushPromises();

      const txCards = wrapper.findAll('.tx-card');
      expect(txCards.length).toBe(1);
      expect(wrapper.text()).toContain('TRANSFER');
      expect(wrapper.text()).not.toContain('PULSA');
    });

    it('C.2.3 Klik "Semua" -> filter tanggal dimatikan, semua 4 transaksi tampil', async () => {
      await router.push('/transactions');
      await router.isReady();

      const wrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="filter-date-all"]').exists()).toBe(true);
      });

      // Klik tombol chip "Semua" pada filter tanggal
      await wrapper.find('[data-testid="filter-date-all"]').trigger('click');
      await flushPromises();

      const dateInput = wrapper.find<HTMLInputElement>('[data-testid="filter-date-input"]');
      expect(dateInput.element.value).toBe('');

      const txCards = wrapper.findAll('.tx-card');
      expect(txCards.length).toBe(4);
    });

    it('C.2.4 Kombinasi: filter tanggal hari ini + filter layanan pulsa -> hanya transaksi pulsa hari ini', async () => {
      await router.push('/transactions');
      await router.isReady();

      const wrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="filter-date-input"]').exists()).toBe(true);
      });

      // Filter spesifik layanan pulsa
      const selectComp = wrapper.findComponent({ name: 'SearchableSelect' });
      await selectComp.vm.$emit('update:modelValue', 'pulsa');
      await flushPromises();

      const txCards = wrapper.findAll('.tx-card');
      expect(txCards.length).toBe(1);
      expect(wrapper.text()).toContain('PULSA');
      expect(wrapper.text()).not.toContain('PAKET DATA');
    });

    it('C.2.5 Empty state: tanggal tanpa transaksi menampilkan pesan "Tidak ada transaksi pada {tanggal}."', async () => {
      await router.push('/transactions');
      await router.isReady();

      const wrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="filter-date-input"]').exists()).toBe(true);
      });

      // Pilih tanggal kosong (misal tahun 2025)
      const dateInput = wrapper.find<HTMLInputElement>('[data-testid="filter-date-input"]');
      await dateInput.setValue('2025-01-01');
      await flushPromises();

      expect(wrapper.findAll('.tx-card').length).toBe(0);
      expect(wrapper.text()).toContain('Tidak ada transaksi pada 2025-01-01.');
    });
  });
});
