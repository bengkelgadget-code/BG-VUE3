import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import {
  LiveUpdateService,
  APP_VERSION_STORAGE_KEY,
  type BundleUpdate,
} from '../src/services/liveUpdateService';

vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    download: vi.fn(),
    set: vi.fn(),
  },
}));

const mockedUpdater = vi.mocked(CapacitorUpdater);

function makeVersionJson(overrides: Record<string, unknown> = {}) {
  return {
    version_code: 8,
    version_name: '0.2.0',
    download_url: 'https://example.com/buku-konter-v0.2.0-b8.apk',
    bundle_version: '1770000000000',
    bundle_url: 'https://example.com/update.zip',
    min_apk_version_code: 8,
    changelog: 'Update Capgo b8',
    force_update: false,
    ...overrides,
  };
}

function makeService(versionJson: Record<string, unknown>, installedCode = 8) {
  const fetchFn = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => versionJson,
  }) as unknown as typeof fetch;
  const service = new LiveUpdateService({
    fetchFn,
    getInstalledVersionCode: async () => installedCode,
    updater: mockedUpdater as unknown as typeof CapacitorUpdater,
  });
  return { service, fetchFn };
}

describe('b8: LiveUpdateService (Capgo, ala Server Pulsa)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
    mockedUpdater.download.mockResolvedValue({
      id: 'bundle-1',
      version: '1770000000000',
      downloaded: new Date().toISOString(),
      checksum: 'abc',
      status: 'success',
    } as never);
    mockedUpdater.set.mockResolvedValue(undefined as never);
  });

  it('bukan native → tidak ada pengecekan (fetch tidak dipanggil)', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(false);
    const { service, fetchFn } = makeService(makeVersionJson());

    expect(await service.checkForUpdate()).toEqual({ kind: 'none' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('instal pertama (belum ada app_version tersimpan) → simpan versi & jangan unduh', async () => {
    const { service } = makeService(makeVersionJson());

    expect(await service.checkForUpdate()).toEqual({ kind: 'none' });
    expect(localStorage.getItem(APP_VERSION_STORAGE_KEY)).toBe('1770000000000');
    expect(mockedUpdater.download).not.toHaveBeenCalled();
  });

  it('bundle_version baru → kembalikan info bundle (download belum dipanggil)', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service } = makeService(makeVersionJson());

    const result = await service.checkForUpdate();
    expect(result).toEqual({
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    });
    expect(mockedUpdater.download).not.toHaveBeenCalled();
  });

  it('bundle_version sama dengan yang tersimpan → tidak ada update', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1770000000000');
    const { service } = makeService(makeVersionJson());

    expect(await service.checkForUpdate()).toEqual({ kind: 'none' });
  });

  it('bundle_version kosong di version.json → tidak ada update', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service } = makeService(makeVersionJson({ bundle_version: '' }));

    expect(await service.checkForUpdate()).toEqual({ kind: 'none' });
  });

  it('min_apk_version_code di atas APK terpasang → apk-required, download bundle TIDAK dipanggil', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service } = makeService(makeVersionJson({ min_apk_version_code: 9 }), 8);

    const result = await service.checkForUpdate();
    expect(result).toEqual({
      kind: 'apk',
      versionCode: 8,
      versionName: '0.2.0',
      downloadUrl: 'https://example.com/buku-konter-v0.2.0-b8.apk',
      changelog: 'Update Capgo b8',
      forceUpdate: false,
    });
    expect(mockedUpdater.download).not.toHaveBeenCalled();
  });

  it('min_apk_version_code sudah terpenuhi → alur bundle normal', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service } = makeService(makeVersionJson({ min_apk_version_code: 8 }), 8);

    const result = await service.checkForUpdate();
    expect(result.kind).toBe('bundle');
  });

  it('fetch gagal (HTTP non-2xx) → lempar error jelas', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const service = new LiveUpdateService({
      fetchFn,
      getInstalledVersionCode: async () => 8,
      updater: mockedUpdater as unknown as typeof CapacitorUpdater,
    });

    await expect(service.checkForUpdate()).rejects.toThrow('HTTP 500');
  });

  it('downloadBundle + applyDownloadedBundle sukses → download + simpan versi + set terpanggil', async () => {
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    const bundle = await service.downloadBundle(update);
    await service.applyDownloadedBundle(bundle, update.bundleVersion);

    expect(mockedUpdater.download).toHaveBeenCalledWith({
      url: 'https://example.com/update.zip',
      version: '1770000000000',
    });
    expect(localStorage.getItem(APP_VERSION_STORAGE_KEY)).toBe('1770000000000');
    expect(mockedUpdater.set).toHaveBeenCalledWith({ id: 'bundle-1' });
  });

  it('downloadBundle gagal di download → app_version dihapus & error dilempar', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    mockedUpdater.download.mockRejectedValue(new Error('network down'));
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    await expect(service.downloadBundle(update)).rejects.toThrow('network down');
    expect(localStorage.getItem(APP_VERSION_STORAGE_KEY)).toBeNull();
    expect(mockedUpdater.set).not.toHaveBeenCalled();
  });

  it('applyDownloadedBundle gagal di set() → app_version dihapus & error dilempar', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    mockedUpdater.set.mockRejectedValue(new Error('set failed'));
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    await expect(service.applyDownloadedBundle({ id: 'bundle-1' }, update.bundleVersion)).rejects.toThrow('set failed');
    expect(localStorage.getItem(APP_VERSION_STORAGE_KEY)).toBeNull();
  });

  it('bundle baru tapi bundle_url kosong → lempar error jelas', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service } = makeService(makeVersionJson({ bundle_url: '' }));

    await expect(service.checkForUpdate()).rejects.toThrow('URL bundle');
  });

  it('checkForUpdate memanggil fetch dengan parameter cache-buster ?t= dan cache: no-store', async () => {
    localStorage.setItem(APP_VERSION_STORAGE_KEY, '1760000000000');
    const { service, fetchFn } = makeService(makeVersionJson());

    await service.checkForUpdate();

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const mockFn = fetchFn as unknown as { mock: { calls: Array<[string, RequestInit]> } };
    const calledUrl = mockFn.mock.calls[0][0];
    const calledOpts = mockFn.mock.calls[0][1];

    expect(calledUrl).toMatch(/[?&]t=\d+/);
    expect(calledOpts).toEqual({ cache: 'no-store' });
  });

  it('(a) Guard isUpdating: dua pemanggilan downloadBundle bersamaan → pemanggilan kedua ditolak dan download hanya dipanggil 1x', async () => {
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    let resolveDownload: (val: unknown) => void = () => {};
    mockedUpdater.download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }) as never
    );

    const call1 = service.downloadBundle(update);

    await expect(service.downloadBundle(update)).rejects.toThrow('Proses pembaruan sedang berjalan.');
    expect(mockedUpdater.download).toHaveBeenCalledTimes(1);

    resolveDownload({ id: 'bundle-1', version: '1770000000000' });
    await call1;
  });

  it('(a-2) Guard isUpdating ter-reset setelah gagal sehingga pemanggilan berikutnya bisa jalan', async () => {
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    mockedUpdater.download.mockRejectedValueOnce(new Error('Network error'));
    await expect(service.downloadBundle(update)).rejects.toThrow('Network error');
    expect(service.getIsUpdating()).toBe(false);

    mockedUpdater.download.mockResolvedValueOnce({ id: 'bundle-2', version: '1770000000000' } as never);
    const bundle = await service.downloadBundle(update);
    await service.applyDownloadedBundle(bundle, update.bundleVersion);
    expect(mockedUpdater.download).toHaveBeenCalledTimes(2);
    expect(mockedUpdater.set).toHaveBeenCalledWith({ id: 'bundle-2' });
  });

  it('checkForUpdate mengembalikan kind: pending saat ada pendingBundle tersimpan', async () => {
    const { service } = makeService(makeVersionJson());
    service.setPendingBundle({ bundle: { id: 'bundle-pending' }, version: '1770000000000' });

    const result = await service.checkForUpdate();
    expect(result).toEqual({ kind: 'pending' });
  });

  it('checkForUpdate mengembalikan kind: updating saat isUpdating bernilai true tanpa pendingBundle', async () => {
    const { service } = makeService(makeVersionJson());
    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    let resolveDownload: (val: unknown) => void = () => {};
    mockedUpdater.download.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDownload = resolve;
      }) as never
    );

    const call1 = service.downloadBundle(update);
    expect(service.getIsUpdating()).toBe(true);

    const checkResult = await service.checkForUpdate();
    expect(checkResult).toEqual({ kind: 'updating' });

    resolveDownload({ id: 'b-1' });
    await call1;
  });

  it('downloadBundle menolak jika sudah ada pendingBundle', async () => {
    const { service } = makeService(makeVersionJson());
    service.setPendingBundle({ bundle: { id: 'bundle-1' }, version: '1770000000000' });

    const update: BundleUpdate = {
      kind: 'bundle',
      bundleVersion: '1770000000000',
      bundleUrl: 'https://example.com/update.zip',
      versionName: '0.2.0',
      versionCode: 8,
      changelog: 'Update Capgo b8',
    };

    await expect(service.downloadBundle(update)).rejects.toThrow('Proses pembaruan sedang berjalan.');
  });

  it('clearPendingBundle mereset pendingBundle dan isUpdating', async () => {
    const { service } = makeService(makeVersionJson());
    service.setPendingBundle({ bundle: { id: 'bundle-1' }, version: '1770000000000' });
    expect(service.hasPendingBundle()).toBe(true);

    service.clearPendingBundle();
    expect(service.hasPendingBundle()).toBe(false);
    expect(service.getPendingBundle()).toBeNull();
    expect(service.getIsUpdating()).toBe(false);
  });
});
