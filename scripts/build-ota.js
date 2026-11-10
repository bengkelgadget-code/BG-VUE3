/* eslint-disable no-console */
// Build bundle live-update (Capgo) ala SERVERPULSA-VUE3 — adaptasi scripts/build-ota.js.
// Dijalankan SETELAH `npm run build` (vite): zip SELURUH isi dist/ menjadi update.zip.
//
// BEDA dengan Server Pulsa:
// - Server Pulsa menulis dist/version.json (manifest update yang disajikan Vercel).
//   Buku Konter TIDAK memakai Vercel — manifest update adalah version.json di ROOT repo
//   (dibaca aplikasi dari raw.githubusercontent.com); field bundle_version / bundle_url /
//   min_apk_version_code diisi langkah bot workflow (lihat .github/workflows/auto_release.yml).
//   Jadi script ini TIDAK menulis version.json.
// - update.zip diletakkan DI LUAR dist/ (root repo) supaya tidak ikut tersalin ke dalam
//   APK saat `npx cap sync` (Server Pulsa mengatasinya dengan `rm -f dist/update.zip`
//   sebelum sync; cara ini lebih aman karena zip memang tidak pernah masuk dist/).
import fs from 'fs';
import process from 'node:process';
import { ZipArchive } from 'archiver';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.resolve(__dirname, '../dist');
const finalZip = path.resolve(__dirname, '../update.zip');

// Make sure dist exists
if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist. Run vite build first.');
  process.exit(1);
}

// Hapus zip lama bila ada (supaya tidak ter-zip berulang / tertinggal dari build sebelumnya)
if (fs.existsSync(finalZip)) {
  fs.unlinkSync(finalZip);
}

// Create a file to stream archive data to
const output = fs.createWriteStream(finalZip);
const archive = new ZipArchive({
  zlib: { level: 9 }, // Sets the compression level.
});

output.on('close', () => {
  console.log(`Generated OTA bundle: ${archive.pointer()} total bytes -> ${finalZip}`);
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

// append files from dist, excluding any previous update.zip to prevent recursive zipping
archive.glob('**/*', {
  cwd: distDir,
  ignore: ['update.zip'],
});

archive.finalize();
