import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bengkel.bukukonter',
  appName: 'Buku Konter',
  webDir: 'dist',
  backgroundColor: '#F6F7F9',
  plugins: {
    // Live update ala Server Pulsa (Capgo, self-hosted — tanpa cloud Capgo / API key).
    // autoUpdate: false = aplikasi sendiri yang memutuskan kapan cek + terapkan update.
    // resetWhenUpdate: true = saat APK baru terinstal, bundle unduhan lama dibuang dan
    // aplikasi kembali ke aset bawaan APK (penting untuk transisi b8).
    CapacitorUpdater: {
      autoUpdate: false,
      resetWhenUpdate: true,
    },
  },
};

export default config;
