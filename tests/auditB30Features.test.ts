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
import AddTransactionView from '../src/views/AddTransactionView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import { waitFor } from './helpers/testUtils';
import type { User, Account } from '../src/db/types';

describe('Audit b30 Features: Aturan Akun Tarik Tunai & Form Styling', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;

  let kasKecil: Account;
  let kasBesar: Account;
  let bankBca: Account;
  let danaEwallet: Account;
  let gopayEwallet: Account;

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
    const dId = await accountService.addAccount({
      name: 'DANA E-Wallet',
      type: 'ewallet',
      initialBalance: 1500000,
    });
    const gId = await accountService.addAccount({
      name: 'GoPay E-Wallet',
      type: 'ewallet',
      initialBalance: 500000,
    });

    kasKecil = (await db.accounts.get(k1Id))!;
    kasBesar = (await db.accounts.get(k2Id))!;
    bankBca = (await db.accounts.get(bId))!;
    danaEwallet = (await db.accounts.get(dId))!;
    gopayEwallet = (await db.accounts.get(gId))!;

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

  describe('A.4 Aturan Akun Tarik Tunai', () => {
    it('A.4.1 Picker sumber tarik tunai di form baru tidak menampilkan ewallet dan menampilkan placeholder khusus', async () => {
      setLoggedInUser(kasirUser);
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: {
            AppScaffold: { template: '<div><slot /></div>' },
            MoneyInput: { template: '<input class="money-input-stub" />' },
            FeeBadge: true,
          },
        },
      });

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-dropdown-trigger"]').exists()).toBe(true);
      });

      // Buka dropdown combobox layanan dan pilih tarik_tunai
      await wrapper.find('[data-testid="service-dropdown-trigger"]').trigger('click');
      await flushPromises();

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-option-tarik_tunai"]').exists()).toBe(true);
      });

      await wrapper.find('[data-testid="service-option-tarik_tunai"]').trigger('click');
      await flushPromises();

      // Cari select rekening konter penerima transfer
      const selectSource = wrapper.find('.cascading-fields select.form-select');
      expect(selectSource.exists()).toBe(true);

      const options = selectSource.findAll('option');
      const optionTexts = options.map((o) => o.text());
      const optionValues = options.map((o) => (o.element as HTMLOptionElement).value);

      // Placeholder khusus tarik tunai
      expect(optionTexts[0]).toContain('-- Pilih Kas / Rekening Bank --');

      // Memuat kas dan bank
      expect(optionValues).toContain(kasKecil.id);
      expect(optionValues).toContain(kasBesar.id);
      expect(optionValues).toContain(bankBca.id);

      // TIDAK memuat ewallet
      expect(optionValues).not.toContain(danaEwallet.id);
      expect(optionValues).not.toContain(gopayEwallet.id);

      // Preselected value tidak boleh ewallet
      const selectedVal = (selectSource.element as HTMLSelectElement).value;
      expect(selectedVal).not.toBe(danaEwallet.id);
      expect(selectedVal).not.toBe(gopayEwallet.id);

      wrapper.unmount();
      await flushPromises();
    });

    it('A.4.2 Dropdown edit: sumber tarik tunai = kas + bank (tanpa ewallet); Diterima Di tarik tunai = bank + kas', async () => {
      // Buat transaksi tarik tunai setup
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 1000000,
          fee: 7000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

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

      // 1. Sumber Dana: Kas + Bank (tanpa ewallet)
      const sourceSelect = wrapper.find('[data-testid="edit-select-source-account"]');
      expect(sourceSelect.exists()).toBe(true);
      const sourceOptions = sourceSelect.findAll('option').map((o) => (o.element as HTMLOptionElement).value);
      expect(sourceOptions).toContain(kasKecil.id);
      expect(sourceOptions).toContain(kasBesar.id);
      expect(sourceOptions).toContain(bankBca.id);
      expect(sourceOptions).not.toContain(danaEwallet.id);
      expect(sourceOptions).not.toContain(gopayEwallet.id);

      // 2. Diterima Di: Bank + Kas (tanpa ewallet)
      const paymentSelect = wrapper.find('[data-testid="edit-select-payment-account"]');
      expect(paymentSelect.exists()).toBe(true);
      const paymentOptions = paymentSelect.findAll('option').map((o) => (o.element as HTMLOptionElement).value);
      expect(paymentOptions).toContain(bankBca.id);
      expect(paymentOptions).toContain(kasKecil.id);
      expect(paymentOptions).toContain(kasBesar.id);
      expect(paymentOptions).not.toContain(danaEwallet.id);
      expect(paymentOptions).not.toContain(gopayEwallet.id);

      wrapper.unmount();
      await flushPromises();
    });

    it('A.4.3 addTransaction tarik tunai dengan source ewallet DITOLAK dengan pesan validasi', async () => {
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
            sourceAccountId: danaEwallet.id, // E-Wallet tidak diizinkan untuk Tarik Tunai
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
        )
      ).rejects.toThrow('Sumber dana Tarik Tunai hanya Kas atau Rekening Bank.');
    });

    it('A.4.4 editTransaction tarik tunai dengan payment ewallet DITOLAK dengan pesan validasi', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 500000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      // Coba ubah Diterima Di menjadi ewallet -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          {
            paymentAccountId: danaEwallet.id,
          },
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Diterima Di Tarik Tunai hanya Kas atau Rekening Bank.');

      // Coba ubah Sumber Dana menjadi ewallet -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          {
            sourceAccountId: danaEwallet.id,
          },
          { actorUserId: ownerUser.id }
        )
      ).rejects.toThrow('Sumber dana Tarik Tunai hanya Kas atau Rekening Bank.');
    });

    it('A.4.5 Tarik tunai source = bank + payment = kas tetap menghasilkan delta yang benar', async () => {
      // bankBca awal: 10.000.000
      // kas (kasKecil: 2jt, kasBesar: 5jt)
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 1000000,
          fee: 7000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: bankBca.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );

      const tx = (await db.transactions.get(txId))!;
      expect(tx.sourceAccountId).toBe(bankBca.id);
      expect([kasKecil.id, kasBesar.id]).toContain(tx.accountId);

      // Saldo Bank BCA bertambah 1.000.000 (transfer masuk dari nasabah) -> 11.000.000
      expect(await accountService.getBalance(bankBca.id)).toBe(11000000);

      // Saldo Kas yang bertugas menyerahkan uang berkurang 993.000 (1.000.000 - 7.000)
      const initialKasBalance = tx.accountId === kasKecil.id ? 2000000 : 5000000;
      expect(await accountService.getBalance(tx.accountId!)).toBe(initialKasBalance - 993000);
    });

    it('A.4.6 Layanan lain TIDAK berubah: sumber transfer / topup_ewallet / ppob tetap boleh ewallet', async () => {
      // 1. Topup E-Wallet dengan sumber dana E-Wallet
      const txTopup = await transactionService.addTransaction(
        {
          layanan: 'topup_ewallet',
          nominal: 100000,
          fee: 2500,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: danaEwallet.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );
      expect(txTopup).toBeDefined();

      // 2. Transfer dengan sumber dana E-Wallet
      const txTransfer = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          nominal: 200000,
          fee: 6500,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: danaEwallet.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );
      expect(txTransfer).toBeDefined();

      // 3. PPOB dengan sumber dana E-Wallet
      const txPpob = await transactionService.addTransaction(
        {
          layanan: 'ppob',
          nominal: 50000,
          fee: 2500,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: danaEwallet.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-test-1' }
      );
      expect(txPpob).toBeDefined();

      // 4. Edit transaksi transfer untuk mengubah sumber dana ke GoPay (ewallet) -> BERHASIL
      await expect(
        transactionService.editTransaction(
          txTransfer,
          {
            sourceAccountId: gopayEwallet.id,
          },
          { actorUserId: ownerUser.id }
        )
      ).resolves.toBeUndefined();
    });
  });
});
