import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import router from '../src/router';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { supabaseSyncService } from '../src/services/supabaseSyncService';
import LoginView from '../src/views/LoginView.vue';
import { AppError } from '../src/core/errors';

/**
 * Alur login-awal (b21): halaman pertama adalah Login, bukan SetupOwner.
 * Di HP baru user bisa login (akun dipulihkan dari cloud) tanpa dipaksa
 * membuat akun baru setiap pindah HP. Buat Akun hanya lewat tautan di
 * bagian bawah halaman Login bila memang belum punya akun.
 */
describe('Login Awal & Pulihkan Akun (b21)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.users.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  it('guard: tanpa user, buka / dialihkan ke Login (bukan SetupOwner)', async () => {
    await router.push('/');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('guard: tanpa user, buka /transactions dialihkan ke Login', async () => {
    await router.push('/transactions');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Login');
  });

  it('guard: tanpa user, /login dan /setup-owner tetap boleh dibuka', async () => {
    await router.push('/login');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Login');

    await router.push('/setup-owner');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('SetupOwner');
  });

  it('guard: bila sudah ada user, /setup-owner dialihkan ke Home', async () => {
    await authService.createOwner('Budi Owner', '123456');

    // Pindah dulu ke /login supaya push ke /setup-owner bukan navigasi duplikat
    await router.push('/login');
    await router.isReady();

    await router.push('/setup-owner');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('Home');
  });

  it('LoginView: tanpa user, tidak dialihkan ke setup; tampil tombol Pulihkan & tautan Buat Akun', async () => {
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    // Tetap di halaman Login — tidak dilempar ke /setup-owner
    expect(router.currentRoute.value.name).toBe('Login');
    // Form login tidak tampil karena belum ada petugas lokal
    expect(wrapper.find('.login-form').exists()).toBe(false);
    // Fasilitas pulihkan + buat akun tampil
    expect(wrapper.find('[data-testid="btn-restore-cloud"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="link-create-account"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="link-create-account"]').attributes('href')).toBe(
      '/setup-owner'
    );
    wrapper.unmount();
  });

  it('LoginView: Pulihkan Akun dari Cloud berhasil -> form login muncul dengan akun yang dipulihkan', async () => {
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    // Simulasi pull dari cloud: satu akun Owner masuk ke Dexie lokal
    vi.spyOn(supabaseSyncService, 'pullAll').mockImplementation(async () => {
      await db.users.add({
        id: 'owner-cloud',
        name: 'Budi Owner',
        role: 'owner',
        pinHash: await authService.hashPin('123456'),
        isActive: true,
        createdAt: Date.now(),
      });
      return { pulled: 1, at: Date.now() };
    });

    await wrapper.find('[data-testid="btn-restore-cloud"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    const successBanner = wrapper.find('[data-testid="restore-success"]');
    expect(successBanner.exists()).toBe(true);
    expect(successBanner.text()).toContain('berhasil dipulihkan');

    // Form login kini tampil dengan akun yang dipulihkan
    expect(wrapper.find('.login-form').exists()).toBe(true);
    expect(wrapper.html()).toContain('Budi Owner');
    wrapper.unmount();
  });

  it('LoginView: Pulihkan gagal (offline) -> pesan error tampil, tetap di halaman Login', async () => {
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    vi.spyOn(supabaseSyncService, 'pullAll').mockRejectedValue(
      new AppError('Gagal sinkronisasi: offline')
    );

    await wrapper.find('[data-testid="btn-restore-cloud"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    const errorBanner = wrapper.find('[data-testid="restore-error"]');
    expect(errorBanner.exists()).toBe(true);
    expect(errorBanner.text()).toContain('offline');
    expect(wrapper.find('.login-form').exists()).toBe(false);
    expect(router.currentRoute.value.name).toBe('Login');
    wrapper.unmount();
  });

  it('LoginView: pull berhasil tapi cloud kosong -> disarankan buat akun baru', async () => {
    await router.push('/login');
    await router.isReady();

    const wrapper = mount(LoginView, {
      global: {
        plugins: [router],
      },
    });
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    vi.spyOn(supabaseSyncService, 'pullAll').mockResolvedValue({ pulled: 0, at: Date.now() });

    await wrapper.find('[data-testid="btn-restore-cloud"]').trigger('click');
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();

    const errorBanner = wrapper.find('[data-testid="restore-error"]');
    expect(errorBanner.exists()).toBe(true);
    expect(errorBanner.text()).toContain('Tidak ada data akun di cloud');
    expect(wrapper.find('[data-testid="link-create-account"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
