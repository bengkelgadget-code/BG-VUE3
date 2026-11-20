import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { accountService } from '../src/services/accountService';
import { transactionService } from '../src/services/transactionService';
import { productService } from '../src/services/productService';
import { reportService } from '../src/services/reportService';
import {
  catalogService,
  computeEffectivePrices,
  extractDenomination,
} from '../src/services/catalogService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import HomeView from '../src/views/HomeView.vue';
import MastersView from '../src/views/MastersView.vue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, Account } from '../src/db/types';

describe('Audit b25 Features Suite (PROMPT b25 Wajib)', () => {
  let ownerUser: User;
  let kasirUser: User;

  function makeAccount(data: Partial<Account> & { id: string; name: string; type: Account['type'] }): Account {
    return {
      initialBalance: 0,
      icon: 'wallet',
      color: '#3b82f6',
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...data,
    };
  }

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();

    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.products.clear();
    await db.shifts.clear();
    await db.users.clear();
    await db.auditLogs.clear();
    await db.productCatalogCache.clear();

    const hashedPin = await authService.hashPin('123456');

    ownerUser = {
      id: 'owner-b25',
      name: 'Budi Owner',
      role: 'owner',
      pinHash: hashedPin,
      isActive: true,
      createdAt: Date.now(),
    };
    await db.users.add(ownerUser);

    kasirUser = {
      id: 'kasir-b25',
      name: 'Siti Kasir',
      role: 'kasir',
      pinHash: hashedPin,
      isActive: true,
      createdAt: Date.now(),
    };
    await db.users.add(kasirUser);

    localStorage.setItem('buku_konter_active_user_id', ownerUser.id);
    const authStore = useAuthStore();
    await authStore.checkInit();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // Bagian A — Pembelian stok membukukan laba di muka & "Keluar" pakai nominal
  // ==========================================================================
  describe('Bagian A — Pembelian Stok & Laporan', () => {
    it('A.1 Beli 10 kabel total 100k (master modal 12k/jual 15k): saldo -100k, stok +10, totalOut 100k, totalLaba 0, byLayanan omzet 0 laba 0', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 500000 });
      await db.accounts.add(kas);

      const kabelId = await productService.addProduct(
        {
          name: 'Kabel Data Type-C Fast',
          category: 'aksesoris',
          modal: 12000,
          hargaJual: 15000,
          stock: 5,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const now = Date.now();
      await transactionService.addTransaction(
        {
          layanan: 'pembelian_stok',
          sourceAccountId: kas.id,
          nominal: 100000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: now,
          cartItems: [
            {
              productId: kabelId,
              qty: 10,
              nominal: 100000,
            },
          ],
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      // Saldo kas berkurang 100.000 (500k -> 400k)
      const bal = await accountService.getBalance(kas.id);
      expect(bal).toBe(400000);

      // Stok fisik bertambah 10 (5 -> 15)
      const updatedProduct = await db.products.get(kabelId);
      expect(updatedProduct?.stock).toBe(15);

      // Total keluar: 100.000 (bukan modal master 120.000)
      const totalOut = await reportService.totalOut(now - 10000, now + 10000);
      expect(totalOut).toBe(100000);

      // Total laba: 0 (bukan +30.000)
      const totalLaba = await reportService.totalLaba(now - 10000, now + 10000);
      expect(totalLaba).toBe(0);

      // byLayanan: omzet 0, laba 0, total 1
      const byLayanan = await reportService.byLayanan(now - 10000, now + 10000);
      const beliRow = byLayanan.find((l) => l.label === 'pembelian_stok');
      expect(beliRow).toBeDefined();
      expect(beliRow?.total).toBe(1);
      expect(beliRow?.omzet).toBe(0);
      expect(beliRow?.laba).toBe(0);
    });

    it('A.2 Jual 10 kabel @ 15.000 (modal master 12.000) setelah dibeli: totalLaba bertambah 30.000 tepat 1x', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 500000 });
      await db.accounts.add(kas);

      const shiftId = 'shift-1';
      await db.shifts.add({
        id: shiftId,
        userId: kasirUser.id,
        openedAt: Date.now() - 3600000,
        kasAwalFisik: 500000,
        saldoAwalSistem: { 'acc-kas': 500000 },
        status: 'open',
      });

      const kabelId = await productService.addProduct(
        {
          name: 'Kabel Data Type-C Fast',
          category: 'aksesoris',
          modal: 12000,
          hargaJual: 15000,
          stock: 0,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const now = Date.now() - 5000;
      // Beli 10 kabel
      await transactionService.addTransaction(
        {
          layanan: 'pembelian_stok',
          sourceAccountId: kas.id,
          nominal: 100000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: now,
          cartItems: [{ productId: kabelId, qty: 10, nominal: 100000 }],
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      // Jual 10 kabel @ 15.000
      await transactionService.addTransaction(
        {
          layanan: 'aksesoris',
          productId: kabelId,
          nominal: 150000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: now + 1000,
          cartItems: [{ productId: kabelId, qty: 10 }],
        },
        { actorUserId: kasirUser.id, shiftId }
      );

      // Laba harus tepat 30.000 ((15.000 - 12.000) * 10), tidak didouble-count dengan pembelian
      const totalLaba = await reportService.totalLaba(now - 10000, now + 10000);
      expect(totalLaba).toBe(30000);
    });

    it('A.3 Beli 3 pcs total 100.000 (tidak habis dibagi): subtotal persis 100.000, modalSnapshot 33.333', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 500000 });
      await db.accounts.add(kas);

      const itemId = await productService.addProduct(
        {
          name: 'Tempered Glass Curved',
          category: 'aksesoris',
          modal: 30000,
          hargaJual: 50000,
          stock: 0,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const now = Date.now();
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pembelian_stok',
          sourceAccountId: kas.id,
          nominal: 100000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: now,
          cartItems: [{ productId: itemId, qty: 3, nominal: 100000 }],
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
      expect(items.length).toBe(1);
      expect(items[0]?.subtotal).toBe(100000);
      expect(items[0]?.modalSnapshot).toBe(33333); // Math.round(100000 / 3)

      const bal = await accountService.getBalance(kas.id);
      expect(bal).toBe(400000); // 500k - 100k
    });

    it('A.4 Edit pembelian_stok 100k -> 120k: subtotal 120k, saldo sumber -120k, totalOut 120k, totalLaba 0', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 500000 });
      await db.accounts.add(kas);

      const itemId = await productService.addProduct(
        {
          name: 'Case Anti-Crack',
          category: 'aksesoris',
          modal: 10000,
          hargaJual: 20000,
          stock: 0,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const now = Date.now();
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pembelian_stok',
          sourceAccountId: kas.id,
          nominal: 100000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: now,
          cartItems: [{ productId: itemId, qty: 10, nominal: 100000 }],
        },
        { actorUserId: ownerUser.id, shiftId: null }
      );

      // Edit transaksi nominal: 100.000 -> 120.000
      await transactionService.editTransaction(
        txId,
        { nominal: 120000 },
        { actorUserId: ownerUser.id }
      );

      const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
      expect(items[0]?.subtotal).toBe(120000);
      expect(items[0]?.modalSnapshot).toBe(12000);

      const bal = await accountService.getBalance(kas.id);
      expect(bal).toBe(380000); // 500k - 120k

      const totalOut = await reportService.totalOut(now - 10000, now + 10000);
      expect(totalOut).toBe(120000);

      const totalLaba = await reportService.totalLaba(now - 10000, now + 10000);
      expect(totalLaba).toBe(0);
    });
  });

  // ==========================================================================
  // Bagian B — Fallback akun kas: kembalikan b23 untuk kasir
  // ==========================================================================
  describe('Bagian B — Validasi Akun Kas Kasir', () => {
    it('B.1 Penjualan Cash tanpa akun Kas di database DITOLAK dengan pesan "Belum ada akun Kas"', async () => {
      // Hanya ada akun bank PANIN, tidak ada akun bertipe 'kas'
      const bankPanin = makeAccount({ id: 'acc-panin', name: 'Bank Panin', type: 'bank', initialBalance: 1000000 });
      await db.accounts.add(bankPanin);

      const shiftId = 'shift-b';
      await db.shifts.add({
        id: shiftId,
        userId: kasirUser.id,
        openedAt: Date.now() - 3600000,
        kasAwalFisik: 0,
        saldoAwalSistem: {},
        status: 'open',
      });

      const prodId = await productService.addProduct(
        {
          name: 'Voucher Telkomsel 10GB',
          category: 'voucher',
          modal: 25000,
          hargaJual: 30000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await expect(
        transactionService.addTransaction(
          {
            layanan: 'voucher',
            productId: prodId,
            nominal: 30000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId }
        )
      ).rejects.toThrow('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');

      // Pastikan saldo PANIN tidak berubah diam-diam
      const balPanin = await accountService.getBalance(bankPanin.id);
      expect(balPanin).toBe(1000000);
    });

    it('B.2 tarik_tunai kasir TANPA akun Kas DITOLAK dengan pesan yang sama', async () => {
      const bankPanin = makeAccount({ id: 'acc-panin', name: 'Bank Panin', type: 'bank', initialBalance: 1000000 });
      await db.accounts.add(bankPanin);

      const shiftId = 'shift-b2';
      await db.shifts.add({
        id: shiftId,
        userId: kasirUser.id,
        openedAt: Date.now() - 3600000,
        kasAwalFisik: 0,
        saldoAwalSistem: {},
        status: 'open',
      });

      await expect(
        transactionService.addTransaction(
          {
            layanan: 'tarik_tunai',
            sourceAccountId: bankPanin.id,
            nominal: 100000,
            fee: 5000,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            date: Date.now(),
          },
          { actorUserId: kasirUser.id, shiftId }
        )
      ).rejects.toThrow('Belum ada akun Kas. Tambahkan akun Kas terlebih dahulu.');
    });

    it('B.3 Layanan Owner (pindah_dana, operasional, dll) TANPA akun Kas berhasil dengan sourceAccountId eksplisit', async () => {
      const bankPanin = makeAccount({ id: 'acc-panin', name: 'Bank Panin', type: 'bank', initialBalance: 1000000 });
      const bankBca = makeAccount({ id: 'acc-bca', name: 'Bank BCA', type: 'bank', initialBalance: 500000 });
      await db.accounts.bulkAdd([bankPanin, bankBca]);

      // Owner pindah dana Panin -> BCA
      await expect(
        transactionService.addTransaction(
          {
            layanan: 'pindah_dana',
            sourceAccountId: bankPanin.id,
            destAccountId: bankBca.id,
            nominal: 200000,
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            paymentMethod: 'tunai',
            date: Date.now(),
          },
          { actorUserId: ownerUser.id, shiftId: null }
        )
      ).resolves.toBeDefined();

      const balPanin = await accountService.getBalance(bankPanin.id);
      const balBca = await accountService.getBalance(bankBca.id);
      expect(balPanin).toBe(800000);
      expect(balBca).toBe(700000);
    });

    it('B.4 Penjualan Cash DENGAN akun Kas: uang masuk ke akun Kas', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 100000 });
      await db.accounts.add(kas);

      const shiftId = 'shift-b4';
      await db.shifts.add({
        id: shiftId,
        userId: kasirUser.id,
        openedAt: Date.now() - 3600000,
        kasAwalFisik: 100000,
        saldoAwalSistem: { 'acc-kas': 100000 },
        status: 'open',
      });

      const prodId = await productService.addProduct(
        {
          name: 'Voucher Indosat 3GB',
          category: 'voucher',
          modal: 15000,
          hargaJual: 18000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await transactionService.addTransaction(
        {
          layanan: 'voucher',
          productId: prodId,
          nominal: 18000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId }
      );

      const balKas = await accountService.getBalance(kas.id);
      expect(balKas).toBe(118000);
    });
  });

  // ==========================================================================
  // Bagian C — Kasir tanpa shift aktif melihat EmptyState di Home
  // ==========================================================================
  describe('Bagian C — Home Kasir Tanpa Shift', () => {
    it('C.1 Mount HomeView sebagai Kasir tanpa shift aktif: Transaksi Terakhir kosong (EmptyState)', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 100000 });
      await db.accounts.add(kas);

      // Buat transaksi di shift lain
      await db.transactions.add({
        id: 'tx-other-shift',
        layanan: 'pulsa',
        shiftId: 'shift-kemarin',
        userId: 'petugas-lain',
        nominal: 25000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now() - 86400000,
        status: 'ok',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
      });

      // Login sebagai kasir
      const authStore = useAuthStore();
      await authStore.login(kasirUser.id, '123456');
      expect(authStore.isOwner).toBe(false);

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 60));
      await flushPromises();

      // Transaksi Terakhir harus menampilkan EmptyState "Belum ada transaksi"
      expect(wrapper.text()).toContain('Belum ada transaksi');
      expect(wrapper.find('[data-testid="recent-tx-tx-other-shift"]').exists()).toBe(false);

      wrapper.unmount();
    });

    it('C.2 Kasir dengan shift aktif: hanya transaksi shift tersebut', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 100000 });
      await db.accounts.add(kas);

      const shiftId = 'shift-active-today';
      await db.shifts.add({
        id: shiftId,
        userId: kasirUser.id,
        openedAt: Date.now() - 3600000,
        kasAwalFisik: 100000,
        saldoAwalSistem: { 'acc-kas': 100000 },
        status: 'open',
      });

      // Transaksi di shift ini
      await db.transactions.add({
        id: 'tx-current-shift',
        layanan: 'pulsa',
        shiftId,
        userId: kasirUser.id,
        nominal: 50000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
        status: 'ok',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Transaksi shift lain
      await db.transactions.add({
        id: 'tx-other',
        layanan: 'pulsa',
        shiftId: 'shift-lain',
        userId: 'other',
        nominal: 20000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
        status: 'ok',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const authStore = useAuthStore();
      await authStore.login(kasirUser.id, '123456');

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 60));
      await flushPromises();

      expect(wrapper.find('[data-testid="recent-tx-tx-current-shift"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="recent-tx-tx-other"]').exists()).toBe(false);

      wrapper.unmount();
    });

    it('C.3 Owner melihat semua transaksi terbaru lintas shift', async () => {
      const kas = makeAccount({ id: 'acc-kas', name: 'Kas Konter', type: 'kas', initialBalance: 100000 });
      await db.accounts.add(kas);

      await db.transactions.add({
        id: 'tx-shift-a',
        layanan: 'pulsa',
        shiftId: 'shift-a',
        userId: kasirUser.id,
        nominal: 50000,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
        status: 'ok',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const authStore = useAuthStore();
      await authStore.login(ownerUser.id, '123456');
      expect(authStore.isOwner).toBe(true);

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 60));
      await flushPromises();

      expect(wrapper.find('[data-testid="recent-tx-tx-shift-a"]').exists()).toBe(true);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // Bagian E — Harga Server Pulsa Bengkel Gadget selalu update
  // ==========================================================================
  describe('Bagian E — Harga Server Pulsa Bengkel Gadget', () => {
    it('E.1 computeEffectivePrices: Pulsa default rule, custom markup, token/game no markup, dan input invalid', () => {
      expect(extractDenomination('Telkomsel 125.000')).toBe(125000);
      expect(extractDenomination('Tsel 5.000')).toBe(5000);
      expect(extractDenomination('Pulsa 90.000')).toBe(90000);

      // Pulsa tanpa custom markup (< 100.000 -> +3.000)
      const p5k = computeEffectivePrices({
        harga_modal: 5000,
        harga_jual: 5000,
        category: 'pulsa',
        product_name: 'Telkomsel 5.000',
      });
      expect(p5k.modal).toBe(5000);
      expect(p5k.jual).toBe(8000);

      const p90k = computeEffectivePrices({
        harga_modal: 90000,
        harga_jual: 90000,
        category: 'pulsa',
        product_name: 'Pulsa 90.000',
      });
      expect(p90k.modal).toBe(90000);
      expect(p90k.jual).toBe(93000);

      // Pulsa tanpa custom markup (>= 100.000 -> +5.000)
      const p125k = computeEffectivePrices({
        harga_modal: 123465,
        harga_jual: 123465,
        category: 'pulsa',
        product_name: 'Telkomsel 125.000',
      });
      expect(p125k.modal).toBe(123465);
      expect(p125k.jual).toBe(130000);

      // Dengan custom markup 4590
      const customP = computeEffectivePrices(
        {
          harga_modal: 20000,
          harga_jual: 20000,
          category: 'token_pln',
          product_name: 'PLN 20.000',
        },
        4590
      );
      expect(customP.modal).toBe(20000);
      expect(customP.jual).toBe(24590);

      // Token/Game tanpa markup -> jual = harga_jual
      const token = computeEffectivePrices({
        harga_modal: 21248,
        harga_jual: 21270,
        category: 'token_pln',
        product_name: 'PLN 20.000',
      });
      expect(token.modal).toBe(21248);
      expect(token.jual).toBe(21270);

      const game = computeEffectivePrices({
        harga_modal: 1599,
        harga_jual: 1599,
        category: 'game',
        product_name: 'Free Fire 12 Diamond',
      });
      expect(game.modal).toBe(1599);
      expect(game.jual).toBe(1599);

      // Input aneh/kosong -> tidak pernah throw
      const invalid = computeEffectivePrices({
        harga_modal: null,
        harga_jual: null,
        category: '',
        product_name: '',
      });
      expect(invalid.modal).toBe(0);
      expect(invalid.jual).toBe(0);
    });

    it('E.2 syncCatalog: mock Supabase products & mitra_pricing menyimpan modal & hargaJual efektif', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: [
          {
            sku_code: 'TSEL125',
            product_name: 'Telkomsel 125.000',
            category: 'Pulsa',
            brand: 'Telkomsel',
            harga_modal: 123465,
            harga_jual: 123465,
          },
          {
            sku_code: 'PLN20',
            product_name: 'PLN 20.000',
            category: 'PLN',
            brand: 'PLN',
            harga_modal: 21248,
            harga_jual: 21270,
          },
        ],
        error: null,
      });

      const fakeClient = {
        from: vi.fn((table: string) => {
          if (table === 'products') {
            return {
              select: vi.fn().mockReturnValue({
                eq: mockEq,
              }),
            };
          }
          if (table === 'mitras') {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'bg-mitra-uuid', nama_mitra: 'Bengkel Gadget' }],
                    error: null,
                  }),
                }),
              }),
            };
          }
          if (table === 'mitra_pricing') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { mitra_id: 'bg-mitra-uuid', product_sku: 'PLN20', markup_amount: 3000 },
                    { mitra_id: 'bg-mitra-uuid', product_sku: 'SKU_USANG_999', markup_amount: 5000 },
                  ],
                  error: null,
                }),
              }),
            };
          }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }),
      };

      catalogService.setCustomClient(fakeClient as unknown as SupabaseClient);
      const res = await catalogService.syncCatalog({ actorUserId: ownerUser.id });

      expect(res.added).toBe(2);
      expect(res.mitraResolved).toBe(true);

      const cachedTsel = await db.productCatalogCache.get('TSEL125');
      expect(cachedTsel?.modal).toBe(123465);
      expect(cachedTsel?.hargaJual).toBe(130000); // 125k default rule (+5000)

      const cachedPln = await db.productCatalogCache.get('PLN20');
      expect(cachedPln?.modal).toBe(21248);
      expect(cachedPln?.hargaJual).toBe(24270); // 21270 + 3000 custom markup

      // Baris usang tidak tersimpan di cache
      const cachedUsang = await db.productCatalogCache.get('SKU_USANG_999');
      expect(cachedUsang).toBeUndefined();
    });

    it('E.3 Refresh harga produk lokal: produk dengan externalProductRef ikut update + ada audit log', async () => {
      // 1. Buat produk lokal bertaut ke katalog TSEL125 dengan harga lama
      const localId = await productService.addProduct(
        {
          name: 'Telkomsel 125.000',
          category: 'pulsa',
          operator: 'Telkomsel',
          externalProductRef: 'TSEL125',
          modal: 120000, // modal lama
          hargaJual: 128000, // jual lama
          stock: null,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      // Produk tanpa externalProductRef (voucher manual)
      const voucherId = await productService.addProduct(
        {
          name: 'Voucher Fisik Manual',
          category: 'voucher',
          modal: 10000,
          hargaJual: 12000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      // 2. Jalankan sync dengan harga DB baru (modal 123.465, jual 130.000)
      const mockEq = vi.fn().mockResolvedValue({
        data: [
          {
            sku_code: 'TSEL125',
            product_name: 'Telkomsel 125.000',
            category: 'Pulsa',
            brand: 'Telkomsel',
            harga_modal: 123465,
            harga_jual: 123465,
          },
        ],
        error: null,
      });

      const fakeClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: mockEq,
          }),
        }),
      };

      catalogService.setCustomClient(fakeClient as unknown as SupabaseClient);
      const res = await catalogService.syncCatalog({ actorUserId: ownerUser.id });

      expect(res.localUpdated).toBe(1);

      // Cek produk lokal terupdate
      const updatedLocal = await db.products.get(localId);
      expect(updatedLocal?.modal).toBe(123465);
      expect(updatedLocal?.hargaJual).toBe(130000);

      // Cek audit log per produk yang harganya berubah
      const audit = await db.auditLogs.where('action').equals('update_harga_katalog').first();
      expect(audit).toBeDefined();
      expect(audit?.entityId).toBe(localId);
      const detail = JSON.parse(audit?.detail || '{}');
      expect(detail.sku).toBe('TSEL125');
      expect(detail.modalLama).toBe(120000);
      expect(detail.modalBaru).toBe(123465);
      expect(detail.jualLama).toBe(128000);
      expect(detail.jualBaru).toBe(130000);

      // Produk voucher manual tidak tersentuh
      const untouchedVoucher = await db.products.get(voucherId);
      expect(untouchedVoucher?.modal).toBe(10000);
      expect(untouchedVoucher?.hargaJual).toBe(12000);
    });

    it('E.4 Test mitra tidak teratasi: mock mitras kosong -> sync tetap berhasil dan notice tampil', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: [
          {
            sku_code: 'TSEL50',
            product_name: 'Telkomsel 50.000',
            category: 'Pulsa',
            brand: 'Telkomsel',
            harga_modal: 49000,
            harga_jual: 49000,
          },
        ],
        error: null,
      });

      const fakeClient = {
        from: vi.fn((table: string) => {
          if (table === 'products') {
            return {
              select: vi.fn().mockReturnValue({
                eq: mockEq,
              }),
            };
          }
          if (table === 'mitras') {
            return {
              select: vi.fn().mockReturnValue({
                ilike: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [], // RLS anon -> kosong
                    error: null,
                  }),
                }),
              }),
            };
          }
          return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }),
      };

      catalogService.setCustomClient(fakeClient as unknown as SupabaseClient);
      const res = await catalogService.syncCatalog({ actorUserId: ownerUser.id });

      expect(res.added).toBe(1);
      expect(res.mitraResolved).toBe(false);
      expect(res.notice).toContain("Mitra 'Bengkel Gadget' tidak teratasi");

      const cached = await db.productCatalogCache.get('TSEL50');
      expect(cached?.modal).toBe(49000);
      expect(cached?.hargaJual).toBe(53000); // 50k (<100k) + 3000 = 53000
    });

    it('E.5 createProductFromCatalog menghasilkan produk lokal dengan modal/jual TERISI dari DB', async () => {
      await db.productCatalogCache.add({
        id: 'TSEL100',
        name: 'Telkomsel 100.000',
        category: 'pulsa',
        operator: 'Telkomsel',
        denomination: '',
        modal: 98000,
        hargaJual: 105000,
        isActive: true,
        updatedAt: Date.now(),
      });

      // Panggil createProductFromCatalog tanpa passing manual modal/hargaJual
      const newProdId = await productService.createProductFromCatalog(
        'TSEL100',
        {},
        { actorUserId: ownerUser.id }
      );

      const created = await db.products.get(newProdId);
      expect(created).toBeDefined();
      expect(created?.modal).toBe(98000);
      expect(created?.hargaJual).toBe(105000);
      expect(created?.externalProductRef).toBe('TSEL100');
    });

    it('E.6 MastersView menampilkan modal & jual dari DB pada kartu katalog dengan label "(Harga DB)"', async () => {
      await db.productCatalogCache.add({
        id: 'TSEL125-VIEW',
        name: 'Telkomsel 125.000 Super',
        category: 'pulsa',
        operator: 'Telkomsel',
        denomination: '',
        modal: 123465,
        hargaJual: 130000,
        isActive: true,
        updatedAt: Date.now(),
      });

      await router.push('/masters');
      await router.isReady();
      const wrapper = mount(MastersView, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 60));
      await flushPromises();

      const card = wrapper.find('[data-testid="product-card-TSEL125-VIEW"]');
      expect(card.exists()).toBe(true);
      expect(card.text()).toContain('Jual: Rp 130.000');
      expect(card.text()).toContain('Modal: Rp 123.465');
      expect(card.text()).toContain('(Harga DB)');

      wrapper.unmount();
    });
  });
});
