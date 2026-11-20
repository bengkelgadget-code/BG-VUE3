import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { accountService } from '../src/services/accountService';
import { transactionService } from '../src/services/transactionService';
import { productService } from '../src/services/productService';
import { catalogService, mapSupabaseCategory } from '../src/services/catalogService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import { customerService } from '../src/services/customerService';
import {
  compareProducts,
  compareAccounts,
  compareUsers,
  compareCustomers,
  compareFeeRules,
} from '../src/utils/productSort';
import { waitFor, waitForText } from './helpers/testUtils';
import HomeView from '../src/views/HomeView.vue';
import AccountsView from '../src/views/AccountsView.vue';
import TransactionsView from '../src/views/TransactionsView.vue';
import MastersView from '../src/views/MastersView.vue';
import ProductFormView from '../src/views/ProductFormView.vue';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { User, Product, Account, Customer } from '../src/db/types';

describe('Audit b24 Features Suite', () => {
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
    await db.shifts.clear();
    await db.products.clear();
    await db.productCatalogCache.clear();
    await db.users.clear();
    await db.customers.clear();
    await db.adminFeeRules.clear();
    await db.auditLogs.clear();

    const hashedPin = await authService.hashPin('1234');

    ownerUser = {
      id: 'owner-b24',
      name: 'Owner Budi',
      role: 'owner',
      pinHash: hashedPin,
      isActive: true,
      createdAt: Date.now(),
    };
    await db.users.add(ownerUser);

    kasirUser = {
      id: 'kasir-b24',
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
    // PENTING: Drain promises dan pending timer agar router tidak membocorkan state
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // BAGIAN A: Dashboard (Home) Sinkron Saldo & Transaksi Terakhir
  // ==========================================================================
  describe('Bagian A — Dashboard Sinkron Saldo', () => {
    it('A.1 Menghitung total saldo kas dari getAllBalances() dan merefleksikan data live user (Rp 19.303.137)', async () => {
      // 6 Akun bank user asli: 5 bermodal initialBalance: 0 + ledger, 1 bermodal initialBalance: 79.000
      const bankPanin = makeAccount({ id: 'acc-panin', name: 'PANIN', type: 'bank', initialBalance: 0 });
      const bankBri = makeAccount({ id: 'acc-bri', name: 'BRI', type: 'bank', initialBalance: 0 });
      const bankMega = makeAccount({ id: 'acc-mega', name: 'MEGA', type: 'bank', initialBalance: 0 });
      const bankMandiri = makeAccount({ id: 'acc-mandiri', name: 'MANDIRI', type: 'bank', initialBalance: 0 });
      const bankSeabank = makeAccount({ id: 'acc-seabank', name: 'SEABANK', type: 'bank', initialBalance: 0 });
      const bankKrom = makeAccount({ id: 'acc-krom', name: 'KROM BANK', type: 'bank', initialBalance: 79000 });

      await db.accounts.bulkAdd([bankPanin, bankBri, bankMega, bankMandiri, bankSeabank, bankKrom]);

      // Baris ledger koreksi_manual seperti data user live
      await db.accountLedger.bulkAdd([
        {
          id: 'l-panin',
          accountId: 'acc-panin',
          createdAt: Date.now(),
          delta: 12635870,
          kind: 'koreksi_manual',
          note: 'Koreksi Saldo',
        },
        {
          id: 'l-bri',
          accountId: 'acc-bri',
          createdAt: Date.now(),
          delta: 1224734,
          kind: 'koreksi_manual',
          note: 'Koreksi Saldo',
        },
        {
          id: 'l-mega',
          accountId: 'acc-mega',
          createdAt: Date.now(),
          delta: 3626533,
          kind: 'koreksi_manual',
          note: 'Koreksi Saldo',
        },
        {
          id: 'l-mandiri',
          accountId: 'acc-mandiri',
          createdAt: Date.now(),
          delta: 107000,
          kind: 'koreksi_manual',
          note: 'Koreksi Saldo',
        },
        {
          id: 'l-seabank',
          accountId: 'acc-seabank',
          createdAt: Date.now(),
          delta: 1630000,
          kind: 'koreksi_manual',
          note: 'Koreksi Saldo',
        },
      ]);

      // Total harus tepat: 12.635.870 + 1.224.734 + 3.626.533 + 107.000 + 1.630.000 + 79.000 = 19.303.137
      const allBalances = await accountService.getAllBalances();
      let sum = 0;
      for (const val of Object.values(allBalances)) {
        sum += val;
      }
      expect(sum).toBe(19303137);

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      // Gunakan polling waitForText agar tahan flakiness saat suite berjalan paralel
      await waitForText(wrapper, 'Rp 19.303.137');

      // Total saldo kas di HomeView
      expect(wrapper.text()).toContain('Rp 19.303.137');
      // Kartu saldo individual di HomeView
      expect(wrapper.text()).toContain('Rp 12.635.870');
      expect(wrapper.text()).toContain('Rp 1.224.734');
      expect(wrapper.text()).toContain('Rp 79.000');

      wrapper.unmount();
    });

    it('A.2 Menampilkan riwayat transaksi terakhir (maksimal 5) di HomeView', async () => {
      const acc = makeAccount({
        id: 'acc-kas-1',
        name: 'Kas Utama',
        type: 'kas',
        initialBalance: 500000,
      });
      await db.accounts.add(acc);

      // Tambahkan 6 transaksi
      for (let i = 1; i <= 6; i++) {
        await db.transactions.add({
          id: `tx-${i}`,
          shiftId: 'shift-1',
          userId: ownerUser.id,
          date: 1700000000000 + i * 1000,
          layanan: 'pulsa',
          nominal: 10000 * i,
          fee: 1000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          accountId: 'acc-kas-1',
          paymentStatus: 'lunas',
          status: 'ok',
          referenceNo: `REF-00${i}`,
          createdAt: 1700000000000 + i * 1000,
          updatedAt: 1700000000000 + i * 1000,
        });
      }

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      await waitFor(() => {
        const txCards = wrapper.findAll('.recent-tx-card');
        expect(txCards.length).toBe(5);
        // Yang terbaru tx-6 (Rp 60.000) harus muncul paling atas
        expect(txCards[0]?.text()).toContain('Rp 60.000');
      });
      expect(wrapper.text()).not.toContain('Belum ada transaksi');

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // BAGIAN B: Halaman & Fitur Transaksi Khusus Role Owner
  // ==========================================================================
  describe('Bagian B — Transaksi Khusus Owner', () => {
    it('B.1 Owner dapat melakukan pindah dana dengan shiftId = null tanpa shift aktif', async () => {
      const srcAcc = makeAccount({
        id: 'acc-src',
        name: 'Bank BCA',
        type: 'bank',
        initialBalance: 1000000,
      });
      const dstAcc = makeAccount({
        id: 'acc-dst',
        name: 'Kas Laci',
        type: 'kas',
        initialBalance: 100000,
      });
      await db.accounts.bulkAdd([srcAcc, dstAcc]);

      // Catat transaksi pindah_dana tanpa shift aktif
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pindah_dana',
          nominal: 250000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          paymentMethod: 'transfer',
          sourceAccountId: 'acc-src',
          destAccountId: 'acc-dst',
          paymentStatus: 'lunas',
          note: 'Tarik tunai untuk kas',
        },
        {
          actorUserId: ownerUser.id,
          shiftId: null,
        }
      );

      const tx = await db.transactions.get(txId);
      expect(tx?.shiftId).toBeNull();
      expect(tx?.layanan).toBe('pindah_dana');

      // Saldo sumber berkurang 250rb, saldo tujuan bertambah 250rb
      const balSrc = await accountService.getBalance('acc-src');
      const balDst = await accountService.getBalance('acc-dst');
      expect(balSrc).toBe(750000);
      expect(balDst).toBe(350000);
    });

    it('B.2 Menolak transaksi jika saldo akun sumber tidak mencukupi', async () => {
      const srcAcc = makeAccount({
        id: 'acc-empty',
        name: 'Bank Kosong',
        type: 'bank',
        initialBalance: 50000,
      });
      const dstAcc = makeAccount({
        id: 'acc-target',
        name: 'Kas',
        type: 'kas',
        initialBalance: 10000,
      });
      await db.accounts.bulkAdd([srcAcc, dstAcc]);

      await expect(
        transactionService.addTransaction(
          {
            layanan: 'pindah_dana',
            nominal: 100000, // melebihi saldo 50.000
            fee: 0,
            feePaidBy: 'cash',
            feeManualOverride: false,
            date: Date.now(),
            paymentMethod: 'transfer',
            sourceAccountId: 'acc-empty',
            destAccountId: 'acc-target',
            paymentStatus: 'lunas',
          },
          {
            actorUserId: ownerUser.id,
            shiftId: null,
          }
        )
      ).rejects.toThrow('Saldo akun sumber tidak mencukupi.');
    });

    it('B.3 Pembelian stok menambah stok produk aksesoris (+qty), dan void mengembalikan stok', async () => {
      const srcAcc = makeAccount({
        id: 'acc-bank-stok',
        name: 'Bank Operasional',
        type: 'bank',
        initialBalance: 1000000,
      });
      await db.accounts.add(srcAcc);

      const prodAccId = await productService.addProduct(
        {
          name: 'Kabel Fast Charging Type-C',
          category: 'aksesoris',
          modal: 15000,
          hargaJual: 25000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      // Pembelian stok 15 pcs @ Rp 15.000 = Rp 225.000
      const txId = await transactionService.addTransaction(
        {
          layanan: 'pembelian_stok',
          nominal: 225000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          paymentMethod: 'transfer',
          sourceAccountId: 'acc-bank-stok',
          paymentStatus: 'lunas',
          productId: prodAccId,
          cartItems: [
            {
              productId: prodAccId,
              qty: 15,
              nominal: 225000,
            },
          ],
        },
        {
          actorUserId: ownerUser.id,
          shiftId: null,
        }
      );

      // Stok bertambah: 10 + 15 = 25 pcs
      let prod = await productService.getProduct(prodAccId);
      expect(prod?.stock).toBe(25);

      // Void transaksi pembelian stok
      await transactionService.voidTransaction(
        txId,
        {
          actorUserId: ownerUser.id,
          pin: '1234',
          reason: 'Salah beli model',
        }
      );

      // Stok kembali berkurang: 25 - 15 = 10 pcs
      prod = await productService.getProduct(prodAccId);
      expect(prod?.stock).toBe(10);
    });

    it('B.4 Operasional mengurangi saldo akun sumber', async () => {
      const srcAcc = makeAccount({
        id: 'acc-ops',
        name: 'Kas Kasir',
        type: 'kas',
        initialBalance: 500000,
      });
      await db.accounts.add(srcAcc);

      await transactionService.addTransaction(
        {
          layanan: 'operasional',
          nominal: 35000,
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          paymentMethod: 'tunai',
          sourceAccountId: 'acc-ops',
          paymentStatus: 'lunas',
          note: 'Beli kertas nota',
        },
        {
          actorUserId: ownerUser.id,
          shiftId: null,
        }
      );

      const bal = await accountService.getBalance('acc-ops');
      expect(bal).toBe(465000);
    });
  });

  // ==========================================================================
  // BAGIAN C: Pengurutan Berdasarkan Kategori
  // ==========================================================================
  describe('Bagian C — Pengurutan Semua Data Berdasarkan Kategori', () => {
    it('C.1 Akun Saldo: diurutkan berdasarkan kelompok (Kas -> Bank -> E-Wallet -> Server -> Provider), judul dinamis', async () => {
      const sampleAccounts = [
        makeAccount({ id: '1', name: 'Z-Bank Mandiri', type: 'bank' }),
        makeAccount({ id: '2', name: 'A-Bank BCA', type: 'bank' }),
        makeAccount({ id: '3', name: 'Kas Laci Toko', type: 'kas' }),
        makeAccount({ id: '4', name: 'GoPay Toko', type: 'ewallet' }),
        makeAccount({ id: '5', name: 'Digipos App', type: 'provider_app' }),
      ];
      await db.accounts.bulkAdd(sampleAccounts);

      const sorted = [...sampleAccounts].sort(compareAccounts);
      expect(sorted[0]?.type).toBe('kas');
      expect(sorted[1]?.name).toBe('A-Bank BCA');
      expect(sorted[2]?.name).toBe('Z-Bank Mandiri');
      expect(sorted[3]?.type).toBe('ewallet');
      expect(sorted[4]?.type).toBe('provider_app');

      await router.push('/accounts');
      await router.isReady();
      const wrapper = mount(AccountsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Judul dinamis: Akun Saldo (5 Akun), BUKAN "5 Kelompok"
      expect(wrapper.find('.page-title').text()).toBe('Akun Saldo (5 Akun)');
      // Header kelompok dengan count
      expect(wrapper.text()).toContain('KAS (1)');
      expect(wrapper.text()).toContain('REKENING BANK (2)');
      expect(wrapper.text()).toContain('E-WALLET (1)');
      expect(wrapper.text()).toContain('PROVIDER APP (1)');

      wrapper.unmount();
    });

    it('C.2 Master Produk: urutan kategori utama (pulsa -> token_pln -> game -> voucher -> perdana -> aksesoris)', () => {
      const prods: Pick<Product, 'name' | 'category' | 'operator'>[] = [
        { name: 'Aksesoris Case', category: 'aksesoris', operator: '' },
        { name: 'Voucher 5/7', category: 'voucher', operator: 'Telkomsel' },
        { name: 'Pulsa 50k', category: 'pulsa', operator: 'Indosat' },
        { name: 'Token Listrik 20k', category: 'token_pln', operator: 'PLN' },
        { name: 'Game Diamond ML', category: 'game', operator: 'Moonton' },
        { name: 'Perdana Cantik', category: 'perdana', operator: 'Telkomsel' },
      ];

      const sorted = [...prods].sort(compareProducts);
      expect(sorted.map((p) => p.category)).toEqual([
        'pulsa',
        'token_pln',
        'game',
        'voucher',
        'perdana',
        'aksesoris',
      ]);
    });

    it('C.3 Petugas (Users): Owner paling atas, lalu alfabetis', async () => {
      const users: Pick<User, 'name' | 'role'>[] = [
        { name: 'Zainal Kasir', role: 'kasir' },
        { name: 'Budi Owner', role: 'owner' },
        { name: 'Andi Admin', role: 'admin' },
      ];

      const sorted = [...users].sort(compareUsers);
      expect(sorted[0]?.name).toBe('Budi Owner');
      expect(sorted[1]?.name).toBe('Andi Admin');
      expect(sorted[2]?.name).toBe('Zainal Kasir');
    });

    it('C.4 Pelanggan (Customers): Alfabetis berdasarkan nama', async () => {
      const customers: Customer[] = [
        { id: '1', name: 'Zainuddin', phone: '081', balanceHutang: 0, createdAt: 1 },
        { id: '2', name: 'Ahmad', phone: '082', balanceHutang: 0, createdAt: 2 },
        { id: '3', name: 'Badrun', phone: '083', balanceHutang: 0, createdAt: 3 },
      ];
      await db.customers.bulkAdd(customers);

      const list = await customerService.listCustomers();
      expect(list.map((c) => c.name)).toEqual(['Ahmad', 'Badrun', 'Zainuddin']);
      expect(customers.sort(compareCustomers).map((c) => c.name)).toEqual(['Ahmad', 'Badrun', 'Zainuddin']);
    });

    it('C.5 Aturan Tarif (Fee Rules): minNom ascending', () => {
      const rules = [
        { id: '1', minNom: 500000 },
        { id: '2', minNom: 10000 },
        { id: '3', minNom: 100000 },
      ];
      const sorted = [...rules].sort(compareFeeRules);
      expect(sorted.map((r) => r.minNom)).toEqual([10000, 100000, 500000]);
    });

    it('C.6 TransaksiView: filter dikelompokkan (Penjualan, Transfer & Top-up, Lainnya)', async () => {
      await router.push('/transactions');
      await router.isReady();
      const wrapper = mount(TransactionsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const options = wrapper.findAll('select#filter-select option');
      const optValues = options.map((o) => o.attributes('value'));
      expect(optValues).toContain('group_penjualan');
      expect(optValues).toContain('group_transfer');
      expect(optValues).toContain('group_lainnya');

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // BAGIAN D: Master Produk Katalog Server Pulsa & Sinkronisasi
  // ==========================================================================
  describe('Bagian D — Katalog Server Pulsa & Sinkronisasi', () => {
    it('D.1 mapSupabaseCategory: HANYA Pulsa, PLN, dan Games yang dipetakan; lainnya null', () => {
      // Yang diterima
      expect(mapSupabaseCategory('Pulsa')).toBe('pulsa');
      expect(mapSupabaseCategory('PULSA')).toBe('pulsa');
      expect(mapSupabaseCategory(' pulsa ')).toBe('pulsa');
      expect(mapSupabaseCategory('PLN')).toBe('token_pln');
      expect(mapSupabaseCategory('pln')).toBe('token_pln');
      expect(mapSupabaseCategory('token_pln')).toBe('token_pln');
      expect(mapSupabaseCategory('Games')).toBe('game');
      expect(mapSupabaseCategory('games')).toBe('game');
      expect(mapSupabaseCategory('game')).toBe('game');

      // Yang DITOLAK / dilewati (revisi 20 Nov 2026)
      expect(mapSupabaseCategory('Data')).toBeNull();
      expect(mapSupabaseCategory('E-Money')).toBeNull();
      expect(mapSupabaseCategory('Masa Aktif')).toBeNull();
      expect(mapSupabaseCategory('Pascabayar')).toBeNull();
      expect(mapSupabaseCategory('Paket SMS & Telpon')).toBeNull();
      expect(mapSupabaseCategory('TV')).toBeNull();
      expect(mapSupabaseCategory('Aktivasi Voucher')).toBeNull();
      expect(mapSupabaseCategory('Gas')).toBeNull();
      expect(mapSupabaseCategory('Tidak Dikenal')).toBeNull();
      expect(mapSupabaseCategory('')).toBeNull();
      expect(mapSupabaseCategory(null)).toBeNull();
      expect(mapSupabaseCategory(undefined)).toBeNull();
    });

    it('D.2 syncCatalog: hanya menyimpan Pulsa, PLN, Game ke cache; Data & E-Money dilewati', async () => {
      const mockEq = vi.fn().mockResolvedValue({
        data: [
          { sku_code: 'PULSA-1', product_name: 'Telkomsel 50K', category: 'Pulsa', brand: 'Telkomsel' },
          { sku_code: 'PLN-1', product_name: 'Token 20K', category: 'PLN', brand: 'PLN' },
          { sku_code: 'GAME-1', product_name: 'ML 86 Diamond', category: 'Games', brand: 'Mobile Legends' },
          { sku_code: 'DATA-1', product_name: 'Internet 10GB', category: 'Data', brand: 'Telkomsel' },
          { sku_code: 'EMONEY-1', product_name: 'Dana 50K', category: 'E-Money', brand: 'Dana' },
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

      // Hanya 3 yang disimpan
      expect(res.added).toBe(3);
      const cached = await db.productCatalogCache.toArray();
      expect(cached.length).toBe(3);
      const categories = cached.map((c) => c.category);
      expect(categories).toContain('pulsa');
      expect(categories).toContain('token_pln');
      expect(categories).toContain('game');
      expect(categories).not.toContain('data');
    });

    it('D.3 MastersView: Tab Paket Data diganti Game; produk katalog muncul dengan badge KATALOG', async () => {
      // Masukkan katalog
      await db.productCatalogCache.add({
        id: 'SKU-ML-86',
        name: 'Mobile Legends 86 Diamond',
        category: 'game',
        operator: 'Moonton',
        denomination: '',
        isActive: true,
        updatedAt: Date.now(),
      });

      await router.push('/masters');
      await router.isReady();
      const wrapper = mount(MastersView, {
        global: { plugins: [router] },
      });
      await waitFor(() => {
        // Cek kartu produk katalog
        const card = wrapper.find('[data-testid="product-card-SKU-ML-86"]');
        expect(card.exists()).toBe(true);
        expect(card.find('[data-testid="badge-catalog"]').text()).toBe('KATALOG');
        expect(card.text()).toContain('Jual: —');
        expect(card.text()).toContain('Modal: —');
      });

      // Cek chip tab: Game ada, Paket Data tidak ada
      const tabs = wrapper.findAll('.cat-tab').map((t) => t.text());
      expect(tabs).toContain('Game');
      expect(tabs).not.toContain('Paket Data');

      wrapper.unmount();
    });

    it('D.4 Deduplikasi: Katalog yang sudah menjadi produk lokal tidak tampil dobel', async () => {
      // Katalog entry
      await db.productCatalogCache.add({
        id: 'SKU-PLN-50',
        name: 'Token PLN 50.000',
        category: 'token_pln',
        operator: 'PLN',
        denomination: '',
        isActive: true,
        updatedAt: Date.now(),
      });

      // Produk lokal yang sudah dibuat dari SKU-PLN-50
      await db.products.add({
        id: 'prod-local-pln',
        name: 'Token PLN 50.000',
        category: 'token_pln',
        operator: 'PLN',
        modal: 50500,
        hargaJual: 53000,
        stock: null,
        stockMin: 0,
        isActive: true,
        externalProductRef: 'SKU-PLN-50',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      await router.push('/masters');
      await router.isReady();
      const wrapper = mount(MastersView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Hanya produk lokal yang muncul, kartu katalog SKU-PLN-50 di-dedupe
      expect(wrapper.find('[data-testid="product-card-prod-local-pln"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="product-card-SKU-PLN-50"]').exists()).toBe(false);

      wrapper.unmount();
    });

    it('D.5 ProductFormView: membaca query ?catalog=<sku>, prefill nama & kategori, simpan jadi produk lokal', async () => {
      await db.productCatalogCache.add({
        id: 'SKU-TSEL-50K',
        name: 'Pulsa Telkomsel 50.000',
        category: 'pulsa',
        operator: 'Telkomsel',
        denomination: '',
        isActive: true,
        updatedAt: Date.now(),
      });

      await router.push('/masters/product/add?catalog=SKU-TSEL-50K');
      await router.isReady();
      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await waitFor(() => {
        const nameInput = wrapper.find('#product-name').element as HTMLInputElement;
        expect(nameInput.value).toBe('Pulsa Telkomsel 50.000');
        const catSelect = wrapper.find('#product-category').element as HTMLSelectElement;
        expect(catSelect.value).toBe('pulsa');
      });

      // Isi modal dan harga jual manual
      await wrapper.find('#product-modal').setValue('49500');
      await wrapper.find('#product-harga-jual').setValue('52000');
      await flushPromises();

      // Submit form
      await wrapper.find('form').trigger('submit');
      await waitFor(async () => {
        // Cek bahwa produk lokal berhasil dibuat dari katalog
        const created = await db.products.where('externalProductRef').equals('SKU-TSEL-50K').first();
        expect(created).toBeDefined();
        expect(created?.name).toBe('Pulsa Telkomsel 50.000');
        expect(created?.modal).toBe(49500);
        expect(created?.hargaJual).toBe(52000);
        expect(created?.category).toBe('pulsa');
      });

      wrapper.unmount();
    });
  });
});
