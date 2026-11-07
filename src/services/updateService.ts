export interface VersionInfo {
  versionCode: number; // int, wajib naik tiap rilis
  versionName: string;
  downloadUrl: string; // URL APK di GitHub Release
  changelog: string;
  forceUpdate: boolean;
}

export class UpdateService {
  private currentVersionCode: number = 1;
  private updateCheckUrl: string =
    'https://raw.githubusercontent.com/bengkelgadget-code/BG-VUE3/main/version.json';

  constructor(opts?: { currentVersionCode?: number; updateCheckUrl?: string }) {
    if (opts?.currentVersionCode !== undefined) {
      this.currentVersionCode = opts.currentVersionCode;
    }
    if (opts?.updateCheckUrl !== undefined) {
      this.updateCheckUrl = opts.updateCheckUrl;
    }
  }

  public setCheckUrl(url: string): void {
    this.updateCheckUrl = url;
  }

  public setInstalledVersionCode(code: number): void {
    this.currentVersionCode = code;
  }

  public async getInstalledVersionCode(): Promise<number> {
    return this.currentVersionCode;
  }

  /**
   * Cek version.json di raw.githubusercontent.
   * Bandingkan version_code dengan versi terpasang saat ini.
   * Null = sudah versi terbaru / tidak ada update.
   */
  public async checkForUpdate(): Promise<VersionInfo | null> {
    try {
      const res = await fetch(this.updateCheckUrl);
      if (!res.ok) return null;
      const data = await res.json();

      const remoteCode = Number(data.version_code ?? data.versionCode);
      const installedCode = await this.getInstalledVersionCode();

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
   * Unduh update APK dan luncurkan installer
   */
  public async downloadAndInstall(
    version: VersionInfo,
    onProgress: (pct: number) => void
  ): Promise<void> {
    for (let p = 20; p <= 100; p += 20) {
      onProgress(p);
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    if (
      version.downloadUrl &&
      typeof window !== 'undefined' &&
      typeof window.open === 'function'
    ) {
      try {
        window.open(version.downloadUrl, '_blank');
      } catch {
        // Abaikan pada environment testing tanpa window.open
      }
    }
  }
}

export const updateService = new UpdateService();
