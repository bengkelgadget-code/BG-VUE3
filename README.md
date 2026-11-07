# BUKU KONTER (v0.1.0) 📱📒

**BUKU KONTER** adalah aplikasi pembukuan transaksi konter (pulsa, data, token PLN, voucher fisik, kartu perdana, aksesoris, transfer uang, tarik tunai, top-up e-wallet, dan tagihan PPOB) berbasis **Vue 3 + TypeScript + Vite + Dexie (IndexedDB) + Pinia + Capacitor**.

Aplikasi ini beroperasi dengan prinsip **Local-First & Offline Penuh**, dengan dukungan Android APK dan Web Browser.

---

## 🔒 Prinsip Inti & Keputusan Terkunci

1. **Murni Pencatatan (Pure Ledger)**:
   - Aplikasi ini **hanya mencatat**. Tidak pernah memanggil Digiflazz, tidak mengubah saldo live di server pulsa, bank, atau e-wallet.
   - Deposit server pulsa di aplikasi hanya dicatat sebagai mutasi internal konter.
2. **Formula Debit Rekening (Terkunci)**:
   - Opsi pembayaran admin terletak berdampingan dengan nominal: `Cash` | `Debit Rekening`.
   - **Debit Rekening = potong dari nominal**: Transfer Rp 500.000 dengan admin Rp 5.000 Debit Rekening → Bank Sumber keluar `-Rp 495.000`, Kasir menerima `+Rp 500.000`, Laba `+Rp 5.000`. Formula `-Rp 505.000` dilarang keras.
3. **Pembulatan Fee Persentase**:
   - Wajib menggunakan `Math.ceil(nominal * pct / 100)` ke Rupiah terdekat. `Math.round` dilarang.
4. **Master Data Tanpa Seed Awal**:
   - Database lokal Dexie kosong saat pertama kali diinstal. Akun Owner dibuat sendiri oleh pengguna saat pertama kali membuka aplikasi melalui layar Setup Owner (PIN disimpan dalam hash SHA-256).
   - Seluruh data akun, produk, tarif, dan pelanggan diinput mandiri lewat form master.
5. **Katalog Supabase Server Pulsa (Read-Only)**:
   - Akses Supabase hanya `SELECT` untuk menyinkronkan identitas produk ke cache lokal (`product_catalog_cache`). Tidak ada operasi tulis (`INSERT`/`UPDATE`/`DELETE`) ke Supabase.
6. **Saldo = Agregasi Buku Besar (Ledger)**:
   - Tabel `accounts` tidak memiliki kolom `balance`. Saldo selalu dihitung dari `initialBalance + SUM(ledger.delta)`.
7. **Void Bukan Hapus**:
   - Transaksi yang dibatalkan diberi status `void` dengan alasan wajib (minimal 3 karakter), saldo dibalik secara otomatis, stok fisik dikembalikan, dan baris transaksi tetap disimpan untuk audit. Hapus transaksi dilarang.

---

## 🛠️ Stack Teknologi & Dependency

- **Framework UI**: Vue 3 (Composition API `<script setup>`)
- **Bahasa**: TypeScript (Strict Mode)
- **Build Tool**: Vite
- **Mobile Container**: Capacitor 7 (Android)
- **Database Lokal**: Dexie (IndexedDB)
- **State Management**: Pinia
- **Ikon**: Lucide Icons (`lucide-vue-next`, tree-shaken)
- **Tipografi**: Plus Jakarta Sans (Google Fonts)
- **Testing**: Vitest + fake-indexeddb

---

## 🚀 Panduan Pengembangan & Build

### 1. Menjalankan di Mode Pengembangan (Web)
```bash
npm install
npm run dev
```

### 2. Memeriksa Integritas Kode & Menjalankan Pengujian
```bash
# Validasi tipe TypeScript
npm run typecheck

# Linter ESLint
npm run lint

# Jalankan 59+ unit test Vitest
npm test
```

### 3. Build Web Production
```bash
npm run build
npm run preview
```

### 4. Build APK Android via Capacitor
```bash
# Sinkronkan hasil build dist ke folder native android
npm run build
npx cap sync

# Buka Android Studio untuk build APK Release / Debug
npx cap open android
```

---

## 🔄 Pembaruan OTA (Pola Setel & GitHub Actions)

Pembaruan aplikasi dilakukan melalui mekanisme **Over-The-Air (OTA) APK via GitHub Releases**:

1. **Workflow Otomatis**: `.github/workflows/auto_release.yml`
   - Dipicu setiap kali ada push ke branch `main`.
   - Menjalankan `typecheck`, `lint`, `npm test`, dan `build`.
   - Mengambil informasi versi dari `version.json` dan membuat GitHub Release otomatis.
2. **Aturan Keystore (Pelajaran Setel & BELANJAKU)**:
   - Keystore rilis **wajib** dipasang pada GitHub Secrets (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) **sebelum instalasi pertama**.
   - Dilarang menyimpan file `.jks` atau password di dalam repository Git.
   - `version_code` di `version.json` wajib naik pada setiap rilis agar Android mengizinkan instalasi tumpuk (update).
3. **Pengecekan Pembaruan di Aplikasi**:
   - `UpdateService` memeriksa `version.json` secara berkala atau lewat tombol di menu Pengaturan.
   - Jika tersedia versi baru, aplikasi menampilkan dialog konfirmasi, progress bar download, dan membuka installer APK Android.
   - Jika `force_update: true`, dialog tidak dapat dilewati hingga pengguna memperbarui aplikasi.

---

## 🧪 Struktur Unit Test (`tests/`)

- `tests/formatters.test.ts`: Uji format Rupiah, tanggal WITA, dan integer parsing.
- `tests/authService.test.ts`: Uji setup Owner, verifikasi SHA-256 hash PIN, dan hak akses peran.
- `tests/feeRuleService.test.ts`: 10 kasus uji resolver tarif range, `Math.ceil`, gap, dan overlap.
- `tests/balanceService.test.ts`: 7 kasus mutasi saldo per layanan & formula Debit Rekening Rp 495.000.
- `tests/transactionService.test.ts`: Transaksi atomik, snapshot master produk, void reversing saldo & stok.
- `tests/masterLifecycle.test.ts`: Uji master lokal kosong saat install awal & pencegahan hapus akun aktif.
- `tests/shiftService.test.ts`: Buka shift, tutup shift (hitung fisik & alasan selisih), dan serah terima 2 PIN.
- `tests/stockService.test.ts`: Penjualan `-1`, void `+1`, pencegahan stok negatif, dan opname Owner/Admin.
- `tests/receivableService.test.ts`: Pencatatan piutang pelanggan dan pelunasan penuh (`markPaidFull`).
- `tests/backupService.test.ts`: Ekspor CSV transaksi, JSON database backup, dan restore dengan safety backup.
- `tests/updateService.test.ts`: Deteksi update OTA dari `version.json` dan progress install.
- `tests/catalogService.test.ts`: Sinkronisasi read-only katalog Supabase via SELECT.

---

## 📄 Lisensi
Hak Cipta © 2026 Bengkel Gadget. Seluruh hak cipta dilindungi undang-undang.
