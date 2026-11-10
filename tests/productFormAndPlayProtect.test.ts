import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { db } from '../src/db/database';
import { brandService } from '../src/services/brandService';
import { productService } from '../src/services/productService';
import { useSettingsStore } from '../src/stores/settingsStore';
import { useAuthStore } from '../src/stores/authStore';
import { AppError } from '../src/core/errors';
import router from '../src/router';
import ProductFormView from '../src/views/ProductFormView.vue';
import AppScaffold from '../src/components/AppScaffold.vue';
import UpdateDialog from '../src/components/UpdateDialog.vue';
import type { ApkUpdate } from '../src/services/liveUpdateService';

describe('b7: Brand Service, Form Tambah Produk Master & Play Protect Notice', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.products.clear();
    await db.brands.clear();
    await db.appSettings.clear();
    await db.users.clear();
    vi.restoreAllMocks();
  });

  describe('1. BrandService (CRUD & Validasi Brand)', () => {
    it('berhasil menambahkan brand dengan nama di-trim & minimal 2 karakter', async () => {
      const b1 = await brandService.addBrand('  Telkomsel  ');
      expect(b1.id).toBeDefined();
      expect(b1.name).toBe('Telkomsel');

      const brands = await brandService.listBrands();
      expect(brands).toHaveLength(1);
      expect(brands[0]?.name).toBe('Telkomsel');
    });

    it('menolak penambahan brand bila kosong atau kurang dari 2 karakter', async () => {
      await expect(brandService.addBrand('')).rejects.toThrow(AppError);
      await expect(brandService.addBrand(' ')).rejects.toThrow('minimal 2 karakter');
      await expect(brandService.addBrand('A')).rejects.toThrow('minimal 2 karakter');
    });

    it('menolak penambahan brand duplikat secara case-insensitive', async () => {
      await brandService.addBrand('Indosat Ooredoo');

      await expect(brandService.addBrand('indosat ooredoo')).rejects.toThrow(AppError);
      await expect(brandService.addBrand('INDOSAT OOREDOO')).rejects.toThrow('sudah ada di daftar');
    });

    it('listBrands mengembalikan daftar brand yang terurut secara alfabetis', async () => {
      await brandService.addBrand('XL Axiata');
      await brandService.addBrand('Axis');
      await brandService.addBrand('Telkomsel');

      const list = await brandService.listBrands();
      expect(list.map((b) => b.name)).toEqual(['Axis', 'Telkomsel', 'XL Axiata']);
    });

    it('menghapus brand dari daftar TIDAK mengubah produk lama yang sudah memakainya', async () => {
      // 1. Buat brand Telkomsel
      const b = await brandService.addBrand('Telkomsel');

      // Setup user admin/owner agar addProduct diizinkan
      await db.users.add({
        id: 'u1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      });

      // 2. Buat produk yang memakai brand Telkomsel dan memiliki denominasi lama
      const prodId = await productService.addProduct({
        name: 'Voucher Telkomsel 10GB',
        category: 'voucher',
        operator: 'Telkomsel',
        denomination: '10GB',
        modal: 25000,
        hargaJual: 30000,
        stock: 5,
        stockMin: 1,
        isActive: true,
      }, { actorUserId: 'u1' });

      const prodBefore = await db.products.get(prodId);
      expect(prodBefore?.operator).toBe('Telkomsel');
      expect(prodBefore?.denomination).toBe('10GB');

      // 3. Hapus brand Telkomsel
      await brandService.removeBrand(b.id);
      const remainingBrands = await brandService.listBrands();
      expect(remainingBrands).toHaveLength(0);

      // 4. Verifikasi produk lama di database tetap utuh dengan operator 'Telkomsel' & denominasi '10GB'
      const prodInDb = await db.products.get(prodId);
      expect(prodInDb?.operator).toBe('Telkomsel');
      expect(prodInDb?.denomination).toBe('10GB');
    });
  });

  describe('2. Form Tambah Produk Master (ProductFormView)', () => {
    it('urutan field baru: Kategori Produk berada di atas Nama Produk', () => {
      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });

      const labels = wrapper.findAll('.form-label').map((l) => l.text());
      expect(labels[0]).toBe('Kategori Produk');
      expect(labels[1]).toBe('Nama Produk (Wajib)');
      expect(labels[2]).toBe('Operator / Brand');
    });

    it('field Denominasi / Paket TIDAK LAGI ada di form', () => {
      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });

      expect(wrapper.text()).not.toContain('Denominasi / Paket');
      expect(wrapper.find('input[placeholder="25.000 / 10GB"]').exists()).toBe(false);
    });

    it('combobox brand: dapat memfilter brand sesuai ketikan pencarian & menambah via tombol +', async () => {
      await brandService.addBrand('Telkomsel');
      await brandService.addBrand('Indosat');
      await brandService.addBrand('Smartfren');

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });

      await flushPromises();

      // Buka dropdown
      const input = wrapper.find('[data-testid="brand-combobox-input"]');
      await input.trigger('focus');
      await flushPromises();

      const dropdown = wrapper.find('[data-testid="brand-dropdown-menu"]');
      expect(dropdown.exists()).toBe(true);
      expect(dropdown.text()).toContain('Telkomsel');
      expect(dropdown.text()).toContain('Indosat');
      expect(dropdown.text()).toContain('Smartfren');

      // Filter ketikan "ind"
      await input.setValue('ind');
      await input.trigger('input');
      await flushPromises();

      expect(dropdown.text()).toContain('Indosat');
      expect(dropdown.text()).not.toContain('Telkomsel');
      expect(dropdown.text()).not.toContain('Smartfren');

      // Ketik brand baru "Tri" lalu tekan tombol +
      await input.setValue('Tri');
      const addBtn = wrapper.find('[data-testid="btn-add-brand"]');
      await addBtn.trigger('click');
      await flushPromises();

      // Brand baru "Tri" masuk ke database dan terpilih
      const allBrands = await brandService.listBrands();
      expect(allBrands.some((b) => b.name === 'Tri')).toBe(true);
      expect((input.element as HTMLInputElement).value).toBe('Tri');
    });

    it('tombol hapus brand di dalam dropdown menghapus brand dari referensi', async () => {
      const b = await brandService.addBrand('Axis');

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const input = wrapper.find('[data-testid="brand-combobox-input"]');
      await input.trigger('focus');
      await flushPromises();

      const deleteBtn = wrapper.find(`[data-testid="delete-brand-${b.id}"]`);
      expect(deleteBtn.exists()).toBe(true);

      await deleteBtn.trigger('click');
      await flushPromises();

      const brandsAfter = await brandService.listBrands();
      expect(brandsAfter).toHaveLength(0);
    });

    it('menyimpan produk baru menyimpan data dengan denomination: undefined', async () => {
      const authStore = useAuthStore();
      const testUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner' as const,
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      };
      await db.users.add(testUser);
      authStore.currentUser = testUser;

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Isi form
      await wrapper.find('#product-category').setValue('voucher');
      await wrapper.find('#product-name').setValue('Voucher Kuota 5GB');
      await wrapper.find('#product-modal').setValue('20000');
      await wrapper.find('#product-modal').trigger('input');
      await wrapper.find('#product-harga-jual').setValue('25000');
      await wrapper.find('#product-harga-jual').trigger('input');

      await wrapper.find('form').trigger('submit.prevent');
      await flushPromises();

      const products = await db.products.toArray();
      expect(products).toHaveLength(1);
      expect(products[0]?.name).toBe('Voucher Kuota 5GB');
      expect(products[0]?.category).toBe('voucher');
      expect(products[0]?.denomination).toBeUndefined();
    });
  });

  describe('3. AppScaffold Navigasi Auto-Hide saat Input Fokus', () => {
    it('sembunyikan nav bawah saat ada input di dalam main yang fokus, dan kembalikan saat blur', async () => {
      vi.useFakeTimers();

      const wrapper = mount(AppScaffold, {
        global: { plugins: [router] },
        slots: {
          default: `
            <div id="test-form">
              <input id="input-1" type="text" />
              <input id="input-2" type="text" />
            </div>
          `,
        },
      });

      // Awal: nav bawah muncul
      expect(wrapper.find('.bottom-nav').exists()).toBe(true);
      expect(wrapper.find('.app-main').classes()).not.toContain('no-nav-padding');

      const input1 = wrapper.find('#input-1');
      const input2 = wrapper.find('#input-2');

      // 1. Fokus ke input-1 -> nav bawah sembunyi
      await input1.trigger('focusin');
      await flushPromises();

      expect(wrapper.find('.bottom-nav').exists()).toBe(false);
      expect(wrapper.find('.app-main').classes()).toContain('no-nav-padding');

      // 2. Pindah fokus ke input-2 -> nav bawah tetap sembunyi (tidak berkedip)
      await input1.trigger('focusout');
      await input2.trigger('focusin');
      vi.advanceTimersByTime(50);
      await flushPromises();

      expect(wrapper.find('.bottom-nav').exists()).toBe(false);

      // 3. Blur dari semua input -> setelah jeda 100ms nav bawah muncul kembali
      await input2.trigger('focusout');
      vi.advanceTimersByTime(150);
      await flushPromises();

      expect(wrapper.find('.bottom-nav').exists()).toBe(true);
      expect(wrapper.find('.app-main').classes()).not.toContain('no-nav-padding');

      vi.useRealTimers();
    });

    it('prop hideNav: true tetap menyembunyikan nav meskipun tidak ada input yang fokus', () => {
      const wrapper = mount(AppScaffold, {
        props: { hideNav: true },
        global: { plugins: [router] },
      });

      expect(wrapper.find('.bottom-nav').exists()).toBe(false);
    });
  });

  describe('4. UpdateDialog & Penjelasan Play Protect', () => {
    const mockUpdate: ApkUpdate = {
      kind: 'apk',
      versionCode: 7,
      versionName: '0.2.0',
      downloadUrl: 'https://example.com/buku-konter-v0.2.0-b7.apk',
      changelog: 'Fitur b7 baru',
      forceUpdate: false,
    };

    it('menampilkan notice Play Protect sebelum unduhan pertama kali', async () => {
      const settingsStore = useSettingsStore();
      await settingsStore.loadSettings();
      expect(settingsStore.hidePlayProtectNotice).toBe(false);

      const wrapper = mount(UpdateDialog, {
        props: { update: mockUpdate },
      });
      await flushPromises();

      const notice = wrapper.find('[data-testid="play-protect-notice"]');
      expect(notice.exists()).toBe(true);
      expect(notice.text()).toContain('Play Protect');
      expect(notice.text()).toContain('Aplikasi berbahaya diblokir');
      expect(notice.text()).toContain('Tetap instal');
      expect(wrapper.find('[data-testid="dont-show-again-checkbox"]').exists()).toBe(true);
    });

    it('mencentang "Jangan tampilkan lagi" menyimpan pilihan ke appSettings secara permanen', async () => {
      const settingsStore = useSettingsStore();
      await settingsStore.loadSettings();

      const wrapper = mount(UpdateDialog, {
        props: { update: mockUpdate },
      });
      await flushPromises();

      // Centang checkbox
      const checkbox = wrapper.find('[data-testid="dont-show-again-checkbox"]');
      await checkbox.setValue(true);
      await flushPromises();

      // Klik update
      const updateBtn = wrapper.find('.btn-update-action');
      await updateBtn.trigger('click');
      await flushPromises();

      // Pilihan tersimpan di settingsStore dan database
      expect(settingsStore.hidePlayProtectNotice).toBe(true);
      const inDb = await db.appSettings.get(1);
      expect(inDb?.hidePlayProtectNotice).toBe(true);

      // Buka dialog baru: notice TIDAK LAGI muncul
      const wrapper2 = mount(UpdateDialog, {
        props: { update: mockUpdate },
      });
      await flushPromises();

      expect(wrapper2.find('[data-testid="play-protect-notice"]').exists()).toBe(false);
    });
  });
});
