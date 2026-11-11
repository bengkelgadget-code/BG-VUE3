/* eslint-disable no-console */
/**
 * Patch untuk @capgo/capacitor-updater (Android) versi 7.53.0.
 *
 * Masalah: Di versi 7.53.0, plugin melempar IOException("Checksum required") bila
 * pemanggilan download() tidak menyertakan checksum. Di Server Pulsa (versi 8),
 * Capgo sudah menghapus batasan ini.
 *
 * Script ini mengamankan plugin agar:
 * 1. Tidak melempar error bila checksum kosong (hanya mencatat info log).
 * 2. Tetap memverifikasi checksum SHA-256 bila checksum diberikan.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pluginJavaPath = path.resolve(
  __dirname,
  '../node_modules/@capgo/capacitor-updater/android/src/main/java/ee/forgr/capacitor_updater/CapacitorUpdaterPlugin.java'
);

if (fs.existsSync(pluginJavaPath)) {
  let content = fs.readFileSync(pluginJavaPath, 'utf8');
  let modified = false;

  // 1. Patch downloadBundle: jangan lempar IOException bila checksum kosong
  const target1 = /if\s*\(manifest\s*==\s*null\s*&&\s*\(checksum\s*==\s*null\s*\|\|\s*checksum\.isEmpty\(\)\)\)\s*\{[\s\S]*?throw new IOException\("Checksum required"\);\s*\}/;
  if (target1.test(content)) {
    content = content.replace(target1, `if (manifest == null && (checksum == null || checksum.isEmpty())) {
            logger.info("No checksum provided, proceeding without checksum verification");
        }`);
    modified = true;
    console.log('[patch-capgo] Patched downloadBundle() checksum requirement.');
  }

  // 2. Patch latest validation (bila ada)
  const target2 = /if\s*\(!latest\.has\("manifest"\)\s*&&\s*\(checksum\s*==\s*null\s*\|\|\s*checksum\.isEmpty\(\)\)\)\s*\{[\s\S]*?return "Checksum required";\s*\}/;
  if (target2.test(content)) {
    content = content.replace(target2, `if (!latest.has("manifest") && (checksum == null || checksum.isEmpty())) {
            logger.info("No checksum provided in latest check");
            return null;
        }`);
    modified = true;
    console.log('[patch-capgo] Patched latest checksum validation.');
  }

  if (modified) {
    fs.writeFileSync(pluginJavaPath, content, 'utf8');
    console.log('[patch-capgo] Successfully patched CapacitorUpdaterPlugin.java');
  } else {
    console.log('[patch-capgo] CapacitorUpdaterPlugin.java already patched or pattern not found.');
  }
} else {
  console.log('[patch-capgo] CapacitorUpdaterPlugin.java not found (node_modules not ready).');
}
