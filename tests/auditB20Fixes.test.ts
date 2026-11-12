import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { transactionService } from '../src/services/transactionService';
import { accountService } from '../src/services/accountService';
import { productService } from '../src/services/productService';
import { shiftService } from '../src/services/shiftService';
import { useAuthStore } from '../src/stores/authStore';
import HomeView from '../src/views/HomeView.vue';
import ShiftsView from '../src/views/ShiftsView.vue';
import MastersView from '../src/views/MastersView.vue';
import ProductFormView from '../src/views/ProductFormView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import type { User, Product } from '../src/db/types';

describe('Audit b19 -> b20 Fixes Suite', () => {
  let ownerUser: User;
  let adminUser: User;
  let kepalaKasirUser: User;
  let kasirUser: User;

  let kasAccountId: string;
  let serverPulsaAccountId: string;

  function setLoggedInUser(user: User) {
    const authStore = useAuthStore();
    authStore.currentUser = user;
    localStorage.setItem('buku_konter_active_user_id', user.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  }

  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.users.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.transactions.clear();
    await db.transactionItems.clear();
    await db.customers.clear();
    await db.products.clear();
    await db.auditLogs.clear();
    await db.shifts.clear();

    const pinOwnerHash = await authService.hashPin('123456');
    const pinAdminHash = await authService.hashPin('222222');
    const pinKepalaKasirHash = await authService.hashPin('333333');
    const pinKasirHash = await authService.hashPin('444444');

    ownerUser = {
      id: 'owner-id',
      name: 'Budi Owner',
      role: 'owner',
      pinHash: pinOwnerHash,
      isActive: true,
      createdAt: Date.now(),
    };

    adminUser = {
      id: 'admin-id',
      name: 'Agus Admin',
      role: 'admin',
      pinHash: pinAdminHash,
      isActive: true,
      createdAt: Date.now(),
    };

    kepalaKasirUser = {
      id: 'kk-id',
      name: 'Dewi Kepala Kasir',
      role: 'kepala_kasir',
      pinHash: pinKepalaKasirHash,
      isActive: true,
      createdAt: Date.now(),
    };

    kasirUser = {
      id: 'kasir-id',
      name: 'Siti Kasir',
      role: 'kasir',
      pinHash: pinKasirHash,
      isActive: true,
      createdAt: Date.now(),
    };

    await db.users.bulkAdd([ownerUser, adminUser, kepalaKasirUser, kasirUser]);

    kasAccountId = await accountService.addAccount({
      name: 'Kas Toko',
      type: 'kas',
      initialBalance: 750000,
    });

    serverPulsaAccountId = await accountService.addAccount({
      name: 'Digipos Server',
      type: 'server_pulsa',
      initialBalance: 1000000,
    });

    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  // --------------------------------------------------------------------------
  // (a) Tes Script Patch Capgo
  // --------------------------------------------------------------------------
  describe('(a) Patch Capgo Regex & Brace Balance Test', () => {
    const originalCapgoUpdaterSnippet = `package ee.forgr.capacitor_updater;
import java.io.File;
import java.io.IOException;
import java.util.Objects;

public class CapgoUpdater {
    private void requireBundleChecksum(final String checksum) throws IOException {
        if (checksum == null || checksum.isEmpty()) {
            logger.error("No checksum provided");
            this.sendStats("checksum_required");
            throw new IOException("Checksum required");
        }
    }

    private void finishDownload(final String id, final String checksumRes, final String sessionKey, final boolean isManifest) throws IOException {
        if (!isManifest) {
            String expectedChecksum = Objects.requireNonNullElse(checksumRes, "");
            this.requireBundleChecksum(expectedChecksum);
            if (CryptoCipher.isValidSessionKey(sessionKey)) {
                CryptoCipher.decryptFile(downloaded, publicKey, sessionKey);
                expectedChecksum = CryptoCipher.decryptChecksum(checksumRes, publicKey);
            }
            checksum = CryptoCipher.calcChecksum(downloaded);
            CryptoCipher.logChecksumInfo("Calculated checksum", checksum);
            CryptoCipher.logChecksumInfo("Expected checksum", expectedChecksum);
            if (!expectedChecksum.equals(checksum)) {
                logger.error("Checksum mismatch");
                logger.debug("Expected: " + expectedChecksum + ", Got: " + checksum);
                this.sendStats("checksum_fail");
                throw new IOException("Checksum failed: " + id);
            }
        }
    }

    static boolean containsPathTraversalSegment(final String relativePath) {
        return false;
    }
}`;

    it('menerapkan regex patch pada isi CapgoUpdater.java asli: kurung seimbang, tidak ada exception, method tetap utuh, dan idempoten', () => {
      // Pastikan snippet awal memiliki kurung seimbang
      const initialOpen = (originalCapgoUpdaterSnippet.match(/\{/g) || []).length;
      const initialClose = (originalCapgoUpdaterSnippet.match(/\}/g) || []).length;
      expect(initialOpen).toBe(initialClose);

      // Regex A (yang baru) & Regex B
      const targetRequireMethod = /logger\.error\("No checksum provided"\);\s*this\.sendStats\("checksum_required"\);\s*throw\s+new\s+IOException\("Checksum required"\);/;
      const targetFinishDownload = /if\s*\(!isManifest\)\s*\{\s*String\s+expectedChecksum\s*=\s*Objects\.requireNonNullElse\(checksumRes,\s*""\);\s*this\.requireBundleChecksum\(expectedChecksum\);\s*if\s*\(CryptoCipher\.isValidSessionKey\(sessionKey\)\)[\s\S]*?throw\s+new\s+IOException\("Checksum failed:\s*"\s*\+\s*id\);\s*\}\s*\}/;

      expect(targetRequireMethod.test(originalCapgoUpdaterSnippet)).toBe(true);
      expect(targetFinishDownload.test(originalCapgoUpdaterSnippet)).toBe(true);

      // Jalankan patch pertama
      let patched = originalCapgoUpdaterSnippet.replace(
        targetRequireMethod,
        'logger.info("No checksum provided, skipping checksum verification");\n            return;'
      );

      patched = patched.replace(
        targetFinishDownload,
        `if (!isManifest) {
                String expectedChecksum = Objects.requireNonNullElse(checksumRes, "");
                this.requireBundleChecksum(expectedChecksum);

                if (!expectedChecksum.isEmpty()) {
                    if (CryptoCipher.isValidSessionKey(sessionKey)) {
                        CryptoCipher.decryptFile(downloaded, publicKey, sessionKey);
                        expectedChecksum = CryptoCipher.decryptChecksum(checksumRes, publicKey);
                    }
                    checksum = CryptoCipher.calcChecksum(downloaded);
                    CryptoCipher.logChecksumInfo("Calculated checksum", checksum);
                    CryptoCipher.logChecksumInfo("Expected checksum", expectedChecksum);
                    if (!expectedChecksum.equals(checksum)) {
                        logger.error("Checksum mismatch");
                        logger.debug("Expected: " + expectedChecksum + ", Got: " + checksum);
                        this.sendStats("checksum_fail");
                        throw new IOException("Checksum failed: " + id);
                    }
                } else {
                    logger.info("No checksum provided, skipping checksum verification");
                }
            }`
      );

      // 1. Kurung seimbang
      const openCount = (patched.match(/\{/g) || []).length;
      const closeCount = (patched.match(/\}/g) || []).length;
      expect(openCount).toBe(closeCount);

      // 2. Tidak ada throw new IOException("Checksum required") yang tersisa
      expect(patched.includes('throw new IOException("Checksum required")')).toBe(false);

      // 3. Method requireBundleChecksum masih ada dan berisi return
      expect(patched.includes('private void requireBundleChecksum(final String checksum) throws IOException {')).toBe(true);
      expect(patched.includes('logger.info("No checksum provided, skipping checksum verification");')).toBe(true);
      expect(patched.includes('return;')).toBe(true);

      // 4. Jalankan patch ke-2 kali -> hasil identik (idempoten)
      let secondPatch = patched;
      if (targetRequireMethod.test(secondPatch)) {
        secondPatch = secondPatch.replace(
          targetRequireMethod,
          'logger.info("No checksum provided, skipping checksum verification");\n            return;'
        );
      }
      if (targetFinishDownload.test(secondPatch)) {
        secondPatch = secondPatch.replace(targetFinishDownload, '...');
      }
      expect(secondPatch).toBe(patched);
    });
  });

  // --------------------------------------------------------------------------
  // (b) Edit Nominal Transaksi Produk Ber-Item
  // --------------------------------------------------------------------------
  describe('(b) Edit Nominal Transaksi Ber-Item', () => {
    it('transaksi voucher nominal 32.000 diedit menjadi 35.000: kas bergeser dari 782.000 menjadi 785.000', async () => {
      // Saldo awal kas = 750.000
      const initialKasBalance = await accountService.getBalance(kasAccountId);
      expect(initialKasBalance).toBe(750000);

      // Buat master produk voucher: modal 28.000, jual 32.000
      const prodId = await productService.addProduct(
        {
          name: 'Voucher Axis 5GB',
          category: 'voucher',
          modal: 28000,
          hargaJual: 32000,
          stock: 10,
          stockMin: 2,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      // Buat transaksi voucher nominal 32.000 oleh kasir
      const txId = await transactionService.addTransaction(
        {
          layanan: 'voucher',
          nominal: 32000,
          paymentMethod: 'tunai',
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          accountId: kasAccountId,
          productId: prodId,
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Kas bertambah dari 750.000 menjadi 782.000
      const kasAfterTx = await accountService.getBalance(kasAccountId);
      expect(kasAfterTx).toBe(782000);

      // Admin mengedit nominal menjadi 35.000
      await transactionService.editTransaction(
        txId,
        { nominal: 35000 },
        { actorUserId: adminUser.id }
      );

      // Kas HARUS bergeser menjadi 785.000 (750.000 + 35.000)
      const kasAfterEdit = await accountService.getBalance(kasAccountId);
      expect(kasAfterEdit).toBe(785000);

      // Transaksi dan snapshot item terupdate
      const updatedTx = await db.transactions.get(txId);
      expect(updatedTx?.nominal).toBe(35000);

      const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
      expect(items.length).toBe(1);
      expect(items[0].hargaJualSnapshot).toBe(35000);
    });

    it('transaksi multi-item menolak pengubahan nominal secara langsung', async () => {
      const p1 = await productService.addProduct(
        {
          name: 'Item A',
          category: 'aksesoris',
          modal: 5000,
          hargaJual: 10000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );
      const p2 = await productService.addProduct(
        {
          name: 'Item B',
          category: 'aksesoris',
          modal: 8000,
          hargaJual: 15000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );

      const txId = await transactionService.addTransaction(
        {
          layanan: 'aksesoris',
          nominal: 25000,
          paymentMethod: 'tunai',
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          accountId: kasAccountId,
          cartItems: [
            { productId: p1, qty: 1 },
            { productId: p2, qty: 1 },
          ],
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Coba ubah nominal pada transaksi multi-item -> harus ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 30000 },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Transaksi multi-item tidak dapat diubah nominalnya');
    });
  });

  // --------------------------------------------------------------------------
  // (c) Tutup Shift sebagai Owner
  // --------------------------------------------------------------------------
  describe('(c) Tutup Shift sebagai Owner disembunyikan', () => {
    beforeEach(async () => {
      // Kasir membuka shift
      await shiftService.openShift({
        userId: kasirUser.id,
        kasAwalFisik: 100000,
      });
    });

    it('HomeView: tombol Tutup Shift TIDAK tampil untuk Owner saat ada shift aktif', async () => {
      setLoggedInUser(ownerUser);

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      expect(wrapper.find('.btn-open-shift').exists()).toBe(false);
      expect(wrapper.find('.btn-close-shift').exists()).toBe(false);
      wrapper.unmount();
    });

    it('HomeView: tombol Tutup Shift TAMPIL untuk Kasir saat ada shift aktif', async () => {
      setLoggedInUser(kasirUser);

      await router.push('/');
      await router.isReady();
      const wrapper = mount(HomeView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      expect(wrapper.find('.btn-close-shift').exists()).toBe(true);
      wrapper.unmount();
    });

    it('ShiftsView: tombol Tutup Shift TIDAK tampil untuk Owner', async () => {
      setLoggedInUser(ownerUser);

      await router.push('/shifts');
      await router.isReady();
      const wrapper = mount(ShiftsView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      expect(wrapper.find('.btn-close').exists()).toBe(false);
      expect(wrapper.find('.btn-tutup-full').exists()).toBe(false);
      wrapper.unmount();
    });

    it('ShiftsView: tombol Tutup Shift TAMPIL untuk Kasir', async () => {
      setLoggedInUser(kasirUser);

      await router.push('/shifts');
      await router.isReady();
      const wrapper = mount(ShiftsView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      expect(wrapper.find('.btn-close').exists()).toBe(true);
      expect(wrapper.find('.btn-tutup-full').exists()).toBe(true);
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // (e) Helper canEditTransaction & canVoidTransaction dipakai
  // --------------------------------------------------------------------------
  describe('(e) Helper canEditTransaction & canVoidTransaction dipakai di service, store, dan UI', () => {
    it('authStore & authService mengevaluasi role permission dengan konsisten', () => {
      const authStore = useAuthStore();

      authStore.currentUser = ownerUser;
      expect(authStore.canEditTransaction).toBe(true);
      expect(authStore.canVoidTransaction).toBe(true);

      authStore.currentUser = adminUser;
      expect(authStore.canEditTransaction).toBe(true);
      expect(authStore.canVoidTransaction).toBe(true);

      authStore.currentUser = kepalaKasirUser;
      expect(authStore.canEditTransaction).toBe(true);
      expect(authStore.canVoidTransaction).toBe(true);

      authStore.currentUser = kasirUser;
      expect(authStore.canEditTransaction).toBe(false);
      expect(authStore.canVoidTransaction).toBe(false);
    });

    it('TransactionDetailView: canManageTransaction mengacu pada canEditTransaction store', async () => {
      setLoggedInUser(kepalaKasirUser);

      const txId = await transactionService.addTransaction(
        {
          layanan: 'pulsa',
          nominal: 10000,
          paymentMethod: 'tunai',
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          accountId: kasAccountId,
          sourceAccountId: serverPulsaAccountId,
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      await router.push(`/transactions/${txId}`);
      await router.isReady();
      const wrapper = mount(TransactionDetailView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Kepala Kasir berhak mengelola langsung
      expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-void-transaction"]').exists()).toBe(true);
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // (f) Nonaktifkan & Aktifkan Produk
  // --------------------------------------------------------------------------
  describe('(f) Nonaktifkan Produk 2 Langkah & Filter/Aktivasi Master', () => {
    let testProd: Product;

    beforeEach(async () => {
      const id = await productService.addProduct(
        {
          name: 'Perdana Telkomsel 10GB',
          category: 'perdana',
          modal: 25000,
          hargaJual: 30000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );
      testProd = (await productService.getProduct(id))!;
    });

    it('productService.deactivateProduct dan activateProduct menulis jejak audit log', async () => {
      // Nonaktifkan
      await productService.deactivateProduct(testProd.id, { actorUserId: adminUser.id });
      let updated = await productService.getProduct(testProd.id);
      expect(updated?.isActive).toBe(false);

      let logs = await db.auditLogs.where('action').equals('nonaktifkan_produk_master').toArray();
      expect(logs.length).toBe(1);
      expect(logs[0].entityId).toBe(testProd.id);

      // Aktifkan kembali
      await productService.activateProduct(testProd.id, { actorUserId: adminUser.id });
      updated = await productService.getProduct(testProd.id);
      expect(updated?.isActive).toBe(true);

      logs = await db.auditLogs.where('action').equals('aktifkan_produk_master').toArray();
      expect(logs.length).toBe(1);
      expect(logs[0].entityId).toBe(testProd.id);
    });

    it('ProductFormView: tombol Nonaktifkan menampilkan dialog konfirmasi sebelum mengeksekusi', async () => {
      setLoggedInUser(adminUser);

      await router.push(`/masters/product/${testProd.id}/edit`);
      await router.isReady();
      await flushPromises();

      const wrapper = mount(ProductFormView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Klik tombol nonaktifkan awal
      const btnDeactivate = wrapper.find('[data-testid="btn-deactivate-product"]');
      expect(btnDeactivate.exists()).toBe(true);
      await btnDeactivate.trigger('click');
      await flushPromises();

      // Modal konfirmasi muncul
      const modal = wrapper.find('[data-testid="deactivate-confirm-modal"]');
      expect(modal.exists()).toBe(true);

      // Klik tombol batal
      const btnCancel = modal.find('.btn-modal-cancel');
      await btnCancel.trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="deactivate-confirm-modal"]').exists()).toBe(false);

      // Produk tetap aktif
      let prod = await productService.getProduct(testProd.id);
      expect(prod?.isActive).toBe(true);

      // Klik tombol nonaktifkan lagi dan konfirmasi "Ya, Nonaktifkan"
      await wrapper.find('[data-testid="btn-deactivate-product"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-testid="btn-confirm-deactivate"]').trigger('click');
      await flushPromises();

      prod = await productService.getProduct(testProd.id);
      expect(prod?.isActive).toBe(false);
      wrapper.unmount();
    });

    it('MastersView: produk nonaktif disembunyikan secara default, muncul saat filter dicentang, dan bisa diaktifkan kembali', async () => {
      setLoggedInUser(ownerUser);

      // Nonaktifkan produk
      await productService.deactivateProduct(testProd.id, { actorUserId: ownerUser.id });

      await router.push('/masters');
      await router.isReady();
      const wrapper = mount(MastersView, {
        global: {
          plugins: [router],
        },
      });
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Secara default, produk nonaktif tidak tampil
      expect(wrapper.find(`[data-testid="product-card-${testProd.id}"]`).exists()).toBe(false);

      // Centang toggle filter tampilkan nonaktif
      const checkbox = wrapper.find('[data-testid="toggle-show-inactive"]');
      expect(checkbox.exists()).toBe(true);
      await checkbox.setValue(true);
      await flushPromises();

      // Sekarang produk nonaktif tampil dengan badge
      const card = wrapper.find(`[data-testid="product-card-${testProd.id}"]`);
      expect(card.exists()).toBe(true);
      expect(card.find('[data-testid="badge-inactive"]').text()).toBe('NONAKTIF');

      // Tombol Aktifkan tampil pada kartu produk nonaktif
      const btnActivate = card.find(`[data-testid="btn-activate-${testProd.id}"]`);
      expect(btnActivate.exists()).toBe(true);

      // Klik tombol Aktifkan
      await btnActivate.trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Produk kini aktif kembali
      const refreshedProd = await productService.getProduct(testProd.id);
      expect(refreshedProd?.isActive).toBe(true);
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // (g) Void sebagai Kasir: hanya ownerPin yang diterima
  // --------------------------------------------------------------------------
  describe('(g) Void sebagai Kasir hanya menerima ownerPin', () => {
    let txId: string;

    beforeEach(async () => {
      txId = await transactionService.addTransaction(
        {
          layanan: 'pulsa',
          nominal: 20000,
          paymentMethod: 'tunai',
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          accountId: kasAccountId,
          sourceAccountId: serverPulsaAccountId,
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );
    });

    it('kasir mengirim adminPin atau pin (tanpa ownerPin) ditolak', async () => {
      // Kasir mencoba void hanya dengan adminPin
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Salah nomor pelanggan',
          actorUserId: kasirUser.id,
          adminPin: '222222',
        })
      ).rejects.toThrow('Persetujuan Owner (PIN Owner) wajib diisi untuk pembatalan oleh Kasir.');

      // Kasir mencoba void hanya dengan pin biasa
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Salah nomor pelanggan',
          actorUserId: kasirUser.id,
          pin: '444444',
        })
      ).rejects.toThrow('Persetujuan Owner (PIN Owner) wajib diisi untuk pembatalan oleh Kasir.');
    });

    it('kasir mengirim PIN Owner yang salah ditolak', async () => {
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Salah nomor pelanggan',
          actorUserId: kasirUser.id,
          ownerPin: '999999',
        })
      ).rejects.toThrow('PIN persetujuan Owner salah. Pembatalan transaksi ditolak.');
    });

    it('kasir mengirim PIN Owner yang benar berhasil void', async () => {
      await transactionService.voidTransaction(txId, {
        reason: 'Salah nomor pelanggan',
        actorUserId: kasirUser.id,
        ownerPin: '123456',
      });

      const tx = await db.transactions.get(txId);
      expect(tx?.status).toBe('void');
    });
  });
});
