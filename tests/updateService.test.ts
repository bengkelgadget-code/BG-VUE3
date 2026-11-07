import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UpdateService } from '../src/services/updateService';

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

  it('5. downloadAndInstall: memancarkan progress hingga 100%', async () => {
    vi.stubGlobal('open', vi.fn());
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
});
