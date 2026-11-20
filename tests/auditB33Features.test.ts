import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import {
  LAYANAN_DEFS,
  getLayananDef,
  staffLayanan,
  ownerLayanan,
  productCategoriesForLayanan,
  paymentRuleForLayanan,
} from '../src/core/layanan';
import {
  sortProductsForLayanan,
} from '../src/utils/productSort';
import { transactionService } from '../src/services/transactionService';
import { reportService } from '../src/services/reportService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import type { User, Account, Product, ProductCatalogEntry } from '../src/db/types';

describe('Audit b33 Features: Sistem Smart Registry Layanan & Form Transaksi Staf', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;
  let kasirUser: User;

  let accKasKecil: Account;
  let accBankBca: Account;
  let accServerPulsa: Account;

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
      initialBalance: 1000000,
      isActive: true,
      icon: 'wallet',
      color: 'green',
      createdAt: now,
      updatedAt: now,
    };
    accBankBca = {
      id: 'acc-bca',
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 5000000,
      isActive: true,
      icon: 'landmark',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    };
    accServerPulsa = {
      id: 'acc-server',
      name: 'Server Digipos',
      type: 'server_pulsa',
      initialBalance: 2000000,
      isActive: true,
      icon: 'server',
      color: 'purple',
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.bulkAdd([accKasKecil, accBankBca, accServerPulsa]);

    await db.shifts.add({
      id: 'shift-1',
      userId: ownerUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 1000000,
      status: 'open',
    });

    const authStore = useAuthStore(pinia);
    authStore.currentUser = ownerUser;
    localStorage.setItem('buku_konter_active_user_id', ownerUser.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(ownerUser);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
    await router.push('/transactions/add');
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  describe('D.1: Registry Layanan Terpusat (src/core/layanan.ts)', () => {
    it('memiliki tepat 18 layanan terdaftar dengan konfigurasi yang valid', () => {
      const keys = Object.keys(LAYANAN_DEFS);
      expect(keys).toHaveLength(18);

      const staff = staffLayanan();
      expect(staff).toHaveLength(14); // 13 layanan staf lama (termasuk operasional) + game baru
      expect(staff.map((s) => s.code)).toContain('game');
      expect(staff.map((s) => s.code)).toContain('operasional');
      expect(staff.map((s) => s.code)).toContain('jasa_transfer');
      expect(staff.every((s) => !s.isOwnerOnly)).toBe(true);

      const owner = ownerLayanan();
      expect(owner).toHaveLength(5);
      expect(owner.map((s) => s.code)).toEqual([
        'pindah_dana',
        'deposit_server',
        'deposit_provider',
        'pembelian_stok',
        'operasional',
      ]);
      expect(owner.filter((s) => s.code !== 'operasional').every((s) => s.isOwnerOnly)).toBe(true);

      // Verifikasi def pulsa
      const defPulsa = getLayananDef('pulsa');
      expect(defPulsa).toBeDefined();
      expect(defPulsa?.productCategories).toEqual(['pulsa']);
      expect(defPulsa?.paymentRule).toBe('kas-mandiri');
      expect(defPulsa?.referenceOptional).toBe(true);
      expect(defPulsa?.needsSourceAccount).toBe(true);

      // Verifikasi def jasa_transfer
      const defJasa = getLayananDef('jasa_transfer');
      expect(defJasa?.touchesBalances).toBe(false);
      expect(defJasa?.supportsHutang).toBe(false);
      expect(defJasa?.paymentRule).toBe('none');

      // Verifikasi def aksesoris (label ACC)
      const defAcc = getLayananDef('aksesoris');
      expect(defAcc?.label).toBe('ACC');
      expect(defAcc?.keywords).toContain('acc');

      // Helpers
      expect(productCategoriesForLayanan('pulsa')).toEqual(['pulsa']);
      expect(productCategoriesForLayanan('voucher')).toEqual(['voucher']);
      expect(paymentRuleForLayanan('transfer')).toBe('kas');
      expect(paymentRuleForLayanan('tarik_tunai')).toBe('kas-bank');
    });
  });

  describe('D.2 & D.3: Filter Produk per Layanan & Urutan Smart (productSort)', () => {
    beforeEach(async () => {
      const now = Date.now();
      const prods: Product[] = [
        { id: 'p-voucher-1', name: 'Telkomsel 10/28', category: 'voucher', operator: 'Telkomsel', modal: 10000, hargaJual: 12000, stock: 5, stockMin: 1, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-voucher-2', name: 'Telkomsel 4/5', category: 'voucher', operator: 'Telkomsel', modal: 5000, hargaJual: 7000, stock: 5, stockMin: 1, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-acc-1', name: 'Kabel Micro Robot', category: 'aksesoris', operator: 'Robot', modal: 8000, hargaJual: 12000, stock: 10, stockMin: 2, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-acc-2', name: 'Adaptor Charger Acome', category: 'aksesoris', operator: 'Acome', modal: 15000, hargaJual: 25000, stock: 8, stockMin: 2, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-pulsa-1', name: 'Pulsa Telkomsel 10K', category: 'pulsa', operator: 'Telkomsel', modal: 10200, hargaJual: 12000, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-data-1', name: 'Data Telkomsel 10GB', category: 'data', operator: 'Telkomsel', modal: 25000, hargaJual: 30000, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-token-1', name: 'PLNF100', category: 'token_pln', operator: 'PLN', modal: 100000, hargaJual: 102500, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-token-2', name: 'PLN 20', category: 'token_pln', operator: 'PLN', modal: 20000, hargaJual: 22500, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-token-3', name: 'Token PLN 50.000', category: 'token_pln', operator: 'PLN', modal: 50000, hargaJual: 52500, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-token-4', name: 'Token PLN 200', category: 'token_pln', operator: 'PLN', modal: 200000, hargaJual: 202500, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-game-1', name: 'Mobile Legends 86 Diamond', category: 'game', operator: 'Moonton', modal: 18000, hargaJual: 20000, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-game-2', name: 'Free Fire 70 Diamond', category: 'game', operator: 'Garena', modal: 9000, hargaJual: 10000, stock: null, stockMin: 0, isActive: true, createdAt: now, updatedAt: now },
      ];
      await db.products.bulkAdd(prods);

      const catalogEntries: ProductCatalogEntry[] = [
        { id: 'cat-game-3', category: 'game', name: 'Free Fire 140 Diamond', operator: 'Garena', modal: 18000, hargaJual: 20000, isActive: true, updatedAt: now },
      ];
      await db.productCatalogCache.bulkAdd(catalogEntries);
    });

    it('D.2: form hanya menampilkan produk yang melekat pada layanan aktif', async () => {
      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      // Pilih Voucher: dropdown hanya memuat voucher (tidak ada perdana atau aksesoris)
      const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerBtn.trigger('click');
      const optVoucher = wrapper.findAll('.service-option-item').find((w) => w.text().includes('Voucher'));
      await optVoucher?.trigger('click');
      await flushPromises();

      const physicalOptions = wrapper.findAll('select.form-select option');
      const optionTexts = physicalOptions.map((o) => o.text());
      expect(optionTexts.some((t) => t.includes('Telkomsel 10/28'))).toBe(true);
      expect(optionTexts.some((t) => t.includes('Kabel Micro Robot'))).toBe(false);

      // Pilih ACC (Aksesoris): dropdown hanya memuat aksesoris
      await triggerBtn.trigger('click');
      const optAcc = wrapper.findAll('.service-option-item').find((w) => w.text().includes('ACC'));
      await optAcc?.trigger('click');
      await flushPromises();

      const accOptions = wrapper.findAll('select.form-select option');
      const accTexts = accOptions.map((o) => o.text());
      expect(accTexts.some((t) => t.includes('Kabel Micro Robot'))).toBe(true);
      expect(accTexts.some((t) => t.includes('Telkomsel 10/28'))).toBe(false);

      // Pilih Pulsa: dropdown hanya memuat pulsa (tidak ada paket data, token, atau game)
      await triggerBtn.trigger('click');
      const optPulsa = wrapper.findAll('.service-option-item').find((w) => w.text().includes('Pulsa'));
      await optPulsa?.trigger('click');
      await flushPromises();

      const pulsaOptions = wrapper.findAll('select.form-select option');
      const pulsaTexts = pulsaOptions.map((o) => o.text());
      expect(pulsaTexts.some((t) => t.includes('Pulsa Telkomsel 10K'))).toBe(true);
      expect(pulsaTexts.some((t) => t.includes('Data Telkomsel 10GB'))).toBe(false);
      expect(pulsaTexts.some((t) => t.includes('PLN'))).toBe(false);
      expect(pulsaTexts.some((t) => t.includes('Diamond'))).toBe(false);

      // Pilih Game: dropdown hanya memuat game (lokal + katalog)
      await triggerBtn.trigger('click');
      const optGame = wrapper.findAll('.service-option-item').find((w) => w.text().includes('Game'));
      await optGame?.trigger('click');
      await flushPromises();

      const gameOptions = wrapper.findAll('select.form-select option');
      const gameTexts = gameOptions.map((o) => o.text());
      expect(gameTexts.some((t) => t.includes('Mobile Legends 86 Diamond'))).toBe(true);
      expect(gameTexts.some((t) => t.includes('Free Fire 140 Diamond'))).toBe(true);
      expect(gameTexts.some((t) => t.includes('Pulsa Telkomsel 10K'))).toBe(false);
    });

    it('D.3: pengurutan smart token (nilai numerik 20 < 50 < 100 < 200) & aksesoris (alfabetis)', () => {
      // Token PLN urut nilai numerik
      const tokens = [
        { name: 'PLNF100' },
        { name: 'PLN 20' },
        { name: 'Token PLN 200' },
        { name: 'Token PLN 50.000' },
      ];
      const sortedTokens = sortProductsForLayanan(tokens, 'token_pln');
      expect(sortedTokens.map((t) => t.name)).toEqual([
        'PLN 20',
        'Token PLN 50.000',
        'PLNF100',
        'Token PLN 200',
      ]);

      // Aksesoris urut alfabetis
      const accs = [
        { name: 'Robot Kabel Micro' },
        { name: 'Acome Charger' },
        { name: 'Baseus Adapter' },
      ];
      const sortedAccs = sortProductsForLayanan(accs, 'aksesoris');
      expect(sortedAccs.map((a) => a.name)).toEqual([
        'Acome Charger',
        'Baseus Adapter',
        'Robot Kabel Micro',
      ]);

      // Game urut brand lalu nama
      const games = [
        { name: 'ML 86 Diamond', operator: 'Moonton' },
        { name: 'FF 70 Diamond', operator: 'Garena' },
        { name: 'FF 140 Diamond', operator: 'Garena' },
      ];
      const sortedGames = sortProductsForLayanan(games, 'game');
      expect(sortedGames.map((g) => g.name)).toEqual([
        'FF 140 Diamond',
        'FF 70 Diamond',
        'ML 86 Diamond',
      ]);
    });
  });

  describe('D.4: Filter Teks di Dropdown Produk', () => {
    it('menyaring produk saat diketik, produk terpilih tetap muncul, dan ganti layanan mereset filter', async () => {
      const now = Date.now();
      await db.products.bulkAdd([
        { id: 'p-acc-1', name: 'Kabel Micro Robot', category: 'aksesoris', operator: 'Robot', modal: 8000, hargaJual: 12000, stock: 10, stockMin: 2, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-acc-2', name: 'Adaptor Charger Acome', category: 'aksesoris', operator: 'Acome', modal: 15000, hargaJual: 25000, stock: 8, stockMin: 2, isActive: true, createdAt: now, updatedAt: now },
        { id: 'p-acc-3', name: 'Headset Robot Bass', category: 'aksesoris', operator: 'Robot', modal: 20000, hargaJual: 35000, stock: 5, stockMin: 2, isActive: true, createdAt: now, updatedAt: now },
      ]);

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      // Pilih layanan ACC
      const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerBtn.trigger('click');
      const optAcc = wrapper.findAll('.service-option-item').find((w) => w.text().includes('ACC'));
      await optAcc?.trigger('click');
      await flushPromises();

      const filterInput = wrapper.find('[data-testid="filter-physical-product"]');
      expect(filterInput.exists()).toBe(true);

      // Ketik "robot" -> menyaring hanya produk Robot
      await filterInput.setValue('robot');
      await flushPromises();

      let options = wrapper.findAll('select.form-select option');
      expect(options.some((o) => o.text().includes('Kabel Micro Robot'))).toBe(true);
      expect(options.some((o) => o.text().includes('Headset Robot Bass'))).toBe(true);
      expect(options.some((o) => o.text().includes('Adaptor Charger Acome'))).toBe(false);

      // Pilih salah satu produk (Kabel Micro Robot)
      const select = wrapper.find('select.form-select');
      await select.setValue('p-acc-1');
      await flushPromises();

      // Ketik "acome" -> walau tidak cocok dengan "acome", produk terpilih (p-acc-1) tetap ada di options
      await filterInput.setValue('acome');
      await flushPromises();
      options = wrapper.findAll('select.form-select option');
      expect(options.some((o) => o.attributes('value') === 'p-acc-1')).toBe(true);
      expect(options.some((o) => o.text().includes('Adaptor Charger Acome'))).toBe(true);

      // Ganti layanan -> filter query dan selectedProductId ter-reset
      await triggerBtn.trigger('click');
      const optPulsa = wrapper.findAll('.service-option-item').find((w) => w.text().includes('Pulsa'));
      await optPulsa?.trigger('click');
      await flushPromises();

      expect((wrapper.find('[data-testid="filter-digital-product"]').element as HTMLInputElement).value).toBe('');
    });
  });

  describe('D.5: Nomor Telepon Pulsa Opsional', () => {
    it('pulsa tanpa nomor HP dapat disimpan dengan referenceNo bernilai undefined', async () => {
      const now = Date.now();
      await db.products.add({
        id: 'p-pulsa-10k',
        name: 'Pulsa Telkomsel 10K',
        category: 'pulsa',
        operator: 'Telkomsel',
        modal: 10200,
        hargaJual: 12000,
        stock: null,
        stockMin: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      // Pilih pulsa
      const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerBtn.trigger('click');
      const optPulsa = wrapper.findAll('.service-option-item').find((w) => w.text().includes('Pulsa'));
      await optPulsa?.trigger('click');
      await flushPromises();

      // Input referenceNo tidak memiliki atribut required
      const refInput = wrapper.find('input[type="tel"]');
      expect(refInput.attributes('required')).toBeUndefined();

      // Pilih produk pulsa dari dropdown digital
      const allSelects = wrapper.findAll('select.form-select');
      const selectProd = allSelects.find((s) => s.findAll('option').some((o) => o.attributes('value') === 'p-pulsa-10k'));
      expect(selectProd?.exists()).toBe(true);
      await selectProd?.setValue('p-pulsa-10k');
      await selectProd?.trigger('change');
      await flushPromises();

      // Simpan tanpa isi no HP
      await (wrapper.vm as any).handleSubmit();
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      const txs = await db.transactions.toArray();
      expect(txs).toHaveLength(1);
      expect(txs[0]?.layanan).toBe('pulsa');
      expect(txs[0]?.referenceNo).toBeUndefined();
    });
  });

  describe('D.6: Label ACC di Picker Layanan', () => {
    it('picker layanan menampilkan label "ACC" dan pencarian "acc" menemukan layanan aksesoris', async () => {
      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerBtn.trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('[data-testid="input-cari-layanan"]');
      await searchInput.setValue('acc');
      await flushPromises();

      const options = wrapper.findAll('.service-option-item');
      expect(options).toHaveLength(1);
      expect(options[0]?.text()).toContain('ACC');
    });
  });

  describe('D.7: Footer Simpan Transaksi Muncul Hanya Bila Ada Isi', () => {
    it('footer simpan tersembunyi saat form kosong dan muncul saat nominal diisi atau produk dipilih', async () => {
      const now = Date.now();
      await db.products.add({
        id: 'p-acc-kabel',
        name: 'Kabel USB Fast Charge',
        category: 'aksesoris',
        operator: 'Robot',
        modal: 10000,
        hargaJual: 20000,
        stock: 5,
        stockMin: 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));
      await flushPromises();

      // Form awal (layanan Transfer, nominal 0) -> footer TIDAK ada
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(false);

      // Isi nominal -> footer MUNCUL
      const nominalInput = wrapper.find('.nominal-input');
      await nominalInput.setValue('50000');
      await nominalInput.trigger('input');
      await flushPromises();
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(true);

      // Kosongkan nominal kembali ke 0 -> footer TERSEMBUNYI lagi
      await nominalInput.setValue('0');
      await nominalInput.trigger('input');
      await flushPromises();
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(false);

      // Pilih layanan ACC dan pilih produk -> footer MUNCUL karena produk punya harga
      const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerBtn.trigger('click');
      const optAcc = wrapper.findAll('.service-option-item').find((w) => w.text().includes('ACC'));
      await optAcc?.trigger('click');
      await flushPromises();

      const select = wrapper.find('select.form-select');
      await select.setValue('p-acc-kabel');
      await select.trigger('change');
      await flushPromises();
      expect(wrapper.find('[data-testid="sticky-footer-bar"]').exists()).toBe(true);
    });
  });

  describe('D.8: Layanan Game End-to-End', () => {
    it('transaksi game menghasilkan mutasi server pulsa -modal dan payment +hargaJual serta tercatat di laporan', async () => {
      const now = Date.now();
      const prodId = 'prod-ml-game';
      await db.products.add({
        id: prodId,
        name: 'Mobile Legends 86 Diamond',
        category: 'game',
        operator: 'Moonton',
        modal: 18000,
        hargaJual: 20000,
        stock: null,
        stockMin: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      // Simpan transaksi game via transactionService
      const txId = await transactionService.addTransaction(
        {
          layanan: 'game',
          productId: prodId,
          sourceAccountId: accServerPulsa.id,
          paymentAccountId: accKasKecil.id,
          nominal: 20000,
          fee: 0,
          feeManualOverride: false,
          date: Date.now(),
          feePaidBy: 'cash',
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
        },
        { actorUserId: ownerUser.id, shiftId: 'shift-1' }
      );
      expect(txId).toBeDefined();

      // Cek mutasi buku besar:
      // server_pulsa berkurang modal (-18.000)
      // kas kecil bertambah harga jual (+20.000)
      const ledgers = await db.accountLedger.where('transactionId').equals(txId).toArray();
      expect(ledgers).toHaveLength(2);

      const serverLedger = ledgers.find((l) => l.accountId === accServerPulsa.id);
      expect(serverLedger?.delta).toBe(-18000);

      const kasLedger = ledgers.find((l) => l.accountId === accKasKecil.id);
      expect(kasLedger?.delta).toBe(20000);

      // Cek laporan penjualan: omzet 20.000, laba 2.000 (20.000 - 18.000)
      const laba = await reportService.totalLaba(now - 1000, now + 1000);
      expect(laba).toBe(2000);

      const totalIn = await reportService.totalIn(now - 1000, now + 1000);
      expect(totalIn).toBe(20000);
    });
  });
});
