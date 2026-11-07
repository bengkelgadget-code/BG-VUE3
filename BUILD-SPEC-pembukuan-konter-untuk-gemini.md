# BUILD SPEC — "BUKU KONTER" (Aplikasi Pembukuan Transaksi Konter)

**Pasangan dari:** `PRD-pembukuan-konter.md` (baca itu dulu, sampai habis)
**Untuk:** AI coding agent (Gemini di Antigravity) — eksekutor pembangunan
**Auditor:** Muse — verifikasi hasil per fase
**Versi:** 1.6 — 8 November 2026 (perubahan dari v1.5: (a) aturan pembulatan fee persentase DIKUNCI — BULATKAN KE ATAS (Math.ceil) ke Rupiah terdekat, menggantikan Math.round warisan BG-APP dan menghapus AppSettings.feeRoundingStep; (b) TIDAK ADA seed tarif admin — tabel admin_fee_rules kosong saat install pertama, user mengisi sendiri lewat form Master Tarif meniru Pengaturan_Margin BG-APP — lihat §4.1 dan Addendum 8 Nov 2026; (c) TIDAK ADA seed data master — akun, produk, pelanggan, tarif semua KOSONG saat install pertama, user mengisi sendiri lewat form CRUD; pengecualian: identitas produk yang sudah ada di katalog Supabase Server Pulsa tetap disinkronisasi read-only ke product_catalog_cache (Fase 3, SELECT saja) — lihat §4.14, §5, dan Addendum 8 Nov 2026)
**Platform:** Vue 3 + Capacitor. Android dulu (APK via Capacitor, prioritas uji di HP user), web via Vercel dari codebase yang sama.
**Repo:** `https://github.com/bengkelgadget-code/BG-VUE3` (deskripsi "Aplikasi konterku"), branch `main`. **FAKTA PENTING: repo ini BARU dibuat user 8 Nov 2026 dan saat ini KOSONG** — hanya `.git`, belum ada kode, workflow, atau release. Gemini mulai dari repo kosong di Fase 0. **Update OTA = GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov 2026, DIKUNCI)** — workflow `auto_release.yml` BELUM ADA dan harus dibangun dari nol mengikuti pola Setel (lihat §3). Deploy Vercel BUKAN jalur OTA.
**Nama kerja:** BUKU KONTER — contoh folder `buku_konter`, contoh appId Capacitor `com.bengkel.bukukonter` (boleh diganti user)
**Bahasa UI:** Bahasa Indonesia. **Uang:** `int` Rupiah. **Zona waktu:** Asia/Makassar (WITA, UTC+8).

**Referensi yang dipakai saat menulis dokumen ini:**
- Rancangan Pembukuan Transaksi Konter v1.4 (12 halaman, revisi 8 Nov 2026) — prinsip, rumus saldo, shift 7 langkah, tarif admin.
- BG-APP (`https://github.com/bengkelgadget-code/BG-APP`, vanilla JS + Firestore) — **adopsi pola, JANGAN salin kelemahannya** (lihat §0.9 dan Addendum). Pola yang diadopsi: `calculateDynamicMargin`, toggle Potong Dalam vs Admin Di Luar, `updateBalances` dengan multiplier, master produk + stok, mutasi antar akun.
- Pola struktur dokumen ini: BUILD-SPEC BELANJAKU (§0–§10).

---

## §0 — Instruksi Kerja untuk Gemini (baca pertama)

1. Baca `PRD-pembukuan-konter.md` sampai paham, lalu dokumen ini sampai habis. Kalau keduanya bertentangan, **PRD menang untuk "apa"** (fitur & perilaku), **BUILD SPEC ini menang untuk "bagaimana"** (struktur, kontrak, package).
2. Kerjakan **per fase** (§7): Fase 0 → 1 → 2 → 3. Jangan loncat fase. Jangan selipkan fitur Fase 2/3 ke tengah Fase 1.
3. Setiap fase selesai: jalankan `npm run typecheck` (TypeScript strict, harus **0 error**) DAN `npm run lint` (harus 0 error/warning) DAN `npm test` (Vitest, harus hijau). Laporkan ringkasan: file dibuat/diubah + versi package yang dipakai + hasil typecheck/lint/test + hasil uji acceptance criteria fase itu.
4. **Jangan ubah kontrak interface di §4** tanpa konfirmasi user. Itu perjanjian dengan auditor.
5. **Aturan emas (wajib, tidak bisa ditawar — pelanggaran = kerjaan ditolak):**
   - a. Nominal uang SELALU `int` Rupiah, TIDAK PERNAH `double`. Tidak ada sen/desimal. Persentase hanya dipakai untuk *menghitung* fee, hasilnya dibulatkan KE ATAS (`Math.ceil`) ke `int` Rupiah sebelum disimpan (lihat §4.1).
   - b. **App ini pure pencatatan — TIDAK PERNAH memanggil Digiflazz, TIDAK PERNAH menulis ke Supabase produk, TIDAK PERNAH mengubah saldo live apa pun.** Tidak ada API key Digiflazz, tidak ada tombol Sync Digiflazz, tidak ada `INSERT/UPDATE/DELETE` ke tabel produk Supabase. Akses Supabase hanya di Fase 3 — hanya `SELECT` katalog produk ke `product_catalog_cache` (keputusan user 8 Nov 2026, DIKUNCI — lihat §4.14). Saldo di app ini adalah **saldo CATATAN** terpisah (ledger lokal), bukan saldo live Bank / e-wallet / Server Pulsa / aplikasi provider. Deposit server hanya *dicatat*, bukan dilakukan.
   - c. **Modal TIDAK PERNAH diinput kasir — selalu dari Master Produk lokal.** Modal + harga jual diisi sekali oleh Owner/Admin di Master Produk. Saat transaksi, modal dan jual terisi otomatis dari master dan disimpan sebagai snapshot di `transaction_items`. Kasir tidak melihat modal di UI. Perubahan master hanya berlaku ke depan; transaksi lama tidak berubah.
   - d. **Koreksi / rubah saldo manual hanya Owner/Admin + wajib alasan + audit log.** Staff/Kasir tidak melihat menu ini sama sekali (bukan hanya tombolnya dinonaktifkan — menunya tidak dirender). Setiap koreksi tercatat di `audit_logs` dengan akun, saldo sistem, saldo seharusnya, selisih, alasan, petugas, waktu.
   - e. **Void BUKAN hapus — hapus permanen transaksi DILARANG.** Transaksi salah dibatalkan lewat `voidTransaction` (§4.3): status jadi `void`, saldo dikoreksi balik dengan multiplier −1, alasan wajib, jejak tetap ada. Tidak ada `DELETE FROM transactions` di kode aplikasi. Tidak ada hard-delete produk/akun yang masih punya transaksi.
   - f. **Transfer / mutasi internal TIDAK PERNAH dihitung sebagai pemasukan / pengeluaran / laba.** Pindah Dana, Deposit Server (dicatat), Deposit Provider (dicatat), dan isi saldo akun sendiri hanya memindahkan saldo catatan antar akun. Laba hanya dari selisih jual − modal pada transaksi jualan, plus fee admin.
   - g. Jangan ubah kontrak §4 tanpa konfirmasi user.
   - h. Jangan tambah dependency di luar §2 tanpa izin.
   - i. **Stack terkunci Vue 3 + Capacitor** — dilarang membuat proyek Flutter / Dart di proyek ini. Semua kode TypeScript (`.ts`) dan komponen Vue (`.vue`).
   - j. **Debit Rekening terkunci:** feePaidBy `debit_rekening` berarti sumber dana keluar nominal − fee (500 → 495). Dilarang memakai rumus nominal + fee untuk Debit Rekening di service, UI, test, atau contoh mana pun.
   - k. **Hutang-piutang versi simpel adalah MVP (keputusan user 8 Nov 2026, DIKUNCI):** status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang, tombol Lunas penuh. Cicilan / pelunasan sebagian adalah v1.1 — jangan dibangun di MVP, jangan pula menghapus versi simpelnya.
   - l. **TIDAK ADA seed data master (keputusan user 8 Nov 2026, DIKUNCI):** master lokal KOSONG saat install pertama — akun, produk, pelanggan, tarif. Owner/Admin mengisi sendiri lewat form CRUD (§4.1, §4.2, §4.4, §4.13, §7 Fase 1). Contoh di dokumen ini hanya fixture test, BUKAN seed. Satu-satunya pengecualian: identitas produk yang sudah ada di katalog Supabase Server Pulsa disinkronisasi read-only ke `product_catalog_cache` (§4.14, §5) — user tidak mengetik ulang produk itu, tapi modal + harga jualnya tetap diisi manual lewat form Master Produk. Satu-satunya akun petugas yang dibuat di awal adalah akun Owner yang dibuat user sendiri di layar setup pertama (nama + PIN, PIN disimpan sebagai hash) — TIDAK ADA user contoh yang di-seed dan TIDAK ADA PIN default/hardcode (lihat §4.10, §5, §7 Fase 0).
6. Versi package: pakai versi stabil terbaru saat dikerjakan, **catat versi yang dipakai** di laporan fase.
7. Bahasa UI: **Bahasa Indonesia**. Nama class/variabel/komentar/kode: English. Pesan error ke user: Indonesia, spesifik, bukan exception mentah.
8. **Repo aplikasi ini: `https://github.com/bengkelgadget-code/BG-VUE3`, branch `main`** (keputusan user 8 Nov 2026). Repo ini BARU dan saat ini KOSONG (hanya `.git`) — Gemini mulai dari repo kosong di Fase 0 (clone repo ini, lalu init proyek di dalamnya). Opsi monorepo di repo `SERVERPULSA-VUE3` yang lama DIGANTI dan tidak berlaku lagi. Push ke BG-VUE3 hanya atas persetujuan eksplisit user dengan repo + branch jelas. Jangan mengarang repo/branch lain. Contoh di dokumen ini (`buku_konter`, `com.bengkel.bukukonter`) adalah contoh yang boleh diganti user.
9. **Pelajaran dari BG-APP (jangan diulangi — lihat Addendum):** uang sebagai string `"Rp ..."`, deteksi persentase via substring, fallback margin hardcoded 5000/3000, login bypass, hard-delete, tanpa validasi overlap/celah tarif, tanpa shift/void/audit. Semua itu **DILARANG** di proyek ini. Fee resolver wajib punya unit test (§7 Fase 1) dan test wajib hijau sebelum Fase 1 dinyatakan selesai.

---

## §1 — Struktur Folder Lengkap

```
buku-konter/                      # root repo BG-VUE3 — repo ini khusus BUKU KONTER, BUKAN monorepo Server Pulsa
├── package.json
├── vite.config.ts
├── capacitor.config.ts           // appId contoh com.bengkel.bukukonter, webDir: dist
├── index.html
├── src/
│   ├── main.ts                   // entry: init Pinia, router, Dexie, mount App.vue
│   ├── App.vue                   // root + RouterView + tema
│   ├── core/
│   │   ├── constants.ts          // nama app, kode layanan, batas nominal, toleransi selisih shift
│   │   ├── errors.ts             // AppError(pesanUser)
│   │   ├── formatters.ts         // formatRupiah(), formatTanggal(), parseRupiah() — SATU-SATUNYA tempat format uang
│   │   ├── theme.css             // CSS variables §PRD-8.5: warna, radius, tipografi Plus Jakarta Sans
│   ├── db/
│   │   ├── database.ts           // Dexie database + versi skema (mulai versi 1)
│   │   └── tables.ts             // definisi store/tabel §5
│   ├── services/
│   │   ├── feeRuleService.ts     // kontrak §4.1 — resolver tarif admin (warisan BG-APP, diperbaiki)
│   │   ├── productService.ts     // kontrak §4.2 — Master Produk lokal (modal + jual)
│   │   ├── transactionService.ts // kontrak §4.3 — tambah + void (bukan delete)
│   │   ├── accountService.ts     // kontrak §4.4 — saldo = agregasi, tanpa kolom balance
│   │   ├── balanceService.ts     // kontrak §4.5 — delta saldo per jenis transaksi (warisan BG-APP updateBalances)
│   │   ├── shiftService.ts       // kontrak §4.6 — buka / tutup / serah terima
│   │   ├── stockService.ts       // kontrak §4.7 — adjustStock -1/+1
│   │   ├── receivableService.ts  // kontrak §4.11 — hutang versi simpel MVP: daftar piutang + Lunas penuh
│   │   ├── customerService.ts    // kontrak §4.13 — Master Pelanggan (CRUD, Owner/Admin)
│   │   ├── catalogService.ts     // kontrak §4.14 — sinkronisasi read-only katalog Supabase ke product_catalog_cache (Fase 3, SELECT saja)
│   │   ├── reportService.ts      // kontrak §4.8
│   │   ├── backupService.ts      // kontrak §4.9 — CSV + backup lokal zip
│   │   ├── authService.ts        // kontrak §4.10 — PIN hash (Web Crypto) + role
│   │   └── updateService.ts      // kontrak §4.12 — cek version.json + download + install (Fase 3)
│   ├── stores/                   // Pinia stores (§6)
│   │   ├── transactionStore.ts
│   │   ├── accountStore.ts
│   │   ├── masterStore.ts        // produk + akun + tarif admin
│   │   ├── shiftStore.ts
│   │   ├── receivableStore.ts
│   │   └── reportStore.ts
│   ├── router/
│   │   └── index.ts              // Vue Router
│   └── views/                    // halaman .vue (route-level)
│       ├── HomeView.vue          // dashboard saldo catatan + aksi cepat + shift aktif
│       ├── TransactionsView.vue  // daftar + cari + filter
│       ├── TransactionDetailView.vue // detail + void (dengan alasan)
│       ├── AddTransactionView.vue    // form dinamis PRD §6.1: tanggal auto, jenis, detail cascading, sumber dana, nominal + admin di sebelahnya, simpan
│       ├── AccountsView.vue      // daftar akun saldo + mutasi per akun (kosong saat install pertama — user buat lewat AccountFormView)
│       ├── AccountDetailView.vue // mutasi + koreksi saldo (Owner/Admin saja)
│       ├── AccountFormView.vue   // form tambah/ubah akun: nama, tipe, no. rekening, pemilik, saldo awal (diinput manual, tercatat sebagai saldo awal — bukan transaksi, lihat §4.4)
│       ├── MastersView.vue       // tab: Produk / Voucher / Perdana / ACC / Bank & E-Wallet
│       ├── ProductFormView.vue   // master produk: modal + jual (Owner/Admin saja); untuk produk katalog, identitas diambil dari product_catalog_cache, modal + jual tetap diisi manual
│       ├── CustomersView.vue     // daftar Master Pelanggan (CRUD, Owner/Admin saja)
│       ├── CustomerFormView.vue  // form tambah/ubah pelanggan: nama (wajib), telepon, catatan
│       ├── FeeRulesView.vue      // daftar Master Tarif Biaya Admin
│       ├── FeeRuleFormView.vue   // form range: min – max, layanan multi-select, Tetap/Persentase
│       ├── ReceivablesView.vue   // daftar piutang per pelanggan + tombol Lunas penuh (MVP simpel)
│       ├── ShiftsView.vue        // riwayat shift + status
│       ├── ShiftOpenView.vue     // buka shift: hitung kas awal
│       ├── ShiftCloseView.vue    // tutup shift: hitung fisik vs sistem + selisih
│       ├── ShiftHandoverView.vue // serah terima: PIN pengirim + PIN penerima
│       ├── ReportsView.vue
│       ├── SettingsView.vue      // pengguna & peran, PIN, backup/export, tentang + versi
│       └── SetupOwnerView.vue    // layar setup pertama (first-run): nama + PIN Owner, hanya muncul bila tabel `users` kosong — lihat §4.10, §7 Fase 0 (selaras PRD v1.8 §5.6)
│   └── components/
│       ├── MoneyInput.vue        // input nominal + kolom admin di sebelahnya (Cash / Debit Rekening)
│       ├── FeeBadge.vue          // tampilkan tarif yang terpakai + sumbernya (aturan / manual)
│       ├── AccountChips.vue
│       ├── TransactionTile.vue
│       ├── BalanceCard.vue
│       ├── EmptyState.vue
│       └── AppScaffold.vue       // bottom nav + tombol tambah transaksi
├── android/                      // dibuat oleh `npx cap add android` — shell native, BUKAN tempat logika web
└── tests/
    ├── feeRuleService.test.ts    // WAJIB (§7 Fase 1): contoh user + overlap + celah + persentase + pembulatan
    ├── balanceService.test.ts    // WAJIB: delta per jenis transaksi + Debit 500→495 + void multiplier -1 + transfer bukan laba
    ├── transactionService.test.ts// WAJIB: snapshot modal/jual + kasir tidak bisa ubah modal + void bukan delete
    ├── receivableService.test.ts // WAJIB (Fase 1): Hutang wajib nama, daftar piutang, Lunas penuh menutup piutang
    ├── formatters.test.ts        // WAJIB (Rupiah, tanggal WITA)
    ├── shiftService.test.ts      // WAJIB (Fase 2): selisih + handover PIN ganda
    └── stockService.test.ts      // WAJIB (Fase 2): stok tidak pernah negatif
```

**Aturan struktur:** UI (`.vue`) tidak boleh memanggil service/Dexie langsung — selalu lewat Pinia store di `src/stores/`. Service tidak boleh import komponen Vue. `feeRuleService.ts` tidak boleh import komponen/Capacitor — supaya bisa di-unit-test murni dengan Vitest. `formatters.ts` adalah satu-satunya tempat format Rupiah; dilarang `` `Rp ${amount}` `` / `toLocaleString` tersebar di komponen.

**Update OTA (konsekuensi struktur ini):** semua yang ada di `src/` adalah web layer — perubahannya sampai ke HP lewat rilis OTA GitHub (tanpa install manual dari user). Yang ada di `android/`, `capacitor.config.ts` (plugin/izin), dan appId adalah shell native — perubahannya butuh APK baru. Jaga logika tetap di web layer supaya sebanyak mungkin update bisa OTA. **OTA resminya via GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov 2026, DIKUNCI)** — workflow `auto_release.yml` di repo BG-VUE3 (BELUM ADA, dibangun di Fase 2, lihat §3). Deploy Vercel BUKAN jalur OTA.

**Kode layanan (dipakai di seluruh kode, tabel, dan UI — jangan buat sinonim baru):**

| Kode | Layanan |
|---|---|
| `transfer` | Transfer (kirim uang) |
| `tarik_tunai` | Tarik Tunai |
| `topup_ewallet` | Top Up E-Wallet |
| `pulsa` | Pulsa |
| `data` | Paket Data |
| `token_pln` | Token PLN |
| `voucher` | Voucher |
| `perdana` | Perdana |
| `aksesoris` | Aksesoris |
| `ppob` | PPOB / tagihan lain |
| `deposit_server` | Deposit Server Pulsa (dicatat) |
| `deposit_provider` | Deposit Aplikasi Provider (dicatat) |
| `pindah_dana` | Pindah Dana antar akun |
| `pembelian_stok` | Pembelian Stok |
| `operasional` | Pengeluaran Operasional |
| `pemasukan_lain` | Pemasukan Lain |

**Kode jenis akun saldo (`accounts.type`):** `kas` | `bank` | `ewallet` | `server_pulsa` | `provider_app`. Akun `server_pulsa` dan `provider_app` selalu berlabel **(catatan)** di UI — saldonya saldo catatan, bukan saldo live.

## §2 — package.json (dependency awal)

```json
{
  "name": "buku-konter",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc -b --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "cap:sync": "npm run build && npx cap sync"
  },
  "dependencies": {
    "vue": "<versi stabil terbaru>",
    "vue-router": "<versi stabil terbaru>",
    "pinia": "<versi stabil terbaru>",
    "dexie": "<versi stabil terbaru>",
    "@capacitor/core": "<versi stabil terbaru>",
    "@capacitor/app": "<versi stabil terbaru>",
    "@capacitor/preferences": "<versi stabil terbaru>",
    "@capacitor/filesystem": "<versi stabil terbaru>",
    "@capacitor/camera": "<versi stabil terbaru>",
    "@capacitor/share": "<versi stabil terbaru>",
    "lucide-vue-next": "<versi stabil terbaru>",
    "chart.js": "<versi stabil terbaru>",
    "uuid": "<versi stabil terbaru>"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "<versi stabil terbaru>",
    "@capacitor/cli": "<versi stabil terbaru>",
    "typescript": "<versi stabil terbaru>",
    "vue-tsc": "<versi stabil terbaru>",
    "vite": "<versi stabil terbaru>",
    "vitest": "<versi stabil terbaru>",
    "eslint": "<versi stabil terbaru>",
    "@vue/test-utils": "<versi stabil terbaru>",
    "jsdom": "<versi stabil terbaru>"
  }
}
```

**Keputusan database lokal (dipilih SATU, konsisten di seluruh proyek): Dexie (IndexedDB).** Alasan: Dexie jalan di web (Vercel) maupun di dalam APK Capacitor tanpa plugin native tambahan, skema + migrasi versi jelas (`db.version(1).stores({...})`), transaksi antar tabel didukung, dan tidak butuh build native untuk ganti skema. Alternatif yang dipertimbangkan dan DITOLAK untuk MVP: `@capacitor-community/sqlite` — lebih berat (plugin native, perlu `cap sync` + build Android tiap ganti skema, dan tidak jalan di web murni tanpa shim). Bila nanti terbukti Dexie tidak cukup (mis. butuh query agregasi SQL kompleks yang lambat), perubahan database adalah keputusan user, bukan keputusan Gemini diam-diam.

Font Plus Jakarta Sans dimuat lewat Google Fonts di `index.html` (bukan package font). Format tanggal Indonesia memakai `Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar' })` — JANGAN pakai library tanggal hanya untuk format Rupiah (format Rupiah memakai `utils/format.ts` sendiri).

**Yang TIDAK boleh ada di MVP (Fase 0–2):** `firebase` / `@angular/fire` / Firestore, `@supabase/supabase-js` sebagai backend tulis, `google_sign_in` / auth cloud, iklan AdMob, analytics pihak ketiga, package OCR cloud, package HTTP client untuk Digiflazz. Kalau Gemini merasa perlu satu saja dari daftar ini, berhenti dan tanya user dulu.

**Dependensi UI DILARANG (keputusan user 8 Nov 2026, DIKUNCI — UI/UX cantik, rapi, profesional, TIDAK BERAT):** dilarang menambah library animasi apa pun (`framer-motion`, `gsap`, `@vueuse/motion`, dan sejenisnya — animasi hanya transisi CSS, lihat §8.1), framework UI berat apa pun (`vuetify`, `quasar`, `primevue`, dan sejenisnya — komponen UI ditulis sendiri di `src/components/`), dan font kedua apa pun (hanya Plus Jakarta Sans). Untuk tampilan/UI, yang dipakai hanya: Vue 3 + Vue Router + Pinia + Dexie + `lucide-vue-next` (import ikon per nama agar tree-shaken, jangan `import *`) + Plus Jakarta Sans + CSS variables sendiri. Dependensi baru apa pun di luar daftar §2 ini — UI atau bukan — harus disetujui user dulu (lihat §0 aturan h); Gemini dilarang menambah dependency diam-diam dengan alasan "mempercantik UI".

**Pengecualian Fase 3 (keputusan user 8 Nov 2026, DIKUNCI — BUKAN opsional lagi):** `@supabase/supabase-js` HANYA sebagai klien baca katalog produk (`SELECT` saja, kredensial lewat env / Preferences, bukan hardcode di repo, bukan di `core/constants.ts`) untuk mengisi `product_catalog_cache` (§4.14, §5). Tidak ada tulis ke Supabase di fase mana pun. Tanpa katalog ini pun aplikasi tetap jalan — produk non-katalog (voucher/perdana/aksesoris) selalu diinput manual lewat form Master Produk.

## §3 — Konfigurasi Capacitor + Android + OTA (GitHub Actions + Releases APK)

`capacitor.config.ts` (satu-satunya tempat konfigurasi Capacitor — jangan duplikasi di `vite.config.ts`):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bengkel.bukukonter', // contoh, boleh diganti user
  appName: 'Buku Konter',
  webDir: 'dist',
  // OTA = GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov
  // 2026, DIKUNCI; workflow auto_release.yml di repo BG-VUE3, lihat §3 di
  // bawah). APK memuat build 'dist' yang dibundel — update datang lewat
  // rilis GitHub, bukan live-URL. server.url TIDAK dipakai (mode live-URL
  // ditolak sebagai jalur OTA).
  backgroundColor: '#F6F7F9',
};
export default config;
```

Perintah Android (Fase 0, sekali saja, lalu ulang hanya bila ada perubahan native):

```bash
npm run build
npx cap add android        # sekali saja — jangan hapus folder android/ setelah ini
npx cap sync               # salin dist + plugin ke proyek Android
npx cap open android       # buka Android Studio -> Run / Build APK
```

Izin Android (diatur lewat plugin Capacitor + `android/app/src/main/AndroidManifest.xml` hasil generate — jangan edit hasil generate kecuali untuk izin):
- Kamera (`@capacitor/camera`) — hanya untuk bukti foto.
- Notifikasi — hanya bila dipakai (pengingat shift / stok menipis).
- Biometrik — hanya bila dipakai (buka kunci PIN).
- Android 13+: akses foto via photo picker, JANGAN minta akses storage luas.

**Aturan izin (penting untuk lolos audit):**
- Minta izin tepat saat dibutuhkan: Kamera saat tekan "Tambah bukti foto", Notifikasi saat shift hampir berakhir / stok menipis — BUKAN semuanya saat pertama buka aplikasi.
- Setiap permintaan izin disertai satu kalimat alasan di UI ("Kamera dipakai untuk memotret bukti transfer, foto tidak dikirim ke mana-mana").
- Foto bukti disimpan di direktori aplikasi via `@capacitor/filesystem` (`Directory.Data/bukti/`), BUKAN galeri publik. Sediakan tombol "Simpan ke galeri" di detail transaksi kalau user mau.
- Kompres foto sebelum simpan: sisi panjang maks 1600px, JPEG kualitas 85.
- Tidak ada izin lokasi, kontak, SMS, atau telepon di MVP.

**OTA — update tanpa install ulang (keputusan user 8 Nov 2026, DIKUNCI: GitHub Actions + Releases APK pola Setel — satu-satunya jalur OTA):**
- **Repo + status saat ini:** repo `https://github.com/bengkelgadget-code/BG-VUE3` BARU dibuat user 8 Nov 2026 dan saat ini KOSONG (hanya `.git`) — belum ada kode, workflow, atau release. Workflow OTA BELUM ADA dan harus dibangun dari nol di proyek ini (dibangun di Fase 2, lihat §7). JANGAN mengklaim workflow sudah ada.
- **Workflow OTA yang harus dibangun — pola Setel** (`.github/workflows/auto_release.yml`): push ke `main` yang menaikkan versi di `package.json` → workflow build APK release (`npm run build` → `npx cap sync` → build Android release) → buat GitHub Release berisi APK → tulis ulang `version.json` (di branch yang sama / branch rilis yang disepakati) berisi `version_code`, `version_name`, `download_url` (URL APK di Release), `changelog`, `force_update`. `UpdateService` di aplikasi (§4.12, dibangun di Fase 2) mengecek `version.json` di `raw.githubusercontent` saat aplikasi dibuka, membandingkan `version_code` dengan versi terpasang, menampilkan dialog update + progress download, lalu install via installer Android. Jangan hardcode URL `version.json` / `download_url` sebelum user menyetujui cabang + nama file-nya.
- **Pelajaran wajib dari Setel / BELANJAKU (jangan diulangi):** keystore rilis HARUS sudah dipasang di GitHub Secrets SEBELUM install pertama di HP mana pun. Jangan pernah commit file `.jks` / password keystore ke repo — workflow men-decode keystore dari Secrets saat build. Kalau tidak, signature APK berubah tiap build dan Android menolak update-timpa (kejadian BELANJAKU: Build 14 tidak bisa menimpa Build 9 karena kunci signing berbeda — user harus uninstall dulu dan data hilang). `version_code` WAJIB naik tiap rilis (naikkan `version` di `package.json` + `versionCode` Android). Workflow WAJIB memvalidasi ini sebelum build (gagalkan build bila `version_code` tidak naik).
- **Deploy Vercel BUKAN jalur OTA.** Versi web tetap bisa di-deploy ke Vercel (`npm run build` → deploy) untuk dibuka di browser — tapi itu hosting web, bukan mekanisme update aplikasi terpasang. Aplikasi yang terpasang di HP (APK) HANYA update lewat GitHub OTA di atas. Jangan tulis Vercel sebagai alternatif OTA.
- **APK memuat `dist` yang dibundel** (`webDir: dist`, tanpa `server.url`). Mode live-URL (`server.url` memuat URL Vercel) TIDAK dipakai — update APK hanya lewat rilis OTA GitHub. Setelah `npm run build`, jalankan `npm run cap:sync` (build + `npx cap sync`) sebelum build APK.
- Perubahan yang **wajib** build APK ulang: tambah/ubah plugin Capacitor, ubah `capacitor.config.ts` (appId/nama), ubah izin AndroidManifest, ubah target SDK. Perubahan selain itu = rilis OTA GitHub.
- Jangan hardcode URL Vercel produksi di `capacitor.config.ts` sebelum user memberi URL deploy-nya.

---

## §4 — Kontrak Interface TypeScript (JANGAN diubah tanpa konfirmasi user)

### §4.1 FeeRuleService / MarginRuleService — resolver tarif admin (warisan BG-APP, diperbaiki)

Pola warisan: BG-APP `calculateDynamicMargin(layanan, nominal)` di `app_logic.js:211-284` — range `nominal >= min && < max` → margin tetap; persentase `nominal >= min` → `round(nominal * pct / 100)`; sort `min` desc, first-match; tidak cocok → `null`. Field master: `tipe`, `layanan` multi-select, `min_nom`, `max_nom`, `persentase_val`, `val_margin`.

Yang **diperbaiki** di sini (wajib, bukan opsional): `min_nom`/`max_nom`/`val_margin`/`persentase_val` adalah `int`, bukan string `"Rp ..."`. Persentase dideteksi dari kolom `feeType == 'persentase'`, **bukan** dari substring teks. Tidak ada fallback margin hardcoded 5000/3000 — tidak cocok → `null`, lalu UI menampilkan "Tidak ada tarif — isi manual atau Rp0" dan wajib konfirmasi. Overlap dan celah divalidasi saat simpan (§4.1 `validateNoOverlap` + `findGaps`), bukan dibiarkan. Pembulatan fee persentase DIGANTI dari `round` BG-APP menjadi `Math.ceil` (bulatkan ke atas ke Rupiah terdekat) — keputusan user 8 Nov 2026, DIKUNCI; pengaturan `feeRoundingStep` (kelipatan 100/500/1000) DIHAPUS dan tidak ada lagi di §5.

```ts
export type FeeType = 'tetap' | 'persentase';

export interface FeeResolution {
  rule: AdminFeeRule; // aturan yang terpakai
  fee: number; // int Rupiah, sudah dibulatkan
  isPercentage: boolean; // true bila dari FeeType 'persentase'
}

export interface FeeGap {
  fromNom: number; // inklusif
  toNom: number | null; // eksklusif, null = sampai tak hingga
}

export interface FeeRuleService {
  /**
   * Cari tarif untuk (layanan, nominal). Aturan:
   * - hanya aturan aktif (isActive === true) untuk layanan itu;
   * - cocok bila nominal >= minNom && (maxNom === null || nominal < maxNom);
   * - sort minNom DESC, ambil first-match; tidak cocok -> null (BUKAN fallback hardcoded).
   * - Tetap: fee = valMargin (TIDAK dibulatkan — sudah int Rupiah).
   *   Persentase: fee = Math.ceil(nominal * persentaseVal / 100) — BULATKAN KE ATAS
   *   ke Rupiah terdekat (keputusan user 8 Nov 2026, DIKUNCI; MENGGANTIKAN Math.round
   *   warisan BG-APP calculateDynamicMargin). Contoh: 5.123.456 x 0,4% = 20.493,824 -> 20.494.
   * - JANGAN PERNAH kembalikan double. JANGAN PERNAH parse string "Rp ...".
   */
  resolveFee(params: { layanan: string; nominal: number }): Promise<FeeResolution | null>;

  /**
   * Simpan aturan baru. WAJIB tolak bila overlap dengan aturan aktif lain
   * untuk layanan yang sama (interval [minNom, maxNom) bersinggungan).
   * Lempar AppError berisi aturan yang bertabrakan + rentangnya.
   */
  addRule(rule: NewAdminFeeRule): Promise<string>;

  updateRule(id: string, rule: Partial<NewAdminFeeRule>): Promise<void>; // validasi overlap yang sama
  deactivateRule(id: string): Promise<void>; // nonaktifkan, BUKAN hard-delete
  listRules(params?: { layanan?: string; activeOnly?: boolean }): Promise<AdminFeeRule[]>;

  /**
   * Validasi murni (tanpa simpan): kembalikan daftar aturan yang overlap.
   * Dipakai form + test. Kosong = aman disimpan.
   */
  validateNoOverlap(candidate: NewAdminFeeRule, opts?: { excludeId?: string }): Promise<AdminFeeRule[]>;

  /**
   * Cari celah nominal yang tidak tercakup aturan aktif untuk satu layanan,
   * dalam [0, maxNominalToCheck]. Dipakai untuk peringatan di UI master tarif
   * ("Nominal Rp100.000–Rp5.000.000 belum ada tarifnya"), BUKAN untuk memblokir simpan.
   */
  findGaps(params: { layanan: string; maxNominalToCheck?: number }): Promise<FeeGap[]>;
}
```

**Form Master Tarif — meniru Pengaturan_Margin BG-APP (keputusan user 8 Nov 2026, DIKUNCI):** layar `FeeRulesView.vue` + `FeeRuleFormView.vue` meniru form `Pengaturan_Margin` di BG-APP (`config.js` + `toggleMarginFields` di `ui_components.js:1336-1370`), dengan perbaikan di bawah. Field form: (1) **Tipe Perhitungan** — `Range Nominal` / `Persentase` (field tampil/sembunyi mengikuti tipe, seperti `toggleMarginFields` BG-APP: pilih Range Nominal → tampil Nominal Awal/Akhir + nilai Tetap; pilih Persentase → tampil Nominal Awal + nilai Persentase); (2) **Layanan Terkait** — multi-select (TRANSFER, TARIK TUNAI, TOP UP E-WALLET, dan layanan lain); (3) **Nominal Awal** (>=, inklusif); (4) **Nominal Akhir** (<, eksklusif, kosong = tanpa batas atas); (5) **nilai biaya** — Tetap (Rp, int) atau Persentase (%). CRUD: tambah / ubah / nonaktifkan (`deactivateRule` — BUKAN hard-delete) lewat `FeeRuleService` + `useMasterStore`; **hanya Owner/Admin** (enforce di service, bukan hanya sembunyikan tombol — Kasir memanggil langsung → ditolak `AppError`). Validasi overlap saat simpan (tolak) + peringatan celah (tampilkan, jangan blokir) TETAP seperti di atas. Tabel `admin_fee_rules` kosong saat install pertama — semua aturan lahir dari form ini, bukan dari seed.

**Kasus uji wajib (§7 Fase 1, harus ada di `fee_rule_service.test.ts`):**
1. `tarik_tunai`, nominal 20.000 → Rp3.000 (aturan contoh user: 20.000 ≤ nominal < 100.000, tetap).
2. `tarik_tunai`, nominal 99.999 → Rp3.000; nominal 100.000 → **bukan** Rp3.000 (batas atas eksklusif).
3. `transfer`, nominal 5.000.000 → Rp20.000 (0,4% × 5.000.000); nominal 10.000.000 → Rp40.000.
4. Persentase dengan pembulatan KE ATAS (`Math.ceil`, keputusan user 8 Nov 2026, DIKUNCI): (a) nominal 5.123.456 × 0,4% = 20.493,824 → **20.494** (bukan 20.493); (b) nominal 5.000.100 × 0,4% = 20.000,4 → **20.001** — kasus ini yang membedakan ceil dari `round` (round akan memberi 20.000); (c) hasil yang sudah bulat tidak berubah: 5.000.000 × 0,4% = 20.000 persis → tetap 20.000 (lihat juga kasus 3). Biaya TETAP tidak dibulatkan. JANGAN pakai `Math.round` (warisan BG-APP) — grep `Math.round` di `feeRuleService` harus NOL.
5. Layanan tidak tercakup aturan → `null`, bukan 5000/3000.
6. Overlap: aturan 20.000–100.000 sudah ada, tambah 50.000–150.000 untuk layanan yang sama → ditolak `AppError`.
7. Aturan beda layanan boleh overlap (mis. `transfer` 20.000–100.000 dan `tarik_tunai` 20.000–100.000 tidak saling bertabrakan).
8. `maxNom == null` = tanpa batas atas (aturan >= 5.000.000).
9. Alur form end-to-end (Master Tarif meniru Pengaturan_Margin BG-APP): buat aturan lewat form (Tipe Perhitungan Range Nominal, layanan `transfer`, 20.000–<100.000, tetap Rp3.000) → transaksi transfer Rp50.000 fee terisi otomatis Rp3.000 → nonaktifkan/hapus aturan lewat form → transaksi transfer berikutnya fee Rp0 + banner "belum ada tarif" (bukan fallback 5000/3000).

### §4.2 ProductService / MasterService — Master Produk lokal

```ts
export interface ProductService {
  /**
   * Tambah produk master. Modal + jual WAJIB diisi (int Rupiah, >= 0).
   * Hanya Owner/Admin (enforce di service, bukan hanya sembunyikan tombol).
   * `externalProductRef` = id/SKU katalog Supabase (boleh null untuk
   * voucher/perdana/ACC yang tidak ada di katalog). Identitas katalog
   * (nama/operator/denominasi) boleh disalin dari katalog read-only,
   * tapi modal/jual SELALU dari master lokal ini.
   */
  addProduct(product: NewProduct, opts: { actorUserId: string }): Promise<string>;

  /**
   * Buat produk master dari satu entri product_catalog_cache (Fase 3).
   * Identitas (nama/operator/denominasi/kategori) disalin dari cache,
   * `externalProductRef` diisi id katalog; modal + jual WAJIB diisi manual
   * oleh Owner/Admin di form yang sama — TIDAK PERNAH diambil dari Supabase.
   * Produk katalog yang belum diberi modal/jual TIDAK BISA dipakai di
   * transaksi (form transaksi menyembunyikan / menonaktifkannya).
   */
  createProductFromCatalog(catalogId: string, params: { modal: number; hargaJual: number; stockMin?: number }, opts: { actorUserId: string }): Promise<string>;

  /** Daftar entri katalog (read-only) untuk dipilih di form Master Produk. */
  listCatalogProducts(params?: { category?: string; query?: string }): Promise<ProductCatalogEntry[]>;

  /**
   * Ubah master. Perubahan hanya berlaku ke depan: transaksi yang sudah
   * tersimpan TIDAK berubah (snapshot di transaction_items, §4.3).
   * Setiap perubahan modal/jual dicatat ke audit_logs.
   */
  updateProduct(id: string, product: Partial<NewProduct>, opts: { actorUserId: string }): Promise<void>;

  /**
   * Nonaktifkan produk (isActive = false), BUKAN hard-delete.
   * Produk boleh dinonaktifkan kapan saja; transaksi lama tetap merujuk snapshot-nya.
   */
  deactivateProduct(id: string, opts: { actorUserId: string }): Promise<void>;

  listProducts(params?: { category?: string; activeOnly?: boolean; query?: string }): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;

  /**
   * Ambil modal + jual saat ini dari master — dipakai TransactionService
   * saat membuat transaksi. Kasir TIDAK PERNAH memanggil ini dari UI
   * untuk menampilkan modal; UI kasir hanya menampilkan harga jual.
   */
  getModalAndPrice(productId: string): Promise<{ modal: number; hargaJual: number }>;
}
```

**Kategori produk (`products.category`):** `pulsa` | `data` | `token_pln` | `voucher` | `perdana` | `aksesoris` | `lainnya`.
**Stok:** hanya `voucher`, `perdana`, `aksesoris` yang memakai stok. `pulsa`/`data`/`token_pln` stok selalu `null` (digital, tidak ada stok fisik). Stok awal 0, stok tidak boleh negatif (§4.7).

### §4.3 TransactionService — tambah + void (bukan delete)

```ts
export interface TransactionInput {
  layanan: string; // kode layanan §1
  productId?: string; // wajib untuk pulsa/data/token/voucher/perdana/aksesoris
  accountId?: string; // akun bank/ewallet tujuan atau sumber, sesuai jenis
  sourceAccountId?: string; // sumber dana (transfer/tarik tunai/topup/deposit/pindah dana)
  destAccountId?: string; // akun penerima (pindah dana / deposit)
  nominal: number; // > 0, int Rupiah
  fee: number; // int Rupiah, >= 0 (dari resolver atau manual, lihat bawah)
  feePaidBy: 'cash' | 'debit_rekening'; // pilihan DI SEBELAH nominal di UI
  feeRuleId?: string; // aturan yang terpakai, null bila manual / tidak ada tarif
  feeManualOverride: boolean; // true bila petugas mengubah fee hasil resolver (tercatat)
  paymentMethod: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  date: number; // epoch ms (WITA saat simpan); backdate hanya Owner/Admin + alasan
  note?: string;
  referenceNo?: string; // no. referensi / bukti transfer
  photoPath?: string; // bukti foto lokal, nullable
  customerId?: string; // nullable; WAJIB terisi bila paymentStatus hutang (MVP simpel, §4.11); paymentStatus: 'lunas' | 'hutang' ada di input ini
}

export interface TransactionService {
  /**
   * Simpan transaksi + items + delta saldo + pergerakan stok DALAM SATU
   * transaksi database (Dexie .transaction). Gagal di satu langkah = semua batal.
   * - Untuk pulsa/data/token/voucher/perdana/aksesoris: modal + jual diambil
   *   dari ProductService.getModalAndPrice, disimpan sebagai snapshot di
   *   transaction_items (modalSnapshot, hargaJualSnapshot). Kasir tidak
   *   menginput modal; field modal TIDAK ADA di TransactionInput.
   * - Fee: bila feeManualOverride === false, fee WAJIB sama dengan hasil
   *   FeeRuleService.resolveFee (bila ada aturan); bila tidak ada aturan,
   *   fee harus 0 atau diisi manual dengan feeManualOverride === true.
   * - Validasi saldo cukup (untuk transaksi yang mengurangi akun) SEBELUM simpan;
   *   saldo tidak boleh negatif kecuali koreksi Owner/Admin (§4.4).
   * - Kembalikan id transaksi. Transaksi terikat shift aktif pembuatnya.
   */
  addTransaction(input: TransactionInput, opts: { actorUserId: string; shiftId: string }): Promise<string>;

  /**
   * Batalkan transaksi (void), BUKAN hapus. Wajib alasan (min. 3 karakter).
   * - status transaksi -> 'void', voidReason + voidBy + voidAt terisi.
   * - Saldo dikoreksi balik lewat BalanceService.applyDeltas dengan multiplier -1.
   * - Stok dikembalikan lewat StockService (adjustStock +qty yang sama).
   * - Baris transaksi + items TETAP ADA dan tetap tampil di laporan dengan
   *   label VOID. TIDAK ADA DELETE di method ini.
   */
  voidTransaction(transactionId: string, opts: { reason: string; actorUserId: string }): Promise<void>;

  /** TIDAK ADA method deleteTransaction di proyek ini. Bila Gemini menulisnya, hapus method itu sebelum laporan fase. */
  listTransactions(params?: {
    from?: number; to?: number; layanan?: string; accountId?: string;
    shiftId?: string; status?: string; query?: string;
  }): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  getItems(transactionId: string): Promise<TransactionItem[]>;
}
```

**Aturan fee di UI (wajib):** kolom Biaya Admin terletak **di sebelah kolom Nominal** dalam satu baris: `[Nominal] [Biaya Admin] [Bayar Admin: Cash | Debit Rekening]`. Saat nominal atau layanan berubah, fee terisi otomatis dari resolver; petugas boleh mengubahnya, tapi perubahan itu menandai `feeManualOverride = true` dan tercatat. Istilah yang dipakai di seluruh UI/kode: **"Debit Rekening"** (bukan "Potong Rekening").

**Pemetaan fee ke saldo — KEPUTUSAN TERKUNCI (user, 8 Nov 2026): Debit Rekening = potong dari nominal.**
Untuk layanan jasa (transfer / tarik tunai / top up e-wallet / PPOB), nominal = N, fee = F:
- `feePaidBy == 'cash'` → hBeli = N, hJual = N + F (admin dibayar tunai di atas nominal).
- `feePaidBy == 'debit_rekening'` → **hBeli = N − F, hJual = N** (admin dipotong dari nominal). Laba = hJual − hBeli = F di kedua mode.
- Contoh yang benar (transfer Rp500.000, admin Rp5.000, Debit Rekening): hBeli = Rp495.000, hJual = Rp500.000, profit Rp5.000, akun sumber dana (bank) berkurang Rp495.000. Varian lama dari rancangan v1.3 (bank −Rp505.000, admin ditambah di atas nominal dan dibebankan ke sumber dana) **DITOLAK** — jangan dipakai di rumus, contoh, maupun test mana pun. Detail delta per layanan ada di §4.5.

### §4.4 AccountService — saldo = agregasi, tanpa kolom balance

```ts
export interface AccountService {
  /**
   * Tambah akun. Saldo awal (`initialBalance`, int Rupiah, default 0)
   * diinput MANUAL oleh Owner/Admin saat membuat akun lewat
   * AccountFormView — tercatat sebagai saldo awal, BUKAN transaksi:
   * disimpan di kolom `accounts.initialBalance` (bukan baris ledger,
   * bukan transaksi, tidak masuk laba/laporan). Saldo akun =
   * initialBalance + SUM(delta ledger). Setelah akun dibuat, saldo hanya
   * berubah lewat transaksi/void/koreksi manual (`adjustBalanceManual`) —
   * `initialBalance` tidak boleh diubah lewat `updateAccount`.
   */
  addAccount(params: { name: string; type: string; initialBalance?: number; accountNo?: string; ownerName?: string; icon?: string; color?: string }): Promise<string>;
  updateAccount(id: string, patch: Partial<{ name: string; accountNo: string; ownerName: string; icon: string; color: string; isActive: boolean }>): Promise<void>;
  /**
   * Tolak hapus bila masih punya transaksi/mutasi — lempar AppError
   * berisi jumlah transaksi. Tidak ada hapus diam-diam.
   */
  deleteAccount(id: string): Promise<void>;

  getAccounts(params?: { activeOnly?: boolean }): Promise<Account[]>;

  /**
   * Saldo = initialBalance + SUM(delta) dari account_ledger untuk akun itu
   * (hanya transaksi status != 'void'). Hitung via agregasi Dexie.
   * JANGAN simpan kolom balance di tabel accounts. JANGAN cache saldo di memory
   * tanpa invalidasi setelah tiap transaksi/void/koreksi.
   */
  getBalance(accountId: string): Promise<number>;
  getAllBalances(): Promise<Record<string, number>>;

  /**
   * Koreksi / rubah saldo manual. HANYA Owner/Admin — enforce di sini
   * (cek role dari Users), bukan hanya di UI. Staff memanggil ini -> AppError.
   * Wajib alasan (min. 3 karakter). Menulis satu baris ledger bertipe
   * 'koreksi_manual' + satu baris audit_logs. Saldo seharusnya = saldo sistem
   * + delta yang diinput; delta boleh positif atau negatif.
   */
  adjustBalanceManual(params: {
    accountId: string;
    delta: number; // int Rupiah, boleh negatif, != 0
    reason: string;
    actorUserId: string;
  }): Promise<void>;

  getLedger(accountId: string, params?: { from?: number; to?: number }): Promise<AccountLedger[]>;
}
```

### §4.5 BalanceService — delta saldo per jenis transaksi (warisan BG-APP updateBalances)

Pola warisan: BG-APP `updateBalances(jenis, sumber, diterimaDi, hargaBeli, hargaJual, multiplier)` di `app_logic.js:75-161`:
- JASA TRANSFER: sumber 0, kasir +profit (profit = jual − beli).
- TARIK TUNAI: sumber +jual, kasir −beli.
- TRANSFER: sumber −beli, kasir +jual.
- Jualan digital: sumber −beli, kasir +jual.
- Multiplier −1 membalik semua delta saat edit/void.

Yang **diperbaiki** di sini: `sumber` dan `diterimaDi` adalah `accountId` (bukan nama string), `hargaBeli`/`hargaJual` adalah `int` (bukan string `"Rp ..."`), dan **semua** delta ditulis ke tabel `account_ledger` (bukan menimpa kolom balance). "Kasir" di bawah berarti **akun Kas** (`accounts.type == 'kas'`), bukan orang kasir. Saldo server pulsa / provider di sini selalu **saldo catatan**.

```ts
export interface BalanceDelta {
  accountId: string;
  delta: number; // int Rupiah, boleh negatif
  kind: 'pokok' | 'fee' | 'laba'; // untuk keterlacakan di ledger, bukan untuk laporan laba
}

export interface BalanceService {
  /**
   * Hitung delta saldo catatan untuk satu transaksi. MURNI (tanpa tulis DB),
   * supaya bisa di-unit-test. `multiplier`: 1 saat simpan, -1 saat void.
   * `modal` = harga beli dari snapshot master; `hargaJual` = harga jual snapshot
   * (untuk pulsa/data/token/voucher/perdana/aksesoris) atau nominal untuk
   * layanan jasa. `fee` dan `feePaidBy` mengikuti §4.3.
   *
   * KEPUTUSAN TERKUNCI (user, 8 Nov 2026): Debit Rekening = potong dari nominal.
   * Untuk layanan jasa (transfer / tarik tunai / topup_ewallet / ppob), nominal = N, fee = F:
   * - cash: hBeli = N, hJual = N + F.
   * - debit_rekening: hBeli = N - F, hJual = N.
   * Contoh terkunci: transfer Rp500.000, admin Rp5.000, Debit Rekening
   * -> hBeli Rp495.000, hJual Rp500.000, profit Rp5.000, bank sumber -Rp495.000.
   * Varian lama (bank -Rp505.000) DITOLAK dan tidak boleh muncul di kode/test.
   *
   * Aturan per layanan (nominal = N, fee = F, modal = M, jual = J):
   * - transfer: sumber -hBeli, akun pembayaran +hJual.
   *   (cash: sumber -N, Kas +(N+F). debit_rekening: sumber -(N-F), Kas +N.)
   * - tarik_tunai: sumber +N, Kas -(N-F).
   *   (Pelanggan mentransfer N ke rekening konter, lalu menerima tunai.
   *   Admin dipotong dari tunai yang diserahkan bila debit_rekening:
   *   pelanggan menerima N-F tunai. Bila cash, pelanggan menerima N tunai
   *   dan membayar F tunai terpisah — delta ledger-nya sama, -(N-F) bersih.
   *   Laba F tetap tercatat dari fee, bukan dari selisih delta.)
   * - topup_ewallet: sama seperti transfer (sumber -hBeli, akun pembayaran +hJual).
   * - pulsa / data / token_pln: akun Server Pulsa (catatan) -M, akun pembayaran +J
   *   (J diterima dari pelanggan; bila paymentMethod != 'tunai', akun pembayaran
   *   adalah Bank/E-Wallet yang dipilih di form, bukan Kas).
   *   Laba = J - M (dihitung di laporan, BUKAN sebagai delta terpisah).
   * - voucher / perdana / aksesoris: akun pembayaran +J, stok -1 (§4.7).
   *   Modal M hanya dipakai menghitung laba di laporan, TIDAK mengurangi akun
   *   (modal sudah keluar saat pembelian stok — lihat pembelian_stok).
   * - deposit_server (dicatat): sumber -N, Server Pulsa (catatan) +N. BUKAN laba.
   * - deposit_provider (dicatat): sumber -N, Provider App (catatan) +N. BUKAN laba.
   * - pindah_dana: sumber -N, tujuan +N. BUKAN pemasukan/pengeluaran/laba.
   * - pembelian_stok: sumber -N (modal stok), stok +qty (§4.7). BUKAN beban laba langsung.
   * - operasional: sumber -N. - pemasukan_lain: tujuan +N.
   * - ppob: sama seperti transfer (sumber -hBeli, akun pembayaran +hJual).
   */
  computeDeltas(params: {
    layanan: string;
    sourceAccountId?: string;
    destAccountId?: string;
    paymentAccountId: string; // akun Kas atau akun pembayaran pelanggan
    nominal: number;
    modal: number;
    hargaJual: number;
    fee: number;
    feePaidBy: 'cash' | 'debit_rekening';
  }): BalanceDelta[];

  /**
   * Terapkan delta ke account_ledger DALAM transaksi DB yang sama dengan
   * penyimpanan transaksi (dipanggil TransactionService, bukan UI).
   * `multiplier` 1 = simpan, -1 = void. Setiap delta = 1 baris ledger
   * (transactionId, accountId, delta * multiplier, kind, createdAt).
   */
  applyDeltas(params: { transactionId: string; deltas: BalanceDelta[]; multiplier?: number }): Promise<void>;
}
```

### §4.6 ShiftService — buka / tutup / serah terima

```ts
export interface ShiftSummary {
  shiftId: string;
  saldoAwalSistem: Record<string, number>; // per accountId, dari agregasi saat buka
  saldoAkhirSistem: Record<string, number>; // per accountId, dari agregasi saat tutup
  hitungFisik: Record<string, number>; // per accountId, diinput petugas saat tutup
  selisih: Record<string, number>; // hitungFisik - saldoAkhirSistem per akun
  totalTransaksi: number;
  totalLaba: number; // sum(jual - modal) transaksi jualan + fee, status != void
}

export interface ShiftService {
  /**
   * Buka shift. Satu user hanya boleh punya 1 shift aktif. Saldo awal sistem
   * diambil otomatis dari AccountService.getAllBalances() dan disimpan
   * sebagai snapshot di shifts (objek Record<string, number>). Kas awal fisik
   * diinput petugas (hitung uang di laci) — boleh berbeda dari sistem,
   * selisih awal dicatat dan wajib dijelaskan bila != 0.
   */
  openShift(params: { userId: string; kasAwalFisik: number; note?: string }): Promise<string>;

  /**
   * Tutup shift: hitung saldo akhir sistem per akun, bandingkan dengan
   * hitung fisik yang diinput. Selisih != 0 WAJIB ada penjelasan per akun
   * (alasan singkat). Status shift -> 'closed' (belum serah terima) atau
   * 'handed_over' bila langsung diserahterimakan (lihat handoverShift).
   * Menutup shift tanpa hitung fisik DILARANG.
   */
  closeShift(params: { shiftId: string; hitungFisik: Record<string, number>; penjelasanSelisih: Record<string, string>; actorUserId: string }): Promise<ShiftSummary>;

  /**
   * Serah terima ke user berikutnya. WAJIB PIN pengirim DAN PIN penerima
   * (dua pihak, verifyPin dua kali — bukan satu PIN). Penerima menyatakan
   * menerima angka FISIK yang dihitung bersama, bukan angka sistem.
   * Shift baru penerima dibuka dengan saldo awal = angka fisik yang diterima.
   * Bila ada selisih di atas toleransi (AppSettings.shiftTolerance, default
   * Rp5.000 per akun — lihat PRD), status handover = 'pending_owner'
   * dan Owner harus menyetujui sebelum shift baru bisa dibuka.
   */
  handoverShift(params: { shiftId: string; toUserId: string; fromPin: string; toPin: string; note?: string }): Promise<string>;

  getActiveShift(userId: string): Promise<Shift | undefined>;
  listShifts(params?: { from?: number; to?: number; userId?: string }): Promise<Shift[]>;
  getSummary(shiftId: string): Promise<ShiftSummary>;
}
```

### §4.7 StockService

```ts
export interface StockService {
  /**
   * Ubah stok produk. qtyChange -1 saat jual, +1 saat void/pembelian/opname.
   * Stok TIDAK PERNAH negatif: hasil < 0 -> AppError('Stok ... tidak cukup')
   * dan transaksi batal. Setiap perubahan = 1 baris stock_movements
   * (productId, qtyChange, reason, transactionId/shiftId, actorUserId).
   * Warisan BG-APP: adjustStock -1/+1, max(0, ...) — di sini max(0,...)
   * DILARANG diam-diam (menutupi kekurangan stok); tolak dengan exception.
   */
  adjustStock(params: { productId: string; qtyChange: number; reason: string; transactionId?: string; actorUserId: string }): Promise<void>;

  getStock(productId: string): Promise<number>;

  /**
   * Opname stok (Fase 2): bandingkan stok sistem vs hitung fisik per produk,
   * selisih dicatat sebagai stock_movements bertipe 'opname' + audit log.
   * Hanya Owner/Admin.
   */
  stockOpname(params: { hitungFisik: Record<string, number>; actorUserId: string }): Promise<void>;
}
```

### §4.8 ReportService

```ts
export interface CategoryTotal { label: string; total: number; }
export interface PeriodTotal { period: number; totalIn: number; totalOut: number; laba: number; } // period = epoch ms awal hari

export interface ReportService {
  /** Total masuk (jual + fee) dan total keluar (modal + operasional) pada periode, status != 'void'. Transfer/pindah dana/deposit TIDAK masuk keduanya. */
  totalIn(from: number, to: number, opts?: { shiftId?: string }): Promise<number>;
  totalOut(from: number, to: number, opts?: { shiftId?: string }): Promise<number>;
  /** Laba = sum(jual - modal) jualan + sum(fee) — dari transaction_items + fee. */
  totalLaba(from: number, to: number, opts?: { shiftId?: string }): Promise<number>;
  byLayanan(from: number, to: number): Promise<CategoryTotal[]>;
  byProduct(from: number, to: number): Promise<CategoryTotal[]>;
  trend(from: number, to: number): Promise<PeriodTotal[]>; // per hari
  byKasir(from: number, to: number): Promise<CategoryTotal[]>; // per userId
  /** Produk hampir habis: stok <= stokMin dan isActive. Dipakai peringatan di Home. */
  lowStockProducts(): Promise<Product[]>;
  /** Akun saldo catatan menipis: saldo < ambang per akun (AppSettings). */
  lowBalanceAccounts(): Promise<Account[]>;
}
```

### §4.9 BackupService

```ts
export interface BackupService {
  /**
   * Export CSV transaksi: kolom Tanggal,Layanan,Produk,Akun,SumberDana,Nominal,Fee,BayarAdmin,Modal,HargaJual,Laba,Kasir,Shift,Status,Catatan.
   * Tanggal 'YYYY-MM-DD HH:mm' (WITA), nominal angka polos tanpa 'Rp'/titik.
   * Baris void tetap diexport dengan Status=VOID.
   * Kembalikan isi file sebagai string (disimpan lewat Filesystem/Share, §3).
   */
  exportCsv(params?: { from?: number; to?: number }): Promise<string>;
  /** Export CSV master produk + tarif admin (untuk arsip / pindah HP). */
  exportMastersCsv(): Promise<string>;
  /**
   * Backup lokal: 1 file berisi export JSON semua tabel Dexie + folder foto bukti/.
   * Kembalikan path file. (Dexie IndexedDB tidak bisa dicopy sebagai 1 file SQLite —
   * backup memakai export JSON, bukan file .db.)
   */
  createBackup(): Promise<string>;
  /**
   * Restore: validasi dulu (schemaVersion + tabel wajib ada), konfirmasi 2x di UI,
   * lalu timpa. Gagal validasi -> AppError. Backup dibuat otomatis sebelum restore.
   */
  restoreBackup(backupPath: string): Promise<void>;
}
```

### §4.10 AuthService

```ts
export type UserRole = 'owner' | 'admin' | 'kasir';

export interface AuthService {
  hasPin(userId: string): Promise<boolean>;
  /**
   * Simpan HASH saja via @capacitor/preferences. Jangan pernah simpan PIN mentah,
   * di Dexie, di log, atau di file backup.
   */
  setPin(userId: string, pin: string): Promise<void>;
  verifyPin(userId: string, pin: string): Promise<boolean>;
  authenticateBiometric(): Promise<boolean>; // fallback ke PIN bila biometrik gagal/tidak ada
  getCurrentUser(): Promise<User | undefined>;
  /**
   * Setup pertama (first-run, selaras PRD v1.8 §5.6): TRUE bila tabel `users`
   * masih kosong. Dipakai router guard di main.ts — bila TRUE, semua route
   * dialihkan ke SetupOwnerView dan app tidak bisa dipakai sebelum setup selesai.
   */
  hasAnyUser(): Promise<boolean>;
  /**
   * Buat akun Owner pertama dari layar setup (nama + PIN, PIN disimpan
   * sebagai HASH saja, bukan mentah). HANYA boleh dipanggil bila belum ada
   * user sama sekali — bila sudah ada user, lempar AppError. TIDAK ADA
   * PIN default/hardcode (dilarang hardcode PIN apa pun di kode, test, atau dokumen).
   */
  createOwner(name: string, pin: string): Promise<User>;
  login(userId: string, pin: string): Promise<void>; // set sesi shift berjalan
  logout(): Promise<void>;
  /**
   * Peran: owner > admin > kasir. Pengecekan peran dilakukan di SERVICE
   * (ProductService, AccountService.adjustBalanceManual, StockService.opname),
   * bukan hanya menyembunyikan tombol di UI.
   */
  canManageMaster(role: UserRole): boolean; // owner, admin
  canAdjustBalance(role: UserRole): boolean; // owner, admin
  canViewModal(role: UserRole): boolean; // owner, admin — kasir TIDAK
}
```

### §4.11 ReceivableService — hutang versi simpel MVP (keputusan user 8 Nov 2026, DIKUNCI)

```ts
export interface ReceivableSummary {
  customerId: string;
  customerName: string;
  totalHutang: number; // int Rupiah, >= 0
  oldestDate: number; // epoch ms transaksi hutang tertua
}

export interface ReceivableService {
  /** Daftar piutang per pelanggan (hanya transaksi status 'hutang' yang belum lunas). */
  listReceivables(): Promise<ReceivableSummary[]>;
  /**
   * Lunas penuh: pelanggan membayar seluruh sisa hutangnya. Mencatat mutasi
   * ke akun penerima (kas/bank/ewallet, dipilih di UI) + audit log.
   * Cicilan / pelunasan sebagian DILARANG di MVP (v1.1).
   */
  markPaidFull(customerId: string, paidToAccountId: string, date: number): Promise<void>;
}
```

### §4.12 UpdateService — cek update OTA via GitHub (Fase 2)

```ts
export interface VersionInfo {
  versionCode: number; // int, wajib naik tiap rilis
  versionName: string;
  downloadUrl: string; // URL APK di GitHub Release
  changelog: string;
  forceUpdate: boolean;
}

export interface UpdateService {
  /** Ambil version.json dari raw.githubusercontent; bandingkan version_code dengan versi terpasang. Null = sudah versi terbaru. */
  checkForUpdate(): Promise<VersionInfo | null>;
  /** Download APK ke cache (progress callback) lalu buka installer Android. */
  downloadAndInstall(version: VersionInfo, onProgress: (pct: number) => void): Promise<void>;
  /** Versi terpasang saat ini (dari package.json / plugin App Capacitor). */
  getInstalledVersionCode(): Promise<number>;
}
```

**Aturan UpdateService:** dibangun di Fase 2. URL `version.json` diambil dari konfigurasi — jangan hardcode sebelum user menyetujui cabang + nama file-nya (§3). Pengecekan berjalan saat aplikasi dibuka + tombol "Cek update" di Pengaturan. `forceUpdate: true` → dialog tidak bisa ditutup tanpa update. Installer APK native memakai plugin yang dipilih di Fase 2 dan dicatat di laporan fase (jangan tambah dependency tanpa izin — §0.8).

### §4.13 CustomerService — Master Pelanggan (CRUD, Owner/Admin)

```ts
export interface CustomerService {
  /**
   * Tambah pelanggan. Nama WAJIB (min. 1 karakter, trim). Telepon opsional
   * (dipakai untuk mencari pelanggan di daftar piutang). Hanya Owner/Admin
   * (enforce di service, bukan hanya sembunyikan tombol).
   */
  addCustomer(customer: NewCustomer, opts: { actorUserId: string }): Promise<string>;
  updateCustomer(id: string, patch: Partial<NewCustomer>, opts: { actorUserId: string }): Promise<void>;
  /**
   * Nonaktifkan pelanggan (isActive = false), BUKAN hard-delete.
   * Tolak bila pelanggan masih punya piutang aktif — lempar AppError
   * berisi total piutang. Transaksi/piutang lama tetap merujuk pelanggan ini.
   */
  deactivateCustomer(id: string, opts: { actorUserId: string }): Promise<void>;
  listCustomers(params?: { activeOnly?: boolean; query?: string }): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | undefined>;
}
```

**Aturan CustomerService:** pelanggan dibuat lewat `CustomersView.vue` + `CustomerFormView.vue` (§7 Fase 1). Pelanggan juga boleh dibuat cepat dari form transaksi saat memilih status Hutang (nama diketik di form transaksi → pelanggan baru dibuat otomatis dengan nama itu, telepon kosong — tetap lewat `addCustomer` yang sama, bukan jalur khusus). Daftar pelanggan KOSONG saat install pertama (keputusan user 8 Nov 2026, DIKUNCI — tidak ada seed pelanggan).

### §4.14 CatalogService — sinkronisasi read-only katalog Supabase (Fase 3)

```ts
export interface CatalogService {
  /**
   * Ambil katalog produk Server Pulsa dari Supabase (SELECT saja) dan
   * simpan ke tabel lokal `product_catalog_cache` (§5). Upsert berdasarkan
   * id katalog: entri baru ditambah, entri yang berubah diperbarui,
   * entri yang tidak ada lagi di Supabase ditandai tidak aktif (bukan
   * dihapus). TIDAK PERNAH menulis ke Supabase, TIDAK PERNAH mengubah
   * tabel `products` — produk master hanya dibuat lewat ProductService
   * (§4.2 `createProductFromCatalog`) dengan modal + jual manual.
   * Hanya Owner/Admin yang boleh memicu sinkronisasi manual.
   */
  syncCatalog(opts: { actorUserId: string }): Promise<{ added: number; updated: number; deactivated: number; syncedAt: number }>;
  /** Waktu sinkronisasi terakhir (0 bila belum pernah disinkronkan). */
  getLastSyncAt(): Promise<number>;
  /** Daftar entri cache (read-only — UI tidak boleh mengedit dari sini). */
  listCatalog(params?: { category?: string; activeOnly?: boolean; query?: string }): Promise<ProductCatalogEntry[]>;
}
```

**Aturan CatalogService (keputusan user 8 Nov 2026, DIKUNCI):** dibangun di Fase 3. Yang disinkronkan HANYA identitas produk (nama/operator/denominasi/kategori + id katalog) — modal + harga jual TIDAK ADA di Supabase dan TIDAK PERNAH disinkronkan; keduanya selalu diisi manual lewat form Master Produk (§4.2). Tanpa koneksi / tanpa kredensial Supabase, aplikasi tetap jalan penuh: produk non-katalog (voucher/perdana/aksesoris) selalu diinput manual, dan produk katalog yang belum disinkronkan dibuat manual lewat `addProduct` biasa dengan `externalProductRef` kosong. Cache TIDAK PERNAH dipakai sebagai pengganti Master Produk — transaksi hanya boleh memakai produk dari tabel `products`, bukan langsung dari cache.

---

## §5 — Model Data (Dexie / IndexedDB)

Database lokal: Dexie (`src/db/database.ts`), schemaVersion awal = 1. Setiap perubahan skema setelah rilis ke user wajib migrasi via `db.version(n).stores({...}).upgrade(...)`, jangan hapus database user diam-diam (`Dexie.delete()` dilarang di kode produksi).

**Aturan data yang sering dilanggar (auditor akan grep):**
- Tidak ada kolom `balance` di `accounts`. Saldo selalu hasil agregasi `account_ledger` (§4.4).
- Tidak ada kolom uang `number` desimal. `persentaseVal` di `admin_fee_rules` adalah `number` persen (bukan Rupiah — mis. 0.4 berarti 0,4%); semua nominal Rupiah adalah `number` integer (validasi `Number.isInteger()` di service).
- Tidak ada `DELETE` permanen untuk transaksi. Status `void` adalah satu-satunya cara membatalkan.
- `externalProductRef` hanya referensi baca ke katalog Supabase; modal/jual lokal tidak pernah ditulis balik ke sana.
- Semua tanggal disimpan sebagai `number` epoch ms (UTC) dan ditampilkan dalam WITA lewat `utils/format.ts`. Jangan simpan tanggal sebagai string tanggal.

```ts
// src/db/database.ts — Dexie database + schema (nama tabel & indeks)
import Dexie, { type Table } from 'dexie';

export class BukuKonterDB extends Dexie {
  accounts!: Table<Account, string>;
  accountLedger!: Table<AccountLedger, string>;
  products!: Table<Product, string>;
  adminFeeRules!: Table<AdminFeeRule, string>;
  transactions!: Table<Transaction, string>;
  transactionItems!: Table<TransactionItem, string>;
  shifts!: Table<Shift, string>;
  shiftHandovers!: Table<ShiftHandover, string>;
  stockMovements!: Table<StockMovement, string>;
  users!: Table<User, string>;
  customers!: Table<Customer, string>;
  productCatalogCache!: Table<ProductCatalogEntry, string>; // cache read-only katalog Supabase (§4.14) — BUKAN master produk
  auditLogs!: Table<AuditLog, string>;
  appSettings!: Table<AppSettings, number>;

  constructor() {
    super('buku_konter');
    this.version(1).stores({
      accounts: 'id, type, isActive',
      accountLedger: 'id, accountId, transactionId, createdAt',
      products: 'id, category, isActive, externalProductRef',
      adminFeeRules: 'id, layanan, groupId, isActive',
      transactions: 'id, layanan, shiftId, userId, accountId, sourceAccountId, status, date',
      transactionItems: 'id, transactionId, productId',
      shifts: 'id, userId, status, openedAt',
      shiftHandovers: 'id, shiftId, fromUserId, toUserId',
      stockMovements: 'id, productId, transactionId, shiftId, createdAt',
      users: 'id, role, isActive',
      customers: 'id, phone',
      productCatalogCache: 'id, category, isActive', // id = id/SKU katalog Supabase (PK)
      auditLogs: 'id, actorUserId, entityType, entityId, createdAt',
      appSettings: 'id',
    });
  }
}
export const db = new BukuKonterDB();
```

```ts
// src/db/types.ts — interface semua tabel (tipe TypeScript, bukan SQL mentah di UI)
export interface Account {
  id: string; // uuid, PK
  name: string; // mis. 'Kas Tunai', 'Bank BCA', 'DANA', 'Server Pulsa (catatan)'
  type: 'kas' | 'bank' | 'ewallet' | 'server_pulsa' | 'provider_app';
  accountNo?: string; // no. rekening / ID ewallet, kosong untuk kas
  ownerName?: string;
  initialBalance: number; // int Rupiah, default 0
  icon: string; // kode Lucide
  color: string; // hex
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface AccountLedger {
  // TIDAK ADA di daftar 11 tabel PRD sebagai tabel terpisah? Ada — ini adalah
  // tabel ke-12 yang WAJIB ada sebagai penopang §4.4/§4.5. Bila PRD menyebut
  // 11 tabel, ledger ini adalah bagian dari implementasi accounts (bukan fitur
  // baru). Jangan hapus tabel ini; tanpa ini saldo tidak bisa diaudit.
  // (Catatan untuk auditor: bila PRD final menetapkan 11 tabel tanpa ledger,
  //  tanyakan user sebelum menghapus — saldo tanpa ledger = tidak bisa dilacak.)
  id: string;
  accountId: string;
  transactionId?: string; // kosong untuk koreksi manual (saldo awal disimpan di kolom accounts.initialBalance, bukan sebagai baris ledger — lihat §4.4)
  kind: 'pokok' | 'fee' | 'laba' | 'koreksi_manual' | 'pindah_dana' | 'deposit';
  delta: number; // int Rupiah, boleh negatif
  note?: string;
  createdAt: number; // epoch ms
}

export interface Product {
  id: string;
  externalProductRef?: string; // id/SKU katalog Supabase, read-only ref
  name: string;
  category: 'pulsa' | 'data' | 'token_pln' | 'voucher' | 'perdana' | 'aksesoris' | 'lainnya';
  operator?: string; // Telkomsel, Indosat, PLN, dll.
  denomination?: string; // '5.000', '10.000', '20.000', dst (teks label, bukan uang)
  modal: number; // int Rupiah — dari Master Produk lokal (Owner/Admin)
  hargaJual: number; // int Rupiah — dari Master Produk lokal
  stock: number | null; // null untuk digital; number untuk voucher/perdana/aksesoris
  stockMin: number; // default 0
  barcode?: string;
  location?: string; // rak / lokasi penyimpanan
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

// Input saat membuat produk baru (dipakai ProductService.addProduct, §4.2).
export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>; // isActive default true, stockMin default 0

// Input saat membuat pelanggan baru (dipakai CustomerService.addCustomer, §4.13).
export type NewCustomer = Omit<Customer, 'id' | 'balanceHutang' | 'createdAt'>; // balanceHutang selalu 0 saat dibuat

/**
 * Cache read-only katalog produk Server Pulsa dari Supabase (§4.14).
 * HANYA identitas produk — tidak ada modal, tidak ada harga jual, tidak
 * ada stok. Diisi HANYA oleh CatalogService.syncCatalog (Fase 3, SELECT
 * saja); user TIDAK PERNAH mengedit tabel ini dari UI. Transaksi TIDAK
 * PERNAH memakai entri cache langsung — produk harus dibuat dulu di tabel
 * `products` lewat ProductService.createProductFromCatalog (§4.2).
 */
export interface ProductCatalogEntry {
  id: string; // id/SKU katalog Supabase (PK)
  name: string; // mis. 'Pulsa Telkomsel 5.000', 'Token PLN 20.000'
  category: 'pulsa' | 'data' | 'token_pln' | 'lainnya';
  operator?: string; // Telkomsel, Indosat, PLN, dll.
  denomination?: string; // '5.000', '10.000', '20.000', dst (teks label, bukan uang)
  isActive: boolean; // false bila entri sudah tidak ada lagi di Supabase
  updatedAt: number; // epoch ms — waktu terakhir disinkronkan
}
```

```ts
export interface AdminFeeRule {
  id: string;
  layanan: string; // kode layanan §1 — SATU baris = SATU layanan (multi-layanan = banyak baris dengan groupId sama)
  groupId: string; // pengelompok aturan multi-layanan di UI (satu form = satu groupId)
  minNom: number; // inklusif, >=, int Rupiah
  maxNom: number | null; // eksklusif, < ; null = Infinity
  feeType: 'tetap' | 'persentase';
  valMargin: number | null; // int Rupiah, bila feeType == 'tetap'
  persentaseVal: number | null; // mis. 0.4 = 0,4%, bila feeType == 'persentase' (bukan Rupiah)
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  // Unik logis: tidak boleh overlap [minNom, maxNom) per layanan aktif — enforce di service + test (§4.1).
}

export interface Transaction {
  id: string;
  layanan: string; // kode layanan §1
  shiftId: string; // shift pembuat transaksi
  userId: string; // kasir/petugas pembuat
  accountId?: string; // akun tujuan/pembayaran
  sourceAccountId?: string; // sumber dana
  destAccountId?: string; // akun penerima (pindah dana/deposit)
  nominal: number; // > 0, int Rupiah
  fee: number; // int Rupiah, default 0
  feePaidBy: 'cash' | 'debit_rekening'; // default 'cash'
  feeRuleId?: string;
  feeManualOverride: boolean; // default false
  paymentMethod: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  date: number; // epoch ms (WITA)
  note?: string;
  referenceNo?: string;
  photoPath?: string;
  customerId?: string;
  status: 'ok' | 'void'; // default 'ok'
  voidReason?: string;
  voidBy?: string;
  voidAt?: number; // epoch ms
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productNameSnapshot: string; // nama saat kejadian (master boleh berubah)
  qty: number; // default 1
  modalSnapshot: number; // int Rupiah — salinan dari master saat kejadian
  hargaJualSnapshot: number; // int Rupiah — salinan dari master saat kejadian
  subtotal: number; // qty * hargaJualSnapshot
  // Laba per item = qty * (hargaJualSnapshot - modalSnapshot) — hitung di laporan, bukan kolom.
}

export interface Shift {
  id: string;
  userId: string;
  openedAt: number; // epoch ms
  closedAt?: number; // epoch ms
  saldoAwalSistem: Record<string, number>; // per accountId
  kasAwalFisik: number; // int Rupiah
  saldoAkhirSistem?: Record<string, number>; // per accountId
  hitungFisik?: Record<string, number>; // per accountId
  selisih?: Record<string, number>; // per accountId
  penjelasanSelisih?: Record<string, string>; // per accountId
  status: 'open' | 'closed' | 'handed_over' | 'pending_owner'; // default 'open'
  note?: string;
}

export interface ShiftHandover {
  id: string;
  shiftId: string;
  fromUserId: string;
  toUserId: string;
  hitungFisikDiterima: Record<string, number>; // angka fisik yang diterima
  status: 'done' | 'pending_owner'; // default 'done'
  note?: string;
  createdAt: number; // epoch ms
}

export interface StockMovement {
  id: string;
  productId: string;
  qtyChange: number; // -1 / +1 / opname delta
  reason: 'jual' | 'void' | 'pembelian_stok' | 'opname' | 'koreksi';
  transactionId?: string;
  shiftId?: string;
  actorUserId: string;
  createdAt: number; // epoch ms
}

export interface User {
  id: string;
  name: string;
  role: 'owner' | 'admin' | 'kasir';
  pinHash: string; // hash saja — simpan di Dexie BOLEH (hash, bukan PIN mentah) atau di Preferences, pilih satu & konsisten dengan AuthService
  isActive: boolean;
  createdAt: number; // epoch ms
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  balanceHutang: number; // int Rupiah, >= 0; hutang pelanggan ke konter — diturunkan dari receivables MVP simpel (Lunas penuh); cicilan v1.1
  createdAt: number; // epoch ms
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  action: 'koreksi_saldo' | 'ubah_modal' | 'ubah_harga_jual' | 'void_transaksi' | 'handover' | 'opname' | 'ubah_tarif' | 'login' | string;
  entityType: 'account' | 'product' | 'transaction' | 'shift' | 'fee_rule' | string;
  entityId: string;
  detail: string; // JSON ringkas: nilai lama -> nilai baru + alasan
  createdAt: number; // epoch ms
}

export interface AppSettings {
  id: number; // selalu 1, single row
  theme: 'light' | 'dark' | 'system'; // default 'system'
  // feeRoundingStep DIHAPUS di v1.5 — pembulatan fee persentase selalu Math.ceil ke Rupiah terdekat (keputusan user 8 Nov 2026, DIKUNCI); tidak ada lagi pembulatan ke kelipatan 100/500/1000.
  shiftTolerance: number; // int Rupiah per akun, default 5000
  biometricEnabled: boolean; // default false
  defaultCashAccountId?: string;
}
```

**Catatan tabel (penting):** Daftar PRD menyebut 11 tabel; `AccountLedger` di atas adalah tabel penopang ke-12 yang wajib ada agar saldo bisa diaudit per mutasi, dan `productCatalogCache` adalah tabel penopang ke-13 (cache read-only katalog Supabase, §4.14). Bila PRD final menetapkan 11 tabel tanpa ledger/cache, **tanyakan user sebelum menghapus** — jangan hapus diam-diam dan jangan ganti ledger dengan kolom `balance`.

**Seed data — TIDAK ADA seed data master (keputusan user 8 Nov 2026, DIKUNCI):**
- **Master lokal KOSONG saat install pertama:** tabel `accounts`, `products`, `customers`, dan `admin_fee_rules` semuanya kosong. Owner/Admin mengisi sendiri lewat form CRUD (§4.1, §4.2, §4.4, §4.13, §7 Fase 1) — akun (nama, tipe, no. rekening, pemilik, saldo awal manual), produk voucher/perdana/aksesoris (nama, kategori, modal, jual, stok), pelanggan (nama, telepon), dan tarif admin. Contoh di dokumen ini hanya fixture test, BUKAN seed — jangan seed akun/produk/pelanggan/tarif apa pun, jangan hardcode contoh ke database.
- **Pengecualian — katalog Supabase (Fase 3, §4.14):** identitas produk yang sudah ada di katalog Supabase Server Pulsa (pulsa, data, token PLN, dan produk katalog lainnya) disinkronisasi read-only ke `product_catalog_cache` (nama/operator/denominasi/kategori + id katalog). User tidak mengetik ulang identitas produk itu — tapi modal + harga jual per produk tetap diisi manual lewat form Master Produk (§4.2 `createProductFromCatalog`); produk katalog yang belum diberi modal/jual tidak bisa dipakai di transaksi.
- **Saldo awal akun** diinput manual saat membuat akun lewat AccountFormView dan disimpan di kolom `accounts.initialBalance` — tercatat sebagai saldo awal, BUKAN transaksi (lihat §4.4). Tidak ada saldo awal bawaan.
- **TIDAK ADA seed sama sekali — seedData.ts DIHAPUS:** tidak ada user, akun, produk, pelanggan, atau tarif yang dibuat otomatis saat install pertama. Tabel `users` juga KOSONG.
- **Layar setup pertama (first-run, §4.10, §7 Fase 0 — selaras PRD v1.8 §5.6/§14 poin 4):** saat app pertama kali dibuka dan tabel `users` kosong, tampilkan layar Setup Owner (`SetupOwnerView.vue`): user mengisi nama + PIN → akun Owner (role `owner`) dibuat, PIN disimpan sebagai HASH saja (bukan mentah). App tidak bisa dipakai sebelum setup ini selesai (router guard: bila belum ada user, semua route dialihkan ke setup). PIN default/hardcode DILARANG — jangan hardcode PIN apa pun di kode, test, contoh, atau dokumen.
- Jika data user sudah ada (tabel tidak kosong), jangan pernah menimpa nama/harga/saldo yang sudah diubah user.

## §6 — Pinia Stores yang Wajib Ada

```ts
// services (singleton, diimpor langsung — bukan lewat provider)
// feeRuleService, productService, transactionService, accountService,
// balanceService, shiftService, stockService, reportService,
// backupService, authService, customerService, catalogService
// database: db (Dexie, src/db/database.ts)
// stores (Pinia, src/stores/)
useTransactionStore  // daftar + filter + cari + tambah + void
useAccountStore      // daftar akun + saldo (hitung ulang tiap ada transaksi/void/koreksi)
useMasterStore       // produk + akun + tarif admin (form Master Tarif meniru Pengaturan_Margin BG-APP — lihat §4.1; CRUD tarif hanya Owner/Admin)
useCustomerStore     // master pelanggan (CRUD, Owner/Admin — §4.13)
useShiftStore        // shift aktif + buka/tutup/serah terima + ringkasan
useReportStore       // periode terpilih + ringkasan + laba + tren
useSettingsStore     // theme, shiftTolerance, biometricEnabled
useAuthStore         // user login + peran + PIN
```

**Aturan state:** Form transaksi dinamis harus bertahan saat rotasi layar / pindah route (state di Pinia store, bukan di komponen). Draft transaksi yang gagal simpan tidak boleh hilang — kembali ke form dengan semua field tetap terisi + pesan error spesifik. Shift aktif harus tersedia di semua layar (store, bukan parameter yang dilempar antar route). Service diimpor langsung oleh store, bukan oleh view.

## §7 — Task Per Fase + Acceptance Criteria

### Fase 0 — Fondasi
- [ ] Clone repo KOSONG `https://github.com/bengkelgadget-code/BG-VUE3` (branch `main`) — verifikasi repo masih kosong, lalu init proyek di dalamnya: `npm create vite@latest buku_konter -- --template vue-ts` (appId contoh `com.bengkel.bukukonter` — boleh diganti user) + `npx cap init "Buku Konter" com.bengkel.bukukonter --web-dir=dist`. Buat `version.json` awal (`version_code: 1`). Workflow OTA dibangun di Fase 2 (§7), bukan di Fase 0. Commit + push pertama HANYA setelah user menyetujui push (repo BG-VUE3, branch `main`).
- [ ] `package.json` sesuai §2; `npm install` sukses; catat versi package
- [ ] `src/db/database.ts` + `src/db/types.ts` (§5) — buka tanpa error; TIDAK ADA seed sama sekali (semua tabel kosong, termasuk `users` — `seedData.ts` DIHAPUS; selaras PRD v1.8 §5.6; TIDAK ADA seed akun/produk/pelanggan/tarif — keputusan user 8 Nov 2026, DIKUNCI)
- [ ] `src/core/theme.ts`: Plus Jakarta Sans, radius kartu 20 / tombol 16 / chip pill, light + dark (CSS variables)
- [ ] `src/App.vue` + `src/router/index.ts`: Home, Transaksi, Master, Shift, Laporan, Pengaturan + bottom nav & FAB tambah transaksi (kerangka saja, isi menyusul)
- [ ] `src/utils/format.ts` + test-nya: `Rp 1.250.000`, `−Rp 50.000`, tanggal Indonesia (WITA)
- [ ] `AuthService` dasar + layar Setup Owner pertama (`SetupOwnerView.vue`, §4.10): bila belum ada user → tampilkan setup; buat Owner (nama + PIN, PIN disimpan sebagai hash) → login shift bisa; router guard memblokir semua route lain sebelum setup selesai
- [ ] **AC:** app terbuka < 2 detik, `npm run typecheck` 0 error, `npm run lint` 0 masalah, `npm test` hijau, master lokal KOSONG saat install pertama (tabel `accounts`, `products`, `customers`, `admin_fee_rules`, dan `users` kosong — tidak ada user/akun/produk/pelanggan/tarif contoh di-seed — keputusan user 8 Nov 2026)
- [ ] **Test wajib setup pertama (Fase 0):** install baru → layar Setup Owner muncul (bukan layar login); buat Owner (nama + PIN) → login shift bisa; buka kedua → langsung layar login, bukan setup lagi; PIN tersimpan sebagai hash (bukan mentah) — grep PIN mentah di Dexie → NOL; tidak ada PIN default di kode — audit §9 memeriksa tidak ada PIN hardcode

### Fase 1 — MVP Inti
- [ ] `FeeRuleService` full (§4.1) + `feeRuleService.test.ts` (9 kasus §4.1 — **wajib hijau sebelum fase dinyatakan selesai**)
- [ ] `ProductService` + `AccountService` + `BalanceService` full (§4.2, §4.4, §4.5)  + `balanceService.test.ts` (delta tiap layanan §4.5 + multiplier −1 saat void + pindah dana/deposit bukan laba). **Kasus wajib:** transfer Rp500.000 admin Rp5.000 Debit Rekening → bank sumber −Rp495.000, Kas +Rp500.000, laba Rp5.000 (keputusan terkunci §4.3/§4.5 — varian −Rp505.000 DITOLAK).
- [ ] `TransactionService.addTransaction` (§4.3, tanpa void dulu — void di Fase 2)  + `transactionService.test.ts` (snapshot modal/jual dari master; kasir tidak bisa menginput modal — tidak ada field modal di input)
- [ ] `AddTransactionView.vue`: tanggal otomatis (WITA, bisa diubah Owner/Admin dengan alasan), dropdown jenis transaksi, detail cascading (transfer/tarik tunai → pilih bank/ewallet; voucher/perdana/ACC → pilih produk itu; pulsa/data/token → pilih produk digital), field sumber dana (muncul kondisional), nominal + **kolom Biaya Admin di sebelah nominal** (`Cash | Debit Rekening`), fee terisi otomatis dari resolver + bisa diubah manual (tercatat `feeManualOverride`), tombol Simpan sticky. Simpan ≤ 10 detik / ≤ 5 ketukan dari Home.
- [ ] `TransactionsView.vue`: grup per hari + subtotal, cari, filter (tanggal/layanan/akun/shift/status) dengan chip aktif + "Hapus filter"
- [ ] `TransactionDetailView.vue`: tampilkan modal? **TIDAK untuk Kasir** — modal hanya tampil untuk Owner/Admin. Tampilkan snapshot jual, fee, sumber dana, shift, kasir.
- [ ] `AccountsView.vue` + `AccountDetailView.vue` + `AccountFormView.vue`: saldo catatan per akun (agregasi), mutasi per akun (dari ledger), form tambah/ubah akun (nama, tipe, no. rekening, pemilik, saldo awal manual — Owner/Admin saja; saldo awal tercatat sebagai saldo awal, bukan transaksi, lihat §4.4)
- [ ] `MastersView.vue` + `ProductFormView.vue`: CRUD master produk (modal + jual, Owner/Admin saja) + master bank/ewallet; produk katalog dipilih dari `product_catalog_cache` (identitas dari cache, modal + jual diisi manual — §4.2 `createProductFromCatalog`); produk non-katalog (voucher/perdana/aksesoris) diinput manual lengkap
- [ ] `CustomersView.vue` + `CustomerFormView.vue` (§4.13): CRUD Master Pelanggan (nama wajib, telepon, catatan — Owner/Admin saja); pelanggan juga bisa dibuat cepat dari form transaksi saat status Hutang
- [ ] **Test wajib master (Fase 1):** install baru → semua master kosong kecuali katalog Supabase (setelah sync Fase 3); user Owner dibuat lewat layar setup pertama (§7 Fase 0); buat akun (dengan saldo awal) + produk + pelanggan + tarif lewat form → semuanya bisa dipakai di transaksi; produk katalog tanpa modal/jual tidak bisa dipilih di form transaksi; hapus/nonaktifkan akun yang masih punya transaksi ditolak
- [ ] `FeeRulesView.vue` + `FeeRuleFormView.vue` (meniru form Pengaturan_Margin BG-APP, keputusan user 8 Nov 2026, DIKUNCI): field Tipe Perhitungan (Range Nominal / Persentase — field tampil/sembunyi mengikuti tipe, seperti `toggleMarginFields` BG-APP), Layanan Terkait multi-select, Nominal Awal (>=), Nominal Akhir (<, kosong = tak hingga), nilai biaya Tetap (Rp) / Persentase (%), CRUD tambah/ubah/nonaktifkan, hanya Owner/Admin (enforce di service). Validasi overlap (tolak simpan) + peringatan celah (tampilkan, jangan blokir). **Test wajib:** buat aturan lewat form → transaksi memakai aturan itu (fee auto-fill) → nonaktifkan/hapus aturan → transaksi berikutnya fee Rp0 + banner "belum ada tarif".
- [ ] `ShiftOpenView.vue` + `ShiftCloseView.vue` (tanpa serah terima dulu — serah terima di Fase 2): buka shift (kas awal fisik), tutup shift (hitung fisik vs sistem + selisih + penjelasan wajib bila selisih ≠ 0)
- [ ] `ReportService` dasar + `ReportsView.vue`: ringkasan harian, total masuk/keluar/laba, donat per layanan, batang tren
- [ ] `ReceivableService` versi simpel (§4.11) + `ReceivablesView.vue` + `receivableService.test.ts`: transaksi Hutang tanpa nama pelanggan ditolak; hutang bernama masuk daftar piutang; tombol Lunas penuh menutup piutang (+ mutasi kas/bank penerima + audit). Cicilan TIDAK dibangun di fase ini (v1.1).
- [ ] `BackupService.exportCsv()` + `createBackup()` + `SettingsView.vue` (pengguna & peran, PIN, backup/export, tentang + versi)
- [ ] Empty state di semua layar kosong (ilustrasi kecil + kalimat + tombol aksi, bukan layar polos)
- [ ] **AC:** tambah transaksi saldo catatan benar per tabel delta §4.5; fee contoh user (20rb–100rb Rp3.000, ≥5jt 0,4%) terhitung otomatis; overlap tarif ditolak; transfer/pindah dana/deposit tidak masuk laba; kasir tidak melihat modal dan tidak melihat menu koreksi saldo; hutang simpel jalan end-to-end (Hutang → piutang → Lunas penuh); `npm run typecheck` 0 error + `npm run lint` 0 masalah + `npm test` hijau

### Fase 2 — Shift Serah Terima Penuh + Void + Audit + Koreksi Saldo + Stok/Opname + Mutasi
- [ ] `TransactionService.voidTransaction` (§4.3) + UI void di detail transaksi (alasan wajib) + `transaction_service.test.ts` tambahan (void membalik saldo + stok, baris tetap ada berstatus VOID, tidak ada DELETE)
- [ ] `ShiftService.handoverShift` (§4.6) + `ShiftHandoverView.vue`: PIN pengirim + PIN penerima, angka fisik yang diterima, status `pending_owner` bila selisih > toleransi
- [ ] `AccountService.adjustBalanceManual` (§4.4) + UI koreksi saldo di detail akun (Owner/Admin saja, alasan wajib, audit log) + menu tidak dirender untuk Kasir
- [ ] `StockService` full (§4.7) + `stockService.test.ts` (jual −1, void +1, stok tidak pernah negatif, opname hanya Owner/Admin)
- [ ] Mutasi antar akun: Pindah Dana, Deposit Server (dicatat), Deposit Provider (dicatat) — form + delta §4.5 + laporan tidak menghitungnya sebagai laba
- [ ] `AuditLogs`: semua aksi koreksi/ubah master/void/handover/opname/ubah tarif tercatat dan bisa dilihat di Pengaturan → Audit Log (Owner/Admin saja)
- [ ] Hutang/piutang **lanjutan** (v1.1 — versi simpelnya sudah MVP di Fase 1, lihat §4.11): pelunasan sebagian / cicilan + riwayat pembayaran, umur hutang, pengingat hutang. Jangan bangun ini di Fase 1.
- [ ] `BackupService.restoreBackup()` (validasi + konfirmasi 2× + backup otomatis sebelum restore)
- [ ] Workflow OTA + `UpdateService` (§3, §4.12) — dibangun di Fase 2: buat `.github/workflows/auto_release.yml` (pola Setel — build APK release tiap naik versi, GitHub Release + tulis ulang `version.json`) + `UpdateService` (cek `version.json`, dialog + progress, install via installer) + `updateService.test.ts`. Keystore rilis WAJIB sudah di GitHub Secrets sebelum uji end-to-end ini (lihat §3 — jangan pernah commit `.jks`/password). Uji end-to-end: naikkan versi → push ke `main` → workflow hijau → Release berisi APK → `version.json` ter-update → aplikasi mendeteksi update, dialog + progress tampil, install berhasil menimpa versi lama (signature sama karena keystore dari Secrets, `version_code` naik). Uji juga `force_update: true`.
- [ ] **AC:** void 1 transaksi → saldo + stok kembali persis seperti sebelum transaksi; serah terima butuh 2 PIN dan shift baru mulai dari angka fisik; koreksi saldo oleh Kasir ditolak di service (bukan hanya tombol hilang); opname selisih tercatat; void transaksi hutang membatalkan piutangnya; `npm test` hijau (fee + balance + void + shift + stock + receivable)

### Fase 3 — Poles & Serah
- [ ] Dark mode penuh di semua layar (uji: tidak ada teks putih-di-putih / hitam-di-hitam)
- [ ] Animasi 200–300ms, haptic ringan saat simpan, skeleton loading (bukan spinner di layar kosong), snackbar setelah simpan (tanpa tombol Urungkan — koreksi lewat void, lihat PRD)
- [ ] Onboarding 1 layar, bisa di-skip, menjelaskan 3 hal saja: catat transaksi, master + tarif, shift & serah terima
- [ ] Aksesibilitas: kontras ≥ 4.5:1, tombol ≥ 48px, label aria / TalkBack untuk tombol ikon, dukung font sistem membesar tanpa layout pecah, rotasi layar tidak menghilangkan draft transaksi
- [ ] Kinerja: lazy list transaksi (virtual scroll bila daftar panjang), query laporan agregasi Dexie (bukan loop JS untuk 12 bulan), cold start ≤ 2 detik di HP mid-range
- [ ] Katalog Supabase read-only (keputusan user 8 Nov 2026, DIKUNCI — BUKAN opsional): `CatalogService.syncCatalog` (§4.14) — SELECT katalog produk Server Pulsa dari Supabase ke `product_catalog_cache` (identitas saja: nama/operator/denominasi/kategori + id katalog; tanpa modal/jual, tanpa tulis ke Supabase, kredensial env/Preferences). Produk katalog dipakai di transaksi hanya setelah dibuat di Master Produk lewat `createProductFromCatalog` dengan modal + jual manual. Tanpa koneksi/kredensial, aplikasi tetap jalan penuh (produk non-katalog selalu manual).
- [ ] README: cara build web + deploy Vercel, cara build APK via Capacitor (`npm run build` → `npx cap sync` → Android Studio), cara kerja OTA GitHub (workflow `auto_release.yml`, `version.json`, cara pasang keystore rilis di GitHub Secrets SEBELUM install pertama — lihat §3), cara test fee resolver + balance delta + void + shift (kasus §7), cara jalankan test, daftar package + versi, keputusan default yang dipakai
- [ ] **AC akhir:** seluruh checklist PRD terpenuhi + seluruh checklist audit §9 terpenuhi. Serahkan laporan fase + bukti analyze/test + daftar file yang dibuat/diubah. Jangan lanjut ke fitur di luar PRD sebelum user bilang OK.

---

## §8 — Konvensi Kode & Desain

- Error: try/catch di service → lempar `AppError(pesanUser)` → UI tampilkan toast/banner. Jangan biarkan exception mentah ke user. Dilarang `console.log` di kode produksi — pakai logger util bila perlu, dan hapus sebelum laporan fase.
- Uang: format & parse hanya lewat `utils/format.ts`. Dilarang format manual (`'Rp ${amount}'`, `toFixed`) tersebar di komponen. Nominal di kode selalu `number` integer; persentase hanya `number` untuk `persentaseVal` (bukan Rupiah) dan hasilnya langsung dibulatkan ke integer.
- Warna/font/radius: hanya lewat token tema di `src/core/theme.ts` (CSS variables). Dilarang hardcode hex/font di tiap komponen. Ikon: satu set saja (Lucide via `lucide-vue-next`) di seluruh aplikasi.
- Komentar: jelaskan *kenapa*, bukan *apa*. Untuk fee resolver, komentari tiap aturan batas (inklusif/eksklusif) dengan contoh nominal. Untuk balance delta, komentari tiap layanan dengan contoh angka — termasuk contoh terkunci transfer Rp500.000 admin Rp5.000 Debit Rekening → bank −Rp495.000.
- Setiap service punya test minimal di `tests/` (fee resolver & balance delta & void & shift & stock wajib, lihat §7). Test baru wajib ditambahkan saat memperbaiki bug — bug yang sama tidak boleh lolos dua kali.
- Tidak ada secret/API key di repo (termasuk kredensial Supabase/Digiflazz — tidak ada kredensial Digiflazz di proyek ini sama sekali). Tidak ada data dummy transaksi yang ikut ke build release (TIDAK ADA seed apa pun — tanpa user Owner awal, tanpa akun/produk/pelanggan/tarif, tanpa PIN default/hardcode; bukan transaksi contoh).
- Modal tidak pernah tampil di UI Kasir: bila satu komponen dipakai dua peran, sembunyikan kolom modal berdasarkan `AuthService.canViewModal(role)` — jangan andalkan "kasir tidak akan menekan tombol itu".
- Semua tanggal disimpan sebagai `number` epoch ms (UTC) di Dexie dan ditampilkan dalam WITA (Asia/Makassar) lewat `utils/format.ts`. Jangan simpan tanggal sebagai string tanggal.
- TypeScript strict: `strict: true`, `noUncheckedIndexedAccess: true` bila memungkinkan. Dilarang `any` di kontrak §4 — bila terpaksa, beri komentar alasan + TODO.

### §8.1 — Aturan UI/UX: cantik, rapi, profesional, tidak berat (keputusan user 8 Nov 2026, DIKUNCI)

- **Styling hanya CSS variables + komponen sendiri.** Semua warna, radius, spasi, dan tipografi lewat token tema di `src/core/theme.ts` (CSS variables, design token PRD §8.5). Dilarang hardcode hex/font di komponen dan dilarang menambah framework CSS/UI apa pun.
- **Satu pola layout untuk semua halaman.** `AppScaffold.vue` (bottom nav + tombol tambah transaksi) + kartu yang sama, jarak dan tipografi yang sama, hierarki yang sama (judul halaman → ringkasan → konten → aksi). Halaman baru wajib meniru pola halaman yang sudah ada, bukan membuat gaya baru.
- **Transisi CSS saja, maks ~200ms.** Animasi hanya transisi CSS sederhana (mis. `transition: opacity/transform 150–200ms`) untuk feedback sentuhan (tombol ditekan, sheet muncul). Dilarang animasi JavaScript, animasi library, dan animasi hiasan yang tidak memberi feedback. Hormati `prefers-reduced-motion`: bila pengguna mengaktifkannya, semua transisi dimatikan (`@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }`).
- **Tanpa gambar/foto latar besar.** Tidak ada foto latar, tidak ada ilustrasi besar, tidak ada gambar hero di halaman mana pun. Satu-satunya gambar yang boleh ada adalah foto bukti transaksi yang diunggah pengguna sendiri (bukan aset bawaan app). Aset bawaan app hanya ikon Lucide (SVG) + logo teks.
- **Route lazy-load per halaman.** Setiap route di `src/router/index.ts` memakai `component: () => import('../views/...')` — jangan import semua view secara statis di atas file. Bundle awal hanya memuat Home + scaffold; halaman lain dimuat saat dibuka.
- **Angka uang pakai `tabular-nums`.** Semua nominal Rupiah di UI memakai `font-variant-numeric: tabular-nums` (di token tema) supaya kolom angka tidak bergeser saat angka berubah.
- **Font hanya Plus Jakarta Sans.** Satu keluarga font di seluruh aplikasi, dimuat lewat Google Fonts di `index.html` (lihat §2). Dilarang font kedua.

## §9 — Checklist Audit (diisi Muse setelah tiap fase)

- [ ] Aturan emas §0 terpenuhi semua (a–k) — grep bukti:
  - `number` desimal untuk nominal uang di `src/` → harus NOL (kecuali `persentaseVal` di `admin_fee_rules` — persen, bukan Rupiah; validasi `Number.isInteger()` untuk semua nominal Rupiah)
  - Jalur tulis ke Digiflazz (import http ke digiflazz / api key digiflazz / kata `digiflazz` di `src/` kecuali komentar "TIDAK PERNAH") → harus NOL
  - Jalur tulis ke Supabase produk (`supabase.from('products').insert/update/delete`, `@supabase/supabase-js` di package.json Fase 0–2) → harus NOL
  - Modal diinput di UI kasir (field input modal di `AddTransactionView.vue` / `TransactionInput` punya field modal) → harus NOL
  - Hard-delete transaksi (`deleteTransaction`, `db.transactions.delete(`, `.delete(` pada tabel transactions) → harus NOL
  - Kolom `balance` di tabel `accounts` → harus NOL (saldo = agregasi ledger)
  - Fallback margin hardcoded (angka 5000/3000 sebagai fallback di fee resolver) → harus NOL
  - Rumus debit yang ditolak: angka `505000` / `-505` untuk transfer Rp500.000 admin Rp5.000 di kode/test → harus NOL (yang benar −Rp495.000, lihat §4.5)
  - PIN mentah di Dexie/log/file → harus NOL (hanya hash)
- [ ] Kontrak §4 tidak berubah tanpa izin user (bandingkan signature dengan dokumen ini)
- [ ] Dependency hanya dari §2 (atau tambahan yang sudah diizinkan + dicatat)
- [ ] UI/UX ringan + cantik (keputusan user 8 Nov 2026, DIKUNCI — audit tiap fase, fase TIDAK lolos bila satu saja gagal):
  - (a) Screenshot Home + Tambah Transaksi + Serah Terima dicek tiap fase sebelum fase dinyatakan lolos (tampilan rapi, hierarki jelas, tidak ada teks terpotong / tombol bertumpuk / warna tak terbaca)
  - (b) Tidak ada dependensi terlarang di `package.json` — grep `framer-motion|gsap|vueuse/motion|vuetify|quasar|primevue` → harus NOL; hanya dependensi §2 (+ yang sudah diizinkan + dicatat)
  - (c) Bundle awal tetap kecil dan tidak ada aset gambar besar di `dist` — cek `npm run build` + `ls -la dist/assets`: tidak ada file gambar/foto bawaan app di atas 100 KB, tidak ada font kedua
  - (d) Uji ketik nominal di HP spek rendah tanpa lag — input nominal di `MoneyInput.vue` merespons tiap ketikan tanpa jeda terasa (tidak ada freeze saat mengetik cepat)
- [ ] Debit Rekening test: transfer 500.000 fee 5.000 debit → sumber −495.000, pembayaran +500.000; rumus +505.000 untuk debit TIDAK ada di service/test/contoh
- [ ] Hutang simpel test: hutang tanpa nama ditolak, hutang bernama masuk piutang, Lunas penuh menutup piutang, void membatalkan piutang
- [ ] Workflow OTA: file `.github/workflows/auto_release.yml` ada; tidak ada secret/keystore ter-commit di repo (grep `.jks`, `keystore`, password keystore di file ter-commit → NOL); workflow menggagalkan build bila `version_code` tidak naik dari rilis sebelumnya
- [ ] UpdateService test: `version_code` sama → `null` (tidak ada update); lebih baru → dialog + progress; `force_update: true` → dialog tidak bisa ditutup tanpa update
- [ ] Fee resolver test: contoh 20rb–100rb Rp3.000, ≥5jt 0,4%, batas 100.000 eksklusif, overlap ditolak, celah diperingatkan, layanan tak tercakup → null, pembulatan ceil 5.123.456 × 0,4% → 20.494 (bukan 20.493) dan 5.000.100 × 0,4% → 20.001 (bukan 20.000 hasil round)
- [ ] Master tanpa seed test (keputusan user 8 Nov 2026, DIKUNCI): install baru → tabel `accounts`, `products`, `customers`, `admin_fee_rules`, dan `users` KOSONG (tanpa user apa pun — Owner dibuat lewat layar setup pertama, §7 Fase 0); tidak ada nama akun/produk/pelanggan contoh di database; buat akun (saldo awal manual) + produk + pelanggan + tarif lewat form → semuanya bisa dipakai di transaksi; produk katalog tanpa modal/jual tidak bisa dipilih di form transaksi
- [ ] Katalog Supabase test (Fase 3): sync hanya SELECT (tidak ada INSERT/UPDATE/DELETE ke Supabase — grep `supabase.from(` dengan tulis → NOL); entri cache hanya identitas (tidak ada kolom modal/jual di `product_catalog_cache`); sync dua kali tidak menggandakan entri; transaksi tidak bisa memakai entri cache langsung
- [ ] Balance delta test: tiap layanan §4.5 benar, void multiplier −1 membalik persis, pindah dana/deposit tidak masuk laba
- [ ] Snapshot test: ubah modal di master → transaksi lama tetap pakai modal lama; transaksi baru pakai modal baru
- [ ] Peran test: Kasir memanggil `adjustBalanceManual` / `updateProduct` / `stockOpname` langsung di service → ditolak `AppError` (bukan hanya tombol hilang di UI)
- [ ] Saldo akun = query agregasi ledger, bukan kolom balance (uji 1.000 transaksi acak → saldo cocok)
- [ ] Shift test: tutup tanpa hitung fisik ditolak; serah terima butuh 2 PIN; shift baru mulai dari angka fisik
- [ ] Stok test: jual saat stok 0 ditolak; void mengembalikan stok; opname tercatat
- [ ] Backup-restore: file backup berisi DB + foto bukti; restore mengembalikan keduanya; restore file rusak ditolak dengan pesan jelas
- [ ] `npm run typecheck` 0 error + `npm run lint` 0 masalah + `npm test` hijau (laporan Gemini dilampirkan per fase)
- [ ] UI Indonesia penuh, tidak ada teks error Inggris mentah; terang + gelap lolos uji baca; label "(catatan)" tampil di akun Server Pulsa & Provider App
- [ ] Izin Android minimal (§3) — tidak ada izin luas yang tidak dijelaskan
- [ ] Kriteria sukses PRD per fase terpenuhi

---

## §10 — Prompt Siap Tempel untuk Gemini

> Tempel ini sebagai pesan pertama ke Gemini di Antigravity, dengan kedua file
> (`PRD-pembukuan-konter.md` dan file ini) tersedia di workspace:

```
Kamu adalah Vue 3 + Capacitor developer senior. Kita akan membangun aplikasi
"BUKU KONTER" — pembukuan transaksi konter (pulsa, token, voucher, perdana,
aksesoris, transfer, tarik tunai, top up e-wallet), single/multi-kasir
dengan shift, local-first, offline penuh. Repo: https://github.com/bengkelgadget-code/BG-VUE3 (branch main) — repo ini BARU dan saat ini KOSONG, jadi mulai dari repo kosong (clone dulu, lalu init proyek di Fase 0). Update OTA = GitHub Actions + Releases APK pola Setel (workflow auto_release.yml dibangun dari nol di Fase 2 — lihat §3); APK via Capacitor.

CARA KERJA:
1. Baca PRD-pembukuan-konter.md sampai paham, lalu BUILD-SPEC ini
   sampai habis.
2. Kerjakan per fase (§7), mulai dari Fase 0. Satu fase selesai = semua
   checklist + acceptance criteria fase itu terpenuhi.
3. Setiap fase selesai: jalankan `npm run typecheck` (harus 0 error),
   `npm run lint` (harus 0 masalah), dan `npm test` (Vitest, harus hijau),
   lalu laporkan: file yang dibuat/diubah, versi package yang dipakai,
   dan hasil uji acceptance criteria.
4. Jangan lanjut ke fase berikutnya sebelum aku bilang OK.

ATURAN KERAS (pelanggaran = kerjaan ditolak):
- Nominal uang SELALU number integer Rupiah, TIDAK PERNAH double/desimal.
- App ini PURE PENCATATAN: TIDAK PERNAH memanggil Digiflazz, TIDAK PERNAH
  menulis ke Supabase produk, TIDAK PERNAH mengubah saldo live. Saldo di
  app ini adalah saldo CATATAN terpisah. Deposit server hanya dicatat,
  bukan dilakukan.
- Modal TIDAK PERNAH diinput kasir — selalu dari Master Produk lokal
  (Owner/Admin). Kasir tidak melihat modal. Snapshot modal+jual disimpan
  per transaksi; perubahan master hanya berlaku ke depan.
- Koreksi saldo manual hanya Owner/Admin + wajib alasan + audit log.
  Staff tidak melihat menunya.
- Void BUKAN hapus — hapus permanen transaksi DILARANG.
- Transfer/mutasi internal TIDAK PERNAH dihitung sebagai pemasukan/
  pengeluaran/laba.
- Bayar admin ada DI SEBELAH nominal: Cash / Debit Rekening.
- Debit Rekening = potong dari nominal (KEPUTUSAN TERKUNCI): transfer
  Rp500.000 admin Rp5.000 Debit Rekening -> hBeli Rp495.000, hJual
  Rp500.000, profit Rp5.000, bank sumber -Rp495.000. Varian bank
  -Rp505.000 DITOLAK.
- Tarif admin per range: nominal awal (>=) – akhir (<, kosong = tak hingga),
  multi-layanan, Tetap atau Persentase, first-match setelah sort min desc.
  Tidak ada fallback margin hardcoded. Overlap ditolak, celah diperingatkan.
- Pembulatan fee persentase = BULATKAN KE ATAS (Math.ceil) ke Rupiah
  terdekat (keputusan user 8 Nov 2026, DIKUNCI): 5.123.456 x 0,4% =
  20.493,824 -> 20.494. Biaya TETAP tidak dibulatkan. JANGAN pakai
  Math.round (warisan BG-APP calculateDynamicMargin).
- TIDAK ADA seed tarif admin (keputusan user 8 Nov 2026, DIKUNCI): tabel
  admin_fee_rules KOSONG saat install pertama; user mengisi sendiri lewat
  form Master Tarif yang meniru Pengaturan_Margin BG-APP (Tipe Perhitungan
  Range Nominal/Persentase, Layanan Terkait multi-select, Nominal
  Awal/Akhir, nilai Tetap/Persentase). Dua contoh tarif user hanya contoh
  + kasus uji, BUKAN seed.
- TIDAK ADA seed data master (keputusan user 8 Nov 2026, DIKUNCI): akun,
  produk, pelanggan, tarif semua KOSONG saat install pertama — user
  mengisi sendiri lewat form CRUD (Master Produk / Akun / Pelanggan /
  Tarif, lihat §4.2, §4.4, §4.13, §7 Fase 1). Saldo awal akun diinput
  manual saat membuat akun (tercatat sebagai saldo awal, bukan transaksi).
  PENGECUALIAN: identitas produk yang sudah ada di katalog Supabase
  Server Pulsa (pulsa, data, token PLN, dll.) disinkronisasi read-only ke
  product_catalog_cache (Fase 3, SELECT saja — §4.14); modal + harga jual
  produk itu tetap diisi manual lewat form Master Produk.
- Hutang-piutang VERSI SIMPEL adalah MVP (keputusan user 8 Nov 2026,
  DIKUNCI): status Lunas/Hutang, nama pelanggan wajib bila Hutang,
  daftar piutang, tombol Lunas penuh (ReceivableService §4.11).
  Cicilan / pelunasan sebagian = v1.1,
  jangan dibangun di MVP. Fee resolver + balance delta + debit 495 +
  hutang simpel + void wajib unit test Vitest hijau sebelum Fase 1 selesai.
- Database lokal Dexie (IndexedDB) — JANGAN ganti ke SQLite Capacitor
  tanpa izinku.
- Jangan ubah kontrak interface di §4 tanpa izinku.
- Jangan tambah dependency di luar §2 tanpa izinku.
- Repo: https://github.com/bengkelgadget-code/BG-VUE3, branch main. Jangan push
  sebelum aku menyetujui push. Jangan push ke repo lain.
- UI berbahasa Indonesia. Kode/komentar berbahasa Inggris.
- UI/UX WAJIB cantik, rapi, dan terlihat profesional TAPI tidak berat
  (keputusan user 8 Nov 2026, DIKUNCI): styling hanya CSS variables +
  komponen sendiri (tanpa framework UI berat, tanpa library animasi —
  transisi CSS maks ~200ms, hormati prefers-reduced-motion), tanpa
  gambar/foto latar besar, route lazy-load per halaman, angka uang
  tabular-nums, font hanya Plus Jakarta Sans. Lihat §8.1.
- Error selalu dibungkus AppError dengan pesan yang dimengerti user.
- Fee resolver + balance delta + void wajib punya unit test dan test
  harus hijau sebelum Fase 1 dinyatakan selesai.

Mulai dari Fase 0 sekarang. Laporkan dulu rencanamu dalam 5 baris,
lalu eksekusi.
```

---

*Dokumen ini + PRD = satu-satunya sumber kebenaran. Kalau keduanya bertentangan, PRD menang untuk "apa", BUILD SPEC menang untuk "bagaimana" — dan konfliknya wajib ditanyakan ke user, bukan diputuskan diam-diam.*

---

## Addendum — Keputusan User (v1.1 / v1.2 / v1.3, 7 Nov 2026)

- **v1.1 — Rubah saldo manual + admin di sebelah nominal + tarif per range:** (1) Rubah saldo manual TETAP ADA, hanya Owner/Admin — staff tidak bisa, tiap koreksi wajib alasan + tercatat audit. (2) Pilihan bayar admin di SEBELAH nominal: Cash / Debit Rekening (istilah "potong rekening" diganti Debit Rekening). (3) Form Master Tarif Biaya Admin per range: nominal awal–akhir, pilih transaksi yang berlaku, biaya Tetap atau Persentase — contoh user: Rp20rb–100rb tarik tunai/transfer/ewallet Rp3.000, ≥Rp5jt 0,4% × nominal. Tarif naik jadi MVP, tabel baru `admin_fee_rules`.
- **v1.2 — Prinsip PURE PENCATATAN (keras):** App baru HANYA mencatat, TIDAK mengganggu saldo server pulsa sama sekali. Tidak memanggil Digiflazz, tidak menulis balik ke Supabase produk, akses Supabase hanya baca (SELECT) katalog produk — dipakai cuma nama/operator/denominasi produk untuk dicatat. Saldo di pembukuan adalah saldo CATATAN terpisah, bukan saldo live; deposit server di pembukuan hanya dicatat, bukan dilakukan. Boleh 1 repo GitHub yang sama dengan Server Pulsa sebagai monorepo (folder + deploy pisah), tapi tabel pembukuan terpisah.
- **v1.3 — Modal dicatat di master (keputusan 7 Nov 2026, "di catat di master"):** Modal + harga jual pulsa/data/token diisi sekali oleh owner/admin di Master Produk lokal, terisi otomatis saat transaksi, kasir tidak melihat modal dan tidak menginput modal tiap transaksi. Perubahan master hanya berlaku ke depan; tiap transaksi menyimpan snapshot modal + jual saat kejadian.
- **TIDAK ADA seed tarif admin (keputusan user 8 Nov 2026, DIKUNCI — lihat Addendum v1.5):** tabel `admin_fee_rules` kosong saat install pertama; user mengisi sendiri lewat form Master Tarif. **Sudah diputuskan (v1.5):** aturan pembulatan persentase = BULATKAN KE ATAS (`Math.ceil`) ke Rupiah terdekat — lihat Addendum v1.5. **Sudah diputuskan:** Debit Rekening = potong dari nominal (500 → 495) untuk semua jasa; hutang-piutang versi simpel masuk MVP (keputusan user 8 Nov 2026, DIKUNCI); stack Vue 3 + Capacitor; repo aplikasi ini BG-VUE3 (bukan monorepo Server Pulsa; push tetap butuh persetujuan user); OTA = GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov 2026, DIKUNCI — deploy Vercel bukan jalur OTA).

## Addendum — Referensi BG-APP (8 Nov 2026, user)

- **Sumber:** `https://github.com/bengkelgadget-code/BG-APP` (vanilla JS + Firestore). Dipakai sebagai referensi pola, bukan sebagai codebase untuk disalin.
- **Pola yang diadopsi ke BUILD-SPEC ini:**
  - `calculateDynamicMargin(layanan, nominal)` (`app_logic.js:211-284`) → §4.1 `FeeRuleService.resolveFee`: range `>= min && < max` → margin tetap; persentase `>= min` → `round(nominal*pct/100)`; sort `min` desc, first-match; tidak cocok → `null`. Field master: tipe, layanan multi-select, `min_nom`, `max_nom`, `persentase_val`, `val_margin`. **PERBEDAAN (v1.5, keputusan user 8 Nov 2026, DIKUNCI):** di BUKU KONTER pembulatan persentase DIGANTI dari `round` BG-APP menjadi `Math.ceil` (bulatkan ke atas ke Rupiah terdekat) — lihat Addendum v1.5; `feeRoundingStep` (kelipatan 100/500/1000) dihapus.
  - Toggle Potong Dalam vs Admin Di Luar (Tunai) di sebelah nominal (`index.html:512`): Potong Dalam → `hBeli = nominal - margin`, `hJual = nominal`; Di Luar → `hBeli = nominal`, `hJual = nominal + margin` → diadaptasi ke §4.3/§4.5 sebagai `feePaidBy` Cash / Debit Rekening di sebelah nominal (bukan disalin mentah — pemetaan ke saldo catatan dijelaskan di §4.5).
  - `updateBalances(jenis, sumber, diterimaDi, hargaBeli, hargaJual, multiplier 1/-1)` (`app_logic.js:75-161`) → §4.5 `BalanceService.computeDeltas` + `applyDeltas`: JASA TRANSFER sumber 0, kasir +profit; TARIK TUNAI sumber +jual, kasir −beli; TRANSFER sumber −beli, kasir +jual; jualan digital sumber −beli, kasir +jual; multiplier −1 untuk membalik saat edit/void.
  - Master produk: Voucher/Perdana/ACC (beli+jual+stok), Pulsa/Token (beli+jual); profit = jual − beli per transaksi; `adjustStock` −1/+1, `max(0, ...)` → §4.2 + §4.7 (dengan perbaikan: stok negatif ditolak, bukan diam-diam dipotong ke 0).
  - Mutasi: Pindah Dana, Topup Server Pulsa, Topup Provider, Tembak Voucher → §4.5 (sebagai `pindah_dana`, `deposit_server` (dicatat), `deposit_provider` (dicatat)).
- **Yang JANGAN disalin dari BG-APP (dilarang di §0.9):** uang sebagai string `"Rp ..."`, deteksi persentase via substring, fallback margin hardcoded 5000/3000, login bypass, hard-delete, tanpa validasi overlap/celah tarif, tanpa shift/void/audit.
- **Perbedaan arsitektur yang disengaja:** BG-APP vanilla JS + Firestore (online, cloud); BUKU KONTER Vue 3 + Capacitor + Dexie/IndexedDB (local-first, offline penuh, web + Android). Karena itu tidak ada kode BG-APP yang disalin baris-per-baris — hanya logika bisnisnya (fee resolver, delta saldo, stok) yang ditulis ulang dalam kontrak TypeScript §4.

## Addendum — Repo BG-VUE3 (diputuskan 8 Nov 2026)

- Repo aplikasi ini: `https://github.com/bengkelgadget-code/BG-VUE3` (deskripsi "Aplikasi konterku"), branch `main`. Repo ini BARU dibuat user 8 Nov 2026 dan saat ini KOSONG — hanya `.git`, belum ada kode, workflow, atau release. Gemini mulai dari repo kosong di Fase 0.
- Opsi monorepo di repo Server Pulsa (`SERVERPULSA-VUE3`) yang lama DIGANTI dan tidak berlaku lagi — BUKU KONTER tinggal di repo sendiri (BG-VUE3), bukan di repo Server Pulsa.
- Push tetap hanya atas persetujuan user (repo BG-VUE3, branch `main`); jangan hardcode URL repo di kode aplikasi.
- OTA = GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov 2026, DIKUNCI) — workflow `auto_release.yml` BELUM ADA, dibangun dari nol di Fase 2 mengikuti pola Setel (§3). Deploy Vercel BUKAN jalur OTA.

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.1)

- **Debit Rekening DIKUNCI = potong dari nominal** (user: "betul yang ada di PRD, harusnya kl 500 admin debet rekening harusnya 495"). Berlaku transfer, tarik tunai, top up — di rumus §4.5, pemetaan §4.3, contoh, acceptance Fase 1, checklist §9, dan prompt §10. Varian 505 bukan lagi OPEN/default/alternatif.
- **Hutang-piutang versi simpel MASUK MVP (keputusan user 8 Nov 2026, DIKUNCI — user: "kita pakai versi MVP"):** status Lunas/Hutang, nama wajib bila Hutang, daftar piutang, tombol Lunas penuh — `ReceivableService` §4.11, `ReceivablesView`, Fase 1 + test wajib. Cicilan/sebagian, umur hutang, pengingat tetap v1.1.
- **Stack Vue 3 + Capacitor menggantikan Flutter**: seluruh dokumen ini TypeScript/Vue/Capacitor (struktur §1, package.json §2, Capacitor + OTA §3, kontrak §4, Dexie §5, Pinia §6, task §7, konvensi §8, audit §9, prompt §10). OTA = GitHub Actions + Releases APK pola Setel (§3); APK memuat `dist` yang dibundel (tanpa live-URL), update datang lewat rilis GitHub; perubahan native (plugin, izin, Capacitor, appId) tetap butuh APK baru.

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.2)

- **Hutang-piutang versi simpel MASUK MVP (keputusan user 8 Nov 2026, DIKUNCI — user: "kita pakai versi MVP").** Semua tulisan lama "pilihan revisi dokumen ini, menunggu konfirmasi user — bukan keputusan user" dihapus di seluruh dokumen (§0 aturan k, §10 prompt, Addendum). Isinya tetap: status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang, tombol Lunas penuh (`ReceivableService` §4.11, Fase 1 + test wajib); cicilan / pelunasan sebagian, umur hutang, pengingat tetap v1.1.
- **Repo aplikasi ini: `https://github.com/bengkelgadget-code/BG-VUE3`, branch `main`** (keputusan user 8 Nov 2026). Repo ini BARU dan saat ini KOSONG (hanya `.git`) — Gemini mulai dari repo kosong di Fase 0. Monorepo di repo Server Pulsa DIGANTI dan tidak berlaku lagi.
- **OTA via GitHub Actions + Releases APK pola Setel (keputusan user 8 Nov 2026, DIKUNCI — alur OTA sudah diputuskan, bukan OPEN lagi).** Workflow `auto_release.yml` BELUM ADA — dibangun dari nol di Fase 2 mengikuti pola Setel (§3): push yang menaikkan versi → build APK release → GitHub Release → tulis ulang `version.json` (`version_code`, `version_name`, `download_url`, `changelog`, `force_update`); `UpdateService` (§4.12, Fase 2) mengecek `version.json` di `raw.githubusercontent`, bandingkan `version_code`, tampilkan dialog update + progress, install via installer. Deploy Vercel DITOLAK sebagai jalur OTA (bukan dilarang selamanya sebagai hosting web, tapi bukan jalur update yang dipilih — jangan tulis Vercel sebagai alternatif OTA). Pelajaran Setel/BELANJAKU: keystore rilis HARUS di GitHub Secrets SEBELUM install pertama (jangan commit `.jks`/password); `version_code` wajib naik tiap rilis (BELANJAKU Build 14 tidak bisa menimpa Build 9 karena kunci signing berbeda).

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.3)

- **Alur OTA DIPUTUSKAN (keputusan user 8 Nov 2026, DIKUNCI): GitHub Actions + Releases APK pola Setel.** Semua tulisan "alur OTA masih OPEN menunggu pilihan user" dihapus di seluruh dokumen (header, §1, §3, §10 prompt, Addendum). Deploy Vercel DITOLAK sebagai jalur OTA — Vercel tetap boleh dipakai sebagai hosting versi web (browser), tapi BUKAN mekanisme update APK, dan tidak boleh ditulis sebagai alternatif OTA.
- **Jadwal workflow OTA: dibangun di Fase 2.** `auto_release.yml` + `UpdateService` (§4.12) + uji end-to-end OTA pindah dari Fase 3 ke Fase 2 (§7); Fase 0 hanya membuat `version.json` awal, bukan kerangka workflow. Mode live-URL (`server.url` memuat URL Vercel) TIDAK dipakai — APK memuat `dist` yang dibundel, update hanya lewat rilis GitHub.

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.4)

- **Standar UI/UX DIKUNCI (keputusan user 8 Nov 2026): UI/UX WAJIB cantik, susunan rapi, terlihat profesional, dan tidak berat.** Aturan: (1) dependensi terlarang §2 — tanpa library animasi (`framer-motion`/`gsap`/`@vueuse/motion` dan sejenis), tanpa framework UI berat (`vuetify`/`quasar`/`primevue` dan sejenis), tanpa font kedua; untuk UI yang dipakai hanya Vue 3 + Pinia + Router + Dexie + `lucide-vue-next` (tree-shaken) + Plus Jakarta Sans; dependensi baru apa pun harus disetujui user dulu. (2) Aturan desain §8.1 — styling hanya CSS variables (design token PRD §8.5) + komponen sendiri; transisi CSS saja maks ~200ms + hormati `prefers-reduced-motion`; tanpa gambar/foto latar besar; route lazy-load per halaman; angka uang pakai `tabular-nums`; satu pola layout semua halaman. (3) Audit §9 — screenshot Home + Tambah Transaksi + Serah Terima dicek tiap fase; cek tidak ada dependensi terlarang di `package.json`; cek bundle awal tetap kecil dan tidak ada aset gambar besar di `dist`; uji ketik nominal di HP spek rendah tanpa lag. (4) Instruksi ini juga masuk prompt §10 supaya Gemini membacanya di prompt.

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.5)

- **Aturan pembulatan fee persentase DIKUNCI (keputusan user 8 Nov 2026): BULATKAN KE ATAS (`Math.ceil`) ke Rupiah terdekat.** Rumus di `FeeRuleService.resolveFee` (§4.1): fee persentase = `Math.ceil(nominal * persentaseVal / 100)` dalam integer Rupiah. Contoh: nominal 5.123.456 × 0,4% = 20.493,824 → **20.494**. Biaya TETAP tidak dibulatkan.
- **MENGGANTIKAN `Math.round` warisan BG-APP** (`calculateDynamicMargin` memakai `round(nominal*pct/100)`): `Math.round` DILARANG di `feeRuleService` — grep harus NOL. Kasus pembeda: nominal 5.000.100 × 0,4% = 20.000,4 → ceil = **20.001**, sedangkan round akan memberi 20.000.
- **`AppSettings.feeRoundingStep` DIHAPUS** (§5): tidak ada lagi pembulatan ke kelipatan 100/500/1000 — aturan lama itu bertentangan dengan ceil ke Rupiah terdekat. Test wajib §4.1 kasus 4 (5.123.456 → 20.494; 5.000.100 → 20.001; hasil bulat 5.000.000 → 20.000 tetap) + checklist §9 harus hijau sebelum Fase 1 selesai. Aturan ini juga masuk prompt §10.
- **TIDAK ADA seed tarif admin (keputusan user 8 Nov 2026, DIKUNCI):** tabel `admin_fee_rules` KOSONG saat install pertama — tidak ada daftar tarif awal yang disediakan sebagai data. User (Owner/Admin) membuat sendiri range tarifnya lewat form Master Tarif di aplikasi, meniru form Pengaturan_Margin BG-APP: field Tipe Perhitungan (Range Nominal / Persentase — field tampil/sembunyi mengikuti tipe seperti `toggleMarginFields`), Layanan Terkait multi-select, Nominal Awal (>=), Nominal Akhir (<, kosong = tanpa batas atas), nilai biaya Tetap (Rp) / Persentase (%); CRUD tambah/ubah/nonaktifkan, hanya Owner/Admin (enforce di service). Dua contoh user (Rp20rb–<Rp100rb → Rp3.000; >=Rp5jt → 0,4%) TETAP hanya sebagai contoh + kasus uji (§4.1), BUKAN seed. Validasi overlap/gap yang sudah ada TETAP; test wajib baru §4.1 kasus 9 (buat lewat form → transaksi auto-fill → hapus aturan → transaksi Rp0 + banner). Status OPEN "daftar tarif awal lengkap" sudah dicabut dari Addendum dan prompt §10 — tidak ada lagi yang menunggu daftar dari user.

## Addendum — Keputusan User 8 November 2026 (BUILD-SPEC v1.6)

- **TIDAK ADA seed data master (keputusan user 8 Nov 2026, DIKUNCI — user: "begitu juga untuk data master sediakan aja form inputnya nanti biar aku yang input sendiri datanya, kecuali yang sudah ada di supabase server pulsa, seperti token pln, pulsa dll"):** master lokal KOSONG saat install pertama — akun, produk, pelanggan, tarif. Owner/Admin mengisi sendiri lewat form CRUD di aplikasi: Master Produk (`ProductFormView`, §4.2), Master Akun (`AccountFormView`, §4.4), Master Pelanggan (`CustomersView` + `CustomerFormView`, §4.13 baru), Master Tarif (§4.1). Contoh di dokumen hanya fixture test, BUKAN seed. Seed 5 akun + produk contoh di §5 v1.5 DIHAPUS seluruhnya; seed user Owner awal (PIN default, wajib diganti saat pertama login) JUGA DIHAPUS — perbaikan inkonsistensi vs PRD v1.8 §5.6/§14 poin 4: TIDAK ADA seed sama sekali, `seedData.ts` dihapus, PIN default/hardcode DILARANG; akun Owner dibuat user sendiri di layar setup pertama (nama + PIN, PIN disimpan sebagai hash) — lihat §4.10, §5, §7 Fase 0.
- **PENGECUALIAN — katalog Supabase Server Pulsa (keputusan user 8 Nov 2026, DIKUNCI):** identitas produk yang SUDAH ADA di katalog Supabase Server Pulsa (pulsa, data, token PLN, dan produk katalog lainnya) tetap disinkronisasi read-only ke `product_catalog_cache` (§4.14 baru, §5) — nama/operator/denominasi/kategori + id katalog, SELECT saja, Fase 3 (BUKAN lagi "opsional, hanya bila user setuju tertulis" — lihat §2 dan §7 Fase 3). User tidak mengetik ulang identitas produk itu; modal + harga jual per produk tetap diisi manual lewat form Master Produk (§4.2 `createProductFromCatalog`); produk katalog yang belum diberi modal/jual tidak bisa dipakai di transaksi. Produk yang TIDAK ADA di Supabase (voucher/perdana/aksesoris) diinput manual lengkap (nama, kategori, modal, jual, stok).
- **Saldo awal akun diinput manual saat membuat akun** (§4.4 `addAccount`): disimpan di kolom `accounts.initialBalance`, tercatat sebagai saldo awal — BUKAN baris ledger, BUKAN transaksi, tidak masuk laba/laporan. Setelah akun dibuat, saldo hanya berubah lewat transaksi/void/koreksi manual.
- **Perubahan skema §5:** tabel baru `product_catalog_cache` (Dexie store + interface `ProductCatalogEntry`, tabel penopang ke-13); tipe `NewProduct` dan `NewCustomer` didefinisikan (sebelumnya dipakai di §4.2/§4.13 tanpa definisi); komentar `AccountLedger.transactionId` diluruskan (saldo awal bukan baris ledger). Test wajib baru di §7 Fase 1 (install baru → master kosong; buat lewat form → bisa dipakai di transaksi) + butir audit §9 (master tanpa seed; sync katalog hanya SELECT).
