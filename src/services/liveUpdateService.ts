import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { CapacitorUpdater } from '@capgo/capacitor-updater';

/**
 * Live update ala Server Pulsa (Capgo, self-hosted) — pengganti updateService (APK penuh).
 *
 * Cara kerja (persis SERVERPULSA-VUE3/src/App.vue `checkForUpdates`, tapi sebagai service
 * agar bisa di-unit-test):
 * 1. Cek `version.json` di raw.githubusercontent.com (cache no-store).
 * 2. Bila `min_apk_version_code` > versionCode APK terpasang → update APK wajib
 *    (bundle baru butuh kode native yang belum ada) → kembalikan `apk-required`;
 *    aplikasi menampilkan dialog unduh APK (buka di browser, BUKAN instal dari aplikasi).
 * 3. Bila `bundle_version` beda dari `localStorage 'app_version'` → ada bundle baru:
 *    `CapacitorUpdater.download()` lalu `set()` (webview me-refresh otomatis).
 *    Data lokal (Dexie/IndexedDB + localStorage) TIDAK ikut tertukar — terikat origin
 *    WebView, bukan folder aset — jadi transaksi/saldo/master tetap utuh.
 * 4. Gagal unduh/apply → `app_version` dihapus (pola Server Pulsa — dicoba lagi saat
 *    aplikasi dibuka berikutnya), bundle lama yang sedang berjalan TIDAK dihapus.
 */

export interface BundleUpdate {
  kind: 'bundle';
  bundleVersion: string;
  bundleUrl: string;
  versionName: string;
  versionCode: number;
  changelog: string;
}

export interface ApkUpdate {
  kind: 'apk';
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  changelog: string;
  forceUpdate: boolean;
}

export interface PendingBundle {
  bundle: { id: string };
  version: string;
}

export type LiveUpdateCheck =
  | { kind: 'none' }
  | { kind: 'pending' }
  | { kind: 'updating' }
  | BundleUpdate
  | ApkUpdate;

/** Kunci localStorage yang sama seperti Server Pulsa. */
export const APP_VERSION_STORAGE_KEY = 'app_version';

type UpdaterLike = typeof CapacitorUpdater;

export class LiveUpdateService {
  private updateCheckUrl: string =
    'https://raw.githubusercontent.com/bengkelgadget-code/BG-VUE3/main/version.json';
  private fetchFn: typeof fetch;
  private getInstalledCodeFn: () => Promise<number>;
  private updater: UpdaterLike;
  private isUpdating = false;
  private pendingBundle: PendingBundle | null = null;

  constructor(opts?: {
    updateCheckUrl?: string;
    fetchFn?: typeof fetch;
    getInstalledVersionCode?: () => Promise<number>;
    updater?: UpdaterLike;
  }) {
    if (opts?.updateCheckUrl !== undefined) {
      this.updateCheckUrl = opts.updateCheckUrl;
    }
    this.fetchFn = opts?.fetchFn ?? ((...args) => fetch(...args));
    this.getInstalledCodeFn =
      opts?.getInstalledVersionCode ?? (async () => {
        try {
          if (!Capacitor.isNativePlatform()) return 0;
          const info = await App.getInfo();
          const code = parseInt(info.build, 10);
          return !isNaN(code) && code > 0 ? code : 0;
        } catch {
          return 0;
        }
      });
    this.updater = opts?.updater ?? CapacitorUpdater;
  }

  public setCheckUrl(url: string): void {
    this.updateCheckUrl = url;
  }

  public getIsUpdating(): boolean {
    return this.isUpdating;
  }

  public getPendingBundle(): PendingBundle | null {
    return this.pendingBundle;
  }

  public setPendingBundle(pending: PendingBundle | null): void {
    this.pendingBundle = pending;
  }

  public hasPendingBundle(): boolean {
    return this.pendingBundle !== null;
  }

  public clearPendingBundle(): void {
    this.pendingBundle = null;
    this.isUpdating = false;
  }

  public async getInstalledVersionCode(): Promise<number> {
    return this.getInstalledCodeFn();
  }

  /**
   * Cek update. Hanya berjalan di platform native — di web/dev selalu 'none'.
   * 'none' = sudah terbaru / belum ada info bundle / gagal baca versi terpasang.
   */
  public async checkForUpdate(): Promise<LiveUpdateCheck> {
    if (!Capacitor.isNativePlatform()) {
      return { kind: 'none' };
    }
    if (this.hasPendingBundle()) {
      return { kind: 'pending' };
    }
    if (this.isUpdating) {
      return { kind: 'updating' };
    }

    const separator = this.updateCheckUrl.includes('?') ? '&' : '?';
    const checkUrl = `${this.updateCheckUrl}${separator}t=${Date.now()}`;
    const res = await this.fetchFn(checkUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Gagal memeriksa pembaruan: HTTP ${res.status}`);
    }
    const data = await res.json();

    const installedCode = await this.getInstalledVersionCode();

    // APK wajib dulu bila bundle baru butuh kode native yang belum ada.
    const minApkCode = Number(data.min_apk_version_code ?? 0);
    if (minApkCode > 0 && installedCode > 0 && minApkCode > installedCode) {
      const downloadUrl = String(data.download_url ?? '');
      if (!downloadUrl) {
        throw new Error('Pembaruan APK diperlukan, tetapi URL unduhan APK tidak tersedia.');
      }
      return {
        kind: 'apk',
        versionCode: Number(data.version_code ?? minApkCode),
        versionName: String(data.version_name ?? ''),
        downloadUrl,
        changelog: String(data.changelog ?? ''),
        forceUpdate: Boolean(data.force_update ?? false),
      };
    }

    const bundleVersion = String(data.bundle_version ?? '');
    if (!bundleVersion) {
      return { kind: 'none' };
    }

    const storedVersion = localStorage.getItem(APP_VERSION_STORAGE_KEY);
    if (!storedVersion) {
      // Instal pertama / belum pernah mencatat versi bundle: catat versi yang sedang
      // berjalan (sudah ada di dalam APK) dan jangan unduh apa-apa.
      localStorage.setItem(APP_VERSION_STORAGE_KEY, bundleVersion);
      return { kind: 'none' };
    }
    if (storedVersion === bundleVersion) {
      return { kind: 'none' };
    }

    const bundleUrl = String(data.bundle_url ?? '');
    if (!bundleUrl) {
      throw new Error('Pembaruan bundle tersedia, tetapi URL bundle tidak tersedia.');
    }
    return {
      kind: 'bundle',
      bundleVersion,
      bundleUrl,
      versionName: String(data.version_name ?? ''),
      versionCode: Number(data.version_code ?? 0),
      changelog: String(data.changelog ?? ''),
    };
  }

  /**
   * Unduh bundle lalu terapkan. `set()` langsung me-refresh webview (terminal operation)
   * sehingga kode setelahnya tidak berjalan bila sukses. Gagal → `app_version` dihapus
   * supaya dicoba lagi saat aplikasi dibuka berikutnya, lalu error dilempar ke pemanggil.
   */
  public async downloadBundle(update: BundleUpdate): Promise<{ id: string }> {
    if (this.isUpdating || this.hasPendingBundle()) {
      throw new Error('Proses pembaruan sedang berjalan.');
    }
    if (!update.bundleUrl) {
      throw new Error('URL bundle tidak valid.');
    }
    this.isUpdating = true;
    try {
      const bundle = await this.updater.download({
        url: update.bundleUrl,
        version: update.bundleVersion,
      });
      return bundle;
    } catch (err) {
      this.isUpdating = false;
      this.pendingBundle = null;
      localStorage.removeItem(APP_VERSION_STORAGE_KEY);
      throw err;
    }
  }

  public async applyDownloadedBundle(bundle: { id: string }, version: string): Promise<void> {
    try {
      localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
      await this.updater.set({ id: bundle.id });
    } catch (err) {
      this.isUpdating = false;
      this.pendingBundle = null;
      localStorage.removeItem(APP_VERSION_STORAGE_KEY);
      throw err;
    }
  }
}

export const liveUpdateService = new LiveUpdateService();
