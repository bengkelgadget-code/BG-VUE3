/* eslint-disable no-console */
/**
 * Patch untuk @capgo/capacitor-updater (Android) versi 7.53.0.
 *
 * Masalah: Di versi 7.53.0, plugin melempar IOException("Checksum required") bila
 * pemanggilan download() tidak menyertakan checksum. Di Server Pulsa (versi 8),
 * Capgo sudah menghapus batasan ini.
 *
 * Script ini mengamankan plugin native (CapacitorUpdaterPlugin.java & CapgoUpdater.java) agar:
 * 1. Tidak melempar error bila checksum kosong (hanya mencatat info log).
 * 2. Tetap memverifikasi checksum SHA-256 bila checksum diberikan.
 */

import fs from 'fs';
import path from 'path';
import process from 'node:process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------
// 1. Patch CapacitorUpdaterPlugin.java
// ---------------------------------------------------------
const pluginJavaPath = path.resolve(
  __dirname,
  '../node_modules/@capgo/capacitor-updater/android/src/main/java/ee/forgr/capacitor_updater/CapacitorUpdaterPlugin.java'
);

if (fs.existsSync(pluginJavaPath)) {
  let content = fs.readFileSync(pluginJavaPath, 'utf8');
  let modified = false;

  // A. Patch downloadBundle: jangan lempar IOException bila checksum kosong
  const target1 = /if\s*\(manifest\s*==\s*null\s*&&\s*\(checksum\s*==\s*null\s*\|\|\s*checksum\.isEmpty\(\)\)\)\s*\{[\s\S]*?throw new IOException\("Checksum required"\);\s*\}/;
  if (target1.test(content)) {
    content = content.replace(target1, `if (manifest == null && (checksum == null || checksum.isEmpty())) {
            logger.info("No checksum provided, proceeding without checksum verification");
        }`);
    modified = true;
    console.log('[patch-capgo] Patched downloadBundle() checksum requirement in CapacitorUpdaterPlugin.java.');
  }

  // B. Patch autoUpdateDownloadBlockedReason (unpatched)
  const target2 = /if\s*\(!latest\.has\("manifest"\)\s*&&\s*\(checksum\s*==\s*null\s*\|\|\s*checksum\.isEmpty\(\)\)\)\s*\{[\s\S]*?return "Checksum required";\s*\}/;
  if (target2.test(content)) {
    content = content.replace(target2, `if (!latest.has("manifest") && (checksum == null || checksum.isEmpty())) {
            logger.info("No checksum provided in latest check");
        }`);
    modified = true;
    console.log('[patch-capgo] Patched autoUpdateDownloadBlockedReason checksum check in CapacitorUpdaterPlugin.java.');
  }

  // C. Rapikan return null redundan di autoUpdateDownloadBlockedReason bila sudah pernah ter-patch sebelumnya (H8)
  const targetRedundantReturn = /if\s*\(!latest\.has\("manifest"\)\s*&&\s*\(checksum\s*==\s*null\s*\|\|\s*checksum\.isEmpty\(\)\)\)\s*\{\s*logger\.info\("No checksum provided in latest check"\);\s*return null;\s*\}/;
  if (targetRedundantReturn.test(content)) {
    content = content.replace(targetRedundantReturn, `if (!latest.has("manifest") && (checksum == null || checksum.isEmpty())) {
            logger.info("No checksum provided in latest check");
        }`);
    modified = true;
    console.log('[patch-capgo] Cleaned redundant return in autoUpdateDownloadBlockedReason.');
  }

  if (modified) {
    fs.writeFileSync(pluginJavaPath, content, 'utf8');
    console.log('[patch-capgo] Successfully updated CapacitorUpdaterPlugin.java');
  } else {
    console.log('[patch-capgo] CapacitorUpdaterPlugin.java already patched.');
  }
} else {
  console.log('[patch-capgo] CapacitorUpdaterPlugin.java not found (node_modules not ready).');
}

// ---------------------------------------------------------
// 2. Patch CapgoUpdater.java (H1 - Lengkapi patch checksum)
// ---------------------------------------------------------
const updaterJavaPath = path.resolve(
  __dirname,
  '../node_modules/@capgo/capacitor-updater/android/src/main/java/ee/forgr/capacitor_updater/CapgoUpdater.java'
);

if (fs.existsSync(updaterJavaPath)) {
  let content = fs.readFileSync(updaterJavaPath, 'utf8');
  let modified = false;

  // A. Patch requireBundleChecksum method: jangan lempar IOException bila checksum kosong
  // HANYA ganti 3 baris di dalam blok if tanpa menyentuh kurung sama sekali
  const targetRequireMethod = /logger\.error\("No checksum provided"\);\s*this\.sendStats\("checksum_required"\);\s*throw\s+new\s+IOException\("Checksum required"\);/;
  if (targetRequireMethod.test(content)) {
    content = content.replace(
      targetRequireMethod,
      'logger.info("No checksum provided, skipping checksum verification");\n            return;'
    );
    modified = true;
    console.log('[patch-capgo] Patched requireBundleChecksum() in CapgoUpdater.java.');
  }

  // B. Patch finishDownload(): hanya lakukan pengecekan kesesuaian checksum bila expectedChecksum tidak kosong
  const targetFinishDownload = /if\s*\(!isManifest\)\s*\{\s*String\s+expectedChecksum\s*=\s*Objects\.requireNonNullElse\(checksumRes,\s*""\);\s*this\.requireBundleChecksum\(expectedChecksum\);\s*if\s*\(CryptoCipher\.isValidSessionKey\(sessionKey\)\)[\s\S]*?throw\s+new\s+IOException\("Checksum failed:\s*"\s*\+\s*id\);\s*\}\s*\}/;
  if (targetFinishDownload.test(content)) {
    content = content.replace(targetFinishDownload, `if (!isManifest) {
                String expectedChecksum = Objects.requireNonNullElse(checksumRes, "");
                this.requireBundleChecksum(expectedChecksum);

                if (!expectedChecksum.isEmpty()) {
                    if (CryptoCipher.isValidSessionKey(sessionKey)) {
                        CryptoCipher.decryptFile(downloaded, publicKey, sessionKey);
                        expectedChecksum = CryptoCipher.decryptChecksum(checksumRes, publicKey);
                    }
                    checksum = CryptoCipher.calcChecksum(downloaded);
                    CryptoCipher.logChecksumInfo("Calculated checksum", checksum);
                    CryptoCipher.logChecksumInfo("Expected checksum", expectedChecksum);
                    if (!expectedChecksum.equals(checksum)) {
                        logger.error("Checksum mismatch");
                        logger.debug("Expected: " + expectedChecksum + ", Got: " + checksum);
                        this.sendStats("checksum_fail");
                        throw new IOException("Checksum failed: " + id);
                    }
                } else {
                    logger.info("No checksum provided, skipping checksum verification");
                }
            }`);
    modified = true;
    console.log('[patch-capgo] Patched finishDownload() checksum verification in CapgoUpdater.java.');
  }

  if (modified) {
    fs.writeFileSync(updaterJavaPath, content, 'utf8');
    console.log('[patch-capgo] Successfully updated CapgoUpdater.java');
  } else {
    console.log('[patch-capgo] CapgoUpdater.java already patched.');
  }
} else {
  console.log('[patch-capgo] CapgoUpdater.java not found (node_modules not ready).');
}

// ---------------------------------------------------------
// 3. Pengaman Keseimbangan Kurung (Wajib untuk Plugin & Updater)
// ---------------------------------------------------------
function verifyBraceBalance(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const openCount = (fileContent.match(/\{/g) || []).length;
  const closeCount = (fileContent.match(/\}/g) || []).length;
  console.log(`[patch-capgo] Verifikasi kurung ${fileName}: { = ${openCount}, } = ${closeCount}`);
  if (openCount !== closeCount) {
    console.error(`[patch-capgo] FATAL: Keseimbangan kurung rusak di ${fileName}! { = ${openCount}, } = ${closeCount} (selisih: ${openCount - closeCount}).`);
    process.exit(1);
  }
}

verifyBraceBalance(pluginJavaPath, 'CapacitorUpdaterPlugin.java');
verifyBraceBalance(updaterJavaPath, 'CapgoUpdater.java');
