import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import router from '../src/router';
import { db } from '../src/db/database';
import { useAuthStore } from '../src/stores/authStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { supabaseSyncService } from '../src/services/supabaseSyncService';
import { liveUpdateService } from '../src/services/liveUpdateService';
import SettingsView from '../src/views/SettingsView.vue';
import CloudSyncDialog from '../src/components/CloudSyncDialog.vue';
import App from '../src/App.vue';

describe('b9 & b10: SettingsView Supabase Sync Card, CloudSyncDialog & App Hook', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    await db.users.clear();
    await db.appSettings.clear();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  describe('1. SettingsView Kartu Sinkronisasi Supabase', () => {
    it('kartu sync tampil untuk Owner/Admin dan tersembunyi untuk Kasir', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      // Owner melihat kartu sync
      expect(wrapper.find('[data-testid="sync-status"]').exists()).toBe(true);

      // Ganti role ke Kasir
      authStore.currentUser.role = 'kasir';
      await flushPromises();

      // Kasir TIDAK melihat kartu sync
      expect(wrapper.find('[data-testid="sync-status"]').exists()).toBe(false);
    });

    it('menampilkan field input kredensial bila env kosong, dan menyimpannya saat tombol diklik', async () => {
      const envRecord = import.meta.env as unknown as Record<string, string | undefined>;
      delete envRecord.VITE_SUPABASE_URL;
      delete envRecord.VITE_SUPABASE_ANON_KEY;

      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'admin-1',
        name: 'Admin',
        role: 'admin',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const urlInput = wrapper.find('[data-testid="sync-supabase-url"]');
      const keyInput = wrapper.find('[data-testid="sync-supabase-key"]');
      const saveBtn = wrapper.find('[data-testid="sync-save-credentials"]');

      expect(urlInput.exists()).toBe(true);
      expect(keyInput.exists()).toBe(true);

      await urlInput.setValue('https://myproject.supabase.co');
      await keyInput.setValue('my-secret-anon-key');
      await saveBtn.trigger('click');
      await flushPromises();

      expect(localStorage.getItem('supabase_catalog_url')).toBe('https://myproject.supabase.co');
      expect(localStorage.getItem('supabase_catalog_key')).toBe('my-secret-anon-key');
    });

    it('(c) field kredensial TERSEMBUNYI bila env sudah terisi', async () => {
      const envRecord = import.meta.env as unknown as Record<string, string | undefined>;
      envRecord.VITE_SUPABASE_URL = 'https://env.supabase.co';
      envRecord.VITE_SUPABASE_ANON_KEY = 'env-anon-key';

      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'admin-1',
        name: 'Admin',
        role: 'admin',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="sync-supabase-url"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="sync-supabase-key"]').exists()).toBe(false);
      expect(wrapper.text()).toContain('Kredensial dari konfigurasi aplikasi.');

      delete envRecord.VITE_SUPABASE_URL;
      delete envRecord.VITE_SUPABASE_ANON_KEY;
    });

    it('tombol "Sinkronkan Sekarang" memanggil pushAll()', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const pushSpy = vi.spyOn(supabaseSyncService, 'pushAll').mockResolvedValue({
        pushed: 10,
        tombstoned: 0,
        at: 123456789,
      });

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const syncBtn = wrapper.find('[data-testid="sync-now"]');
      await syncBtn.trigger('click');
      await flushPromises();

      expect(pushSpy).toHaveBeenCalledTimes(1);
    });

    it('tombol "Tarik Data dari Cloud" meminta konfirmasi window.confirm sebelum memanggil pullAll()', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const pullSpy = vi.spyOn(supabaseSyncService, 'pullAll').mockResolvedValue({
        pulled: 15,
        at: 123456789,
      });

      // User klik Cancel
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const pullBtn = wrapper.find('[data-testid="sync-pull"]');
      await pullBtn.trigger('click');
      await flushPromises();

      expect(confirmSpy).toHaveBeenCalled();
      expect(pullSpy).not.toHaveBeenCalled();

      // User klik OK
      confirmSpy.mockReturnValue(true);
      await pullBtn.trigger('click');
      await flushPromises();

      expect(pullSpy).toHaveBeenCalledTimes(1);
    });

    it('toggle auto-sync memperbarui appSettings di settingsStore', async () => {
      const authStore = useAuthStore();
      const settingsStore = useSettingsStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const toggle = wrapper.find('[data-testid="sync-auto-toggle"]');
      expect(toggle.exists()).toBe(true);
      expect((toggle.element as HTMLInputElement).checked).toBe(true);

      // Ubah toggle ke off
      await toggle.setValue(false);
      await flushPromises();

      expect(settingsStore.cloudAutoSync).toBe(false);
    });

    it('(c) handleCheckUpdate gagal di download/apply: successMessage kosong dan teks error menyebut unduh/terapkan', async () => {
      const authStore = useAuthStore();
      authStore.currentUser = {
        id: 'owner-1',
        name: 'Owner',
        role: 'owner',
        pinHash: 'h',
        isActive: true,
        createdAt: Date.now(),
      };

      vi.spyOn(liveUpdateService, 'checkForUpdate').mockResolvedValue({
        kind: 'bundle',
        bundleVersion: '123',
        bundleUrl: 'https://example.com/update.zip',
        versionName: '0.2.0',
        versionCode: 12,
        changelog: 'Test update',
      });
      vi.spyOn(liveUpdateService, 'applyBundleUpdate').mockRejectedValue(new Error('Network failure'));

      const wrapper = mount(SettingsView, {
        global: { plugins: [router] },
      });
      await flushPromises();

      const checkBtn = wrapper.find('.btn-check-update');
      await checkBtn.trigger('click');
      await flushPromises();

      const success = wrapper.find('.feedback-banner.success');
      expect(success.exists()).toBe(false);

      const err = wrapper.find('.feedback-banner.error');
      expect(err.exists()).toBe(true);
      expect(err.text()).toContain('Gagal mengunduh pembaruan. Coba lagi.');
    });
  });

  describe('2. CloudSyncDialog Component', () => {
    it('tombol "Tarik Sekarang" memanggil pullAll() lalu meng-emit pulled & dismiss', async () => {
      const pullSpy = vi.spyOn(supabaseSyncService, 'pullAll').mockResolvedValue({
        pulled: 20,
        at: 9999999,
      });

      const wrapper = mount(CloudSyncDialog);
      await flushPromises();

      expect(wrapper.text()).toContain('Tarik Data dari Cloud?');
      expect(wrapper.text()).toContain('Ditemukan data di database Supabase');

      const confirmBtn = wrapper.find('[data-testid="cloud-sync-confirm"]');
      await confirmBtn.trigger('click');
      await flushPromises();

      expect(pullSpy).toHaveBeenCalledTimes(1);
      expect(wrapper.emitted('pulled')).toBeTruthy();
      expect(wrapper.emitted('pulled')?.[0]).toEqual([20]);
      expect(wrapper.emitted('dismiss')).toBeTruthy();
    });

    it('tombol "Nanti Saja" meng-emit dismiss tanpa memanggil pullAll()', async () => {
      const pullSpy = vi.spyOn(supabaseSyncService, 'pullAll');

      const wrapper = mount(CloudSyncDialog);
      await flushPromises();

      const dismissBtn = wrapper.find('[data-testid="cloud-sync-dismiss"]');
      await dismissBtn.trigger('click');
      await flushPromises();

      expect(pullSpy).not.toHaveBeenCalled();
      expect(wrapper.emitted('dismiss')).toBeTruthy();
    });
  });

  describe('3. Hook App.vue & Toast Sukses (b10)', () => {
    it('(d1) dialog muncul saat install baru (lokal kosong + cloud ada data), dan toast sukses muncul setelah pulled', async () => {
      vi.spyOn(supabaseSyncService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(supabaseSyncService, 'isLocalEmpty').mockResolvedValue(true);
      vi.spyOn(supabaseSyncService, 'hasCloudData').mockResolvedValue(true);
      const pushSpy = vi.spyOn(supabaseSyncService, 'pushAll');

      const wrapper = mount(App, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Dialog harus muncul
      expect(wrapper.findComponent(CloudSyncDialog).exists()).toBe(true);
      // pushAll tidak dipanggil saat lokal kosong
      expect(pushSpy).not.toHaveBeenCalled();

      // Trigger emit pulled dari dialog
      const dialog = wrapper.findComponent(CloudSyncDialog);
      dialog.vm.$emit('pulled', 12);
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Toast sukses muncul
      const toast = wrapper.find('[data-testid="sync-toast-success"]');
      expect(toast.exists()).toBe(true);
      expect(toast.text()).toContain('Data berhasil ditarik dari cloud');
      expect(toast.text()).toContain('12 data dipulihkan');
    });

    it('(d2) pushAll silent jalan saat data lokal sudah ada, dialog TIDAK muncul', async () => {
      vi.spyOn(supabaseSyncService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(supabaseSyncService, 'isLocalEmpty').mockResolvedValue(false);
      const pushSpy = vi.spyOn(supabaseSyncService, 'pushAll').mockResolvedValue({
        pushed: 5,
        tombstoned: 0,
        at: Date.now(),
      });

      const wrapper = mount(App, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Dialog TIDAK muncul
      expect(wrapper.findComponent(CloudSyncDialog).exists()).toBe(false);
      // pushAll dipanggil secara silent
      expect(pushSpy).toHaveBeenCalled();
    });

    it('(b1) auto-apply bundle: saat route BUKAN Home, set() TIDAK dipanggil sampai kembali ke Home', async () => {
      await db.users.add({
        id: 'user-1',
        name: 'User 1',
        role: 'owner',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      });
      localStorage.setItem('buku_konter_active_user_id', 'user-1');

      vi.spyOn(supabaseSyncService, 'isConfigured').mockReturnValue(false);
      vi.spyOn(liveUpdateService, 'checkForUpdate').mockResolvedValue({
        kind: 'bundle',
        bundleVersion: '999',
        bundleUrl: 'https://example.com/update.zip',
        versionName: '0.2.0',
        versionCode: 12,
        changelog: 'OTA b12',
      });
      const downloadSpy = vi.spyOn(liveUpdateService, 'downloadBundle').mockResolvedValue({ id: 'bundle-test' });
      const applySpy = vi.spyOn(liveUpdateService, 'applyDownloadedBundle').mockResolvedValue();

      await router.push('/settings');
      await flushPromises();

      const wrapper = mount(App, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Download jalan di background
      expect(downloadSpy).toHaveBeenCalled();
      // Reload (set) DITUNDA karena route bukan Home
      expect(applySpy).not.toHaveBeenCalled();

      // Toast "Pembaruan siap" tampil
      const toast = wrapper.find('[data-testid="live-update-toast"]');
      expect(toast.exists()).toBe(true);
      expect(toast.text()).toContain('Pembaruan siap, akan diterapkan di Beranda');

      // Navigasi kembali ke Home -> applyDownloadedBundle baru dipanggil!
      await router.push('/');
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      expect(applySpy).toHaveBeenCalledWith({ id: 'bundle-test' }, '999');
    });

    it('(b2) auto-apply bundle: saat dialog sinkron tampil, set() TIDAK dipanggil sampai dialog ditutup', async () => {
      await db.users.add({
        id: 'user-1',
        name: 'User 1',
        role: 'owner',
        pinHash: 'hash',
        isActive: true,
        createdAt: Date.now(),
      });
      localStorage.setItem('buku_konter_active_user_id', 'user-1');

      vi.spyOn(supabaseSyncService, 'isConfigured').mockReturnValue(true);
      vi.spyOn(supabaseSyncService, 'isLocalEmpty').mockResolvedValue(true);
      vi.spyOn(supabaseSyncService, 'hasCloudData').mockResolvedValue(true);

      vi.spyOn(liveUpdateService, 'checkForUpdate').mockResolvedValue({
        kind: 'bundle',
        bundleVersion: '999',
        bundleUrl: 'https://example.com/update.zip',
        versionName: '0.2.0',
        versionCode: 12,
        changelog: 'OTA b12',
      });
      const downloadSpy = vi.spyOn(liveUpdateService, 'downloadBundle').mockResolvedValue({ id: 'bundle-test' });
      const applySpy = vi.spyOn(liveUpdateService, 'applyDownloadedBundle').mockResolvedValue();

      await router.push('/');
      await flushPromises();

      const wrapper = mount(App, {
        global: { plugins: [router] },
      });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Dialog sinkron muncul
      expect(wrapper.findComponent(CloudSyncDialog).exists()).toBe(true);
      expect(downloadSpy).toHaveBeenCalled();
      // applyDownloadedBundle DITUNDA karena dialog sinkron sedang terbuka
      expect(applySpy).not.toHaveBeenCalled();

      // Tutup dialog
      wrapper.findComponent(CloudSyncDialog).vm.$emit('dismiss');
      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Sekarang applyDownloadedBundle dipanggil!
      expect(applySpy).toHaveBeenCalledWith({ id: 'bundle-test' }, '999');
    });
  });
});
