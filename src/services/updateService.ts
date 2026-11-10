import { Capacitor, CapacitorHttp, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { App } from '@capacitor/app';

export interface VersionInfo {
  versionCode: number; // int, wajib naik tiap rilis
  versionName: string;
  downloadUrl: string; // URL APK di GitHub Release
  changelog: string;
  forceUpdate: boolean;
}

interface ApkInstallerPlugin {
  install(options: { path: string }): Promise<void>;
}

const ApkInstaller = registerPlugin<ApkInstallerPlugin>('ApkInstaller');

// Fallback jika di lingkungan web/dev tanpa platform native
export const DEFAULT_WEB_FALLBACK_VERSION_CODE = 6;

/**
 * Normalisasi hasil unduhan native menjadi Uint8Array.
 * CapacitorHttp dengan responseType 'arraybuffer' mengembalikan ArrayBuffer,
 * tapi di beberapa platform bridge mengembalikan string base64 — tangani keduanya.
 */
function toUint8Array(data: unknown): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (data instanceof Uint8Array) return data;
  if (typeof data === 'string') {
    const bin = atob(data);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  throw new Error('Format data unduhan tidak dikenali.');
}

export class UpdateService {
  private currentVersionCode: number = DEFAULT_WEB_FALLBACK_VERSION_CODE;
  private isManuallySet: boolean = false;
  private updateCheckUrl: string =
    'https://raw.githubusercontent.com/bengkelgadget-code/BG-VUE3/main/version.json';
  // Fungsi unduh native — defaultnya CapacitorHttp.request. Bisa di-override
  // lewat constructor untuk pengujian (CapacitorHttp adalah proxy registerPlugin
  // yang method-nya baru muncul setelah plugin native ter-load, jadi tidak bisa
  // di-spyOn langsung di jsdom).
  private nativeHttpRequest: typeof CapacitorHttp.request;

  constructor(opts?: {
    currentVersionCode?: number;
    updateCheckUrl?: string;
    nativeHttpRequest?: typeof CapacitorHttp.request;
  }) {
    if (opts?.currentVersionCode !== undefined) {
      this.currentVersionCode = opts.currentVersionCode;
      this.isManuallySet = true;
    }
    if (opts?.updateCheckUrl !== undefined) {
      this.updateCheckUrl = opts.updateCheckUrl;
    }
    this.nativeHttpRequest =
      opts?.nativeHttpRequest ?? ((o) => CapacitorHttp.request(o));
  }

  public setCheckUrl(url: string): void {
    this.updateCheckUrl = url;
  }

  public setInstalledVersionCode(code: number): void {
    this.currentVersionCode = code;
    this.isManuallySet = true;
  }

  /**
   * Menyinkronkan version code dari info build native via @capacitor/app.
   * Hanya dijalankan jika berada di platform native dan belum di-override secara manual.
   */
  public async syncInstalledVersionCode(): Promise<number> {
    if (this.isManuallySet) {
      return this.currentVersionCode;
    }

    try {
      if (Capacitor.isNativePlatform()) {
        const info = await App.getInfo();
        const buildCode = parseInt(info.build, 10);
        if (!isNaN(buildCode) && buildCode > 0) {
          this.currentVersionCode = buildCode;
        }
      }
    } catch (err) {
      console.warn('Fallback web/dev mode: gagal membaca info native App.getInfo', err);
    }
    return this.currentVersionCode;
  }

  public async getInstalledVersionCode(): Promise<number> {
    if (!this.isManuallySet) {
      await this.syncInstalledVersionCode();
    }
    return this.currentVersionCode;
  }

  /**
   * Cek version.json di raw.githubusercontent.
   * Bandingkan version_code dengan versi terpasang saat ini.
   * Null = sudah versi terbaru / tidak ada update.
   */
  public async checkForUpdate(): Promise<VersionInfo | null> {
    try {
      const installedCode = await this.getInstalledVersionCode();

      const res = await fetch(this.updateCheckUrl);
      if (!res.ok) return null;
      const data = await res.json();

      const remoteCode = Number(data.version_code ?? data.versionCode);

      if (remoteCode > installedCode) {
        return {
          versionCode: remoteCode,
          versionName: String(data.version_name ?? data.versionName ?? ''),
          downloadUrl: String(data.download_url ?? data.downloadUrl ?? ''),
          changelog: String(data.changelog ?? ''),
          forceUpdate: Boolean(data.force_update ?? data.forceUpdate),
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Unduh update APK sungguhan dan luncurkan installer native Android via Capacitor
   */
  public async downloadAndInstall(
    version: VersionInfo,
    onProgress: (pct: number) => void
  ): Promise<void> {
    onProgress(0);

    if (!version.downloadUrl) {
      throw new Error('URL unduhan APK tidak valid.');
    }

    // Di platform native, unduh via CapacitorHttp (request native) — BUKAN fetch().
    // Alasan: fetch() di WebView kena blokir CORS saat mengunduh dari host release GitHub
    // (release-assets.githubusercontent.com tidak mengirim Access-Control-Allow-Origin),
    // sehingga update selalu gagal dengan "Failed to fetch" padahal APK-nya baik-baik saja.
    // Request native tidak kena CORS. Di web/dev/test tetap pakai fetch seperti sebelumnya.
    let combined: Uint8Array;
    if (Capacitor.isNativePlatform()) {
      const nativeRes = await this.nativeHttpRequest({
        method: 'GET',
        url: version.downloadUrl,
        responseType: 'arraybuffer',
      });
      if (nativeRes.status < 200 || nativeRes.status >= 300) {
        throw new Error(`Gagal mengunduh file APK: HTTP ${nativeRes.status}`);
      }
      combined = toUint8Array(nativeRes.data);
      onProgress(100);
      const expectedLen = Number(
        nativeRes.headers?.['content-length'] ?? nativeRes.headers?.['Content-Length'] ?? 0
      );
      if (expectedLen > 0 && combined.byteLength !== expectedLen) {
        throw new Error(
          `Unduhan tidak lengkap (${combined.byteLength} dari ${expectedLen} byte). Coba lagi.`
        );
      }
    } else {
      const res = await fetch(version.downloadUrl);
      if (!res.ok) {
        throw new Error(`Gagal mengunduh file APK: HTTP ${res.status}`);
      }

      const contentLength = Number(res.headers.get('content-length')) || 0;
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            receivedBytes += value.length;
            if (contentLength > 0) {
              const pct = Math.min(100, Math.round((receivedBytes / contentLength) * 100));
              onProgress(pct);
            }
          }
        }
      } else {
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        chunks.push(new Uint8Array(buf));
        receivedBytes = buf.byteLength;
        onProgress(100);
      }

      onProgress(100);

      const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
      const merged = new Uint8Array(totalLen);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      if (contentLength > 0 && merged.byteLength !== contentLength) {
        throw new Error(
          `Unduhan tidak lengkap (${merged.byteLength} dari ${contentLength} byte). Coba lagi.`
        );
      }
      combined = merged;
    }

    // Simpan file APK ke cache filesystem
    let binary = '';
    const len = combined.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(combined[i]);
    }
    const base64Data = btoa(binary);

    const fileName = 'buku-konter-update.apk';

    try {
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      if (Capacitor.isNativePlatform()) {
        const uriResult = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache,
        });
        const cleanPath = uriResult.uri.replace(/^file:\/\//, '');
        await ApkInstaller.install({ path: cleanPath });
      } else {
        // Fallback untuk browser web / development
        if (typeof document !== 'undefined') {
          const blob = new Blob([combined], { type: 'application/vnd.android.package-archive' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch (err: unknown) {
      // Fallback toleran jika Filesystem bridge tidak aktif di environment testing
      if (typeof window !== 'undefined' && typeof window.open === 'function' && !Capacitor.isNativePlatform()) {
        try {
          window.open(version.downloadUrl, '_blank');
        } catch {
          // Abaikan pada environment testing tanpa window.open
        }
      } else if (err instanceof Error) {
        throw err;
      }
    }
  }
}

export const updateService = new UpdateService();
