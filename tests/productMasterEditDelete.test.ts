import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { productService } from '../src/services/productService';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import MastersView from '../src/views/MastersView.vue';
import ProductFormView from '../src/views/ProductFormView.vue';
import type { User } from '../src/db/types';

describe('Master Produk: Fungsi Edit dan Hapus', () => {
  const ownerUser: User = {
    id: 'owner-master',
    name: 'Owner Master',
    role: 'owner',
    pinHash: 'hash-owner',
    isActive: true,
    createdAt: Date.now(),
  };

  const kasirUser: User = {
    id: 'kasir-master',
    name: 'Kasir Master',
    role: 'kasir',
    pinHash: 'hash-kasir',
    isActive: true,
    createdAt: Date.now(),
  };

  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.products.clear();
    await db.brands.clear();
    await db.auditLogs.clear();
    await db.users.clear();

    await db.users.add(ownerUser);
    await db.users.add(kasirUser);

    localStorage.setItem('buku_konter_active_user_id', ownerUser.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(ownerUser);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
    const authStore = useAuthStore();
    authStore.currentUser = ownerUser;

    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  describe('1. ProductService.updateProduct & deleteProduct', () => {
    it('updateProduct berhasil memperbarui data produk dan mencatat audit log', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Voucher 3GB',
          category: 'voucher',
          operator: 'Telkomsel',
          modal: 15000,
          hargaJual: 18000,
          stock: 5,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await productService.updateProduct(
        prodId,
        {
          name: 'Voucher 4GB Promo',
          modal: 16000,
          hargaJual: 20000,
          stock: 12,
          stockMin: 3,
        },
        { actorUserId: ownerUser.id }
      );

      const updated = await productService.getProduct(prodId);
      expect(updated?.name).toBe('Voucher 4GB Promo');
      expect(updated?.modal).toBe(16000);
      expect(updated?.hargaJual).toBe(20000);
      expect(updated?.stock).toBe(12);
      expect(updated?.stockMin).toBe(3);

      const logs = await db.auditLogs.where('entityId').equals(prodId).toArray();
      expect(logs.some((l) => l.action === 'ubah_modal')).toBe(true);
      expect(logs.some((l) => l.action === 'ubah_harga_jual')).toBe(true);
      expect(logs.some((l) => l.action === 'ubah_produk_master')).toBe(true);
    });

    it('updateProduct mengubah kategori fisik ke digital mengosongkan stock menjadi null', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Aksesoris Kabel',
          category: 'aksesoris',
          modal: 10000,
          hargaJual: 15000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await productService.updateProduct(
        prodId,
        {
          category: 'pulsa',
          stock: 25, // harus di-null-kan karena digital
        },
        { actorUserId: ownerUser.id }
      );

      const updated = await productService.getProduct(prodId);
      expect(updated?.category).toBe('pulsa');
      expect(updated?.stock).toBeNull();
    });

    it('updateProduct menolak data tidak valid (nama kosong, modal/harga jual negatif)', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Produk Awal',
          category: 'pulsa',
          modal: 5000,
          hargaJual: 7000,
          stock: null,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await expect(
        productService.updateProduct(prodId, { name: '   ' }, { actorUserId: ownerUser.id })
      ).rejects.toThrow('Nama produk wajib diisi.');

      await expect(
        productService.updateProduct(prodId, { modal: -100 }, { actorUserId: ownerUser.id })
      ).rejects.toThrow('Modal produk harus bilangan bulat positif.');

      await expect(
        productService.updateProduct(prodId, { hargaJual: -500 }, { actorUserId: ownerUser.id })
      ).rejects.toThrow('Harga jual produk harus bilangan bulat positif.');
    });

    it('updateProduct menolak akses jika dilakukan oleh kasir', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Produk Toko',
          category: 'voucher',
          modal: 10000,
          hargaJual: 12000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await expect(
        productService.updateProduct(prodId, { hargaJual: 13000 }, { actorUserId: kasirUser.id })
      ).rejects.toThrow(/Hanya Owner dan Admin/);
    });

    it('deleteProduct menghapus produk dari database dan mencatat audit log', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Voucher Hangus',
          category: 'voucher',
          modal: 10000,
          hargaJual: 12000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await productService.deleteProduct(prodId, { actorUserId: ownerUser.id });

      const inDb = await productService.getProduct(prodId);
      expect(inDb).toBeUndefined();

      const logs = await db.auditLogs.where('entityId').equals(prodId).toArray();
      const deleteLog = logs.find((l) => l.action === 'hapus_produk_master');
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.actorUserId).toBe(ownerUser.id);
    });

    it('deleteProduct menolak produk yang tidak ada dan menolak kasir', async () => {
      await expect(
        productService.deleteProduct('random-id', { actorUserId: ownerUser.id })
      ).rejects.toThrow('Produk tidak ditemukan.');

      const prodId = await productService.addProduct(
        {
          name: 'Produk Uji',
          category: 'pulsa',
          modal: 5000,
          hargaJual: 6000,
          stock: null,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await expect(
        productService.deleteProduct(prodId, { actorUserId: kasirUser.id })
      ).rejects.toThrow(/Hanya Owner dan Admin/);
    });
  });

  describe('2. MastersView: Card Produk Dapat Diklik untuk Edit', () => {
    it('klik card produk memicu navigasi router ke halaman edit', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Voucher Telkomsel 10GB',
          category: 'voucher',
          operator: 'Telkomsel',
          modal: 25000,
          hargaJual: 28000,
          stock: 8,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const routerPushSpy = vi.spyOn(router, 'push');

      const wrapper = mount(MastersView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const card = wrapper.find(`[data-testid="product-card-${prodId}"]`);
      expect(card.exists()).toBe(true);

      await card.trigger('click');
      await flushPromises();

      expect(routerPushSpy).toHaveBeenCalledWith(`/masters/product/${prodId}/edit`);
    });
  });

  describe('3. ProductFormView: Mode Edit dengan Pilihan Update dan Hapus', () => {
    it('menampilkan form tambah saat tanpa parameter id', async () => {
      await router.push('/masters/product/add');
      await flushPromises();

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      expect(wrapper.find('.page-title').text()).toBe('Tambah Produk Master');
      expect(wrapper.find('[data-testid="btn-save-product"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-update-product"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="btn-delete-product"]').exists()).toBe(false);
    });

    it('menampilkan form edit dengan data terisi serta tombol Update & Hapus', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Perdana Smartfren 30GB',
          category: 'perdana',
          operator: 'Smartfren',
          modal: 40000,
          hargaJual: 50000,
          stock: 15,
          stockMin: 3,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await router.push(`/masters/product/${prodId}/edit`);
      await router.isReady();
      await flushPromises();

      expect(router.currentRoute.value.path).toBe(`/masters/product/${prodId}/edit`);
      expect(router.currentRoute.value.params['id']).toBe(prodId);

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      expect(wrapper.find('.page-title').text()).toBe('Edit Produk Master');
      expect((wrapper.find('#product-name').element as HTMLInputElement).value).toBe('Perdana Smartfren 30GB');
      expect((wrapper.find('#product-category').element as HTMLSelectElement).value).toBe('perdana');
      expect((wrapper.find('#product-modal').element as HTMLInputElement).value).toBe('40.000');
      expect((wrapper.find('#product-harga-jual').element as HTMLInputElement).value).toBe('50.000');
      expect((wrapper.find('#product-stock').element as HTMLInputElement).value).toBe('15');
      expect((wrapper.find('#product-stock-min').element as HTMLInputElement).value).toBe('3');

      // Tombol Update dan Hapus tampil
      expect(wrapper.find('[data-testid="btn-update-product"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-delete-product"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-save-product"]').exists()).toBe(false);
    });

    it('menekan tombol Update Produk memanggil updateProduct dan mengarahkan ke /masters', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Voucher Lama',
          category: 'voucher',
          modal: 10000,
          hargaJual: 12000,
          stock: 4,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await router.push(`/masters/product/${prodId}/edit`);
      await router.isReady();
      await flushPromises();

      expect(router.currentRoute.value.path).toBe(`/masters/product/${prodId}/edit`);
      expect(router.currentRoute.value.params['id']).toBe(prodId);

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Ubah nama & harga jual
      await wrapper.find('#product-name').setValue('Voucher Baru Update');
      await wrapper.find('#product-harga-jual').setValue('14000');
      await wrapper.find('#product-harga-jual').trigger('input');

      await wrapper.find('form').trigger('submit.prevent');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      const updated = await productService.getProduct(prodId);
      expect(updated?.name).toBe('Voucher Baru Update');
      expect(updated?.hargaJual).toBe(14000);
      expect(router.currentRoute.value.path).toBe('/masters');
    });

    it('menekan tombol Hapus Produk menampilkan dialog konfirmasi, dan konfirmasi menghapus produk', async () => {
      const prodId = await productService.addProduct(
        {
          name: 'Produk Yang Akan Dihapus',
          category: 'voucher',
          modal: 10000,
          hargaJual: 12000,
          stock: 1,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      await router.push(`/masters/product/${prodId}/edit`);
      await router.isReady();
      await flushPromises();

      expect(router.currentRoute.value.path).toBe(`/masters/product/${prodId}/edit`);
      expect(router.currentRoute.value.params['id']).toBe(prodId);

      const wrapper = mount(ProductFormView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Modal konfirmasi awalnya tidak muncul
      expect(wrapper.find('[data-testid="delete-confirm-modal"]').exists()).toBe(false);

      // Klik tombol Hapus Produk
      const btnDelete = wrapper.find('[data-testid="btn-delete-product"]');
      await btnDelete.trigger('click');
      await flushPromises();

      // Modal konfirmasi muncul
      const modal = wrapper.find('[data-testid="delete-confirm-modal"]');
      expect(modal.exists()).toBe(true);
      expect(modal.text()).toContain('Hapus Produk?');
      expect(modal.text()).toContain('Produk Yang Akan Dihapus');

      // Klik tombol Ya, Hapus
      const btnConfirm = wrapper.find('[data-testid="btn-confirm-delete"]');
      await btnConfirm.trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Produk terhapus dari DB dan diarahkan kembali ke /masters
      const inDb = await productService.getProduct(prodId);
      expect(inDb).toBeUndefined();
      expect(router.currentRoute.value.path).toBe('/masters');
    });
  });
});
