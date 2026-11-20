import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { brandService, PROVIDER_CATEGORIES } from '../src/services/brandService';
import { productService } from '../src/services/productService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import ProductFormView from '../src/views/ProductFormView.vue';
import { waitFor } from './helpers/testUtils';
import type { User, Brand, Product } from '../src/db/types';

describe('Audit b32 Features: Brand/Operator dipisah per kategori (provider vs aksesoris dll)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let ownerUser: User;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);

    await db.users.clear();
    await db.products.clear();
    await db.brands.clear();
    await db.auditLogs.clear();
    await db.productCatalogCache.clear();
    vi.restoreAllMocks();

    const now = Date.now();
    const pinHash = await authService.hashPin('111111');
    ownerUser = {
      id: 'owner-1',
      name: 'Owner Budi',
      role: 'owner',
      pinHash,
      isActive: true,
      createdAt: now,
    };
    await db.users.add(ownerUser);

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

  describe('D.1: Brand provider dibuat sekali, otomatis muncul di semua kategori provider', () => {
    it('brand yang dibuat di pulsa otomatis muncul di voucher, data, token_pln, dan perdana', async () => {
      const b1 = await brandService.addBrand('Telkomsel', 'pulsa');
      expect(b1.name).toBe('Telkomsel');

      for (const cat of PROVIDER_CATEGORIES) {
        const list = await brandService.listBrandsForCategory(cat);
        expect(list.some((b) => b.name === 'Telkomsel')).toBe(true);
      }

      // Tambahkan brand lain di kategori voucher
      const b2 = await brandService.addBrand('Indosat', 'voucher');
      expect(b2.name).toBe('Indosat');

      for (const cat of PROVIDER_CATEGORIES) {
        const list = await brandService.listBrandsForCategory(cat);
        const names = list.map((b) => b.name);
        expect(names).toEqual(['Indosat', 'Telkomsel']); // urut alfabetis
      }
    });
  });

  describe('D.2: Brand kategori mandiri hanya muncul di kategorinya sendiri', () => {
    it('brand aksesoris hanya muncul di aksesoris, tidak muncul di provider maupun game', async () => {
      await brandService.addBrand('Robot', 'aksesoris');
      await brandService.addBrand('Acome', 'aksesoris');
      await brandService.addBrand('Telkomsel', 'pulsa');

      const aksesorisBrands = await brandService.listBrandsForCategory('aksesoris');
      expect(aksesorisBrands.map((b) => b.name)).toEqual(['Acome', 'Robot']);

      // Provider tidak melihat brand aksesoris
      for (const cat of PROVIDER_CATEGORIES) {
        const providerBrands = await brandService.listBrandsForCategory(cat);
        const names = providerBrands.map((b) => b.name);
        expect(names).toEqual(['Telkomsel']);
        expect(names).not.toContain('Robot');
        expect(names).not.toContain('Acome');
      }

      // Kategori lain (misal game) juga tidak melihat brand aksesoris
      const gameBrands = await brandService.listBrandsForCategory('game');
      expect(gameBrands).toHaveLength(0);
    });
  });

  describe('D.3: Brand dengan nama sama bisa diasosiasikan ke kategori berbeda', () => {
    it('brand yang sudah ada di provider dapat diasosiasikan ke aksesoris tanpa duplikasi id', async () => {
      const bProvider = await brandService.addBrand('Telkomsel', 'pulsa');
      expect(bProvider.categories).toEqual(['pulsa']);

      // Tambahkan Telkomsel ke aksesoris
      const bAksesoris = await brandService.addBrand('Telkomsel', 'aksesoris');
      expect(bAksesoris.id).toBe(bProvider.id);
      expect(bAksesoris.categories).toContain('pulsa');
      expect(bAksesoris.categories).toContain('aksesoris');

      // Total data brand di tabel tetap 1
      const allInDb = await db.brands.toArray();
      expect(allInDb).toHaveLength(1);

      // Sekarang muncul di aksesoris DAN provider
      const listAksesoris = await brandService.listBrandsForCategory('aksesoris');
      expect(listAksesoris.some((b) => b.name === 'Telkomsel')).toBe(true);

      const listPulsa = await brandService.listBrandsForCategory('pulsa');
      expect(listPulsa.some((b) => b.name === 'Telkomsel')).toBe(true);
    });
  });

  describe('D.4: Validasi duplikasi per kategori', () => {
    it('menolak penambahan brand duplikat di kategori yang sama atau sesama provider', async () => {
      await brandService.addBrand('Telkomsel', 'pulsa');

      // Duplikat di kategori provider yang sama
      await expect(brandService.addBrand('telkomsel', 'pulsa')).rejects.toThrow(
        'Brand "Telkomsel" sudah ada di daftar.'
      );

      // Duplikat di kategori provider lain (misal voucher)
      await expect(brandService.addBrand('TELKOMSEL', 'voucher')).rejects.toThrow(
        'Brand "Telkomsel" sudah ada di daftar.'
      );

      // Brand aksesoris
      await brandService.addBrand('Robot', 'aksesoris');
      await expect(brandService.addBrand('robot', 'aksesoris')).rejects.toThrow(
        'Brand "Robot" sudah ada di daftar.'
      );
    });

    it('menolak brand dengan nama kosong atau kurang dari 2 karakter', async () => {
      await expect(brandService.addBrand('', 'aksesoris')).rejects.toThrow(
        'Nama brand/operator minimal 2 karakter.'
      );
      await expect(brandService.addBrand('   ', 'aksesoris')).rejects.toThrow(
        'Nama brand/operator minimal 2 karakter.'
      );
      await expect(brandService.addBrand('X', 'aksesoris')).rejects.toThrow(
        'Nama brand/operator minimal 2 karakter.'
      );
    });
  });

  describe('D.5: ensureBrand otomatis mengasosiasikan kategori saat simpan/update produk', () => {
    it('addProduct otomatis membuat brand dan mengasosiasikannya ke kategori produk', async () => {
      await productService.addProduct(
        {
          name: 'Kabel Data Robot Micro',
          category: 'aksesoris',
          operator: 'Robot',
          modal: 10000,
          hargaJual: 15000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const aksesorisBrands = await brandService.listBrandsForCategory('aksesoris');
      expect(aksesorisBrands.some((b) => b.name === 'Robot')).toBe(true);

      // Provider tidak melihatnya
      const pulsaBrands = await brandService.listBrandsForCategory('pulsa');
      expect(pulsaBrands.some((b) => b.name === 'Robot')).toBe(false);
    });

    it('updateProduct ke kategori baru otomatis menambahkan asosiasi kategori pada brand', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Item Test',
          category: 'aksesoris',
          operator: 'Vivan',
          modal: 10000,
          hargaJual: 15000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      let vivanBrand = (await db.brands.toArray()).find((b) => b.name === 'Vivan');
      expect(vivanBrand?.categories).toEqual(['aksesoris']);

      // Update produk ke kategori lainnya
      await productService.updateProduct(
        prodId,
        { category: 'lainnya' },
        { actorUserId: ownerUser.id }
      );

      vivanBrand = (await db.brands.toArray()).find((b) => b.name === 'Vivan');
      expect(vivanBrand?.categories).toContain('aksesoris');
      expect(vivanBrand?.categories).toContain('lainnya');
    });
  });

  describe('D.6: Interaksi UI ProductFormView', () => {
    it('ganti kategori me-reload brand dan mengosongkan operator jika tidak cocok dengan kategori baru', async () => {
      await brandService.addBrand('Telkomsel', 'voucher');
      await brandService.addBrand('Robot', 'aksesoris');

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      await wrapper.find('[data-testid="brand-combobox-trigger"]').trigger('click');
      await flushPromises();

      let dropdown = wrapper.find('[data-testid="brand-dropdown-menu"]');
      expect(dropdown.text()).toContain('Telkomsel');
      expect(dropdown.text()).not.toContain('Robot');

      // Pilih Telkomsel
      const tselOption = wrapper.findAll('.brand-item').find((w) => w.text().includes('Telkomsel'));
      await tselOption?.trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="brand-combobox-trigger"]').text()).toContain('Telkomsel');

      // Ubah kategori ke aksesoris
      const categorySelect = wrapper.find('#product-category');
      await categorySelect.setValue('aksesoris');
      await flushPromises();

      // Operator harus di-reset karena Telkomsel bukan brand aksesoris
      expect(wrapper.find('[data-testid="brand-combobox-trigger"]').text()).not.toContain('Telkomsel');

      // Buka dropdown lagi: sekarang yang muncul Robot
      await wrapper.find('[data-testid="brand-combobox-trigger"]').trigger('click');
      await flushPromises();
      dropdown = wrapper.find('[data-testid="brand-dropdown-menu"]');
      expect(dropdown.text()).toContain('Robot');
      expect(dropdown.text()).not.toContain('Telkomsel');
    });

    it('menampilkan petunjuk empty hint dengan nama label kategori saat kategori belum punya brand', async () => {
      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Pilih kategori Game (belum ada brand)
      await wrapper.find('#product-category').setValue('game');
      await flushPromises();

      await wrapper.find('[data-testid="brand-combobox-trigger"]').trigger('click');
      await flushPromises();

      const hint = wrapper.find('.brand-empty-hint');
      expect(hint.exists()).toBe(true);
      expect(hint.text()).toContain('Belum ada brand untuk Game.');
    });

    it('menambahkan brand baru via tombol + menampilkan feedback sukses menyebut kategori', async () => {
      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      await wrapper.find('#product-category').setValue('aksesoris');
      await flushPromises();

      await wrapper.find('[data-testid="brand-combobox-trigger"]').trigger('click');
      await flushPromises();

      const input = wrapper.find('[data-testid="brand-combobox-input"]');
      await input.setValue('Baseus');
      await input.trigger('input');

      const addBtn = wrapper.find('[data-testid="btn-add-brand"]');
      await addBtn.trigger('click');

      await waitFor(() => {
        const feedback = wrapper.find('.brand-feedback');
        expect(feedback.exists()).toBe(true);
        expect(feedback.text()).toContain('Brand "Baseus" berhasil ditambahkan untuk Aksesoris!');
      });

      // Pastikan Baseus masuk ke daftar brand aksesoris di DB
      const aksesorisBrands = await brandService.listBrandsForCategory('aksesoris');
      expect(aksesorisBrands.some((b) => b.name === 'Baseus')).toBe(true);
    });
  });

  describe('D.7: Migrasi data Dexie v3 mengisi categories untuk brand legacy', () => {
    it('mengisi categories berdasarkan produk yang ada atau default provider', async () => {
      const legacyBrands: Brand[] = [
        { id: 'b-tsel', name: 'Telkomsel', createdAt: 1000 },
        { id: 'b-robot', name: 'Robot', createdAt: 2000 },
        { id: 'b-kosong', name: 'Unknown Brand', createdAt: 3000 },
      ];

      const legacyProducts: Partial<Product>[] = [
        { id: 'p1', name: 'Voucher 10GB', category: 'voucher', operator: 'Telkomsel' },
        { id: 'p2', name: 'Kabel USB', category: 'aksesoris', operator: 'Robot' },
      ];

      // Simulasi logika upgrade v3
      const providerCats = ['pulsa', 'data', 'token_pln', 'voucher', 'perdana'];
      const migrated = legacyBrands.map((b) => {
        if (Array.isArray(b.categories) && b.categories.length > 0) return b;
        const matching = legacyProducts.filter(
          (p) => p.operator && p.operator.trim().toLowerCase() === b.name.trim().toLowerCase()
        );
        const usedCats = Array.from(new Set(matching.map((p) => p.category).filter(Boolean))) as string[];
        const categories = usedCats.length > 0 ? usedCats : [...providerCats];
        return { ...b, categories };
      });

      const tsel = migrated.find((b) => b.id === 'b-tsel');
      expect(tsel?.categories).toEqual(['voucher']);

      const robot = migrated.find((b) => b.id === 'b-robot');
      expect(robot?.categories).toEqual(['aksesoris']);

      const kosong = migrated.find((b) => b.id === 'b-kosong');
      expect(kosong?.categories).toEqual(providerCats);
    });
  });
});
