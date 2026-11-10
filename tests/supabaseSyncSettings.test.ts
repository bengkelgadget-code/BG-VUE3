import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import router from '../src/router';
import { db } from '../src/db/database';
import { useAuthStore } from '../src/stores/authStore';
import { useSettingsStore } from '../src/stores/settingsStore';
import { supabaseSyncService } from '../src/services/supabaseSyncService';
import SettingsView from '../src/views/SettingsView.vue';
import CloudSyncDialog from '../src/components/CloudSyncDialog.vue';

describe('b9: SettingsView Supabase Sync Card & CloudSyncDialog', () => {
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
});
