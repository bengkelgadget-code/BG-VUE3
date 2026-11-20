import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { transactionService } from '../src/services/transactionService';
import { accountService } from '../src/services/accountService';
import { reportService } from '../src/services/reportService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import TransactionsView from '../src/views/TransactionsView.vue';
import { waitFor } from './helpers/testUtils';
import type { User, Account } from '../src/db/types';

describe('Audit b31 Features: Dropdown Diterima Di Manual & Jasa Transfer', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;

  let kasKecil: Account;
  let kasBesar: Account;
  let bankBca: Account;
  let bankMandiri: Account;
  let serverPulsa: Account;
  let danaEwallet: Account;

  function setLoggedInUser(user: User) {
    const authStore = useAuthStore(pinia);
    authStore.currentUser = user;
    localStorage.setItem('buku_konter_active_user_id', user.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
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
    const pinKasirHash = await authService.hashPin('123456');

    ownerUser = {
      id: 'user-owner',
      name: 'Owner Budi',
      role: 'owner',
      pinHash: pinOwnerHash,
      isActive: true,
      createdAt: now,
    };
    kasirUser = {
      id: 'user-kasir',
      name: 'Fitra Kasir',
      role: 'kasir',
      pinHash: pinKasirHash,
      isActive: true,
      createdAt: now,
    };

    await db.users.bulkAdd([ownerUser, kasirUser]);

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
    const bId = await accountService.addAccount({
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 10000000,
    });
    const mId = await accountService.addAccount({
      name: 'Rekening Mandiri',
      type: 'bank',
      initialBalance: 8000000,
    });
    const sId = await accountService.addAccount({
      name: 'Server Digipos',
      type: 'server_pulsa',
      initialBalance: 3000000,
    });
    const dId = await accountService.addAccount({
      name: 'DANA E-Wallet',
      type: 'ewallet',
      initialBalance: 1500000,
    });

    kasKecil = (await db.accounts.get(k1Id))!;
    kasBesar = (await db.accounts.get(k2Id))!;
    bankBca = (await db.accounts.get(bId))!;
    bankMandiri = (await db.accounts.get(mId))!;
    serverPulsa = (await db.accounts.get(sId))!;
    danaEwallet = (await db.accounts.get(dId))!;

    await db.shifts.add({
      id: 'shift-test-1',
      userId: kasirUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 500000,
      status: 'open',
    });

    setLoggedInUser(kasirUser);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
    vi.restoreAllMocks();
  });

  describe('C.1 Dropdown form baru', () => {
    it('C.1 default = Kas Kecil; opsi transfer = kas saja; opsi pulsa = kas + QR Mandiri; ganti pulsa -> transfer mereset ke Kas Kecil', async () => {
      setLoggedInUser(kasirUser);
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
            FeeBadge: true,
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="select-payment-account"]').exists()).toBe(true);
      });

      const paymentSelect = wrapper.find('[data-testid="select-payment-account"]');

      // 1. Default awal untuk Transfer adalah Kas Kecil
      await waitFor(() => {
        expect((paymentSelect.element as HTMLSelectElement).value).toBe(kasKecil.id);
      });

      // 2. Opsi untuk transfer: hanya akun kas (tanpa Mandiri, BCA, atau E-Wallet)
      let options = paymentSelect.findAll('option');
      let optionValues = options.map((o) => (o.element as HTMLOptionElement).value);
      expect(optionValues).toContain(kasKecil.id);
      expect(optionValues).toContain(kasBesar.id);
      expect(optionValues).not.toContain(bankMandiri.id);
      expect(optionValues).not.toContain(bankBca.id);
      expect(optionValues).not.toContain(danaEwallet.id);

      // 3. Ganti layanan ke pulsa
      await wrapper.find('[data-testid="service-dropdown-trigger"]').trigger('click');
      await flushPromises();
      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-option-pulsa"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="service-option-pulsa"]').trigger('click');
      await flushPromises();

      // Opsi untuk pulsa: kas + QR Mandiri (label mengandung "QR Mandiri")
      options = paymentSelect.findAll('option');
      optionValues = options.map((o) => (o.element as HTMLOptionElement).value);
      expect(optionValues).toContain(kasKecil.id);
      expect(optionValues).toContain(kasBesar.id);
      expect(optionValues).toContain(bankMandiri.id);
      expect(optionValues).not.toContain(bankBca.id);

      const mandiriOption = options.find((o) => (o.element as HTMLOptionElement).value === bankMandiri.id);
      expect(mandiriOption?.text()).toContain('QR Mandiri');

      // 4. Pilih QR Mandiri sebagai payment account
      await paymentSelect.setValue(bankMandiri.id);
      expect((paymentSelect.element as HTMLSelectElement).value).toBe(bankMandiri.id);

      // 5. Ganti kembali layanan ke transfer -> otomatis reset ke Kas Kecil
      await wrapper.find('[data-testid="service-dropdown-trigger"]').trigger('click');
      await flushPromises();
      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-option-transfer"]').exists()).toBe(true);
      });
      await wrapper.find('[data-testid="service-option-transfer"]').trigger('click');
      await flushPromises();

      expect((paymentSelect.element as HTMLSelectElement).value).toBe(kasKecil.id);

      wrapper.unmount();
      await flushPromises();
    });
  });

  describe('C.2 Service: Validasi dan Penurunan paymentAccountId', () => {
    it('C.2.1 paymentAccountId eksplisit dihormati (transfer dengan payment = Kas Besar -> ledger masuk Kas Besar)', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          nominal: 100000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          paymentAccountId: kasBesar.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      const besarLedger = ledgers.find((l) => l.accountId === kasBesar.id);
      const kecilLedger = ledgers.find((l) => l.accountId === kasKecil.id);

      expect(besarLedger).toBeDefined();
      expect(besarLedger?.delta).toBe(105000); // 100.000 nominal + 5.000 fee
      expect(kecilLedger).toBeUndefined(); // Kas Kecil tidak tersentuh
    });

    it('C.2.2 transfer dengan payment = Mandiri DITOLAK', async () => {
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'transfer',
            nominal: 100000,
            fee: 5000,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: bankBca.id,
            paymentAccountId: bankMandiri.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
        )
      ).rejects.toThrow('Diterima Di Transfer hanya Kas Kecil atau Kas Besar.');
    });

    it('C.2.3 pulsa dengan payment = bank lain (BCA) DITOLAK; dengan payment = Mandiri DITERIMA', async () => {
      // 1. Pulsa dengan BCA ditolak
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
            sourceAccountId: serverPulsa.id,
            paymentAccountId: bankBca.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
        )
      ).rejects.toThrow('Diterima Di hanya Kas atau QR Mandiri (Rekening Mandiri).');

      // 2. Pulsa dengan Mandiri diterima
      const mandiriBefore = await accountService.getBalance(bankMandiri.id);
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pulsa',
          nominal: 25000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: serverPulsa.id,
          paymentAccountId: bankMandiri.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      const mandiriAfter = await accountService.getBalance(bankMandiri.id);
      expect(mandiriAfter - mandiriBefore).toBe(25000);

      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      const mandiriLedger = ledgers.find((l) => l.accountId === bankMandiri.id);
      expect(mandiriLedger?.delta).toBe(25000);
    });

    it('C.2.4 bila paymentAccountId tidak dikirim, penurunan lama tetap jalan (Cash -> Kas pertama; Debit -> source)', async () => {
      // Cash -> Kas pertama (Kas Kecil / Kas Besar berdasarkan sort)
      const txCashId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          nominal: 50000,
          fee: 3000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );
      const txCash = (await db.transactions.get(txCashId))!;
      const kasAccount = await db.accounts.where('type').equals('kas').first();
      expect(txCash.accountId).toBe(kasAccount?.id);

      // Debit -> sourceAccountId (Bank BCA)
      const txDebitId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          nominal: 50000,
          fee: 3000,
          feePaidBy: 'debit_rekening',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );
      const txDebit = (await db.transactions.get(txDebitId))!;
      expect(txDebit.accountId).toBe(bankBca.id);
    });
  });

  describe('C.3 Regresi b29: field lama accountId tetap diabaikan', () => {
    it('C.3 kasir tarik_tunai + accountId + tanpa akun Kas tetap DITOLAK (bukan lolos ke accountId)', async () => {
      // Hapus seluruh akun kas
      await db.accounts.where('type').equals('kas').delete();

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
            accountId: bankBca.id, // Field lama - harus diabaikan!
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
        )
      ).rejects.toThrow('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');
    });
  });

  describe('C.4 Layanan Jasa Transfer', () => {
    it('C.4.1 addTransaction berhasil TANPA akun, saldo tidak berubah, tanpa ledger, fee tercatat, void aman, laba tidak berubah', async () => {
      const accountsBefore = await db.accounts.toArray();
      const balancesBefore: Record<string, number> = {};
      for (const a of accountsBefore) {
        balancesBefore[a.id] = await accountService.getBalance(a.id);
      }

      const txId = await transactionService.addTransaction(
        {
          layanan: 'jasa_transfer',
          nominal: 1000000,
          fee: 15000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          referenceNo: 'BCA 123456 a.n. Joni',
          note: 'Transfer lewat EDC nasabah',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      const tx = (await db.transactions.get(txId))!;
      expect(tx).toBeDefined();
      expect(tx.layanan).toBe('jasa_transfer');
      expect(tx.nominal).toBe(1000000);
      expect(tx.fee).toBe(15000);
      expect(tx.referenceNo).toBe('BCA 123456 a.n. Joni');
      expect(tx.sourceAccountId).toBeUndefined();
      expect(tx.accountId).toBeUndefined();

      // Tidak ada baris ledger sama sekali
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      expect(ledgers.length).toBe(0);

      // Seluruh saldo akun sama persis sebelum dan sesudah
      for (const a of accountsBefore) {
        const balAfter = await accountService.getBalance(a.id);
        expect(balAfter).toBe(balancesBefore[a.id]);
      }

      // Laporan totalLaba, totalIn, totalOut tidak menghitung uang jasa_transfer
      const now = Date.now();
      const laba = await reportService.totalLaba(now - 86400000, now + 86400000);
      const totalIn = await reportService.totalIn(now - 86400000, now + 86400000);
      const totalOut = await reportService.totalOut(now - 86400000, now + 86400000);
      expect(laba).toBe(0);
      expect(totalIn).toBe(0);
      expect(totalOut).toBe(0);

      // Void transaksi jasa_transfer
      await transactionService.voidTransaction(txId, {
        reason: 'Salah pencatatan',
        actorUserId: ownerUser.id,
        pin: '111111',
      });

      const txVoid = (await db.transactions.get(txId))!;
      expect(txVoid.status).toBe('void');

      // Saldo tetap sama setelah void
      for (const a of accountsBefore) {
        const balAfterVoid = await accountService.getBalance(a.id);
        expect(balAfterVoid).toBe(balancesBefore[a.id]);
      }
    });
  });

  describe('C.5 Form Edit: Opsi Diterima Di per layanan & Pemindahan Saldo', () => {
    it('C.5.1 opsi Diterima Di per layanan di form edit & edit pulsa dari Kas Kecil ke Mandiri berhasil memindahkan saldo', async () => {
      // Buat transaksi pulsa dengan payment = Kas Kecil
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pulsa',
          nominal: 50000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: serverPulsa.id,
          paymentAccountId: kasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      const kasKecilBefore = await accountService.getBalance(kasKecil.id);
      const mandiriBefore = await accountService.getBalance(bankMandiri.id);

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

      await wrapper.find('[data-testid="btn-edit-transaction"]').trigger('click');

      await waitFor(() => {
        expect(wrapper.find('[data-testid="edit-dialog"]').exists()).toBe(true);
      });

      // Periksa opsi Diterima Di untuk pulsa: kas + Mandiri (tanpa BCA)
      const paymentSelect = wrapper.find('[data-testid="edit-select-payment-account"]');
      expect(paymentSelect.exists()).toBe(true);

      const options = paymentSelect.findAll('option');
      const optionValues = options.map((o) => (o.element as HTMLOptionElement).value);
      expect(optionValues).toContain(kasKecil.id);
      expect(optionValues).toContain(kasBesar.id);
      expect(optionValues).toContain(bankMandiri.id);
      expect(optionValues).not.toContain(bankBca.id);

      // Ubah paymentAccountId ke bankMandiri
      await paymentSelect.setValue(bankMandiri.id);
      await wrapper.find('[data-testid="btn-submit-edit"]').trigger('click');
      await flushPromises();

      await waitFor(() => {
        expect(wrapper.find('[data-testid="edit-dialog"]').exists()).toBe(false);
      });

      // Verifikasi di DB transaksi sudah terupdate
      const updatedTx = (await db.transactions.get(txId))!;
      expect(updatedTx.accountId).toBe(bankMandiri.id);

      // Verifikasi saldo berpindah: Kas Kecil berkurang 50.000, Mandiri bertambah 50.000
      const kasKecilAfter = await accountService.getBalance(kasKecil.id);
      const mandiriAfter = await accountService.getBalance(bankMandiri.id);

      expect(kasKecilAfter).toBe(kasKecilBefore - 50000);
      expect(mandiriAfter).toBe(mandiriBefore + 50000);

      wrapper.unmount();
      await flushPromises();
    });
  });

  describe('C.6 Jasa Transfer di UI', () => {
    it('C.6.1 Opsi muncul di picker layanan form baru, tanpa dropdown akun & toggle hutang; muncul di filter TransactionsView', async () => {
      setLoggedInUser(kasirUser);
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
            FeeBadge: true,
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-dropdown-trigger"]').exists()).toBe(true);
      });

      // Pilih jasa_transfer
      await wrapper.find('[data-testid="service-dropdown-trigger"]').trigger('click');
      await flushPromises();

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-option-jasa_transfer"]').exists()).toBe(true);
      });

      await wrapper.find('[data-testid="service-option-jasa_transfer"]').trigger('click');
      await flushPromises();

      // Form Jasa Transfer:
      // 1. Dropdown Diterima Di TIDAK tampil
      expect(wrapper.find('[data-testid="select-payment-account"]').exists()).toBe(false);

      // 2. Dropdown Sumber Dana TIDAK tampil
      expect(wrapper.find('.cascading-fields select').exists()).toBe(false);

      // 3. Toggle Hutang TIDAK tampil
      expect(wrapper.find('.status-toggle').exists()).toBe(false);

      // 4. Input Nama Bank & No Rekening Tujuan tampil
      const refInput = wrapper.find('.cascading-fields input.form-input');
      expect(refInput.exists()).toBe(true);

      // 5. Toggle Bayar Admin Cash/Debit di MoneyInput tidak tampil
      expect(wrapper.find('.method-col').exists()).toBe(false);

      wrapper.unmount();
      await flushPromises();

      // Cek filter di TransactionsView
      await router.push('/transactions');
      await router.isReady();

      const txWrapper = mount(TransactionsView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
            EmptyState: true,
          },
        },
      });

      await waitFor(() => {
        expect(txWrapper.find('#filter-select').exists()).toBe(true);
      });

      const filterSelect = txWrapper.find('#filter-select');
      const optGroup = filterSelect.findAll('optgroup').find((g) => g.attributes('label') === 'Transfer & Top-up');
      expect(optGroup).toBeDefined();

      const optionValues = optGroup!.findAll('option').map((o) => (o.element as HTMLOptionElement).value);
      expect(optionValues).toContain('jasa_transfer');

      txWrapper.unmount();
      await flushPromises();
    });
  });
});
