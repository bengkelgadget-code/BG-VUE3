import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
  // (a) Tes Script Patch Capgo — eksekusi script ASLI pada file 7.53.0
  // (b21-C: jangan duplikasi regex inline — jalankan scripts/patch-capgo.js)
  // --------------------------------------------------------------------------
  describe('(a) Patch Capgo — Script Asli pada File 7.53.0', () => {
    const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
    const FIXTURE_DIR = path.resolve(TEST_DIR, 'fixtures');
    const JAVA_REL =
      'node_modules/@capgo/capacitor-updater/android/src/main/java/ee/forgr/capacitor_updater';

    function readPristine(fileName: string): string {
      const filePath = path.join(FIXTURE_DIR, `${fileName}.pristine`);
      return fs.readFileSync(filePath, 'utf8');
    }

    function buildFakeTree(): { tmpDir: string; javaDir: string; scriptPath: string } {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-capgo-test-'));
      const javaDir = path.join(tmpDir, JAVA_REL);
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'CapgoUpdater.java'), readPristine('CapgoUpdater.java'));
      fs.writeFileSync(
        path.join(javaDir, 'CapacitorUpdaterPlugin.java'),
        readPristine('CapacitorUpdaterPlugin.java')
      );
      const scriptsDir = path.join(tmpDir, 'scripts');
      fs.mkdirSync(scriptsDir);
      // Salin script ASLI dari repo — perubahan regex di script ikut teruji.
      const scriptPath = path.join(scriptsDir, 'patch-capgo.js');
      fs.copyFileSync(path.resolve(TEST_DIR, '../scripts/patch-capgo.js'), scriptPath);
      return { tmpDir, javaDir, scriptPath };
    }

    function runPatchScript(scriptPath: string): { code: number; output: string } {
      try {
        const output = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
        return { code: 0, output };
      } catch (err) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        return { code: e.status ?? 1, output: `${e.stdout || ''}${e.stderr || ''}` };
      }
    }

    function braceCounts(content: string): { open: number; close: number } {
      return {
        open: (content.match(/\{/g) || []).length,
        close: (content.match(/\}/g) || []).length,
      };
    }

    it('menjalankan script asli pada file 7.53.0 pristine: kurung seimbang, tanpa "Checksum required", idempoten', () => {
      const { tmpDir, javaDir, scriptPath } = buildFakeTree();
      try {
        const updaterPath = path.join(javaDir, 'CapgoUpdater.java');
        const pluginPath = path.join(javaDir, 'CapacitorUpdaterPlugin.java');

        // Sanity: fixture pristine benar-benar asli (angka audit b20)
        const updaterBefore = fs.readFileSync(updaterPath, 'utf8');
        const pluginBefore = fs.readFileSync(pluginPath, 'utf8');
        expect(braceCounts(updaterBefore)).toEqual({ open: 848, close: 848 });
        expect(braceCounts(pluginBefore)).toEqual({ open: 1290, close: 1290 });
        expect(updaterBefore.includes('throw new IOException("Checksum required")')).toBe(true);

        // Jalankan patch ke-1
        const run1 = runPatchScript(scriptPath);
        expect(run1.code).toBe(0);
        const updaterPatched = fs.readFileSync(updaterPath, 'utf8');
        const pluginPatched = fs.readFileSync(pluginPath, 'utf8');

        // 1. Kurung seimbang (CapgoUpdater 850/850 karena regex B menambah blok if/else)
        expect(braceCounts(updaterPatched)).toEqual({ open: 850, close: 850 });
        expect(braceCounts(pluginPatched)).toEqual({ open: 1290, close: 1290 });

        // 2. Tidak ada lagi throw "Checksum required"
        expect(updaterPatched.includes('throw new IOException("Checksum required")')).toBe(false);
        expect(pluginPatched.includes('throw new IOException("Checksum required")')).toBe(false);

        // 3. Method requireBundleChecksum utuh, berisi logger.info + return
        expect(updaterPatched).toContain(
          'private void requireBundleChecksum(final String checksum) throws IOException {'
        );
        expect(updaterPatched).toContain(
          'logger.info("No checksum provided, skipping checksum verification");'
        );

        // 4. Jalankan patch ke-2 -> hasil identik (idempoten), exit 0
        const run2 = runPatchScript(scriptPath);
        expect(run2.code).toBe(0);
        expect(fs.readFileSync(updaterPath, 'utf8')).toBe(updaterPatched);
        expect(fs.readFileSync(pluginPath, 'utf8')).toBe(pluginPatched);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('script menolak file rusak (kurung 850/851 seperti b19) dengan exit 1', () => {
      const { tmpDir, javaDir, scriptPath } = buildFakeTree();
      try {
        const updaterPath = path.join(javaDir, 'CapgoUpdater.java');
        // Rusakkan file pristine dengan satu kurung tutup ekstra di akhir
        // (persis korupsi b19: sesudah patch jadi 850 buka / 851 tutup).
        fs.appendFileSync(updaterPath, '\n}\n');
        const before = fs.readFileSync(updaterPath, 'utf8');
        expect(braceCounts(before)).toEqual({ open: 848, close: 849 });

        const run = runPatchScript(scriptPath);
        expect(run.code).toBe(1);
        expect(run.output).toContain('FATAL: Keseimbangan kurung rusak');
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
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
      // (b21-A) subtotal item ikut diperbarui agar sama dengan nominal baru
      expect(items[0].subtotal).toBe(35000);
    });

    it('transaksi 1 item qty 3 nominal 35.000: kas tepat +35.000 (bukan +35.001) dan subtotal = 35.000', async () => {
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

      // 3 pcs @ 32.000 = 96.000
      const txId = await transactionService.addTransaction(
        {
          layanan: 'voucher',
          nominal: 96000,
          paymentMethod: 'tunai',
          fee: 0,
          feePaidBy: 'cash',
          feeManualOverride: false,
          date: Date.now(),
          accountId: kasAccountId,
          cartItems: [{ productId: prodId, qty: 3 }],
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      const kasAfterTx = await accountService.getBalance(kasAccountId);
      expect(kasAfterTx).toBe(846000);

      // Admin mengedit nominal menjadi 35.000
      await transactionService.editTransaction(
        txId,
        { nominal: 35000 },
        { actorUserId: adminUser.id }
      );

      // (b21-B) Kas HARUS tepat 785.000 — bukan 785.001 (Math.round(35000/3)=11667 x 3)
      const kasAfterEdit = await accountService.getBalance(kasAccountId);
      expect(kasAfterEdit).toBe(785000);

      const items = await db.transactionItems.where('transactionId').equals(txId).toArray();
      expect(items.length).toBe(1);
      expect(items[0].qty).toBe(3);
      // Harga per-unit tampil dibulatkan, tapi total subtotal = nominal baru persis
      expect(items[0].hargaJualSnapshot).toBe(11667);
      expect(items[0].subtotal).toBe(35000);
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

    it('TransactionDetailView: tombol Edit digating canEditTransaction, tombol Void digating canVoidTransaction', async () => {
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

    it('TransactionDetailView: Kasir tanpa persetujuan Owner tidak melihat tombol Edit & Void', async () => {
      setLoggedInUser(kasirUser);

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

      // Kasir tidak punya canEditTransaction maupun canVoidTransaction
      expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="btn-void-transaction"]').exists()).toBe(false);
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

    it('MastersView: produk nonaktif disembunyikan secara default, muncul saat dicari, dan bisa diaktifkan kembali', async () => {
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

      // (b22) Cari produk lewat search — produk nonaktif yang cocok ikut tampil
      const searchInput = wrapper.find('[data-testid="search-produk"]');
      expect(searchInput.exists()).toBe(true);
      await searchInput.setValue('Telkomsel');
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

      // (b21-D) Umpan balik sukses tampil di halaman, bukan diam-diam
      const successBanner = wrapper.find('[data-testid="activate-success"]');
      expect(successBanner.exists()).toBe(true);
      expect(successBanner.text()).toContain('berhasil diaktifkan');
      expect(wrapper.find('[data-testid="activate-error"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('MastersView: aktivasi gagal menampilkan pesan error (bukan diam-diam)', async () => {
      setLoggedInUser(ownerUser);

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

      // (b22) Cari produk lewat search agar kartu nonaktif muncul
      await wrapper.find('[data-testid="search-produk"]').setValue('Telkomsel');
      await flushPromises();

      const btnActivate = wrapper.find(`[data-testid="btn-activate-${testProd.id}"]`);
      expect(btnActivate.exists()).toBe(true);

      // Paksa aktivasi gagal
      const spy = vi
        .spyOn(productService, 'activateProduct')
        .mockRejectedValueOnce(new Error('Gagal mengaktifkan produk.'));
      await btnActivate.trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      const errorBanner = wrapper.find('[data-testid="activate-error"]');
      expect(errorBanner.exists()).toBe(true);
      expect(errorBanner.text()).toContain('Gagal mengaktifkan produk');
      expect(wrapper.find('[data-testid="activate-success"]').exists()).toBe(false);

      // Produk tetap nonaktif
      const prod = await productService.getProduct(testProd.id);
      expect(prod?.isActive).toBe(false);
      spy.mockRestore();
      wrapper.unmount();
    });
  });

  // --------------------------------------------------------------------------
  // (f2) Search Produk Master (b22): ganti checkbox tampilkan nonaktif
  // --------------------------------------------------------------------------
  describe('(f2) Search Produk Master (b22)', () => {
    let prodTelkomsel: Product;
    let prodIndosat: Product;
    let prodPulsaTsel: Product;

    beforeEach(async () => {
      const id1 = await productService.addProduct(
        {
          name: 'Perdana Telkomsel 10GB',
          category: 'perdana',
          operator: 'Telkomsel',
          modal: 25000,
          hargaJual: 30000,
          stock: 5,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );
      prodTelkomsel = (await productService.getProduct(id1))!;
      const id2 = await productService.addProduct(
        {
          name: 'Voucher Indosat 5GB',
          category: 'voucher',
          operator: 'Indosat',
          modal: 20000,
          hargaJual: 25000,
          stock: 3,
          stockMin: 1,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );
      prodIndosat = (await productService.getProduct(id2))!;
      const id3 = await productService.addProduct(
        {
          name: 'Pulsa 50rb',
          category: 'pulsa',
          operator: 'Telkomsel',
          modal: 48000,
          hargaJual: 50000,
          stock: null,
          stockMin: 0,
          isActive: true,
        },
        { actorUserId: ownerUser.id }
      );
      prodPulsaTsel = (await productService.getProduct(id3))!;
    });

    async function mountMasters() {
      setLoggedInUser(ownerUser);
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
      return wrapper;
    }

    it('search memfilter berdasarkan nama (case-insensitive) dan operator', async () => {
      const wrapper = await mountMasters();

      // Semua produk tampil saat search kosong
      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodIndosat.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(true);

      // Ketik "telkomsel" (huruf kecil) -> cocok nama + operator
      const searchInput = wrapper.find('[data-testid="search-produk"]');
      expect(searchInput.exists()).toBe(true);
      await searchInput.setValue('telkomsel');
      await flushPromises();

      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodIndosat.id}"]`).exists()).toBe(false);

      // Ketik "voucher" -> hanya voucher Indosat
      await searchInput.setValue('voucher');
      await flushPromises();
      expect(wrapper.find(`[data-testid="product-card-${prodIndosat.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(false);
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(false);
      wrapper.unmount();
    });

    it('search bekerja bersama chip kategori (AND)', async () => {
      const wrapper = await mountMasters();

      // Pilih chip Pulsa
      const pulsaTab = wrapper.findAll('button.cat-tab').find((w) => w.text() === 'Pulsa');
      expect(pulsaTab?.exists()).toBe(true);
      if (pulsaTab) await pulsaTab.trigger('click');
      await flushPromises();

      // Tanpa query: hanya produk pulsa
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(false);

      // Tambah query "indosat": tidak ada pulsa Indosat -> empty state search
      await wrapper.find('[data-testid="search-produk"]').setValue('indosat');
      await flushPromises();
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(false);
      expect(wrapper.text()).toContain('Tidak Ada Produk yang Cocok');
      wrapper.unmount();
    });

    it('query tanpa hasil menampilkan pesan tidak cocok + tombol bersihkan pencarian', async () => {
      const wrapper = await mountMasters();

      await wrapper.find('[data-testid="search-produk"]').setValue('xyz-tidak-ada');
      await flushPromises();

      expect(wrapper.text()).toContain('Tidak Ada Produk yang Cocok');
      expect(wrapper.text()).not.toContain('Belum Ada Produk Master');

      // Klik "Bersihkan Pencarian" -> daftar penuh kembali
      const btnClearEmpty = wrapper.find('[data-testid="search-clear-empty"]');
      expect(btnClearEmpty.exists()).toBe(true);
      await btnClearEmpty.trigger('click');
      await flushPromises();

      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodIndosat.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodPulsaTsel.id}"]`).exists()).toBe(true);
      wrapper.unmount();
    });

    it('tombol X membersihkan pencarian dan mengembalikan daftar penuh', async () => {
      const wrapper = await mountMasters();

      const searchInput = wrapper.find('[data-testid="search-produk"]');
      await searchInput.setValue('indosat');
      await flushPromises();
      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(false);

      const btnClear = wrapper.find('[data-testid="search-clear"]');
      expect(btnClear.exists()).toBe(true);
      await btnClear.trigger('click');
      await flushPromises();

      expect((searchInput.element as HTMLInputElement).value).toBe('');
      expect(wrapper.find(`[data-testid="product-card-${prodTelkomsel.id}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="product-card-${prodIndosat.id}"]`).exists()).toBe(true);
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

  // --------------------------------------------------------------------------
  // (b23) Urutan Master Produk: Provider lalu Masa Aktif (hari setelah "/")
  // --------------------------------------------------------------------------
  describe('(b23) Sorting Master Produk di MastersView', () => {
    beforeEach(async () => {
      await db.products.clear();

      const sample = [
        { name: 'Tsel 10/28', category: 'voucher' as const, operator: 'Telkomsel' },
        { name: 'IM3 4/3', category: 'voucher' as const, operator: 'Indosat' },
        { name: 'Tsel 7/7', category: 'voucher' as const, operator: 'Telkomsel' },
        { name: 'Tsel 6/2', category: 'voucher' as const, operator: 'Telkomsel' },
        { name: 'Tsel 11/5', category: 'voucher' as const, operator: 'Telkomsel' },
        { name: 'Tsel 4/5', category: 'voucher' as const, operator: 'Telkomsel' },
        { name: 'Perdana Tsel Segel', category: 'perdana' as const, operator: 'Telkomsel' },
        { name: 'Aksesoris Kabel Data', category: 'aksesoris' as const, operator: '' },
      ];

      for (const item of sample) {
        await productService.addProduct(
          {
            name: item.name,
            category: item.category,
            operator: item.operator,
            modal: 10000,
            hargaJual: 12000,
            stock: 10,
            stockMin: 0,
            isActive: true,
          },
          { actorUserId: ownerUser.id }
        );
      }
    });

    async function mountMasters() {
      setLoggedInUser(ownerUser);
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
      return wrapper;
    }

    it('tab Voucher merender produk terurut: Indosat sebelum Telkomsel, lalu hari menaik (2, 5 kuota 4, 5 kuota 11, 7, 28)', async () => {
      const wrapper = await mountMasters();

      const voucherTab = wrapper.findAll('button.cat-tab').find((w) => w.text() === 'Voucher');
      expect(voucherTab?.exists()).toBe(true);
      if (voucherTab) await voucherTab.trigger('click');
      await flushPromises();

      const names = wrapper.findAll('.prod-name').map((w) => w.text());
      expect(names).toEqual([
        'IM3 4/3',
        'Tsel 6/2',
        'Tsel 4/5',
        'Tsel 11/5',
        'Tsel 7/7',
        'Tsel 10/28',
      ]);
      wrapper.unmount();
    });

    it('hasil pencarian search tetap terurut dengan aturan b23', async () => {
      const wrapper = await mountMasters();

      const searchInput = wrapper.find('[data-testid="search-produk"]');
      await searchInput.setValue('tsel');
      await flushPromises();

      const names = wrapper.findAll('.prod-name').map((w) => w.text());
      expect(names).toEqual([
        'Tsel 6/2',
        'Tsel 4/5',
        'Tsel 11/5',
        'Tsel 7/7',
        'Tsel 10/28',
        'Perdana Tsel Segel',
      ]);
      wrapper.unmount();
    });

    it('tab Semua merender produk: provider bernama terurut alfabetis, tanpa operator di paling akhir', async () => {
      const wrapper = await mountMasters();

      const names = wrapper.findAll('.prod-name').map((w) => w.text());
      expect(names).toEqual([
        'IM3 4/3',
        'Tsel 6/2',
        'Tsel 4/5',
        'Tsel 11/5',
        'Tsel 7/7',
        'Tsel 10/28',
        'Perdana Tsel Segel',
        'Aksesoris Kabel Data',
      ]);
      wrapper.unmount();
    });
  });
});
