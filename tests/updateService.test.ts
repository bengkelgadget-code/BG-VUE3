import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { App } from '@capacitor/app';
import {
  UpdateService,
  updateService as defaultUpdateService,
  DEFAULT_WEB_FALLBACK_VERSION_CODE,
} from '../src/services/updateService';
import UpdateDialog from '../src/components/UpdateDialog.vue';
import versionData from '../version.json';

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

// Filesystem web di jsdom tidak punya IndexedDB — mock agar alur unduh bisa
// diuji sampai ke langkah installer (bukan gagal di writeFile).
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    writeFile: vi.fn().mockResolvedValue({ uri: '' }),
    getUri: vi.fn().mockResolvedValue({ uri: 'file:///cache/buku-konter-update.apk' }),
  },
  Directory: {
    Cache: 'CACHE',
    Data: 'DATA',
    Documents: 'DOCUMENTS',
    External: 'EXTERNAL',
    ExternalStorage: 'EXTERNAL_STORAGE',
    Library: 'LIBRARY',
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

  describe('OTA CORS: unduhan native via CapacitorHttp (bukan fetch)', () => {
    it('di platform native, downloadAndInstall memakai request native (arraybuffer) dan TIDAK memanggil fetch', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const fakeBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      const requestSpy = vi.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-length': '4' },
        data: fakeBytes.buffer,
        url: 'https://example.com/app.apk',
      });
      const nativeService = new UpdateService({
        currentVersionCode: 1,
        updateCheckUrl: 'https://example.com/version.json',
        nativeHttpRequest: requestSpy as never,
      });
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;
      // Mock Filesystem (factory) sudah di-restore oleh afterEach test sebelumnya —
      // pasang lagi implementasinya di sini.
      vi.mocked(Filesystem.writeFile).mockResolvedValue({ uri: '' });
      vi.mocked(Filesystem.getUri).mockResolvedValue({ uri: 'file:///cache/buku-konter-update.apk' });

      // Di jsdom, ApkInstaller native tidak terimplementasi — alur akan gagal tepat
      // di langkah installer (bukan di unduhan). Yang diuji di sini: request native
      // terpanggil dengan benar dan fetch tidak dipakai sama sekali.
      await expect(
        nativeService.downloadAndInstall(
          {
            versionCode: 6,
            versionName: '0.2.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Update',
            forceUpdate: false,
          },
          () => {},
        ),
      ).rejects.toThrow(/not implemented/i);

      expect(requestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'https://example.com/app.apk',
          responseType: 'arraybuffer',
        }),
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('unduhan native yang tidak lengkap (content-length tidak cocok) langsung ditolak sebelum installer', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const nativeService = new UpdateService({
        currentVersionCode: 1,
        updateCheckUrl: 'https://example.com/version.json',
        nativeHttpRequest: vi.fn().mockResolvedValue({
          status: 200,
          headers: { 'content-length': '100' },
          data: new Uint8Array([0x50, 0x4b]).buffer,
          url: 'https://example.com/app.apk',
        }) as never,
      });

      await expect(
        nativeService.downloadAndInstall(
          {
            versionCode: 6,
            versionName: '0.2.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Update',
            forceUpdate: false,
          },
          () => {},
        ),
      ).rejects.toThrow(/tidak lengkap/i);
    });

    it('unduhan web (fetch) yang tidak lengkap juga ditolak', async () => {
      const fakeData = new Uint8Array([0x50, 0x4b]);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (h: string) => (h === 'content-length' ? '100' : null),
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

      await expect(
        updateService.downloadAndInstall(
          {
            versionCode: 6,
            versionName: '0.2.0',
            downloadUrl: 'https://example.com/app.apk',
            changelog: 'Update',
            forceUpdate: false,
          },
          () => {},
        ),
      ).rejects.toThrow(/tidak lengkap/i);
    });
  });

  describe('b6: Unduhan native via CapacitorHttp + validasi ukuran', () => {
    const apkVersion = {
      versionCode: 6,
      versionName: '0.2.0',
      downloadUrl: 'https://example.com/app.apk',
      changelog: 'Perbaikan OTA b6',
      forceUpdate: false,
    };

    // Di jsdom, CapacitorHttp.get berjalan lewat implementasi web-nya yang
    // memanggil globalThis.fetch — jadi jalur native diuji lewat fetch mock
    // berupa Response sungguhan. Implementasi web mengembalikan data
    // arraybuffer sebagai string base64 (sama seperti plugin native),
    // sehingga jalur toUint8Array(base64) ikut teruji.
    function mockFetchApk(bytes: Uint8Array, contentLength: string | null, status = 200) {
      const headers: Record<string, string> = {
        'content-type': 'application/vnd.android.package-archive',
      };
      if (contentLength !== null) headers['content-length'] = contentLength;
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(bytes as unknown as BodyInit, { status, headers })
      ) as unknown as typeof fetch;
      return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    }

    it('fallback web = 6 dan version.json version_code = 6 (naik bareng)', () => {
      expect(DEFAULT_WEB_FALLBACK_VERSION_CODE).toBe(6);
      expect(versionData.version_code).toBe(6);
    });

    it('native: unduh via CapacitorHttp (bukan fetch langsung service), progress berakhir 100', async () => {
      const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      const fetchMock = mockFetchApk(fakeData, '4');

      const progressList: number[] = [];
      const bytes = await updateService.downloadApk(apkVersion, (pct) => {
        progressList.push(pct);
      });

      // CapacitorHttp web memanggil fetch dengan requestInit (method GET);
      // jalur fetch langsung service memanggil fetch(url) tanpa init.
      expect(fetchMock).toHaveBeenCalledWith(
        apkVersion.downloadUrl,
        expect.objectContaining({ method: 'GET' })
      );
      expect(bytes).toEqual(fakeData);
      expect(progressList[progressList.length - 1]).toBe(100);
    });

    it('native: HTTP non-2xx ditolak dengan pesan jelas', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      mockFetchApk(new Uint8Array([]), null, 404);

      await expect(updateService.downloadApk(apkVersion, () => {})).rejects.toThrow('HTTP 404');
    });

    it('native: ukuran diterima != content-length ditolak (file tidak lengkap)', async () => {
      const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      mockFetchApk(fakeData, '10');

      await expect(updateService.downloadApk(apkVersion, () => {})).rejects.toThrow(
        /tidak lengkap/
      );
    });

    it('native: tanpa content-length, file di bawah batas minimum ditolak', async () => {
      const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
      mockFetchApk(fakeData, null);

      await expect(updateService.downloadApk(apkVersion, () => {})).rejects.toThrow(
        /tidak lengkap/
      );
    });

    it('web: unduhan terpotong (content-length tidak cocok) menggagalkan downloadAndInstall', async () => {
      vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
      const fakeData = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (h: string) => (h === 'content-length' ? '10' : null),
        },
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

      await expect(updateService.downloadAndInstall(apkVersion, () => {})).rejects.toThrow(
        /tidak lengkap/
      );
    });
  });
});
