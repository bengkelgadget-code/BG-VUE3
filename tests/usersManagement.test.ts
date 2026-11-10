import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import { AppError } from '../src/core/errors';
import router from '../src/router';
import AppScaffold from '../src/components/AppScaffold.vue';
import SettingsView from '../src/views/SettingsView.vue';
import UsersView from '../src/views/UsersView.vue';

describe('Kelola Petugas & Pengaturan Navigasi (b5)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.users.clear();
    await db.auditLogs.clear();
    await authService.logout();
    vi.restoreAllMocks();
  });

  // Drain navigasi router yang masih berjalan sebelum jsdom di-teardown.
  // Guard router bersifat async (baca IndexedDB via authService); bila
  // navigasi selesai SETELAH teardown, vue-router melempar unhandled
  // rejection "history is not defined" dan Vitest exit 1 — inilah yang
  // menggagalkan run CI b8 #20 padahal 120/120 tes lolos.
  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  describe('Service: authService Petugas CRUD & Keamanan', () => {
    it('1. Tambah kasir baru oleh Owner -> bisa login dengan PIN-nya & PIN tersimpan sebagai SHA-256 hash', async () => {
      // 1. Setup Owner
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');

      // 2. Owner membuat kasir baru
      const rawPin = '5678';
      const kasir = await authService.createUser('Siti Kasir', 'kasir', rawPin);

      expect(kasir.id).toBeDefined();
      expect(kasir.name).toBe('Siti Kasir');
      expect(kasir.role).toBe('kasir');
      expect(kasir.isActive).toBe(true);

      // Verifikasi PIN tersimpan sebagai hash SHA-256 (bukan plaintext)
      expect(kasir.pinHash).toHaveLength(64);
      expect(kasir.pinHash).not.toBe(rawPin);

      // Verifikasi di database
      const kasirInDb = await db.users.get(kasir.id);
      expect(kasirInDb?.pinHash).toBe(kasir.pinHash);
      expect((kasirInDb as unknown as Record<string, unknown>)['pin']).toBeUndefined();

      // Logout owner, login sebagai kasir
      await authService.logout();
      await authService.login(kasir.id, rawPin);

      const current = await authService.getCurrentUser();
      expect(current?.id).toBe(kasir.id);
      expect(current?.name).toBe('Siti Kasir');
    });

    it('2. Login kasir dengan PIN salah -> ditolak dengan AppError', async () => {
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');

      const kasir = await authService.createUser('Budi Kasir', 'kasir', '4321');
      await authService.logout();

      await expect(authService.login(kasir.id, '9999')).rejects.toThrow(AppError);
      await expect(authService.login(kasir.id, '9999')).rejects.toThrow('PIN salah');
    });

    it('3. Nonaktifkan kasir -> tidak bisa login & tidak muncul di daftar login aktif', async () => {
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');

      const kasir = await authService.createUser('Rudi Kasir', 'kasir', '1122');

      // Nonaktifkan kasir
      const updated = await authService.setUserActive(kasir.id, false);
      expect(updated.isActive).toBe(false);

      // Cek filter dropdown login (hanya u.isActive yang muncul)
      const activeUsers = await db.users.filter((u) => u.isActive).toArray();
      expect(activeUsers.some((u) => u.id === kasir.id)).toBe(false);

      // Coba login kasir nonaktif
      await authService.logout();
      await expect(authService.login(kasir.id, '1122')).rejects.toThrow(AppError);
      await expect(authService.login(kasir.id, '1122')).rejects.toThrow('tidak aktif');
    });

    it('4. Owner TIDAK BISA menonaktifkan dirinya sendiri', async () => {
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');

      await expect(authService.setUserActive(owner.id, false)).rejects.toThrow(AppError);
      await expect(authService.setUserActive(owner.id, false)).rejects.toThrow(
        'Akun Owner tidak dapat dinonaktifkan'
      );

      const ownerInDb = await db.users.get(owner.id);
      expect(ownerInDb?.isActive).toBe(true);
    });

    it('5. Reset PIN petugas oleh Owner tanpa perlu PIN lama', async () => {
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');

      const kasir = await authService.createUser('Ani Kasir', 'kasir', '1234');
      const oldHash = kasir.pinHash;

      // Reset PIN ke 9876
      await authService.resetPinByOwner(kasir.id, '9876');

      const updatedKasir = await db.users.get(kasir.id);
      expect(updatedKasir?.pinHash).not.toBe(oldHash);

      // Login dengan PIN lama gagal, PIN baru sukses
      await authService.logout();
      await expect(authService.login(kasir.id, '1234')).rejects.toThrow('PIN salah');
      await authService.login(kasir.id, '9876');
      const current = await authService.getCurrentUser();
      expect(current?.id).toBe(kasir.id);
    });

    it('6. Non-owner (Kasir/Admin) dilarang menambah atau memodifikasi petugas di service', async () => {
      const owner = await authService.createOwner('Owner Konter', '1234');
      await authService.login(owner.id, '1234');
      const kasir = await authService.createUser('Kasir 1', 'kasir', '1234');

      // Login sebagai kasir
      await authService.logout();
      await authService.login(kasir.id, '1234');

      await expect(authService.createUser('Kasir 2', 'kasir', '5555')).rejects.toThrow(
        'Hanya Owner yang berhak menambah petugas'
      );
      await expect(authService.updateUser(kasir.id, { name: 'Kasir Ganti' })).rejects.toThrow(
        'Hanya Owner yang berhak mengubah data petugas'
      );
      await expect(authService.setUserActive(kasir.id, false)).rejects.toThrow(
        'Hanya Owner yang berhak mengubah status petugas'
      );
      await expect(authService.resetPinByOwner(kasir.id, '7777')).rejects.toThrow(
        'Hanya Owner yang berhak mereset PIN petugas'
      );
    });
  });

  describe('Route Guard & Role Gate: /users & /reports', () => {
    it('1. Kasir / Admin membuka /users langsung -> dilempar ke Home', async () => {
      await db.users.bulkAdd([
        { id: 'owner-1', name: 'Owner', role: 'owner', pinHash: 'h1', isActive: true, createdAt: Date.now() },
        { id: 'kasir-1', name: 'Kasir', role: 'kasir', pinHash: 'h2', isActive: true, createdAt: Date.now() },
        { id: 'admin-1', name: 'Admin', role: 'admin', pinHash: 'h3', isActive: true, createdAt: Date.now() },
      ]);

      vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);

      // Test Kasir
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
        id: 'kasir-1',
        name: 'Kasir',
        role: 'kasir',
        pinHash: 'h2',
        isActive: true,
        createdAt: Date.now(),
      });

      await router.push('/users');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Home');

      // Test Admin
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
        id: 'admin-1',
        name: 'Admin',
        role: 'admin',
        pinHash: 'h3',
        isActive: true,
        createdAt: Date.now(),
      });

      await router.push('/users');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Home');
    });

    it('2. Owner membuka /users -> diizinkan masuk ke halaman Users', async () => {
      vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h1',
        isActive: true,
        createdAt: Date.now(),
      });

      await router.push('/users');
      await router.isReady();
      expect(router.currentRoute.value.name).toBe('Users');
    });

    it('3. Buka /reports langsung -> route tidak lagi ditemukan (tidak menampilkan halaman Laporan)', async () => {
      vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h1',
        isActive: true,
        createdAt: Date.now(),
      });

      // Route /reports sudah dihapus dari router
      const reportsRoute = router.getRoutes().find((r) => r.path === '/reports');
      expect(reportsRoute).toBeUndefined();
    });
  });

  describe('UI Component: AppScaffold Navigasi & SettingsView', () => {
    it('1. AppScaffold navigasi bawah memiliki Pengaturan (bukan Laporan) mengarah ke /settings', () => {
      const wrapper = mount(AppScaffold, {
        global: {
          plugins: [router],
        },
      });

      expect(wrapper.text()).toContain('Pengaturan');
      expect(wrapper.text()).not.toContain('Laporan');

      const settingsLink = wrapper.find('a[href="/settings"]');
      expect(settingsLink.exists()).toBe(true);
      const reportsLink = wrapper.find('a[href="/reports"]');
      expect(reportsLink.exists()).toBe(false);
    });

    it('2. SettingsView sebagai Owner: menampilkan kartu Kelola Petugas dan Master Data', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Pak Owner',
        role: 'owner',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [router],
        },
      });

      expect(wrapper.text()).toContain('Kelola Petugas');
      expect(wrapper.text()).toContain('Master Data Konter');
      expect(wrapper.find('a[href="/users"]').exists()).toBe(true);
    });

    it('3. SettingsView sebagai Kasir: kartu Kelola Petugas & Master Data TIDAK tampil, tombol Keluar tetap ada', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'kasir-1',
        name: 'Mbak Kasir',
        role: 'kasir',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [router],
        },
      });

      expect(wrapper.text()).not.toContain('Kelola Petugas');
      expect(wrapper.text()).not.toContain('Master Data Konter');
      expect(wrapper.find('a[href="/users"]').exists()).toBe(false);

      // Tombol Keluar tetap ada
      const logoutBtn = wrapper.find('.btn-logout');
      expect(logoutBtn.exists()).toBe(true);
      expect(logoutBtn.text()).toBe('Keluar');
    });

    it('4. Ketuk tombol Keluar -> session terhapus dan router diarahkan ke /login', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'kasir-1',
        name: 'Mbak Kasir',
        role: 'kasir',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      };

      const replaceSpy = vi.spyOn(router, 'replace');

      const wrapper = mount(SettingsView, {
        global: {
          plugins: [router],
        },
      });

      const logoutBtn = wrapper.find('.btn-logout');
      await logoutBtn.trigger('click');
      await flushPromises();

      expect(authStore.currentUser).toBeNull();
      expect(replaceSpy).toHaveBeenCalledWith('/login');
    });

    it('5. UsersView onMounted: jika bukan owner, langsung dilempar ke /', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'kasir-1',
        name: 'Mbak Kasir',
        role: 'kasir',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      };

      const replaceSpy = vi.spyOn(router, 'replace');

      mount(UsersView, {
        global: {
          plugins: [router],
        },
      });

      expect(replaceSpy).toHaveBeenCalledWith('/');
    });
  });
});
