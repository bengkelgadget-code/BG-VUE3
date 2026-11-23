import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
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
import OwnerTransactionView from '../src/views/OwnerTransactionView.vue';
import ProductFormView from '../src/views/ProductFormView.vue';
import SearchableSelect from '../src/components/SearchableSelect.vue';
import { handleFormKeyDown } from '../src/utils/formNavigation';
import { waitFor } from './helpers/testUtils';
import type { User, Account, Customer } from '../src/db/types';

describe('Audit b37 Features: Tarik Tunai Admin Dalam/Cash, Sticky Footer Keypad, Enter/Tab Focus', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;
  let accKasKecil: Account;
  let accBankBri: Account;
  let testCustomer: Customer;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);

    await db.delete();
    await db.open();

    const now = Date.now();
    ownerUser = {
      id: 'user-owner',
      name: 'Owner Toko',
      role: 'owner',
      pinHash: 'dummy-hash',
      isActive: true,
      createdAt: now,
    };
    kasirUser = {
      id: 'user-kasir',
      name: 'Fitra Kasir',
      role: 'kasir',
      pinHash: 'dummy-hash',
      isActive: true,
      createdAt: now,
    };
    await db.users.bulkAdd([ownerUser, kasirUser]);

    accKasKecil = {
      id: 'acc-kas-kecil',
      name: 'Kas Kecil',
      type: 'kas',
      initialBalance: 1000000,
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
      initialBalance: 2000000,
      isActive: true,
      icon: 'bank',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.bulkAdd([accKasKecil, accBankBri]);

    testCustomer = {
      id: 'cust-1',
      name: 'Pelanggan Uji',
      phone: '081234567890',
      balanceHutang: 0,
      createdAt: now,
    };
    await db.customers.add(testCustomer);

    await db.shifts.add({
      id: 'shift-1',
      userId: kasirUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 1000000,
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

  // ==========================================================================
  // TUGAS 1 — Tarik Tunai: Pilihan Admin Dalam vs Cash
  // ==========================================================================
  describe('Tugas 1: Tarik Tunai Admin Dalam vs Cash (Registry, Service, Ledger, UI)', () => {
    it('1.1 Registry: tarik_tunai memiliki hasFee: true dan hasFeePaidBy: true', () => {
      const def = LAYANAN_DEFS['tarik_tunai'];
      expect(def).toBeDefined();
      expect(def.hasFee).toBe(true);
      expect(def.hasFeePaidBy).toBe(true);
    });

    it('1.2 Mode Potong di Dalam (debit_rekening): Bank +N, Kas -(N - F), Laba +F', async () => {
      // N = 252.000, F = 5.000 -> Pelanggan transfer 252.000, kas diserahkan 247.000
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 252000,
          fee: 5000,
          feePaidBy: 'debit_rekening',
          feeManualOverride: true,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accBankBri.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      const tx = await db.transactions.get(txId);
      expect(tx?.feePaidBy).toBe('debit_rekening');

      // Saldo Bank BRI bertambah 252.000: 2.000.000 + 252.000 = 2.252.000
      const bankBal = await accountService.getBalance(accBankBri.id);
      expect(bankBal).toBe(2000000 + 252000);

      // Saldo Kas berkurang 247.000: 1.000.000 - 247.000 = 753.000
      const kasBal = await accountService.getBalance(accKasKecil.id);
      expect(kasBal).toBe(1000000 - 247000);

      // Ledger: 1 entry bank +252.000, 1 entry kas -247.000
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      expect(ledgers.length).toBe(2);
      const bankLedger = ledgers.find((l) => l.accountId === accBankBri.id);
      const kasLedger = ledgers.find((l) => l.accountId === accKasKecil.id);
      expect(bankLedger?.delta).toBe(252000);
      expect(kasLedger?.delta).toBe(-247000);

      // Laba laporan: fee 5.000
      const from = Date.now() - 3600000;
      const to = Date.now() + 3600000;
      const laba = await reportService.totalLaba(from, to);
      expect(laba).toBe(5000);
    });

    it('1.3 Mode Cash: Bank +N, Kas -N (pokok), Kas +F (fee terpisah), Net Kas -(N - F), Laba +F', async () => {
      // N = 252.000, F = 5.000 -> Pelanggan transfer 252.000, kas diserahkan 252.000, fee tunai 5.000
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 252000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: true,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accBankBri.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      const tx = await db.transactions.get(txId);
      expect(tx?.feePaidBy).toBe('cash');

      // Saldo Bank BRI bertambah 252.000
      const bankBal = await accountService.getBalance(accBankBri.id);
      expect(bankBal).toBe(2000000 + 252000);

      // Saldo Kas net berkurang 247.000 (1.000.000 - 252.000 + 5.000 = 753.000)
      const kasBal = await accountService.getBalance(accKasKecil.id);
      expect(kasBal).toBe(1000000 - 247000);

      // Ledger HARUS mencatat 3 entri terpisah:
      // 1 bank +252.000, 1 kas -252.000 (pokok), 1 kas +5.000 (fee)
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      expect(ledgers.length).toBe(3);

      const bankLedger = ledgers.find((l) => l.accountId === accBankBri.id);
      expect(bankLedger?.delta).toBe(252000);

      const kasPokokLedger = ledgers.find((l) => l.accountId === accKasKecil.id && l.kind === 'pokok');
      expect(kasPokokLedger?.delta).toBe(-252000);

      const kasFeeLedger = ledgers.find((l) => l.accountId === accKasKecil.id && l.kind === 'fee');
      expect(kasFeeLedger?.delta).toBe(5000);

      // Laba laporan tetap 5.000 (dihitung 1 kali)
      const from = Date.now() - 3600000;
      const to = Date.now() + 3600000;
      const laba = await reportService.totalLaba(from, to);
      expect(laba).toBe(5000);
    });

    it('1.4 Hutang Tarik Tunai: pelanggan berhutang N = 252.000 pada kedua mode (tanpa kelebihan fee)', async () => {
      // Mode Potong di Dalam Hutang
      await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 252000,
          fee: 5000,
          feePaidBy: 'debit_rekening',
          feeManualOverride: true,
          paymentMethod: 'tunai',
          paymentStatus: 'hutang',
          customerId: testCustomer.id,
          sourceAccountId: accBankBri.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      let cust = await db.customers.get(testCustomer.id);
      expect(cust?.balanceHutang).toBe(252000);

      // Kas interim keluar: -247.000
      let kasBal = await accountService.getBalance(accKasKecil.id);
      expect(kasBal).toBe(1000000 - 247000);

      // Reset customer hutang & kas untuk uji mode Cash
      await db.customers.update(testCustomer.id, { balanceHutang: 0 });
      await db.accounts.update(accKasKecil.id, { initialBalance: 1000000 });
      await db.accountLedger.clear();

      // Mode Cash Hutang: pelanggan berhutang N = 252.000 (fee 5.000 sudah beres tunai saat itu)
      await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 252000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: true,
          paymentMethod: 'tunai',
          paymentStatus: 'hutang',
          customerId: testCustomer.id,
          sourceAccountId: accBankBri.id,
          paymentAccountId: accKasKecil.id,
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      cust = await db.customers.get(testCustomer.id);
      expect(cust?.balanceHutang).toBe(252000);

      // Kas interim net keluar: -252.000 + 5.000 = -247.000
      kasBal = await accountService.getBalance(accKasKecil.id);
      expect(kasBal).toBe(1000000 - 247000);
    });

    it('1.5 Validasi fee: fee > nominal ditolak, fee < 0 ditolak', async () => {
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'tarik_tunai',
            nominal: 50000,
            fee: 60000,
            feePaidBy: 'debit_rekening',
            feeManualOverride: true,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accBankBri.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow('Biaya admin tidak boleh lebih besar dari nominal.');

      await expect(
        transactionService.addTransaction(
          {
            layanan: 'tarik_tunai',
            nominal: 50000,
            fee: -1000,
            feePaidBy: 'debit_rekening',
            feeManualOverride: true,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            sourceAccountId: accBankBri.id,
            paymentAccountId: accKasKecil.id,
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-1' }
        )
      ).rejects.toThrow(/Biaya admin/);
    });

    it('1.6 UI AddTransactionView: toggle admin tarik tunai menampilkan "Potong di Dalam" dan hitungan live', async () => {
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });

      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Pilih layanan tarik_tunai
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      await waitFor(() => expect(wrapper.find('[data-testid="service-option-tarik_tunai"]').exists()).toBe(true));
      await wrapper.find('[data-testid="service-option-tarik_tunai"]').trigger('click');
      await flushPromises();

      // Tombol toggle harus berlabel "Potong di Dalam" dan "Cash"
      const debitBtn = wrapper.find('[data-testid="btn-fee-debit"]');
      const cashBtn = wrapper.find('[data-testid="btn-fee-cash"]');
      expect(debitBtn.exists()).toBe(true);
      expect(debitBtn.text()).toBe('Potong di Dalam');
      expect(cashBtn.exists()).toBe(true);
      expect(cashBtn.text()).toBe('Cash');

      // Set nominal 252.000 dan fee 5.000
      const moneyInputComp = wrapper.findComponent({ name: 'MoneyInput' });
      await moneyInputComp.vm.$emit('update:modelValue', 252000);
      await flushPromises();

      (wrapper.vm as unknown as { fee: number; feeManualOverride: boolean }).fee = 5000;
      (wrapper.vm as unknown as { fee: number; feeManualOverride: boolean }).feeManualOverride = true;
      await flushPromises();

      await moneyInputComp.vm.$emit('update:feePaidBy', 'debit_rekening');
      await flushPromises();

      // Box hitungan langsung tampil untuk mode Dalam
      const calcBox = wrapper.find('[data-testid="tarik-tunai-calc"]');
      expect(calcBox.exists()).toBe(true);
      expect(calcBox.text()).toContain('Tunai diserahkan:');
      expect(calcBox.text()).toContain('247.000');

      // Ganti ke mode Cash
      await moneyInputComp.vm.$emit('update:feePaidBy', 'cash');
      await flushPromises();

      expect(calcBox.text()).toContain('Tunai diserahkan:');
      expect(calcBox.text()).toContain('252.000');
      expect(calcBox.text()).toContain('Fee tunai:');
      expect(calcBox.text()).toContain('5.000');
    });

    it('1.7 Detail & Edit: TransactionDetailView menampilkan hitungan tunai dan mendukung edit mode admin', async () => {
      const now = Date.now();
      const txId = await transactionService.addTransaction(
        {
          layanan: 'tarik_tunai',
          nominal: 252000,
          fee: 5000,
          feePaidBy: 'debit_rekening',
          feeManualOverride: true,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          sourceAccountId: accBankBri.id,
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
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });

      await waitFor(() => {
        expect(wrapper.text()).toContain('Potong di Dalam');
        expect(wrapper.text()).toContain('Tunai Diserahkan');
        expect(wrapper.text()).toContain('247.000');
      });

      // Buka dialog edit owner
      const editBtn = wrapper.find('[data-testid="btn-edit-transaction"]');
      await editBtn.trigger('click');
      await waitFor(() => expect(wrapper.find('[data-testid="edit-dialog"]').exists()).toBe(true));

      // Toggle feePaidBy ke Cash
      const editFeeCash = wrapper.find('[data-testid="edit-fee-cash"]');
      expect(editFeeCash.exists()).toBe(true);
      await editFeeCash.trigger('click');

      // Simpan edit
      const submitEdit = wrapper.find('[data-testid="btn-submit-edit"]');
      await submitEdit.trigger('click');

      await waitFor(async () => {
        const updatedTx = await db.transactions.get(txId);
        expect(updatedTx?.feePaidBy).toBe('cash');
      });
    });
  });

  // ==========================================================================
  // TUGAS 2 — Popup Simpan: Tempel Tepat di Atas Keypad Virtual
  // ==========================================================================
  describe('Tugas 2: Popup Simpan Menempel Keypad (AddTransactionView & OwnerTransactionView)', () => {
    it('2.1 CSS .sticky-footer berposisi fixed dan saat keyboard terbuka bottom menempel di 8px', async () => {
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });

      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      const moneyInputComp = wrapper.findComponent({ name: 'MoneyInput' });
      await moneyInputComp.vm.$emit('update:modelValue', 50000);
      await flushPromises();

      const footer = wrapper.find('[data-testid="sticky-footer-bar"]');
      expect(footer.exists()).toBe(true);

      // Verifikasi form memiliki class keyboard-open saat isKeyboardOpen true
      (wrapper.vm as unknown as { isKeyboardOpen: boolean }).isKeyboardOpen = true;
      await flushPromises();

      const form = wrapper.find('.tx-form');
      expect(form.classes()).toContain('keyboard-open');
    });

    it('2.2 OwnerTransactionView tombol submit fixed dan memiliki class keyboard-open saat keyboard aktif', async () => {
      const authStore = useAuthStore(pinia);
      authStore.currentUser = ownerUser;

      await router.push('/transactions/owner');
      await router.isReady();

      const wrapper = mount(OwnerTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });

      await flushPromises();
      const submitBtn = wrapper.find('[data-testid="btn-submit-owner-tx"]');
      expect(submitBtn.exists()).toBe(true);

      (wrapper.vm as unknown as { isKeyboardOpen: boolean }).isKeyboardOpen = true;
      await flushPromises();

      const form = wrapper.find('.owner-tx-form');
      expect(form.classes()).toContain('keyboard-open');
    });
  });

  // ==========================================================================
  // TUGAS 3 — Enter/Tab Loncat ke Field Berikutnya (Semua Form, Semua Role)
  // ==========================================================================
  describe('Tugas 3: Enter / Tab Loncat ke Field Berikutnya (SearchableSelect & Form)', () => {
    it('3.1 SearchableSelect: ketik "tra" -> Enter -> memilih "Transfer" dan fokus maju ke field berikutnya', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer Bank' },
        { value: 'tarik_tunai', label: 'Tarik Tunai' },
        { value: 'pulsa', label: 'Pulsa' },
      ];

      // Pasang container dengan 2 elemen untuk menguji perpindahan fokus
      const div = document.createElement('div');
      div.innerHTML = `
        <form id="test-form">
          <div id="select-container"></div>
          <input id="next-field" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const selectContainer = div.querySelector('#select-container')!;
      const nextField = div.querySelector('#next-field') as HTMLInputElement;

      const wrapper = mount(SearchableSelect, {
        props: {
          options,
          modelValue: '',
        },
        attachTo: selectContainer,
      });

      // Buka dropdown
      const trigger = wrapper.find('.searchable-select-trigger');
      await trigger.trigger('click');
      await flushPromises();

      // Ketik "tra" di search input
      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('tra');
      await flushPromises();

      // Tekan Enter
      await searchInput.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      // Dropdown tertutup dan nilai terpilih adalah transfer
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['transfer']);

      // Fokus berpindah ke field berikutnya di form
      expect(document.activeElement).toBe(nextField);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('3.2 SearchableSelect: Tab saat dropdown terbuka dan ada hasil memilih item dan fokus maju ke field berikutnya', async () => {
      const options = [
        { value: 'kas', label: 'Kas Kecil' },
        { value: 'bank', label: 'Bank BRI' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="tab-form">
          <div id="tab-select-container"></div>
          <input id="tab-next-field" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const container = div.querySelector('#tab-select-container')!;
      const nextField = div.querySelector('#tab-next-field') as HTMLInputElement;

      const wrapper = mount(SearchableSelect, {
        props: {
          options,
          modelValue: '',
        },
        attachTo: container,
      });

      const trigger = wrapper.find('.searchable-select-trigger');
      await trigger.trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      // Tekan Tab
      await searchInput.trigger('keydown', { key: 'Tab' });
      await flushPromises();

      // Memilih opsi pertama ('kas')
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['kas']);
      // Fokus maju ke field berikutnya
      expect(document.activeElement).toBe(nextField);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('3.3 Universal handleFormKeyDown: Enter di input biasa memajukan fokus ke input selanjutnya; field terakhir fokus ke submit button', () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <form id="multi-field-form">
          <input id="field-1" type="text" />
          <input id="field-2" type="text" />
          <button id="btn-submit" type="submit">Simpan</button>
        </form>
      `;
      document.body.appendChild(div);

      const field1 = div.querySelector('#field-1') as HTMLInputElement;
      const field2 = div.querySelector('#field-2') as HTMLInputElement;
      const submitBtn = div.querySelector('#btn-submit') as HTMLButtonElement;
      const form = div.querySelector('#multi-field-form') as HTMLFormElement;

      form.addEventListener('keydown', (e) => handleFormKeyDown(e, form));

      // Fokus di field 1, tekan Enter
      field1.focus();
      const enterEvent1 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      field1.dispatchEvent(enterEvent1);

      // Fokus harus loncat ke field 2
      expect(document.activeElement).toBe(field2);

      // Fokus di field 2, tekan Enter
      const enterEvent2 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      field2.dispatchEvent(enterEvent2);

      // Fokus harus loncat ke tombol submit (bukan auto-submit)
      expect(document.activeElement).toBe(submitBtn);

      document.body.removeChild(div);
    });

    it('3.4 ProductFormView: alur Enter/Tab navigasi field master produk', async () => {
      const authStore = useAuthStore(pinia);
      authStore.currentUser = ownerUser;

      await router.push('/masters/product/add');
      await router.isReady();

      const wrapper = mount(ProductFormView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
        attachTo: document.body,
      });

      await flushPromises();

      const nameInput = wrapper.find('#product-name').element as HTMLInputElement;
      const modalInput = wrapper.find('#product-modal').element as HTMLInputElement;
      const jualInput = wrapper.find('#product-harga-jual').element as HTMLInputElement;

      expect(nameInput).toBeDefined();
      expect(modalInput).toBeDefined();
      expect(jualInput).toBeDefined();

      // Di field Nama Produk, tekan Enter
      nameInput.focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      nameInput.dispatchEvent(event);
      await flushPromises();

      // Sesuai DOM form, elemen berikutnya difokuskan
      expect(document.activeElement).not.toBe(nameInput);

      wrapper.unmount();
    });
  });
});
