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
import AppScaffold from '../src/components/AppScaffold.vue';
import HomeView from '../src/views/HomeView.vue';
import TransactionsView from '../src/views/TransactionsView.vue';
import TransactionDetailView from '../src/views/TransactionDetailView.vue';
import ShiftsView from '../src/views/ShiftsView.vue';
import UsersView from '../src/views/UsersView.vue';
import type { User, UserRole } from '../src/db/types';

describe('b19: Roles, Permissions, Owner Visibility, Kepala Kasir, and Transaction Edit/Void', () => {
  let ownerUser: User;
  let adminUser: User;
  let kepalaKasirUser: User;
  let kasirUser: User;

  let kasId: string;
  let bankId: string;

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

    // Setup Akun Kas & Bank
    kasId = await accountService.addAccount({
      name: 'Kas Toko',
      type: 'kas',
      initialBalance: 1000000,
    });
    bankId = await accountService.addAccount({
      name: 'Bank BCA',
      type: 'bank',
      initialBalance: 5000000,
    });

    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  function setLoggedInUser(user: User) {
    const authStore = useAuthStore();
    authStore.currentUser = user;
    localStorage.setItem('buku_konter_active_user_id', user.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(user);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  }

  describe('(a) Matriks Role: canEditTransaction & canVoidTransaction', () => {
    it('memvalidasi hak role matriks secara tepat', () => {
      const roles: UserRole[] = ['owner', 'admin', 'kepala_kasir', 'kasir'];
      expect(authService.canEditTransaction('owner')).toBe(true);
      expect(authService.canEditTransaction('admin')).toBe(true);
      expect(authService.canEditTransaction('kepala_kasir')).toBe(true);
      expect(authService.canEditTransaction('kasir')).toBe(false);

      expect(authService.canVoidTransaction('owner')).toBe(true);
      expect(authService.canVoidTransaction('admin')).toBe(true);
      expect(authService.canVoidTransaction('kepala_kasir')).toBe(true);
      expect(authService.canVoidTransaction('kasir')).toBe(false);

      // Verifikasi computed authStore
      const authStore = useAuthStore();
      for (const r of roles) {
        authStore.currentUser = { ...kasirUser, role: r };
        if (r === 'kepala_kasir') {
          expect(authStore.isKepalaKasir).toBe(true);
          expect(authStore.isAdmin).toBe(false); // JANGAN masukkan ke isAdmin
        } else if (r === 'kasir') {
          expect(authStore.isKasir).toBe(true);
          expect(authStore.isAdmin).toBe(false);
          expect(authStore.isKepalaKasir).toBe(false);
        } else if (r === 'owner') {
          expect(authStore.isOwner).toBe(true);
          expect(authStore.isAdmin).toBe(true);
        } else if (r === 'admin') {
          expect(authStore.isAdmin).toBe(true);
          expect(authStore.isOwner).toBe(false);
        }
      }
    });

    it('service menolak pemanggilan edit/void langsung oleh Kasir tanpa PIN Owner', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 100000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Kasir memanggil edit tanpa ownerPin -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 150000 },
          { actorUserId: kasirUser.id }
        )
      ).rejects.toThrow('Persetujuan Owner');

      // Kasir memanggil void tanpa ownerPin -> ditolak
      await expect(
        transactionService.voidTransaction(txId, {
          reason: 'Kasir coba void tanpa izin',
          actorUserId: kasirUser.id,
        })
      ).rejects.toThrow('Persetujuan Owner');
    });
  });

  describe('(b) Owner: Sembunyikan Tambah Transaksi & Buka Shift + Route Guard', () => {
    it('FAB Tambah Transaksi di AppScaffold TIDAK tampil saat login Owner, tapi tampil untuk Kasir', async () => {
      setLoggedInUser(ownerUser);
      const wrapperOwner = mount(AppScaffold, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // FAB dengan aria-label "Tambah Transaksi" tidak ada untuk Owner
      expect(wrapperOwner.find('.nav-fab').exists()).toBe(false);

      // Ganti ke Kasir
      setLoggedInUser(kasirUser);
      const wrapperKasir = mount(AppScaffold, {
        global: { plugins: [router] },
      });
      await flushPromises();
      expect(wrapperKasir.find('.nav-fab').exists()).toBe(true);
    });

    it('TransactionsView: tombol Catat Transaksi Baru TIDAK tampil untuk Owner', async () => {
      setLoggedInUser(ownerUser);
      const wrapper = mount(TransactionsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Empty state action link tidak ada untuk Owner
      expect(wrapper.find('a[href="/transactions/add"]').exists()).toBe(false);
    });

    it('HomeView: Quick Action dan Tombol Buka Shift TIDAK tampil untuk Owner', async () => {
      setLoggedInUser(ownerUser);
      const wrapper = mount(HomeView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Quick action section disembunyikan
      expect(wrapper.find('.quick-actions-section').exists()).toBe(false);
      // Tombol Buka Shift disembunyikan
      expect(wrapper.find('.btn-open-shift').exists()).toBe(false);

      // Namun kartu saldo & header tetap tampil
      expect(wrapper.find('.saldo-card').exists()).toBe(true);
    });

    it('ShiftsView: tombol Buka Shift Baru TIDAK tampil untuk Owner bila tidak ada shift aktif', async () => {
      setLoggedInUser(ownerUser);
      const wrapper = mount(ShiftsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      expect(wrapper.find('.btn-open').exists()).toBe(false);
    });

    it('Route guard: Owner yang mengakses /transactions/add atau /shifts/open dialihkan ke Home', async () => {
      setLoggedInUser(ownerUser);

      await router.push('/transactions/add');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/');

      await router.push('/shifts/open');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/');
    });

    it('Kasir dan Admin diizinkan mengakses /transactions/add dan /shifts/open', async () => {
      setLoggedInUser(kasirUser);
      await router.push('/transactions/add');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/transactions/add');

      setLoggedInUser(adminUser);
      await router.push('/shifts/open');
      await flushPromises();
      expect(router.currentRoute.value.path).toBe('/shifts/open');
    });
  });

  describe('(c) Kelola Petugas: Role Kepala Kasir', () => {
    it('Owner bisa menambah petugas dengan role kepala_kasir dan PIN ter-hash', async () => {
      setLoggedInUser(ownerUser);

      const newPetugas = await authService.createUser(
        'Rina Supervisi',
        'kepala_kasir',
        '555555'
      );

      expect(newPetugas.name).toBe('Rina Supervisi');
      expect(newPetugas.role).toBe('kepala_kasir');
      expect(newPetugas.pinHash).not.toBe('555555');
      expect(newPetugas.pinHash.length).toBe(64); // SHA-256

      const inDb = await db.users.get(newPetugas.id);
      expect(inDb?.role).toBe('kepala_kasir');
    });

    it('UsersView: pilihan Kepala Kasir ada di form dan roleLabel menampilkan Kepala Kasir', async () => {
      setLoggedInUser(ownerUser);
      await router.push('/users');
      await flushPromises();

      const wrapper = mount(UsersView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Klik tombol Tambah Petugas
      await wrapper.find('.btn-add').trigger('click');
      await flushPromises();

      const select = wrapper.find('.modal-box select');
      expect(select.exists()).toBe(true);
      const options = select.findAll('option');
      const values = options.map((o) => o.attributes('value'));
      expect(values).toContain('kepala_kasir');

      // Verifikasi tampilan badge role-kepala_kasir
      const text = wrapper.text();
      expect(text).toContain('Kepala Kasir');
      expect(wrapper.find('.role-kepala_kasir').exists()).toBe(true);
    });
  });

  describe('(d) Kepala Kasir: Tombol Edit & Void Langsung Berhasil', () => {
    it('Kepala Kasir dapat melakukan edit transaksi dan saldo terhitung ulang dengan BENAR', async () => {
      setLoggedInUser(kepalaKasirUser);

      // Transaksi transfer 500.000, fee 5.000 cash.
      // Bank BCA keluar 500.000 (5.000.000 -> 4.500.000)
      // Kas Toko masuk 505.000 (1.000.000 -> 1.505.000)
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 500000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      expect(await accountService.getBalance(bankId)).toBe(4500000);
      expect(await accountService.getBalance(kasId)).toBe(1505000);

      // Kepala Kasir mengoreksi nominal menjadi 400.000 dan fee 4.000
      await transactionService.editTransaction(
        txId,
        {
          nominal: 400000,
          fee: 4000,
          note: 'Koreksi jumlah transfer',
        },
        { actorUserId: kepalaKasirUser.id }
      );

      // Verifikasi transaksi terupdate
      const tx = await db.transactions.get(txId);
      expect(tx?.nominal).toBe(400000);
      expect(tx?.fee).toBe(4000);
      expect(tx?.note).toBe('Koreksi jumlah transfer');

      // BUKTI ANGKA BENAR:
      // Bank BCA harusnya keluar 400.000 (5.000.000 - 400.000 = 4.600.000)
      // Kas Toko harusnya bertambah 404.000 (1.000.000 + 404.000 = 1.404.000)
      expect(await accountService.getBalance(bankId)).toBe(4600000);
      expect(await accountService.getBalance(kasId)).toBe(1404000);

      // Audit log tercatat
      const audit = await db.auditLogs
        .where('entityId')
        .equals(txId)
        .and((l) => l.action === 'edit_transaksi')
        .first();
      expect(audit?.action).toBe('edit_transaksi');
      expect(audit?.actorUserId).toBe(kepalaKasirUser.id);
    });

    it('Kepala Kasir dapat melakukan void transaksi secara langsung dengan PIN-nya', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 200000,
          fee: 3000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      await transactionService.voidTransaction(txId, {
        reason: 'Salah transfer oleh pelanggan',
        actorUserId: kepalaKasirUser.id,
        pin: '333333', // PIN benar Kepala Kasir
      });

      const tx = await db.transactions.get(txId);
      expect(tx?.status).toBe('void');
      expect(tx?.voidReason).toBe('Salah transfer oleh pelanggan');
      expect(await accountService.getBalance(bankId)).toBe(5000000);
      expect(await accountService.getBalance(kasId)).toBe(1000000);
    });
  });

  describe('(e) Kasir: Batasan Approval Owner di UI & Service', () => {
    it('Kasir: Tombol Edit & Void TIDAK tampil, tombol Minta Koreksi ke Owner tampil', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 100000,
          fee: 2500,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      setLoggedInUser(kasirUser);
      await router.push(`/transactions/${txId}`);
      await flushPromises();

      const wrapper = mount(TransactionDetailView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Tombol Edit & Void disembunyikan total
      expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="btn-void-transaction"]').exists()).toBe(false);

      // Tombol Minta Koreksi ke Owner tampil
      const btnRequest = wrapper.find('[data-testid="btn-request-owner-approval"]');
      expect(btnRequest.exists()).toBe(true);

      // Klik tombol minta koreksi -> modal/form input PIN Owner muncul
      await btnRequest.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-testid="approval-box"]').exists()).toBe(true);

      // PIN Owner salah -> ditolak
      const inputPin = wrapper.find('[data-testid="input-owner-pin"]');
      await inputPin.setValue('999999');
      await flushPromises();
      const btnVerify = wrapper.find('[data-testid="btn-verify-owner-pin"]');
      await btnVerify.trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      expect(wrapper.find('[data-testid="approval-error"]').text()).toContain('PIN Owner salah');
      expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(false);

      // PIN Owner benar -> disetujui, form terbuka SATU KALI
      await wrapper.find('[data-testid="input-owner-pin"]').setValue('123456');
      await wrapper.find('[data-testid="btn-verify-owner-pin"]').trigger('click');
      await flushPromises();
      await new Promise((resolve) => setTimeout(resolve, 50));
      await flushPromises();

      // Badge persetujuan owner tampil dan tombol Edit & Void terbuka
      expect(wrapper.find('[data-testid="owner-approved-badge"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-edit-transaction"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="btn-void-transaction"]').exists()).toBe(true);
    });

    it('Kasir melakukan edit dengan persetujuan Owner: service memvalidasi dan audit mencatat approvedBy', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 200000,
          fee: 5000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: kasirUser.id, shiftId: 'shift-1' }
      );

      // Edit dengan PIN Owner yang valid
      await transactionService.editTransaction(
        txId,
        {
          nominal: 250000,
          fee: 5000,
          note: 'Koreksi nominal oleh kasir setelah disetujui owner',
        },
        {
          actorUserId: kasirUser.id,
          ownerPin: '123456', // PIN Owner benar
        }
      );

      const tx = await db.transactions.get(txId);
      expect(tx?.nominal).toBe(250000);

      // Cek entri audit
      const audit = await db.auditLogs
        .where('entityId')
        .equals(txId)
        .and((l) => l.action === 'edit_transaksi')
        .first();
      expect(audit?.action).toBe('edit_transaksi');
      expect(audit?.actorUserId).toBe(kasirUser.id);
      const detail = JSON.parse(audit?.detail || '{}');
      expect(detail.approvedBy).toBe(ownerUser.id);
      expect(detail.old.nominal).toBe(200000);
      expect(detail.new.nominal).toBe(250000);
    });
  });

  describe('(f) Edit: Field Terlarang & Transaksi Void', () => {
    it('service menolak modifikasi jenis layanan, tanggal, petugas, atau status', async () => {
      const now = Date.now();
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 50000,
          fee: 2000,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: now,
        },
        { actorUserId: adminUser.id, shiftId: 'shift-1' }
      );

      // Ubah layanan -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { layanan: 'tarik_tunai' },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Jenis layanan transaksi tidak dapat diubah');

      // Ubah tanggal -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { date: now - 100000 },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Tanggal transaksi tidak dapat diubah');

      // Ubah petugas -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { userId: 'user-lain' },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Petugas pembuat transaksi tidak dapat diubah');

      // Ubah status -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { status: 'void' },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Status transaksi tidak dapat diubah');
    });

    it('service menolak edit transaksi yang sudah void', async () => {
      const txId = await transactionService.addTransaction(
        {
          layanan: 'transfer',
          sourceAccountId: bankId,
          accountId: kasId,
          nominal: 75000,
          fee: 2500,
          feePaidBy: 'cash',
          feeManualOverride: false,
          paymentMethod: 'tunai',
          paymentStatus: 'lunas',
          date: Date.now(),
        },
        { actorUserId: adminUser.id, shiftId: 'shift-1' }
      );

      // Void transaksi
      await transactionService.voidTransaction(txId, {
        reason: 'Void terlebih dahulu',
        actorUserId: adminUser.id,
        pin: '222222',
      });

      // Coba edit transaksi void -> ditolak
      await expect(
        transactionService.editTransaction(
          txId,
          { nominal: 80000 },
          { actorUserId: adminUser.id }
        )
      ).rejects.toThrow('Transaksi yang sudah dibatalkan (void) tidak dapat diedit');
    });
  });
});
