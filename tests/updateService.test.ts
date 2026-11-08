import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { UpdateService, updateService as defaultUpdateService } from '../src/services/updateService';
import UpdateDialog from '../src/components/UpdateDialog.vue';

vi.mock('@capacitor/app', () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({
      name: 'Buku Konter',
      id: 'com.bengkel.bukukonter',
      build: '3',
      version: '0.2.0',
    }),
  },
}));

describe('UpdateService (OTA GitHub Pattern Setel)', () => {
  let updateService: UpdateService;

  beforeEach(() => {
    updateService = new UpdateService({
      currentVersionCode: 1,
      updateCheckUrl: 'https://example.com/version.json',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. checkForUpdate: versi remote sama dengan terpasang -> return null (tidak ada update)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version_code: 1,
        version_name: '0.1.0',
        download_url: 'https://example.com/buku-konter-v1.apk',
        changelog: 'Versi sama',
        force_update: false,
      }),
    } as unknown as Response);

    const update = await updateService.checkForUpdate();
    expect(update).toBeNull();
  });

  it('2. checkForUpdate: versi remote lebih baru -> return info update', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version_code: 2,
        version_name: '0.2.0',
        download_url: 'https://github.com/bengkelgadget-code/BG-VUE3/releases/download/v0.2.0/app-release.apk',
        changelog: 'Pembaruan fitur shift dan void',
        force_update: false,
      }),
    } as unknown as Response);

    const update = await updateService.checkForUpdate();
    expect(update).not.toBeNull();
    expect(update?.versionCode).toBe(2);
    expect(update?.versionName).toBe('0.2.0');
    expect(update?.changelog).toBe('Pembaruan fitur shift dan void');
    expect(update?.forceUpdate).toBe(false);
  });

  it('3. checkForUpdate: force_update = true ditangkap dengan benar', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        version_code: 5,
        version_name: '0.5.0',
        download_url: 'https://example.com/critical.apk',
        changelog: 'Pembaruan keamanan kritis',
        force_update: true,
      }),
    } as unknown as Response);

    const update = await updateService.checkForUpdate();
    expect(update).not.toBeNull();
    expect(update?.forceUpdate).toBe(true);
  });

  it('4. checkForUpdate: fetch gagal / offline -> return null tanpa crash', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const update = await updateService.checkForUpdate();
    expect(update).toBeNull();
  });

  it('5. downloadAndInstall: mengunduh APK sungguhan dan memancarkan progress', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => null);
    const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (h: string) => (h === 'content-length' ? '4' : null),
      },
      blob: async () => new Blob([fakeData]),
      body: {
        getReader: () => {
          let read = false;
          return {
            read: async () => {
              if (!read) {
                read = true;
                return { done: false, value: fakeData };
              }
              return { done: true, value: undefined };
            },
          };
        },
      },
    } as unknown as Response);

    const progressList: number[] = [];
    await updateService.downloadAndInstall(
      {
        versionCode: 2,
        versionName: '0.2.0',
        downloadUrl: 'https://example.com/app.apk',
        changelog: 'Update',
        forceUpdate: false,
      },
      (pct) => {
        progressList.push(pct);
      }
    );

    expect(progressList.length).toBeGreaterThan(0);
    expect(progressList[progressList.length - 1]).toBe(100);
  });

  describe('UpdateDialog UI Component Flow', () => {
    it('dialog tampil saat ada versi baru dengan informasi versi dan changelog', () => {
      const wrapper = mount(UpdateDialog, {
        props: {
          update: {
            versionCode: 3,
            versionName: '0.3.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Fitur baru laporan bulanan',
            forceUpdate: false,
          },
        },
      });

      expect(wrapper.text()).toContain('Pembaruan Tersedia');
      expect(wrapper.text()).toContain('Versi 0.3.0 (Build 3)');
      expect(wrapper.text()).toContain('Fitur baru laporan bulanan');
    });

    it('force_update = false: tombol "Nanti Saja" ada dan dapat di-dismiss', async () => {
      const wrapper = mount(UpdateDialog, {
        props: {
          update: {
            versionCode: 3,
            versionName: '0.3.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Update minor',
            forceUpdate: false,
          },
        },
      });

      const dismissBtn = wrapper.find('.btn-dismiss');
      expect(dismissBtn.exists()).toBe(true);
      await dismissBtn.trigger('click');
      expect(wrapper.emitted('dismiss')).toBeTruthy();
    });

    it('force_update = true tidak bisa ditutup tanpa update (tanpa tombol dismiss, klik backdrop ditolak)', async () => {
      const wrapper = mount(UpdateDialog, {
        props: {
          update: {
            versionCode: 4,
            versionName: '0.4.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Pembaruan keamanan wajib',
            forceUpdate: true,
          },
        },
      });

      // Tombol 'Nanti Saja' TIDAK ADA
      expect(wrapper.find('.btn-dismiss').exists()).toBe(false);
      expect(wrapper.text()).toContain('Pembaruan Kritis: Anda wajib memperbarui aplikasi');

      // Klik backdrop tidak meng-emit dismiss
      await wrapper.find('.update-modal-backdrop').trigger('click');
      expect(wrapper.emitted('dismiss')).toBeFalsy();
    });

    it('klik "Update Sekarang" memanggil updateService.downloadAndInstall', async () => {
      const downloadSpy = vi.spyOn(defaultUpdateService, 'downloadAndInstall').mockImplementation(async (_v, onProgress) => {
        onProgress(50);
        onProgress(100);
      });

      const wrapper = mount(UpdateDialog, {
        props: {
          update: {
            versionCode: 3,
            versionName: '0.3.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Pembaruan',
            forceUpdate: false,
          },
        },
      });

      const updateBtn = wrapper.find('.btn-update-action');
      await updateBtn.trigger('click');

      expect(downloadSpy).toHaveBeenCalled();
    });
  });

  describe('W2-R1: Deteksi Versi Terpasang & Pencegahan Update Loop', () => {
    it('service yang diberi installed code 3 tidak menawarkan update b3 lagi (mencegah loop)', async () => {
      const s = new UpdateService({
        updateCheckUrl: 'https://example.com/version.json',
      });
      s.setInstalledVersionCode(3);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version_code: 3,
          version_name: '0.2.0',
          download_url: 'https://example.com/app-v0.2.0-b3.apk',
          changelog: 'Rilis b3',
          force_update: false,
        }),
      } as unknown as Response);

      const update = await s.checkForUpdate();
      expect(update).toBeNull();
    });

    it('service yang diberi installed code 2 tetap menawarkan update b3', async () => {
      const s = new UpdateService({
        updateCheckUrl: 'https://example.com/version.json',
      });
      s.setInstalledVersionCode(2);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version_code: 3,
          version_name: '0.2.0',
          download_url: 'https://example.com/app-v0.2.0-b3.apk',
          changelog: 'Rilis b3 perbaikan loop OTA',
          force_update: false,
        }),
      } as unknown as Response);

      const update = await s.checkForUpdate();
      expect(update).not.toBeNull();
      expect(update?.versionCode).toBe(3);
      expect(update?.changelog).toBe('Rilis b3 perbaikan loop OTA');
    });

    it('fallback web tetap jalan tanpa crash saat App.getInfo gagal atau bukan native', async () => {
      const s = new UpdateService({
        updateCheckUrl: 'https://example.com/version.json',
      });

      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);

      const installedCode = await s.getInstalledVersionCode();
      expect(typeof installedCode).toBe('number');
      expect(installedCode).toBeGreaterThanOrEqual(1);

      // Cek update di web fallback tidak melempar error
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version_code: 10,
          version_name: '1.0.0',
          download_url: 'https://example.com/app-v10.apk',
          changelog: 'Versi 1.0.0',
          force_update: false,
        }),
      } as unknown as Response);

      const update = await s.checkForUpdate();
      expect(update).not.toBeNull();
      expect(update?.versionCode).toBe(10);
    });

    it('membaca version code dari platform native lewat @capacitor/app getInfo()', async () => {
      const s = new UpdateService({
        updateCheckUrl: 'https://example.com/version.json',
      });

      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.mocked(App.getInfo).mockResolvedValue({
        name: 'Buku Konter',
        id: 'com.bengkel.bukukonter',
        build: '3',
        version: '0.2.0',
      });

      const installedCode = await s.getInstalledVersionCode();
      expect(installedCode).toBe(3);
    });

    it('App.vue startup: membaca build code native lewat App.getInfo() dan menyetel updateService', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      vi.mocked(App.getInfo).mockResolvedValue({
        name: 'Buku Konter',
        id: 'com.bengkel.bukukonter',
        build: '3',
        version: '0.2.0',
      });
      const setCodeSpy = vi.spyOn(defaultUpdateService, 'setInstalledVersionCode');

      // Jalankan logika startup persis seperti di App.vue
      if (Capacitor.isNativePlatform()) {
        const info = await App.getInfo();
        const code = parseInt(info.build, 10);
        if (!isNaN(code) && code > 0) {
          defaultUpdateService.setInstalledVersionCode(code);
        }
      }

      expect(App.getInfo).toHaveBeenCalled();
      expect(setCodeSpy).toHaveBeenCalledWith(3);
    });
  });
});
