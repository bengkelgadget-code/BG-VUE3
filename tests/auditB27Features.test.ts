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
import { waitFor } from './helpers/testUtils';
import type { User } from '../src/db/types';

describe('Audit b27 Features: Otorisasi Form Staf & Transaksi Produk Katalog', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let adminUser: User;
  let kepalaKasirUser: User;
  let kasirUser: User;

  let kasAccId: string;
  let bankAccId: string;
  let serverAccId: string;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);

    await db.users.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.products.clear();
    await db.productCatalogCache.clear();
    await db.stockMovements.clear();
    await db.customers.clear();
    await db.shifts.clear();
    await db.auditLogs.clear();

    const now = Date.now();
    const pinHash = await authService.hashPin('123456');

    ownerUser = {
      id: 'user-owner',
      name: 'Owner Budi',
      role: 'owner',
      pinHash,
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

    kasAccId = await accountService.addAccount({
      name: 'Kas Toko',
      type: 'kas',
      initialBalance: 500000,
    });
    bankAccId = await accountService.addAccount({
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 2000000,
    });
    serverAccId = await accountService.addAccount({
      name: 'Server BGapp',
      type: 'server_pulsa',
      initialBalance: 1000000,
    });

    // Default shift aktif untuk kasirUser
    await db.shifts.add({
      id: 'shift-fitra',
      userId: kasirUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 500000,
      status: 'open',
    });

    const authStore = useAuthStore(pinia);
    authStore.currentUser = kasirUser;
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(kasirUser);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
    vi.restoreAllMocks();
  });

  // ==========================================
  // BAGIAN A: Proteksi Form & Layanan Staf
  // ==========================================
  describe('Bagian A: Sembunyikan Layanan Owner dari Form Staf & Otorisasi Service', () => {
    it('A.1 Render AddTransactionView sebagai Kasir: opsi Pindah Dana, Deposit Server, Deposit Provider tidak ada; Operasional tetap ada', async () => {
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

      // Buka dropdown jenis layanan
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');

      await waitFor(() => {
        expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(true);
      });

      const menuText = wrapper.find('[data-testid="service-dropdown-menu"]').text();
      expect(menuText).not.toContain('Pindah Dana');
      expect(menuText).not.toContain('Deposit Server');
      expect(menuText).not.toContain('Deposit Provider');
      expect(menuText).toContain('Operasional');

      expect(wrapper.find('[data-testid="service-option-pindah_dana"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="service-option-deposit_server"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="service-option-deposit_provider"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="service-option-operasional"]').exists()).toBe(true);

      wrapper.unmount();
    });

    it('A.2 Buka form dengan route.query.type = "pindah_dana" sebagai Kasir: layanan diabaikan & menggunakan default staf (Transfer)', async () => {
      await router.push('/transactions/add?type=pindah_dana');

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

      // Trigger dropdown harus menunjukkan default 'Transfer', bukan 'Pindah Dana'
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      expect(trigger.text()).toContain('Transfer');
      expect(trigger.text()).not.toContain('Pindah Dana');

      wrapper.unmount();
    });

    it('A.3 addTransaction dengan pindah_dana / deposit_server / deposit_provider oleh non-owner (Kasir/Admin/Kepala Kasir) ditolak tanpa mutasi', async () => {
      const staffUsers = [kasirUser, adminUser, kepalaKasirUser];
      const ownerServices = ['pindah_dana', 'deposit_server', 'deposit_provider'];

      for (const user of staffUsers) {
        for (const srv of ownerServices) {
          await expect(
            transactionService.addTransaction(
              {
                layanan: srv,
                nominal: 100000,
                fee: 0,
                feePaidBy: 'cash',
                feeManualOverride: false,
                paymentMethod: 'tunai',
                sourceAccountId: bankAccId,
                destAccountId: kasAccId,
                date: Date.now(),
              },
              { actorUserId: user.id, shiftId: 'shift-fitra' }
            )
          ).rejects.toThrow('Layanan ini hanya untuk Owner. Gunakan halaman Transaksi Owner.');
        }
      }

      // Pastikan tidak ada transaksi yang tercatat dan saldo tidak berubah
      const txCount = await db.transactions.count();
      expect(txCount).toBe(0);

      const balBank = await accountService.getBalance(bankAccId);
      const balKas = await accountService.getBalance(kasAccId);
      expect(balBank).toBe(2000000);
      expect(balKas).toBe(500000);
    });

    it('A.4 addTransaction dengan layanan Owner oleh actor Owner berhasil diproses', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pindah_dana',
          nominal: 150000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          sourceAccountId: bankAccId,
          destAccountId: kasAccId,
          date: Date.now(),
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      expect(txId).toBeDefined();

      const balBank = await accountService.getBalance(bankAccId);
      const balKas = await accountService.getBalance(kasAccId);
      expect(balBank).toBe(2000000 - 150000);
      expect(balKas).toBe(500000 + 150000);
    });
  });

  // ==========================================
  // BAGIAN B: Produk Katalog Transaksi
  // ==========================================
  describe('Bagian B: Katalog Digital di Form & Eksekusi Penjualan', () => {
    it('B.1 Picker (computed): katalog muncul di availableDigitalProducts, dedupe lokal menang jika externalProductRef cocok', async () => {
      const now = Date.now();
      // 1. Tambah 3 produk katalog
      await db.productCatalogCache.bulkAdd([
        {
          id: 'SKU-TSEL-5K',
          name: 'Telkomsel 5.000',
          category: 'pulsa',
          operator: 'Telkomsel',
          denomination: '5.000',
          modal: 5100,
          hargaJual: 7000,
          isActive: true,
          updatedAt: now,
        },
        {
          id: 'SKU-PLN-20K',
          name: 'Token PLN 20.000',
          category: 'token_pln',
          operator: 'PLN',
          denomination: '20.000',
          modal: 20100,
          hargaJual: 22500,
          isActive: true,
          updatedAt: now,
        },
        {
          id: 'SKU-INACTIVE',
          name: 'Indosat Nonaktif',
          category: 'pulsa',
          modal: 10000,
          hargaJual: 12000,
          isActive: false,
          updatedAt: now,
        },
      ]);

      // 2. Tambah 1 produk lokal yang meng-override 'SKU-TSEL-5K'
      await db.products.add({
        id: 'local-prod-tsel-override',
        externalProductRef: 'SKU-TSEL-5K',
        name: 'Telkomsel 5K Custom Harga',
        category: 'pulsa',
        modal: 5100,
        hargaJual: 8000, // Override harga
        stock: null,
        stockMin: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

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

      // Ambil options di select produk digital
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      const pulsaOption = wrapper.find('[data-testid="service-option-pulsa"]');
      await pulsaOption.trigger('click');

      await waitFor(() => {
        const select = wrapper.find('select[required]');
        expect(select.exists()).toBe(true);
      });

      const options = wrapper.findAll('.cascading-fields select option');
      const optionTexts = options.map((o) => o.text());

      // Telkomsel lokal harus muncul (harga 8.000) dan bukan entri katalognya
      expect(optionTexts.some((t) => t.includes('Telkomsel 5K Custom Harga (Harga: Rp 8.000)'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('Telkomsel 5.000 (Harga: Rp 7.000) · KATALOG'))).toBe(false);

      // Token PLN katalog harus muncul dengan label KATALOG
      expect(optionTexts.some((t) => t.includes('Token PLN 20.000 (Harga: Rp 22.500) · KATALOG'))).toBe(true);

      // Inactive catalog tidak boleh muncul
      expect(optionTexts.some((t) => t.includes('Indosat Nonaktif'))).toBe(false);

      wrapper.unmount();
    });

    it('B.2 onProductSelected untuk entri katalog mengisi nominal dengan hargaJual dari cache', async () => {
      const now = Date.now();
      await db.productCatalogCache.add({
        id: 'SKU-ML-86',
        name: 'Mobile Legends 86 Diamond',
        category: 'game',
        modal: 19000,
        hargaJual: 22000,
        isActive: true,
        updatedAt: now,
      });

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

      // Pilih layanan pulsa/digital
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      await wrapper.find('[data-testid="service-option-pulsa"]').trigger('click');

      await waitFor(() => {
        const productSelect = wrapper.findAll('select').find((s) => s.text().includes('Mobile Legends'));
        expect(productSelect?.exists()).toBe(true);
      });

      const productSelect = wrapper.findAll('select').find((s) => s.text().includes('Mobile Legends'));
      await productSelect?.setValue('SKU-ML-86');

      // Nominal harus otomatis terisi Rp 22.000
      await waitFor(() => {
        const moneyInput = wrapper.findComponent({ name: 'MoneyInput' });
        expect(moneyInput.props('modelValue')).toBe(22000);
      });

      wrapper.unmount();
    });

    it('B.3 End-to-end service: jual Pulsa katalog sukses mengurangi saldo server dengan modal & menambah kas dengan hargaJual tanpa buat produk lokal', async () => {
      const now = Date.now();
      await db.productCatalogCache.add({
        id: 'SKU-TSEL-50K',
        name: 'Telkomsel 50.000',
        category: 'pulsa',
        modal: 50100,
        hargaJual: 52000,
        isActive: true,
        updatedAt: now,
      });

      const txId = await transactionService.addTransaction(
        {
          layanan: 'pulsa',
          productId: 'SKU-TSEL-50K',
          sourceAccountId: serverAccId,
          nominal: 52000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          referenceNo: '081234567890',
          date: now,
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-fitra' }
      );

      expect(txId).toBeDefined();

      // Cek saldo: server berkurang modal (50.100), kas bertambah harga jual (52.000)
      const balServer = await accountService.getBalance(serverAccId);
      const balKas = await accountService.getBalance(kasAccId);
      expect(balServer).toBe(1000000 - 50100);
      expect(balKas).toBe(500000 + 52000);

      // Cek snapshot di transaction_items
      const items = await transactionService.getItems(txId);
      expect(items).toHaveLength(1);
      expect(items[0]?.productId).toBe('SKU-TSEL-50K');
      expect(items[0]?.productNameSnapshot).toBe('Telkomsel 50.000');
      expect(items[0]?.modalSnapshot).toBe(50100);
      expect(items[0]?.hargaJualSnapshot).toBe(52000);
      expect(items[0]?.subtotal).toBe(52000);

      // Cek Master Produk: TIDAK ada produk lokal baru yang tercipta
      const localProductsCount = await db.products.count();
      expect(localProductsCount).toBe(0);
    });

    it('B.4 Entri katalog tanpa hargaJual (0) ditolak dengan pesan sync katalog & saldo tidak berubah', async () => {
      const now = Date.now();
      await db.productCatalogCache.add({
        id: 'SKU-NO-PRICE',
        name: 'Game Voucher Tanpa Harga',
        category: 'game',
        modal: 10000,
        hargaJual: 0,
        isActive: true,
        updatedAt: now,
      });

      await expect(
        transactionService.addTransaction(
          {
            layanan: 'pulsa',
            productId: 'SKU-NO-PRICE',
            sourceAccountId: serverAccId,
            nominal: 12000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            paymentStatus: 'lunas',
            date: now,
          },
          { actorUserId: kasirUser.id, shiftId: 'shift-fitra' }
        )
      ).rejects.toThrow('Harga produk katalog belum tersedia. Sinkronkan katalog terlebih dahulu.');

      const balServer = await accountService.getBalance(serverAccId);
      const balKas = await accountService.getBalance(kasAccId);
      expect(balServer).toBe(1000000);
      expect(balKas).toBe(500000);
    });

    it('B.5 Render form kasir: teks picker katalog tidak mengandung nilai modal (hanya harga jual)', async () => {
      const now = Date.now();
      await db.productCatalogCache.add({
        id: 'SKU-CONFIDENTIAL',
        name: 'Telkomsel 100K Rahasia',
        category: 'pulsa',
        modal: 98765, // Modal sensitif
        hargaJual: 102000,
        isActive: true,
        updatedAt: now,
      });

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

      // Buka pulsa
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      await wrapper.find('[data-testid="service-option-pulsa"]').trigger('click');

      await waitFor(() => {
        expect(wrapper.text()).toContain('Telkomsel 100K Rahasia');
      });

      // Validasi bahwa modal (98.765 / 98765) sama sekali TIDAK ada di seluruh teks wrapper
      expect(wrapper.text()).not.toContain('98.765');
      expect(wrapper.text()).not.toContain('98765');
      expect(wrapper.text()).toContain('Rp 102.000');

      wrapper.unmount();
    });
  });
});
