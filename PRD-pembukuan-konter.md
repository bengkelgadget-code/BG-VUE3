# PRD — Aplikasi Pembukuan Transaksi Konter (BUKU KONTER)

**Nama kerja:** BUKU KONTER (bisa diganti lewat satu konstanta nama, jangan hardcode brand di logika inti)
**Versi PRD:** v1.8 — 8 November 2026 (v1.1: Debit Rekening dikunci + stack Vue 3 + Capacitor; v1.2: hutang-piutang versi simpel ditempatkan di MVP sebagai pilihan revisi — menunggu konfirmasi user; v1.3: hutang-piutang versi simpel masuk MVP DIKUNCI sebagai keputusan user + repo pindah ke BG-VUE3 dengan OTA via GitHub; v1.4: alur OTA DIKUNCI — GitHub Actions + Releases APK pola Setel, deploy Vercel ditolak sebagai jalur OTA; v1.5: standar UI/UX DIKUNCI — cantik, rapi, profesional, dan tidak berat; v1.6: aturan pembulatan biaya admin persentase DIKUNCI — bulatkan ke atas (`Math.ceil`) ke Rupiah terdekat; v1.7: TIDAK ADA data tarif awal — user mengisi sendiri range tarifnya lewat form Master Tarif seperti Pengaturan_Margin BG-APP — lihat Addendum poin 8; v1.8: TIDAK ADA data master awal — master lokal kosong saat install pertama, user mengisi sendiri lewat form input; produk Supabase tetap ditarik read-only — lihat Addendum poin 9)
**Dibuat untuk:** bengkel, dikerjakan Gemini (Vue 3 + Capacitor)
**Sumber:** Rancangan Aplikasi Pembukuan Transaksi Konter v1.9 (12 halaman, 8 Nov 2026) + pola referensi repo lama BG-APP (https://github.com/bengkelgadget-code/BG-APP — vanilla JS + Firestore, dipakai sebagai referensi pola saja, bukan untuk disalin mentah)
**Platform:** Vue 3 + Capacitor — web app sebagai jalur utama, dibungkus Capacitor jadi APK Android dari codebase yang sama; iOS menyusul dari codebase yang sama. Repo: https://github.com/bengkelgadget-code/BG-VUE3 (kosong — mulai dari commit pertama). Update fitur/fix: OTA via GitHub (Actions → Release + `version.json`, pola Setel — workflow belum ada, dibangun di Fase 2, lihat §10); deploy Vercel BUKAN jalur OTA (ditolak sebagai jalur OTA oleh user 8 Nov 2026, lihat §14 poin 8 dan Addendum poin 5); APK Capacitor hanya perlu di-build ulang bila plugin native-nya berubah.
**Bahasa aplikasi:** Indonesia. Mata uang: Rupiah (IDR), semua nominal integer, tanpa desimal sen. Timezone: Asia/Makassar (WITA).
**Sifat data:** Multi-user per shift (Owner, Admin, Kasir) dengan PIN per user. Local-first, bisa offline penuh. Cloud/sync BUKAN MVP.

> Cara pakai dokumen ini: kerjakan berurutan dari Fase 0 → Fase 3 di §13. Kalau ada konflik antara PRD ini dan asumsi lain, PRD ini yang menang — kecuali keputusan user yang lebih baru, yang selalu menang atas PRD. Kalau ada keputusan yang belum dibuat user, pakai "Default bila user diam" di §14, jangan berhenti menunggu.

---

## 1. Ringkasan Produk

### 1.1 Masalah
Konter pulsa / agen transfer di Samarinda mencatat transaksi di buku tulis, kertas, dan ingatan petugas:
1. Uang tersebar di banyak tempat — kas laci, beberapa rekening bank, beberapa e-wallet, saldo server pulsa, saldo aplikasi provider — tapi tidak ada satu catatan yang menunjukkan saldo masing-masing saat ini.
2. Biaya admin transfer / tarik tunai / top up ditentukan dari ingatan petugas, beda petugas beda tarif, dan sering tidak tercatat sebagai pendapatan.
3. Modal pulsa, token, voucher, dan perdana tidak dicatat per transaksi, jadi laba harian tidak pernah tahu persis — yang kelihatan hanya uang kas yang masuk.
4. Pergantian shift adalah titik paling rawan kehilangan uang tanpa jejak: tidak ada yang membandingkan angka sistem dengan hitungan fisik, dan tidak ada yang menandatangani serah terima.
5. Hutang pelanggan ("nanti sore dibayar") dicatat di kertas dan hilang; transaksi salah dihapus diam-diam; tidak ada jejak siapa mengubah apa.

### 1.2 Solusi
Aplikasi pembukuan transaksi konter yang **murni mencatat** (bukan menjalankan transaksi):
1. Satu form transaksi dinamis: pilih jenis transaksi, form berubah mengikuti jenisnya — detail, sumber dana, nominal, dan biaya admin mengikuti jenis itu.
2. Saldo catatan 5 kelompok akun (Kas, Bank, E-Wallet, Server Pulsa, Aplikasi Provider) bergerak otomatis dari pencatatan transaksi, lengkap dengan mutasi per akun.
3. Biaya admin terisi otomatis dari Master Tarif per range nominal (tetap atau persentase), konsisten antar petugas.
4. Modal dan harga jual dicatat di Master Produk lokal (diisi sekali oleh owner/admin), terisi otomatis saat transaksi — kasir tidak melihat modal dan tidak menginput modal tiap transaksi.
5. Serah terima shift 7 langkah: hitung fisik vs sistem per akun, selisih wajib penjelasan, konfirmasi PIN pengirim + penerima, shift baru mulai dari angka fisik yang diterima.
6. Void bukan hapus, koreksi saldo manual khusus owner/admin, jejak audit lengkap, tutup harian, backup & ekspor.

### 1.3 Janji produk (satu kalimat)
> "Setiap rupiah konter tercatat — dari mana datangnya, ke mana perginya, dan siapa yang memegangnya di setiap shift."

### 1.4 Prinsip yang tidak boleh dilanggar (baca dulu sebelum coding)
1. **Murni pencatatan (keputusan user v1.2, keras).** Aplikasi ini HANYA mencatat. Tidak memanggil Digiflazz, tidak menulis balik ke Supabase produk, tidak menjalankan penjualan pulsa / deposit / transfer, tidak mengubah saldo asli di Server Pulsa, bank, atau e-wallet. Akses ke Supabase hanya baca (SELECT) katalog produk — dipakai hanya nama / operator / denominasi produk untuk dicatat. Saldo di aplikasi ini adalah saldo **CATATAN** terpisah, bukan saldo live. Deposit server di aplikasi ini hanya **dicatat**, bukan dilakukan.
2. **Modal dicatat di master (keputusan user v1.3).** Modal + harga jual pulsa / data / token diisi sekali oleh owner/admin di Master Produk lokal, terisi otomatis saat transaksi. Kasir tidak melihat modal dan tidak menginput modal tiap transaksi. Perubahan master hanya berlaku ke depan; tiap transaksi menyimpan snapshot modal + jual saat kejadian.
3. **Saldo tidak diketik bebas (kecuali koreksi terkunci).** Saldo hanya bergerak karena transaksi, mutasi internal, serah terima shift, atau Koreksi Saldo Manual oleh Owner/Admin dengan alasan tercatat. Kasir / staff tidak bisa melihat menu koreksi saldo.
4. **Transaksi tersimpan tidak dihapus.** Salah input diperbaiki dengan void (alasan + jejak audit, saldo & stok dikembalikan), bukan hapus.
5. **Satu transaksi bisa menggerakkan banyak akun.** Tarik tunai menggerakkan bank dan kas sekaligus, dalam satu kali simpan — kalau satu gagal, semua batal (transaksi database atomik).
6. **Uang fisik selalu dibandingkan dengan angka sistem.** Setiap tutup shift dan tutup harian, selisih dicatat — bukan ditutupi.
7. **Debit Rekening = potong dari nominal (keputusan user 8 Nov 2026, DIKUNCI).** Bila admin dibayar dengan Debit Rekening, yang keluar dari sumber dana adalah nominal − admin. Contoh yang mengikat di seluruh dokumen: transfer Rp500.000, admin Rp5.000, Debit Rekening → sumber dana keluar **Rp495.000**, pelanggan membayar **Rp500.000**, laba tetap Rp5.000. Rumus lama (sumber keluar Rp505.000) TIDAK dipakai lagi di mana pun.
8. **Hutang-piutang versi simpel masuk MVP (keputusan user 8 Nov 2026, DIKUNCI).** Lihat penjelasan bahasa sederhana di §4 dan rincian di §5.5 / §6.1. Yang ditunda ke v1.1 hanya lanjutannya: pelunasan sebagian / cicilan, umur hutang, dan pengingat.
9. **Stack dikunci: Vue 3 + Capacitor (keputusan user 8 Nov 2026), bukan Flutter.** Alasan user: lebih ringan dan update bagian web bisa dikirim tanpa install ulang APK. Batas jujurnya ada di §10: perubahan shell native tetap butuh APK baru.
10. **Tidak ada data tarif awal — user mengisi sendiri lewat form Master Tarif (keputusan user 8 Nov 2026, DIKUNCI).** Tabel `admin_fee_rules` KOSONG saat install pertama; tidak ada aturan tarif yang di-seed dari dokumen ini. User (Owner/Admin) membuat sendiri range tarifnya lewat form Master Tarif di aplikasi, meniru form Pengaturan_Margin di BG-APP (lihat §5.4). Dua contoh user di §5.4 (Rp20rb–<Rp100rb → Rp3.000; ≥Rp5jt → 0,4%) HANYA contoh + kasus uji, BUKAN data seed. Sampai ada aturan yang cocok, admin = Rp0 + banner "belum ada tarif" (§5.4.1 poin 4).
11. **Tidak ada data master awal — master lokal kosong saat install pertama, user mengisi sendiri lewat form input (keputusan user 8 Nov 2026, DIKUNCI).** Akun saldo, produk voucher / perdana / aksesoris, pelanggan, dan aturan tarif semuanya KOSONG saat install pertama — tidak ada satu pun data contoh yang di-seed (akun contoh, produk contoh, pelanggan contoh semuanya dilarang). Owner/Admin mengisi sendiri lewat form input di aplikasi (lihat §5). PENGECUALIAN: identitas produk yang SUDAH ADA di katalog Supabase Server Pulsa (pulsa, paket data, token PLN, dan produk katalog lainnya) tetap ditarik read-only ke `product_catalog_cache` (nama / operator / denominasi + `external_product_ref`) — user TIDAK perlu mengetik ulang produk-produk itu; yang tetap diisi manual lewat form Master Produk lokal adalah modal + harga jual per produk itu (lihat §5.3). Contoh-contoh di dokumen ini (nama bank, nama produk, angka hitungan) HANYA contoh penulisan + kasus uji, BUKAN data bawaan.

### 1.5 Bukan produk ini (out of scope permanen untuk v1)
- Bukan aplikasi kasir penjualan pulsa / server pulsa — penjualan tetap dijalankan di aplikasi Server Pulsa yang sudah ada; aplikasi ini hanya mencatat hasilnya.
- Bukan dompet digital / payment — tidak ada transfer uang sungguhan, top-up sungguhan, deposit sungguhan, atau koneksi rekening bank otomatis.
- Bukan akuntansi perusahaan (tidak ada jurnal double-entry formal, neraca, PPh).
- Bukan multi-cabang / loyalti di v1.
- Bukan sync cloud / multi-HP di MVP — itu v2 dan belum diputuskan (lihat §10, §14).

---

## 2. Tujuan & Tolok Ukur Sukses

| Tujuan | Tolok ukur MVP (uji di HP user, di konter, dengan transaksi nyata) |
|---|---|
| Input terasa ringan untuk kasir | Tambah transaksi ≤ 15 detik, ≤ 6 ketukan dari Home; transaksi yang paling sering (pulsa, transfer, tarik tunai) bisa diselesaikan tanpa scroll |
| Admin konsisten antar petugas | 10 transaksi transfer / tarik tunai dengan nominal sama diuji 2 petugas berbeda → biaya admin yang terisi otomatis sama persis 10/10 |
| Laba bisa dipercaya | Laba per transaksi = harga jual − modal dari master (bukan tebakan); rekap laba harian cocok dengan hitung manual owner dari 20 transaksi sampel (selisih Rp0) |
| Saldo catatan bisa dipertanggungjawabkan | Setelah 1 hari penuh transaksi nyata, tutup shift pertama: selisih per akun bisa dijelaskan (Rp0 atau ada penjelasan tercatat), dan shift baru mulai dari angka fisik yang diterima |
| Serah terima benar-benar dipakai | Pergantian shift selesai ≤ 5 menit termasuk hitung fisik kas; dokumen serah terima tersimpan dan tidak bisa diubah setelah konfirmasi PIN berdua |
| Stok tidak bocor diam-diam | Jual 5 voucher → stok berkurang tepat 5; void 1 transaksi voucher → stok kembali +1; stok tidak bisa minus tanpa peringatan keras |
| Aplikasi stabil & ringan | Cold start ≤ 2 detik di HP mid-range; tidak crash saat input 50 transaksi berturut-turut; semua data tetap ada setelah restart / update aplikasi |
| Offline penuh | Matikan internet & data → semua fitur MVP jalan (kecuali penyegaran katalog produk Supabase, yang memang hanya baca dan boleh pakai cache lokal) |

---

## 3. Persona & User Story

**Persona utama:** bengkel (owner konter di Samarinda) dan petugas shift / kasirnya. Owner memegang uang, harga, dan tarif; kasir melayani pelanggan secepat mungkin di HP konter; admin membantu owner mengatur master dan mengesahkan tutup harian. Satu perangkat utama di konter untuk MVP; akun owner terpisah untuk persetujuan dan laporan.

Peran dan hak akses lengkap ada di §6.10. Ringkasnya: Owner = semua; Admin = semua kecuali (tidak ada — admin sama dengan owner, kecuali hal yang secara eksplisit dicatat sebagai owner saja di §6.10); Kasir = input transaksi + serah terima sebagai pihak, tidak bisa melihat modal/laba, tidak bisa ubah master/tarif, tidak bisa koreksi saldo manual, tidak bisa void sendiri (minta persetujuan PIN admin).

### 3.1 User story MVP (wajib semua)

**Akun saldo & dashboard**
- US-01: Sebagai owner, saya bisa melihat saldo catatan tiap akun (Kas, tiap Bank, tiap E-Wallet, Server Pulsa, Aplikasi Provider) dan totalnya di Home, supaya saya tahu posisi uang konter saat ini tanpa buka 5 aplikasi.
- US-02: Sebagai owner/admin, saya bisa tambah akun saldo baru (mis. rekening bank baru) dengan saldo awal, supaya akun baru langsung bisa dipakai sebagai sumber dana / penerima.
- US-03: Sebagai owner/admin, saya bisa membuka mutasi tiap akun (tanggal, transaksi asal, masuk/keluar, saldo sebelum–sesudah, petugas) supaya selisih bisa ditelusur ke transaksi pembentuknya.
- US-04: Sebagai owner/admin, saya bisa melakukan Koreksi Saldo Manual (akun, saldo sistem, saldo seharusnya, selisih otomatis, alasan wajib) supaya selisih yang sah (mis. biaya admin bank otomatis) bisa dicatat — kasir tidak bisa melihat menu ini sama sekali.

**Master data**
- US-05: Sebagai owner/admin, saya bisa input master voucher / perdana / aksesoris (nama, operator/kategori, modal, jual, stok awal) supaya petugas tinggal memilih saat transaksi.
- US-06: Sebagai owner/admin, saya bisa input master produk pulsa / data / token di Master Produk lokal (identitas dari katalog Supabase read-only + modal & harga jual lokal) supaya kasir tinggal memilih produk dan modal terisi otomatis.
- US-07: Sebagai owner/admin, saya bisa input master bank & e-wallet (nama, pemilik, nomor rekening / HP) supaya muncul sebagai pilihan detail dan sumber dana.
- US-08: Sebagai owner/admin, saya bisa input Master Tarif Biaya Admin per range nominal (lihat §5.4) supaya admin terisi otomatis dan konsisten antar petugas.
- US-09: Sebagai owner/admin, saya bisa menonaktifkan (bukan menghapus) master yang sudah pernah dipakai transaksi, supaya riwayat dan stok tetap bisa ditelusur.

**Form transaksi (inti produk)**
- US-10: Sebagai kasir, saya bisa tambah transaksi dengan tanggal otomatis (tidak bisa diubah kasir), jenis transaksi, detail yang berubah mengikuti jenisnya, sumber dana (bila relevan), nominal, dan biaya admin — supaya satu form melayani semua jenis transaksi konter.
- US-11: Sebagai kasir, saya bisa memilih cara bayar admin di sebelah nominal — **Cash** atau **Debit Rekening** — supaya akun yang menanggung admin jelas dan rumus saldonya benar (lihat §6.4).
- US-12: Sebagai kasir, saya bisa memilih metode terima dari pelanggan (Tunai / Non-Tunai) dan akun penerima (Diterima Di) supaya jelas uang pelanggan masuk ke akun mana.
- US-13: Sebagai kasir, saya bisa menjual beberapa item sekaligus dalam satu kunjungan (keranjang: tambah item, satu pembayaran, satu struk) supaya tidak ada item yang terlewat dicatat.
- US-14: Sebagai kasir, saya bisa melihat ringkasan saldo sebelum–sesudah saat Simpan ditekan, supaya saya langsung tahu dampak transaksi itu ke saldo.
- US-15: Sebagai kasir, saya bisa membagikan struk transaksi ke WhatsApp pelanggan atau mencetaknya di printer thermal Bluetooth, supaya komplain bisa dicocokkan dengan catatan sistem.

**Stok**
- US-16: Sebagai kasir, saya bisa menjual voucher / perdana / aksesoris dan stok berkurang otomatis 1 per item, supaya stok catatan selalu mengikuti penjualan.
- US-17: Sebagai owner/admin, saya bisa melihat daftar stok menipis / habis dan melakukan opname stok (hitung fisik vs catatan, selisih tercatat) supaya stok fisik dan catatan tidak diam-diam berbeda.

**Shift & serah terima**
- US-18: Sebagai kasir, saya bisa buka shift (login PIN, konfirmasi saldo awal dari serah terima sebelumnya) dan tutup shift (minta tutup → sistem kunci input baru untuk shift itu).
- US-19: Sebagai kasir lama + kasir baru, kami bisa menghitung fisik bersama (uang tunai per pecahan, saldo bank/e-wallet/server dicek dari aplikasi aslinya lalu diketik), melihat selisih per akun (Pas / Lebih / Kurang), dan wajib memberi penjelasan bila ada selisih.
- US-20: Sebagai kasir lama + kasir baru, kami bisa mengonfirmasi serah terima dengan PIN masing-masing, dan shift baru mulai dari angka fisik yang diterima (bukan angka sistem lama).

**Tutup harian, void, audit, laporan, data**
- US-21: Sebagai owner/admin, saya bisa mengesahkan tutup harian (rekap 1 hari: pendapatan jasa, laba barang & pulsa, pengeluaran, selisih, saldo akhir semua akun) dan mengunci hari itu; hari terkunci tidak bisa ditambah transaksi tanpa buka kunci tercatat.
- US-22: Sebagai owner/admin, saya bisa membatalkan (void) transaksi yang salah dengan alasan + PIN admin, dan saldo & stok kembali otomatis; baris aslinya tetap terlihat dengan status Batal.
- US-23: Sebagai owner, saya bisa melihat jejak audit (siapa, melakukan apa, kapan: login, input, void, koreksi saldo, ubah harga/modal, buka kunci tutup harian) supaya perselisihan bisa dibuktikan.
- US-24: Sebagai owner/admin, saya bisa melihat laporan per shift, per hari, laba per kategori (jasa transfer/tarik tunai, pulsa/data, voucher, perdana, aksesoris), mutasi per akun, dan piutang — semua angka bisa diklik untuk melihat transaksi pembentuknya.
- US-25: Sebagai owner, saya bisa export transaksi dan laporan ke spreadsheet (CSV) per periode dan backup-restore data lokal, supaya kehilangan HP tidak berarti kehilangan pembukuan.
- US-26: Sebagai kasir, saya bisa menandai transaksi sebagai **Hutang** (nama pelanggan wajib diisi), melihat daftar piutang per pelanggan, dan menandai **Lunas penuh** saat pelanggan membayar — supaya hutang "nanti sore dibayar" tidak lagi dicatat di kertas dan hilang. (Ini versi simpel yang masuk MVP; cicilan / bayar sebagian masuk v1.1, lihat §3.2.)

### 3.2 User story v1.1 (penting, setelah MVP stabil — jangan dikerjakan di MVP)
- US-26L: Lanjutan hutang-piutang (SETELAH versi simpel US-26 yang sudah masuk MVP): pelunasan sebagian / cicilan, umur hutang, dan pengingat hutang. Bukan pengganti US-26 — US-26 tetap dikerjakan di MVP.
- US-27: Peringatan saldo menipis & stok menipis (ambang per akun / barang, mis. server di bawah Rp200.000 atau voucher tinggal 2) di dashboard.
- US-28: Foto bukti transaksi (foto bukti transfer / struk) tersimpan lokal dan bisa dibuka dari detail transaksi.
- US-29: Opname berkala terpandu (sistem menunjuk kategori yang dihitung bergilir per shift) dan opname penuh mingguan.
- US-30: Laporan perbandingan antar periode (minggu/bulan ini vs sebelumnya) dan Top 10 layanan berdasarkan profit.

### 3.3 User story v2 (nice to have, jangan dikerjakan di MVP maupun v1.1)
- US-31: Sinkronisasi antar perangkat (owner memantau dari HP lain) dan cadangan cloud otomatis — hanya setelah diputuskan user (lihat §14).
- US-32: Multi-cabang.
- US-33: Pengingat hutang via WhatsApp.
- US-34: Penyegaran katalog produk terjadwal dari Supabase (tetap hanya baca).

---

## 4. Scope & Prioritas

| Fitur | MVP (Fase 1) | v1.1 | v2 |
|---|---|---|---|
| Login PIN per user, peran Owner/Admin/Kasir | ✅ | | |
| Akun saldo 5 kelompok + mutasi per akun | ✅ | | |
| Koreksi Saldo Manual khusus Owner/Admin (alasan wajib + audit) | ✅ | | |
| Master: akun bank/e-wallet, server/provider, voucher, perdana, aksesoris | ✅ | | |
| Master Produk lokal pulsa/data/token (modal + jual, katalog Supabase read-only) | ✅ | | |
| Master Tarif Biaya Admin per range (tetap/persentase, validasi overlap & celah) | ✅ | | |
| Form transaksi dinamis 12 jenis + keranjang multi-item | ✅ | | |
| Pilihan admin Cash / Debit Rekening di sebelah nominal | ✅ | | |
| Metode terima Tunai/Non-Tunai + Diterima Di | ✅ | | |
| Struk WhatsApp / cetak thermal Bluetooth | ✅ | | |
| Stok otomatis −1 saat simpan, +1 saat void (voucher/perdana/ACC) | ✅ | | |
| Serah terima shift 7 langkah + dokumen serah terima | ✅ | | |
| Tutup harian + kunci hari | ✅ | | |
| Void (bukan hapus) + audit trail | ✅ | | |
| Laporan per shift/hari, laba per kategori, mutasi per akun | ✅ | | |
| Export CSV + backup-restore lokal | ✅ | | |
| Hutang-piutang pelanggan — versi simpel: status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang, tombol Lunas penuh | ✅ | | |
| Hutang-piutang lanjutan: pelunasan sebagian / cicilan, umur hutang, pengingat | | ✅ | |
| Peringatan saldo/stok menipis, opname terpandu | | ✅ | |
| Foto bukti transaksi | | ✅ | |
| Laporan perbandingan antar periode, Top 10 layanan | | ✅ | |
| Sync antar perangkat, cadangan cloud otomatis | | | ✅ |
| Multi-cabang, pengingat hutang via WhatsApp | | | ✅ |

**Aturan scope:** fitur v1.1/v2 tidak boleh menghambat MVP. Jangan buat tabel/skema yang "sekadar jaga-jaga" untuk v2 kalau tidak dipakai MVP, kecuali kolom yang memang sudah tercantum di §9. **Penjelasan hutang-piutang dengan bahasa sederhana (poin ini sempat membuat user bingung, jadi ditulis terang di sini):** di rancangan awal hutang-piutang tertulis MVP (dikerjakan di versi pertama); PRD v1.0 sempat memindahnya ke v1.1 (baru dikerjakan setelah versi pertama stabil, jadi versi pertama hanya mencatat Lunas dan hutang tetap di kertas). **Keputusan user 8 Nov 2026 (DIKUNCI — "kita pakai versi MVP"): versi simpelnya DIKEMBALIKAN ke MVP** — versi pertama sudah bisa status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang, dan tombol Lunas penuh. Yang tetap v1.1 hanya lanjutannya: bayar sebagian / cicilan, umur hutang, dan pengingat.

---

## 5. Master Data — Wajib Sesuai Ini di MVP

### 5.1 Prinsip master data
- **TIDAK ADA data master awal (keputusan user 8 Nov 2026, DIKUNCI — lihat §1.4 poin 11).** Semua master lokal — akun saldo, produk voucher / perdana / aksesoris, pelanggan, aturan tarif — KOSONG saat install pertama. Tidak ada akun contoh, produk contoh, atau pelanggan contoh yang di-seed. Owner/Admin mengisi sendiri lewat form input di aplikasi (US-02, US-05–US-09). PENGECUALIAN: identitas produk pulsa / data / token yang SUDAH ADA di katalog Supabase Server Pulsa tetap ditarik read-only ke cache (lihat §5.3) — user tidak perlu mengetik ulang produk-produk itu, yang diisi manual hanya modal + harga jualnya.
- Master diisi sekali di awal, ditambah saat ada barang / akun / aturan baru. Saat transaksi, petugas cukup memilih dari daftar — nama, harga jual, dan modal selalu konsisten.
- Barang / akun / aturan yang sudah pernah dipakai transaksi **tidak bisa dihapus**, hanya dinonaktifkan. Yang nonaktif tidak muncul di pilihan tambah transaksi, tapi riwayatnya tetap ada.
- Semua perubahan master (tambah, ubah harga/modal, nonaktifkan) hanya boleh dilakukan Owner/Admin dan tercatat di audit log (§6.9) dengan nama petugas + waktu + nilai lama → nilai baru.
- Impor awal: sediakan template spreadsheet sederhana untuk mengisi master dan stok awal secara massal, supaya setup awal tidak diketik satu per satu di HP. Template itu KOSONG — hanya judul kolom, tanpa satu pun baris data contoh di dalamnya.
- Semua nominal di master = integer Rupiah. Jangan simpan uang sebagai string "Rp ..." dan jangan parse string uang di mana-mana (pelajaran dari BG-APP — lihat §5.5).

### 5.2 Akun saldo — 5 kelompok, satu perlakuan (diadaptasi dari 5 Sumber Dana BG-APP)
Semua tempat uang konter diperlakukan sebagai "akun saldo catatan" dengan struktur yang sama. Menambah bank atau server baru cukup tambah satu baris master, tanpa mengubah program.

| Kelompok akun | Contoh | Kode kelompok |
|---|---|---|
| Kas (Uang Tunai) | Laci kas per shift, brankas owner | `cash` |
| Bank (Rekening Bank) | BCA, BRI, Mandiri, BNI — bisa lebih dari satu rekening per bank | `bank` |
| E-Wallet | DANA, OVO, GoPay, ShopeePay | `ewallet` |
| Server Pulsa (catatan) | Saldo deposit di server yang dipakai konter — di sini hanya dicatat angkanya | `server` |
| Aplikasi Provider (catatan) | Aplikasi agen resmi operator / PPOB yang saldonya terpisah | `provider` |

Field setiap akun: nama akun, kelompok, nomor rekening / nomor HP akun (bila relevan), nama pemilik, saldo awal catatan, status aktif/nonaktif, dibuat oleh + tanggal. Semua field diisi lewat **form Tambah Akun** (Owner/Admin saja, US-02 / US-07) — tidak ada akun yang dibuat otomatis.
**Saldo awal:** saldo awal catatan WAJIB diisi di form Tambah Akun saat akun dibuat (integer Rupiah, boleh 0) — tercatat sebagai **saldo awal, bukan transaksi** (tidak muncul sebagai pemasukan/pengeluaran/laba di laporan). Setelah akun dibuat, saldo awal tidak bisa diubah lewat form — perubahan berikutnya hanya lewat Koreksi Saldo Manual (§6.8), dengan alasan tercatat. Tidak ada menu "Saldo Awal / Opname Awal" terpisah.
**Saldo saat ini** tidak disimpan sebagai angka yang diedit manual — dihitung sistem: saldo awal + semua mutasi catatan akun itu (dari transaksi, mutasi internal, koreksi, serah terima). Lihat §9.
**Tidak ada akun contoh (DIKUNCI).** Daftar akun KOSONG saat install pertama — nama-nama di tabel di atas (BCA, BRI, DANA, dsb.) hanya contoh penulisan, BUKAN data bawaan. User membuat sendiri akunnya lewat form Tambah Akun.

### 5.3 Produk — Master Produk lokal (semua produk, satu master)

| Master | Field | Stok? | Modal terlihat siapa? |
|---|---|---|---|
| Voucher | Operator, nama voucher, kuota / masa aktif, modal, jual, stok awal, kode / serial bila dilacak | Ya | Owner/Admin saja |
| Kartu Perdana | Operator, jenis perdana, nomor / serial bila dilacak, modal, jual, stok | Ya | Owner/Admin saja |
| Aksesoris | Nama barang, kategori (charger, kabel, casing, earphone, dll.), modal, jual, stok, satuan | Ya | Owner/Admin saja |
| Pulsa / Paket Data / Token PLN | Identitas dari katalog Supabase read-only (nama, operator, denominasi / paket, jenis) + `external_product_ref`; modal & harga jual dicatat di Master Produk lokal ini | Tidak | Owner/Admin saja |

**TIDAK ADA produk contoh (DIKUNCI).** Master Produk lokal KOSONG saat install pertama — tidak ada voucher, perdana, atau aksesoris contoh yang di-seed. Owner/Admin menginput sendiri lewat **form Master Produk** (tambah / ubah / nonaktif, US-05 / US-06): voucher & perdana & aksesoris diinput manual lengkap (nama, operator/kategori, modal, harga jual, stok awal, kode/serial bila dilacak).
**PENGECUALIAN — produk yang sudah ada di Supabase (DIKUNCI):** untuk pulsa / paket data / token PLN dan produk katalog lainnya yang SUDAH ADA di katalog Supabase Server Pulsa, identitasnya (nama, operator, denominasi / paket, jenis) tetap ditarik read-only ke `product_catalog_cache` + `external_product_ref` — user TIDAK perlu mengetik ulang produk-produk itu. Di form Master Produk, produk Supabase dipilih dari daftar katalog (bukan diketik), lalu owner/admin mengisi manual hanya modal + harga jualnya. Produk Supabase yang belum diisi modal + jualnya tidak bisa dipilih di transaksi (lihat aturan di bawah).
**Aturan modal di master (keputusan user v1.3, tegas):**
- Modal + harga jual diisi sekali oleh owner/admin per produk di Master Produk lokal. Terisi otomatis saat transaksi. Kasir **tidak melihat modal** (di form kasir, field modal tidak tampil sama sekali — bukan disembunyikan dengan teks samar) dan **tidak menginput modal** tiap transaksi.
- Perubahan modal / jual di master hanya berlaku ke depan dan tidak mengubah riwayat lama — riwayat selalu menyimpan modal dan harga saat transaksi terjadi (snapshot di `transaction_items`, §9).
- **Alur data produk satu arah, hanya baca:** Supabase Server Pulsa → aplikasi ini membaca daftar produk → produk tampil sebagai pilihan → petugas memilihnya untuk dicatat. Tidak ada arah sebaliknya: tidak ada simpan / update / hapus / sinkronisasi balik, harga dan stok di Supabase tidak diubah, dan data itu tidak dipakai untuk menjalankan transaksi.
- Katalog produk boleh di-cache lokal supaya form tetap jalan saat offline. Cache tidak pernah menulis balik ke Supabase.
- Kalau produk di katalog Supabase tidak ditemukan di Master Produk lokal (belum diisi modalnya), produk itu tidak bisa dipilih untuk transaksi — tampilkan pesan "Produk ini belum ada modal di master. Minta owner/admin isi dulu." Jangan izinkan kasir mengisi modal darurat di form transaksi.

### 5.4 Master Tarif Biaya Admin / Margin (diadaptasi dari Pengaturan_Margin BG-APP)

> Di BG-APP, biaya admin = margin = keuntungan. PRD ini memakai istilah yang sama di logika inti (`admin_fee_rules`, `adminAmount`, `profit`), tetapi teks yang tampil ke user tetap "Biaya Admin".

**Form Master Tarif meniru form Pengaturan_Margin di BG-APP (keputusan user 8 Nov 2026, DIKUNCI).** Layar Master Tarif di aplikasi ini adalah padanan form `Pengaturan_Margin` BG-APP: field Tipe Perhitungan (Range Nominal / Persentase), Layanan Terkait multi-select, Nominal Awal, Nominal Akhir, dan nilai biaya — dipetakan ke field di tabel di bawah ini. Bedanya dengan BG-APP: form ini wajib punya validasi §5.4.2 (tolak overlap, peringatkan celah — tidak ada di BG-APP) dan pembulatan persentase wajib `Math.ceil` (bukan `Math.round` BG-APP).

**TIDAK ADA data tarif awal (DIKUNCI).** Tabel `admin_fee_rules` kosong saat install pertama — tidak ada satu pun aturan yang di-seed dari dokumen ini. User (Owner/Admin) membuat sendiri semua range tarifnya lewat form ini (tombol Tambah / Ubah / Hapus aturan + Aktif/Nonaktif; hanya Owner/Admin yang bisa masuk layar ini, kasir tidak melihat menunya). Contoh aturan di bawah ini HANYA contoh + kasus uji QA (untuk unit test, aturan contoh dimasukkan sebagai fixture test, bukan seed aplikasi). Selama belum ada aturan yang cocok untuk suatu nominal/layanan, admin = Rp0 + banner "belum ada tarif" (§5.4.1 poin 4).

**Field form Isi Aturan Tarif (satu aturan):**

| Field | Aturan |
|---|---|
| Nama aturan | Bebas, mis. "Admin standar 20rb–100rb". Wajib diisi. |
| Nominal awal (dari) | Batas bawah range, **inklusif** (`>=`). Contoh: Rp20.000. Nominal yang persis sama dengan batas ini masuk ke aturan ini. Wajib diisi, integer ≥ 0. |
| Nominal akhir (sampai) | Batas atas range, **eksklusif** (`<`). Contoh: Rp100.000 berarti berlaku untuk nominal Rp20.000 s.d. Rp99.999. Boleh dikosongkan = tanpa batas atas ("Rp5.000.000 ke atas"). Bila diisi, harus > nominal awal. |
| Berlaku untuk transaksi | Pilihan banyak (centang): Transfer, Tarik Tunai, Top Up E-Wallet, Bayar Tagihan / PPOB, Pulsa, Paket Data, Token PLN, Voucher, Perdana, Aksesoris, dan jenis lain yang memakai admin. Hanya transaksi tercentang yang memakai aturan ini. Minimal 1 tercentang. |
| Tipe biaya | Pilih satu: **Tetap** (flat, Rupiah) atau **Persentase** (% dari nominal). Tidak ada tipe ketiga, dan deteksi tipe tidak boleh lewat substring teks (pelajaran dari BG-APP — tipe disimpan sebagai enum `fixed` / `percent`). |
| Nilai biaya | Mengikuti tipe: Rupiah untuk Tetap (mis. Rp3.000), persen untuk Persentase (mis. 0,4 — simpan sebagai per-seribu / desimal tetap di kode, bukan string "0,4%"). Untuk Persentase, nilai harus > 0 dan ≤ 100. |
| Pembulatan (khusus Persentase) | **DIKUNCI (keputusan user 8 Nov 2026): selalu bulatkan KE ATAS ke Rupiah terdekat — `admin = Math.ceil(nominal × persen / 100)` dalam integer Rupiah.** Tidak ada pilihan lain: tanpa pembulatan ke Rp100 / Rp500 / Rp1.000 terdekat, dan tanpa arah ke bawah / ke terdekat. Biaya Tetap tidak dibulatkan (nilainya sudah bulat). |
| Status | Aktif / Nonaktif. Yang nonaktif tidak dipakai sistem. |
| Prioritas / urutan | Dihitung sistem, bukan diisi manual: lihat §5.4.1. |

**Contoh aturan (contoh user — HANYA contoh + kasus uji QA, BUKAN data seed):**

| Range nominal | Berlaku untuk | Tipe | Biaya admin |
|---|---|---|---|
| Rp20.000 – < Rp100.000 | Tarik Tunai, Transfer, Top Up E-Wallet | Tetap | Rp3.000 |
| Rp100.000 – < Rp1.000.000 | Tarik Tunai, Transfer, Top Up E-Wallet | Tetap | Rp5.000 |
| Rp1.000.000 – < Rp5.000.000 | Transfer, Tarik Tunai | Tetap | Rp7.500 |
| Rp5.000.000 – tanpa batas | Transfer, Tarik Tunai, Top Up E-Wallet | Persentase | 0,4% × nominal |

Contoh hitung persentase: transfer Rp5.000.000 × 0,4% = admin Rp20.000. Transfer Rp10.000.000 × 0,4% = admin Rp40.000. Contoh pembulatan ke atas (DIKUNCI): transfer Rp5.123.456 × 0,4% = 20.493,824 → admin **Rp20.494** (selalu dibulatkan ke atas, bukan ke terdekat — `Math.round` akan menghasilkan Rp20.494 juga di contoh ini, tapi di nominal lain bisa berbeda; yang berlaku selalu `Math.ceil`). Contoh flat: tarik tunai Rp50.000 masuk range pertama, adminnya tetap Rp3.000.

#### 5.4.1 Rumus pencocokan tarif (diadaptasi dari `calculateDynamicMargin` BG-APP)
1. Ambil semua aturan **Aktif** yang layanannya mencakup jenis transaksi ini.
2. Urutkan berdasarkan nominal awal **terbesar dulu** (descending).
3. Cocokkan satu per satu, first-match menang:
   - **Tetap:** cocok bila `nominal >= nominalMin DAN (nominalMax kosong ATAU nominal < nominalMax)` → admin = nilai tetap.
   - **Persentase:** cocok bila `nominal >= nominalMin DAN (nominalMax kosong ATAU nominal < nominalMax)` → admin = `Math.ceil(nominal × persen / 100)` — **selalu dibulatkan KE ATAS ke Rupiah terdekat** (keputusan user 8 Nov 2026, DIKUNCI). Ini MENGGANTIKAN `Math.round` di BG-APP lama, yang membulatkan ke terdekat.
4. **Tidak ada aturan yang cocok → admin Rp0 + banner kuning di form: "Belum ada tarif untuk nominal ini — admin Rp0. Minta owner/admin atur tarifnya."** Tidak ada fallback hardcoded (pelajaran dari BG-APP: jangan ada angka 5000/3000 tersembunyi di kode).
5. Yang dicocokkan adalah **nominal pokok** transaksi, bukan nominal + admin. Untuk keranjang multi-item, pencocokan memakai nominal per item jasa (bukan total keranjang).
6. Admin yang terisi otomatis masih bisa diubah petugas di form (bila ada kesepakatan khusus), dan perubahan dari tarif otomatis itu tercatat di transaksi (`adminFeeRuleId` + `adminFeeManualOverride` + alasan bila diubah — alasan wajib bila admin diubah jadi Rp0).
7. Perubahan tarif hanya berlaku ke depan. Transaksi lama tetap menyimpan biaya admin saat kejadian, sehingga laporan masa lalu tidak berubah.
8. Hanya Owner/Admin yang bisa membuat, mengubah, atau menonaktifkan aturan tarif. Kasir hanya menerima hasil otomatisnya di form transaksi.

#### 5.4.2 Validasi tarif — BARU, tidak ada di BG-APP (wajib di MVP)
1. **Tolak simpan** bila range baru tumpang-tindih (overlap) dengan aturan Aktif lain untuk layanan yang sama. Pesan harus menyebut aturan mana yang bentrok (nama aturan + range-nya), bukan sekadar "Range bentrok".
2. **Peringatan (boleh simpan, tapi tampilkan)** bila ada celah nominal yang tidak tercakup aturan mana pun untuk suatu layanan (mis. ada aturan 20rb–100rb dan 200rb ke atas, tapi 100rb–200rb kosong). Tampilkan celah itu secara eksplisit di daftar tarif ("Celah: Rp100.000 – < Rp200.000 belum ada tarif untuk Transfer").
3. **Tolak simpan** bila nominal akhir terisi dan ≤ nominal awal; bila nilai biaya ≤ 0; bila persentase > 100; bila tidak ada layanan tercentang.
4. Validasi berjalan di sisi aplikasi (bukan hanya di UI form) supaya tidak bisa dilewati.

### 5.5 Pelanggan (MVP untuk hutang versi simpel)
Nama, nomor HP, catatan. Dipakai untuk hutang-piutang versi simpel (§3.1 US-26, §4), riwayat, dan pelanggan langganan. Di MVP sudah ada daftar pelanggan sederhana + daftar piutang per pelanggan + tombol Lunas penuh. **Daftar pelanggan KOSONG saat install pertama — tidak ada pelanggan contoh yang di-seed.** Pelanggan baru dibuat lewat **form Master Pelanggan** (tambah / ubah / nonaktif, Owner/Admin) atau dari form transaksi saat status bayar = Hutang (nama wajib, nomor HP opsional). Pelunasan sebagian / cicilan, umur hutang, dan pengingat = v1.1.

### 5.6 Petugas / User
Nama, PIN (disimpan sebagai hash, bukan PIN mentah — lihat §11), peran (owner / admin / kasir), status aktif. Setiap transaksi dan serah terima selalu atas nama seseorang. PIN dipakai untuk login shift dan untuk konfirmasi (void, serah terima, koreksi saldo, buka kunci tutup harian). **Tidak ada petugas contoh yang di-seed** — satu-satunya akun petugas yang dibuat di awal adalah akun Owner yang dibuat user sendiri di layar setup pertama (nama + PIN, lihat §14 poin 4); petugas lain ditambah Owner/Admin lewat form Master Petugas.

### 5.7 Yang TIDAK boleh disalin dari BG-APP (daftar larangan untuk Gemini)
- Uang disimpan sebagai string "Rp ..." + parse di mana-mana → di aplikasi ini semua nominal integer Rupiah di semua lapisan.
- Deteksi persentase lewat substring 'persen' → tipe biaya adalah enum `fixed` / `percent`.
- Fallback margin hardcoded 5000/3000 → tidak ada angka fallback; tidak cocok = admin Rp0 + banner (§5.4.1 poin 4).
- Login di-bypass (`activeRole='Admin'` langsung) → login PIN wajib, peran dari tabel `users`, tidak ada peran default admin.
- Hard-delete transaksi tanpa jejak → void dengan alasan + audit (§6.9), baris asli tetap ada berstatus Batal.
- Tidak ada validasi range tumpang-tindih / celah → validasi §5.4.2 wajib.
- Tidak ada shift / serah terima, void, audit log → semuanya wajib di MVP (§6.7, §6.9).
- Pembulatan persentase pakai `Math.round` (BG-APP membulatkan ke terdekat) → di aplikasi ini WAJIB `Math.ceil` — selalu bulatkan ke atas ke Rupiah terdekat (§5.4, keputusan user 8 Nov 2026, DIKUNCI).

---

## 6. Fitur Inti — Spesifikasi Detail

### 6.1 Form transaksi dinamis — satu form, berubah mengikuti jenisnya
Form tidak menampilkan semua field sekaligus. Petugas memilih jenis transaksi terlebih dahulu, lalu form menampilkan hanya field yang relevan — lebih cepat dan mengurangi salah isi.

**Urutan field pada form:**

| Field | Perilaku |
|---|---|
| Tanggal & jam | Otomatis dari sistem (WITA), tidak bisa diubah kasir. Owner/admin dapat mengoreksi dengan alasan tercatat bila ada transaksi susulan. Tanggal tidak boleh > hari ini. |
| Shift & petugas | Otomatis dari sesi login dan shift yang sedang aktif. Tidak dipilih manual. Tidak ada shift aktif → form transaksi terkunci dengan pesan "Buka shift dulu". |
| Jenis transaksi | 12 jenis di §6.2. Pilih satu dulu, baru field lain muncul. |
| Detail transaksi | Berubah mengikuti jenis (cascading, §6.2): Transfer / Tarik Tunai / Top Up menampilkan daftar bank & e-wallet; Voucher / Perdana / Aksesoris menampilkan daftar barang dari master; Pulsa / Data / Token menampilkan pilihan produk dari katalog Supabase (hanya nama produknya) + nomor HP tujuan; modal & jual otomatis dari Master Produk lokal, bukan input petugas. |
| Sumber dana | Muncul untuk Transfer, Tarik Tunai, Top Up, Deposit, dan mutasi internal: akun bank / e-wallet / kas / server / provider tempat uang diambil, yang saldo catatannya bergerak sesuai arah transaksi (§6.4). |
| Nominal transaksi | Nominal pokok (jumlah yang ditransfer, ditarik, atau di-top up). Untuk barang: jumlah × harga jual, terisi otomatis dan masih bisa disesuaikan bila ada diskon (diskon tercatat, harga jual master tidak berubah). |
| Biaya admin / jasa | Terpisah dari nominal pokok — inilah pendapatan jasa konter. Terisi otomatis dari Master Tarif (§5.4). Petugas masih bisa mengubahnya bila ada kesepakatan khusus, dan perubahan dari tarif otomatis itu tercatat. |
| Bayar admin — di sebelah nominal | Pilihan ini diletakkan sejajar / di sebelah field nominal dan biaya admin pada baris yang sama, bukan di bagian bawah form. Pilihannya hanya dua: **Cash** atau **Debit Rekening**. Pilihan ini mengubah rumus saldo, lihat §6.4. |
| Metode terima dari pelanggan | Tunai atau Non-Tunai. Bila Non-Tunai, wajib pilih akun penerima (Diterima Di: bank / e-wallet tertentu) — menentukan akun mana yang bertambah. |
| Catatan & bukti | Opsional di MVP: nomor referensi, nama pengirim/penerima. Foto bukti transaksi = v1.1. |
| Status bayar | MVP: **Lunas** atau **Hutang** (versi simpel, §4). Bila Hutang: nama pelanggan wajib diisi dan transaksi masuk daftar piutang; pelunasan = tombol Lunas penuh. Cicilan / sebagian = v1.1. |

**Tampilan baris nominal–admin–cara bayar (satu baris, berdampingan — wajib seperti ini):**
`[Nominal Rp500.000] [Biaya Admin Rp5.000] [Bayar Admin: Cash | Debit Rekening]`
Petugas mengisi nominal, sistem mengisi biaya admin dari aturan range yang cocok, petugas memilih Cash atau Debit Rekening di sebelahnya. Bila tidak ada aturan cocok, admin Rp0 + banner "belum ada tarif" (§5.4.1 poin 4), dan admin diisi manual bila perlu.

**Tombol Simpan melakukan lima hal sekaligus — semuanya di dalam aplikasi ini saja, dalam satu transaksi database (atomik, kalau satu gagal semua batal):** (1) menyimpan catatan transaksi, (2) menggerakkan saldo catatan terkait, (3) mengurangi stok catatan bila barang, (4) mencatat mutasi catatan, dan (5) menampilkan ringkasan sebelum–sesudah (saldo tiap akun yang bergerak: sebelum → sesudah). Simpan tidak mengirim apa pun ke Server Pulsa / Digiflazz / bank / e-wallet dan tidak menjalankan penjualan.

**Pengaman pada form:** peringatan bila saldo catatan sumber dana tidak cukup — simpan hanya bisa dilanjutkan dengan persetujuan owner / PIN admin, dan dicatat. Peringatan bila nominal jauh di luar kebiasaan (mis. kelebihan satu nol — ambang: nominal > 10× rata-rata transaksi jenis itu 30 hari terakhir, atau > Rp10.000.000 untuk transaksi jasa). Tombol transaksi cepat untuk yang paling sering: nominal dan operator favorit tampil sebagai pilihan satu sentuh.

### 6.2 Jenis transaksi — 12 jenis + mutasi internal

| # | Jenis | Detail (cascading) | Sumber dana | Admin dari tarif? | Stok? |
|---|---|---|---|---|---|
| 1 | Transfer | Bank / e-wallet tujuan (dari master akun) + nama + nomor rekening tujuan | Wajib — akun pengirim konter | Ya | Tidak |
| 2 | Tarik Tunai | Bank / e-wallet asal transfer pelanggan (dari master akun) | Kas (otomatis — tunai yang diserahkan) | Ya | Tidak |
| 3 | Top Up E-Wallet | E-wallet tujuan + nomor HP tujuan | Wajib — saldo e-wallet / bank konter | Ya | Tidak |
| 4 | Pulsa | Produk dari katalog Supabase + nomor HP tujuan | Otomatis — Server Pulsa (catatan) | Tidak (laba = jual − modal) | Tidak |
| 5 | Paket Data | Produk dari katalog Supabase + nomor HP tujuan | Otomatis — Server Pulsa (catatan) | Tidak | Tidak |
| 6 | Token PLN | Produk dari katalog Supabase + nomor meter / ID pelanggan | Otomatis — Server Pulsa (catatan) | Tidak | Tidak |
| 7 | Voucher | Barang dari master voucher | — (stok) | Tidak (laba = jual − modal) | Ya, −1 |
| 8 | Perdana | Barang dari master perdana | — (stok) | Tidak | Ya, −1 |
| 9 | Aksesoris | Barang dari master aksesoris | — (stok) | Tidak | Ya, −1 |
| 10 | Bayar Tagihan / PPOB | Jenis tagihan (listrik, air, internet, dll.) + nomor pelanggan | Wajib — server / bank (catatan) | Ya | Tidak |
| 11 | Deposit Server (dicatat) | Server tujuan (dari master akun server) | Wajib — bank / kas (catatan) | Tidak | Tidak |
| 12 | Pengeluaran Operasional | Kategori wajib: listrik, sewa, plastik/struk, transport, dll. | Wajib — kas / bank | Tidak | Tidak |

**Mutasi internal (bukan jenis transaksi pelanggan, tidak dihitung sebagai laba/rugi):** Pindah Dana (antar akun), Topup Server Pulsa (dicatat), Topup Provider (dicatat), Tembak Voucher (dicatat), Setor Modal / Tarik Modal Owner. Masing-masing punya form sendiri yang sederhana (akun asal → akun tujuan → nominal → catatan) dan ditandai `isInternalTransfer = true` di data, dikeluarkan dari perhitungan pendapatan dan laba.

**Keranjang multi-item (MVP):** pelanggan konter sering membeli beberapa hal sekaligus. Sediakan mode "tambah item" dalam satu transaksi induk, dengan satu pembayaran dan satu struk, tetapi setiap item tetap menggerakkan saldo dan stoknya masing-masing (satu baris `transaction_items` per item, §9). Admin jasa dihitung per item jasa (bukan dari total keranjang).

### 6.3 Istilah uang internal (supaya rumus di §6.4 tidak ambigu)
- **Nominal:** jumlah pokok transaksi (yang ditransfer / ditarik / di-top up / harga jual barang).
- **Admin:** biaya jasa dari Master Tarif (§5.4), atau laba barang/digital bila tidak ada tarif.
- **hBeli:** jumlah yang keluar dari sumber dana (akun asal) untuk transaksi itu.
- **hJual:** jumlah yang diterima konter dari pelanggan untuk transaksi itu.
- **Profit / laba per transaksi = hJual − hBeli**, disimpan per transaksi (diadaptasi dari BG-APP: `profit = hargaJual − hargaBeli`). Untuk jasa: profit = admin. Untuk barang/digital: profit = (harga jual − modal) × jumlah.
- **Cash (Admin Di Luar / Tunai, diadaptasi dari BG-APP "Admin Di Luar"):** admin dibayar tunai di luar nominal. hBeli = nominal, hJual = nominal + admin.
- **Debit Rekening (Potong Dalam, diadaptasi dari BG-APP "Potong Dalam"):** admin dipotong dari nominal. hBeli = nominal − admin, hJual = nominal. **Keputusan user 8 November 2026, DIKUNCI — bukan default sementara.** Contoh yang benar: transfer Rp500.000, admin Rp5.000 Debit Rekening → hBeli = Rp495.000, hJual = Rp500.000, profit Rp5.000, bank sumber dana −Rp495.000 (§6.5 Contoh B). Varian lama rancangan v1.3 (bank −Rp505.000, admin ditambah di atas nominal dan dibebankan ke sumber dana) DITOLAK dan tidak boleh dipakai di dokumen maupun di kode — jangan pakai dua rumus sekaligus.

### 6.4 Rumus pergerakan saldo catatan per jenis transaksi
Tabel ini adalah jantung PRD. Tanda (+) berarti saldo **catatan di aplikasi ini** bertambah, (−) berkurang. Tidak satu pun baris ini menggerakkan saldo asli di Server Pulsa, Digiflazz, bank, atau e-wallet. "Kas" = akun Kas (laci kasir) yang aktif di shift itu.

| Jenis | Sumber / akun asal | Tujuan / penerimaan | Catatan admin & laba |
|---|---|---|---|
| Transfer (pelanggan kirim uang) | Rekening pengirim konter (− hBeli) | Kas (+) bila pelanggan bayar tunai, atau rekening konter (+) bila bayar transfer | Admin Cash: Kas (+ admin) — sudah termasuk di hJual. Admin Debit Rekening: hBeli = nominal − admin (keputusan dikunci 8 Nov 2026, §6.3). |
| Tarik Tunai | Kas (− nominal tunai yang diserahkan) | Rekening konter (+ hJual, dari transfer pelanggan) | Admin umumnya cash bersamaan, atau didebit — bila didebit, berlaku rumus §6.3 yang sudah dikunci (hBeli = nominal − admin, hJual = nominal). |
| Top Up E-Wallet | Saldo e-wallet / bank konter (− hBeli) | Kas (+) bila pelanggan bayar tunai, atau rekening (+) bila bayar transfer | Admin Cash ke Kas; admin Debit Rekening dipotong dari nominal mengikuti rumus terkunci §6.3 (sumber keluar nominal − admin). |
| Pulsa / Paket Data / Token | Saldo catatan Server / Provider (− modal), hanya di aplikasi ini | Kas / rekening / e-wallet catatan (+ harga jual) | Produk dipilih dari katalog Supabase (hanya nama produknya); modal dan harga jual diambil dari Master Produk lokal. Laba catatan = jual − modal. Saldo asli Server Pulsa tidak berkurang oleh pencatatan ini. |
| Voucher / Perdana / Aksesoris | Stok barang (− jumlah) | Kas / rekening / e-wallet (+ harga jual) | Laba = (jual − modal) × jumlah. Stok dan laba bergerak bersamaan. |
| Bayar Tagihan / PPOB | Saldo catatan server / bank (− nominal tagihan + biaya sistem) | Kas / rekening catatan (+ dari pelanggan) | Admin jasa dicatat terpisah dari biaya sistem penyedia. |
| Deposit Server (dicatat) | Bank / Kas catatan (− jumlah deposit) | Saldo catatan Server (+ deposit, dikurangi potongan bila ada) | Hanya mencatat deposit yang sudah dilakukan lewat jalur biasa — aplikasi ini tidak melakukan depositnya. Bukan pendapatan. Ditandai mutasi internal. |
| Pindah Dana / Isi Saldo Sendiri | Kas / akun lain (−) | Akun tujuan (+) | Perpindahan internal, tidak dihitung sebagai laba/rugi. |
| Setor Modal / Tarik Modal Owner | Di luar konter | Kas / Bank (+ atau −) | Dipisahkan tegas dari pendapatan supaya laba harian tidak terlihat membengkak. Ditandai mutasi internal. |
| Pengeluaran Operasional | Kas / Bank (−) | — | Kategori wajib. Mengurangi laba bersih harian. |

**Tabel delta saldo (diadaptasi dari `updateBalances` BG-APP — "kasir" di sini = akun Kas laci kasir, "sumber" = akun sumber dana):**

| Jenis (BG-APP) | Sumber dana | Kas |
|---|---|---|
| Jasa Transfer | Tidak berubah | Kasir hanya terima profit (hJual − hBeli) |
| Tarik Tunai | Sumber + hJual | Kasir − hBeli |
| Transfer | Sumber − hBeli | Kasir + hJual |
| Jualan digital (pulsa / voucher / dll.) | Sumber − hBeli | Kasir + hJual |

**Perpindahan internal bukan laba.** Deposit server, isi saldo sendiri, dan setor modal adalah kesalahan klasik yang membuat laporan terlihat untung besar padahal uang hanya berpindah tempat. Sistem menandai ketiganya sebagai mutasi internal dan mengeluarkannya dari perhitungan pendapatan.

### 6.5 Tiga contoh hitungan nyata (wajib jadi test case QA — angka dari rancangan v1.3, disesuaikan dengan default §6.3)

**Contoh A — Transfer Rp500.000, admin Rp5.000 dibayar Cash.**
Tarif cocok: Rp100.000 – < Rp1.000.000 → Rp5.000. Cash: hBeli = Rp500.000, hJual = Rp505.000, profit = Rp5.000.
| Akun | Sebelum | Perubahan | Sesudah |
|---|---|---|---|
| Bank BCA (sumber dana transfer) | Rp10.000.000 | − Rp500.000 | Rp9.500.000 |
| Kas (pelanggan bayar tunai pokok + admin) | Rp750.000 | + Rp505.000 | Rp1.255.000 |
Pendapatan jasa tercatat: Rp5.000. Nominal pokok Rp500.000 bukan pendapatan — uang pelanggan yang diteruskan.

**Contoh B — Transfer Rp500.000, admin Rp5.000 Debit Rekening (keputusan user 8 Nov 2026 — DIKUNCI).**
Debit Rekening = potong dari nominal: hBeli = Rp500.000 − Rp5.000 = Rp495.000, hJual = Rp500.000, profit = Rp5.000.
| Akun | Sebelum | Perubahan | Sesudah |
|---|---|---|---|
| Bank BCA (sumber dana, dipotong hBeli) | Rp10.000.000 | − Rp495.000 | Rp9.505.000 |
| Kas (pelanggan membayar pokok) | Rp750.000 | + Rp500.000 | Rp1.250.000 |
> Catatan: varian lama rancangan v1.3 Contoh B (bank − Rp505.000, saldo akhir Rp9.495.000 — admin ditambah di atas nominal dan dibebankan ke sumber dana) DITOLAK oleh user 8 Nov 2026 dan tidak berlaku lagi. Rumus di atas adalah satu-satunya rumus Debit Rekening di PRD ini — jangan pakai dua rumus sekaligus, di dokumen maupun di kode.

**Contoh C — Jual voucher + pulsa dalam satu kunjungan (keranjang).**
| Komponen | Pergerakan | Laba |
|---|---|---|
| Voucher data, modal Rp28.000, jual Rp32.000, stok 10 | Stok menjadi 9; Kas + Rp32.000 | Rp4.000 |
| Pulsa Rp25.000 (produk dipilih dari katalog Supabase), modal Rp24.500, jual Rp27.000 | Saldo catatan server − Rp24.500; Kas + Rp27.000; saldo asli Server Pulsa tetap, tidak berubah | Rp2.500 |
| **Total kunjungan** | **Kas + Rp59.000** | **Rp6.500** |

### 6.6 Stok & opname
- Stok berkurang otomatis saat transaksi tersimpan: voucher / perdana / aksesoris −1 per item (atau −jumlah bila jumlah > 1). Hanya ketiga kategori ini yang punya stok — pulsa / data / token / game tidak punya stok (diadaptasi dari master produk BG-APP).
- Stok bertambah kembali (+1 per item) saat transaksi di-void (§6.9). Stok yang dikembalikan tercatat di `stock_movements` dengan alasan void.
- **Stok boleh minus hanya dengan peringatan.** Sistem memberi peringatan keras saat stok habis / akan minus, tetapi tetap mengizinkan simpan bila owner mengizinkan (PIN owner) — karena di lapangan, stok fisik dan catatan kadang tidak sinkron, dan transaksi pelanggan tidak boleh tertahan. Peringatan dan persetujuan tercatat di audit log.
- Opname stok (MVP dasar: hitung fisik vs catatan per barang, selisih tercatat dengan alasan; opname terpandu bergilir per shift = v1.1, opname penuh mingguan = v1.1). Stok tidak perlu dihitung penuh setiap shift — yang dihitung penuh setiap shift adalah uang dan saldo (§6.7).
- Barang dengan stok < 1 masuk daftar "Stok habis" di laporan (diadaptasi dari laporan BG-APP).

### 6.7 Shift & serah terima — 7 langkah (BARU, tidak ada di BG-APP)
Pergantian shift adalah titik paling rawan kehilangan uang tanpa jejak. Sistem memperlakukannya sebagai penutupan mini: shift lama tidak bisa ditutup sebelum angka sistem dan hitungan fisik dibandingkan, dan shift baru tidak bisa mulai sebelum menerima hasilnya.

1. **Petugas lama menekan "Minta Tutup Shift".** Sistem mengunci input baru untuk shift tersebut dan menyusun laporan shift otomatis.
2. **Sistem menampilkan angka seharusnya (menurut sistem):** saldo awal shift untuk setiap akun, total masuk, total keluar, dan saldo akhir seharusnya — untuk kas, setiap bank, setiap e-wallet, saldo server, dan saldo aplikasi provider.
3. **Petugas lama dan petugas baru menghitung fisik bersama:** uang tunai di laci dihitung lembar per lembar (sediakan rincian pecahan: Rp100.000, Rp50.000, Rp20.000, Rp10.000, Rp5.000, Rp2.000, Rp1.000, koin), saldo bank / e-wallet / server dicek langsung dari aplikasi aslinya masing-masing lalu angkanya diketik ke form serah terima. Aplikasi ini hanya mencatat angka hasil cek itu — ia tidak menarik saldo asli secara otomatis dan tidak mengubahnya.
4. **Sistem menghitung selisih per akun:** Fisik − Sistem. Hasilnya Pas (Rp0), Lebih, atau Kurang, lengkap dengan nominalnya.
5. **Selisih wajib diberi penjelasan.** Pilihan penyebab: salah input transaksi, transaksi belum dicatat, uang kembalian berlebih/kurang, biaya tidak tercatat, atau belum diketahui. Selisih "belum diketahui" tetap boleh melanjutkan shift, tetapi otomatis menjadi tugas tindak lanjut owner (muncul di dashboard owner sampai ditutup).
6. **Kedua petugas mengonfirmasi dengan PIN masing-masing.** Dokumen serah terima tersimpan permanen dan tidak bisa diubah setelah dikonfirmasi — koreksi hanya lewat catatan tambahan owner.
7. **Shift baru dibuka dengan saldo awal persis sama dengan hasil serah terima (angka fisik yang diterima), bukan angka sistem lama.** Selisihnya sudah tercatat terpisah, sehingga shift baru mulai dari angka yang bersih dan adil.

**Tabel contoh dokumen serah terima:**

| Akun | Menurut sistem | Hitungan fisik | Selisih | Keterangan |
|---|---|---|---|---|
| Kas tunai | Rp1.255.000 | Rp1.250.000 | − Rp5.000 | Wajib penjelasan |
| Bank BCA | Rp9.500.000 | Rp9.500.000 | Rp0 | Pas |
| E-Wallet DANA | Rp860.000 | Rp860.000 | Rp0 | Pas |
| Saldo Server Pulsa (catatan vs cek di aplikasi Server Pulsa) | Rp1.475.500 | Rp1.475.500 | Rp0 | Pas |
| Stok voucher (contoh, spot check) | 9 pcs | 9 pcs | 0 | Pas |

Untuk stok, gunakan hitung bergilir: setiap shift memeriksa 1–2 kategori yang ditunjuk sistem secara acak (v1.1 terpandu; MVP: petugas memilih kategori yang dihitung), dan opname penuh dilakukan mingguan.

### 6.8 Koreksi Saldo Manual — khusus Owner/Admin (keputusan user di revisi rancangan v1.1)
- Menu "Koreksi / Ubah Saldo Manual" tampil hanya untuk Owner dan Admin; kasir / staff tidak bisa melihat menunya sama sekali (bukan hanya tombol nonaktif — menu tidak ada di navigasi kasir).
- Setiap koreksi wajib mengisi: akun, saldo sistem (otomatis, tidak bisa diubah), saldo seharusnya, selisih (otomatis = seharusnya − sistem), dan alasan (pilihan: biaya admin bank otomatis, bonus/potongan server, salah saldo awal, selisih serah terima, lain-lain + catatan bebas bila "lain-lain").
- Koreksi tersimpan sebagai mutasi "Koreksi Manual" dengan nama petugas + waktu, muncul di laporan dan jejak audit, dan tidak pernah menimpa angka lama tanpa jejak. Saldo awal / opname awal memakai jalur yang sama tetapi hanya sekali saat akun pertama dipakai (§5.2).
- Koreksi tidak boleh dipakai untuk menutup selisih shift tanpa penjelasan — selisih shift harus lewat dokumen serah terima dulu (§6.7); koreksi hanya untuk sebab sah di luar shift.

### 6.9 Void, audit trail, tutup harian
- **Void (bukan hapus):** transaksi salah hanya bisa dibatalkan (void) dengan alasan wajib + persetujuan PIN admin. Pembatalannya mengembalikan saldo catatan dan stok secara otomatis (kebalikan dari §6.4). Baris aslinya tetap terlihat dengan status Batal. Tidak ada hard-delete transaksi di aplikasi ini (pelajaran dari BG-APP).
- **Audit trail (audit_logs, §9):** siapa melakukan apa dan kapan — login, input transaksi, void, koreksi saldo, ubah harga/modal di master, ubah tarif, buka kunci tutup harian, buka/tutup shift, serah terima. Setiap entri: waktu (WITA), user, peran, aksi, entitas yang diubah, nilai lama → nilai baru (bila relevan), alasan (bila wajib). Audit log tidak bisa diubah atau dihapus dari aplikasi.
- **Tutup harian (closing):** di atas serah terima shift, ada rekap satu hari penuh: total pendapatan jasa, laba barang & pulsa, pengeluaran, selisih, dan saldo akhir semua akun. Dikunci setelah owner mengesahkan; hari yang sudah ditutup tidak bisa ditambah transaksi tanpa membuka kunci tercatat (buka kunci = owner + alasan + audit log). Transaksi susulan untuk hari terkunci dicatat di hari berjalan dengan catatan "transaksi susulan tanggal X" — jangan ubah hari yang sudah dikunci diam-diam.

### 6.10 Laporan & dashboard
**Dashboard (layar utama, Home):** total kas hari ini, saldo catatan tiap bank & e-wallet, saldo catatan server & aplikasi provider, pendapatan jasa hari ini, laba barang & pulsa hari ini, jumlah transaksi, daftar hutang belum lunas (MVP versi simpel: daftar piutang + tombol Lunas penuh), peringatan saldo/stok menipis (v1.1 — di MVP tampilkan stok habis < 1), dan selisih serah terima yang belum ditindaklanjuti. Semua angka adalah angka catatan aplikasi ini, diberi label "catatan" supaya tidak tertukar dengan saldo asli di aplikasi asalnya. Semua dalam satu layar, tanpa perlu membuka laporan.
**Laporan yang disediakan (MVP):** laporan per shift, tutup harian, laba per kategori (jasa transfer/tarik tunai, pulsa/data, voucher, perdana, aksesoris), mutasi per akun, stok & opname, dan rekap selisih serah terima per petugas dalam satu periode. Semua angka bisa diklik untuk melihat transaksi pembentuknya. Grafik yang tidak bisa ditelusur ke transaksi = gagal.
**Laporan BG-APP yang diadopsi:** profit harian/bulanan, Top 10 layanan (v1.1), stok habis (< 1).

### 6.11 Matriks hak akses — siapa boleh apa

| Kemampuan | Owner | Admin | Kasir / Shift |
|---|---|---|---|
| Input transaksi harian | Ya | Ya | Ya |
| Melihat harga modal & laba | Ya | Ya | Tidak (tidak tampil) |
| Ubah master, harga, dan tarif | Ya | Ya | Tidak |
| Void / batalkan transaksi | Ya | Dengan PIN | Minta persetujuan (PIN admin) |
| Koreksi / ubah saldo manual | Ya | Ya | Tidak (menu tidak ada) |
| Saldo awal / opname awal | Ya | Ya | Tidak |
| Atur tarif biaya admin (range nominal) | Ya | Ya | Tidak |
| Serah terima shift | Ya | Ya | Ya (sebagai pihak) |
| Tutup harian & buka kunci hari tertutup | Ya (mengesahkan) | Sahkan saja | Tidak |
| Laporan laba & ekspor data | Ya | Ya | Ringkasan shift sendiri |

---

## 7. Aturan Bisnis & Validasi (Checklist Bernomor untuk Gemini — Tegas)

1. Nominal harus > 0, integer Rupiah, maks Rp999.999.999.999. Pesan error Bahasa Indonesia, sopan, spesifik (bukan "Error!").
2. Semua nominal di semua lapisan = integer Rupiah. Jangan simpan uang sebagai string "Rp ..." dan jangan parse string uang.
3. Tipe biaya admin adalah enum `fixed` / `percent` — jangan deteksi lewat substring teks.
4. Tidak ada angka fallback biaya admin di kode. Tidak ada aturan cocok → admin Rp0 + banner "belum ada tarif" (§5.4.1 poin 4).
5. Validasi tarif §5.4.2 wajib di sisi aplikasi, bukan hanya di UI: tolak overlap untuk layanan yang sama, peringatkan celah nominal, tolak nominal akhir ≤ nominal awal, tolak nilai biaya ≤ 0, tolak persentase > 100.
6. Transaksi hanya bisa dibuat bila ada shift aktif. Tanpa shift aktif, form terkunci ("Buka shift dulu").
7. Tanggal transaksi tidak boleh > hari ini. Kasir tidak bisa mengubah tanggal; owner/admin bisa mengoreksi dengan alasan tercatat.
8. Detail transaksi, sumber dana, dan akun penerima yang dipilih harus aktif. Kalau master dinonaktifkan, transaksi lama tetap tampil.
9. Saldo catatan sumber dana tidak cukup → peringatan + simpan hanya dengan PIN owner/admin, dan dicatat di audit log. Jangan tolak mentah-mentah tanpa jalan keluar (kasir di lapangan kadang harus tetap melayani), tetapi jangan pula biarkan minus diam-diam.
10. Stok tidak boleh minus tanpa peringatan keras + PIN owner (§6.6).
11. Modal tidak pernah tampil ke kasir dan tidak pernah diinput di form transaksi. Modal selalu dari Master Produk lokal (§5.3) dan disimpan sebagai snapshot per item (§9).
12. Perubahan master (harga/modal/tarif) hanya berlaku ke depan; transaksi lama menyimpan nilai saat kejadian.
13. Mutasi internal (Pindah Dana, Deposit Server dicatat, Topup Provider dicatat, Setor/Tarik Modal) tidak masuk perhitungan pendapatan dan laba.
14. Transfer / mutasi antar akun tidak masuk hitungan pemasukan/pengeluaran di laporan laba.
15. Transaksi tersimpan tidak bisa dihapus. Koreksi hanya lewat void (§6.9) atau transaksi pembalik yang tercatat.
16. Void wajib alasan + PIN admin; void mengembalikan saldo catatan dan stok otomatis; baris asli tetap berstatus Batal.
17. Serah terima shift wajib PIN pengirim + PIN penerima; dokumen serah terima tidak bisa diubah setelah konfirmasi.
18. Shift baru mulai dari angka fisik yang diterima di serah terima, bukan angka sistem lama.
19. Tutup harian yang sudah dikunci tidak bisa ditambah transaksi tanpa buka kunci tercatat (owner + alasan + audit log).
20. Koreksi Saldo Manual hanya Owner/Admin, alasan wajib, tersimpan sebagai mutasi "Koreksi Manual" (§6.8).
21. Aplikasi harus jalan penuh tanpa internet. Penyegaran katalog Supabase hanya baca dan boleh gagal diam-diam (pakai cache lokal) tanpa banner error yang mengganggu.
22. Semua teks UI Bahasa Indonesia. Jangan ada teks Inggris tersisa di layar user (kecuali nama brand/package). Pesan error teknis (exception) tidak boleh tampil mentah ke user — ubah jadi kalimat Indonesia + tombol "Coba lagi".
23. Satu transaksi = satu shift, satu petugas, satu waktu simpan. Tidak ada transaksi tanpa petugas.
24. Hapus akun saldo / master yang masih punya transaksi = ditolak + pesan jumlah transaksi yang terdampak — jangan hapus diam-diam berikut transaksinya.
25. Pencatatan di aplikasi ini tidak boleh memanggil Digiflazz, tidak boleh menulis ke tabel produk Supabase, dan tidak boleh mengubah saldo asli di layanan mana pun (§1.4 poin 1). Pelanggaran aturan ini = PRD gagal (§12.2).

---

## 8. Desain UI/UX — Kasir Cepat, Angka Paling Besar

### 8.1 Prinsip desain (5 saja, pegang terus — diadaptasi dari BELANJAKU §8.2)
1. **Satu layar, satu tugas.** Home = lihat saldo & tambah transaksi. Tambah Transaksi = isi & simpan. Shift = serah terima. Jangan campur laporan ke Home sampai penuh.
2. **Angka adalah bintang.** Nominal selalu paling besar & paling tebal di layar. Jangan kalahkan angka dengan dekorasi.
3. **Jempol dulu, kasir berdiri.** Semua aksi utama (Tambah, Simpan, Tutup Shift) bisa dijangkau jempol tanpa pindah genggaman. Tombol Simpan selalu di bawah, lebar penuh, tinggi ≥ 52px. Form transaksi harus selesai tanpa scroll untuk jenis yang paling sering.
4. **Warna punya arti, bukan hiasan.** Hijau = masuk / laba, merah/oranye lembut = keluar, amber = waspada / selisih, abu-abu = netral. Jangan pakai hijau untuk tombol hapus/void, merah untuk tombol simpan.
5. **Kosong itu harus membantu.** Tidak ada layar kosong polos: selalu ada ilustrasi kecil + kalimat + tombol aksi ("Belum ada transaksi shift ini — Tambah pertama yuk").
6. **Cantik, rapi, ringan.** Tampilan wajib terlihat profesional dan susunannya rapi di semua layar, tapi aplikasinya tetap ringan — standar terkunci di §8.6 (keputusan user 8 Nov 2026).

### 8.2 Tata letak per layar (wireframe teks — implementasi wajib mengikuti ini)

**Home / Dashboard (layar utama):**
- Atas: sapaan kecil ("Selamat pagi, boy" — nama dari user login) + nama shift aktif + jam + avatar/inisial petugas + tombol Tutup Shift.
- Kartu saldo kas hari ini: angka besar (label "Kas — catatan"), di bawahnya chip: Masuk hari ini (hijau), Keluar hari ini (merah lembut), Laba hari ini (netral/hijau).
- Strip akun saldo: kartu horizontal bisa di-swipe (Kas / tiap Bank / tiap E-Wallet / Server Pulsa / Aplikasi Provider + saldo catatan masing-masing, lengkap dengan label kecil "catatan").
- Aksi cepat (4 tombol bulat + label): Tambah Transaksi, Transfer, Tarik Tunai, Pulsa.
- Bagian "Shift ini": ringkasan transaksi shift berjalan (jumlah, total masuk, total keluar, laba) + tombol "Lihat laporan shift".
- Bagian "Terakhir": 5 transaksi terbaru (ikon jenis, detail/nama, tanggal-jam, nominal kanan dengan +/−, badge Batal bila void). Ketuk → detail.
- Peringatan (bila ada): selisih serah terima belum ditindaklanjuti, stok habis, tarif belum ada untuk nominal tertentu.
- Bottom nav: Home, Transaksi, [FAB + tengah, menonjol], Shift, Laporan. FAB tengah = Tambah Transaksi (lebih besar, warna primer). Jangan pakai bottom nav 6 item.

**Tambah Transaksi:**
- Pilih jenis transaksi dulu (grid 3 kolom, ikon + label) — baru field lain muncul.
- Numpad custom besar (§8.4) + preview nominal besar di atas numpad.
- Baris nominal–admin–cara bayar dalam satu baris (§6.1): Nominal | Biaya Admin (otomatis) | Cash / Debit Rekening.
- Detail (dropdown cascading sesuai jenis) + Sumber Dana (chip akun) + Metode terima (Tunai / Non-Tunai) + Diterima Di (chip akun bila Non-Tunai).
- Keranjang: tombol "+ Tambah item" untuk kunjungan multi-item; tiap item satu baris (nama, nominal, hapus).
- Ringkasan sebelum–sesudah (muncul saat Simpan ditekan / sebelum konfirmasi): saldo tiap akun yang bergerak, sebelum → sesudah.
- Tombol Simpan lebar penuh di bawah, selalu terlihat (tidak tertutup keyboard karena pakai numpad custom, bukan keyboard sistem).

**Master (Pengaturan → Master Data):**
- Daftar per kategori master (Akun Saldo, Voucher, Perdana, Aksesoris, Produk Pulsa/Data/Token, Tarif Biaya Admin, Pelanggan, Petugas) — hanya Owner/Admin yang bisa masuk; kasir tidak melihat menu ini. Semua daftar master dimulai KOSONG saat install pertama — tidak ada data contoh yang di-seed (keputusan user 8 Nov 2026, DIKUNCI, lihat §1.4 poin 11).
- Form Tambah Akun: nama akun, kelompok (Kas / Bank / E-Wallet / Server Pulsa / Aplikasi Provider), nomor rekening / HP (bila relevan), nama pemilik, **saldo awal catatan (wajib diisi, boleh 0 — tercatat sebagai saldo awal, bukan transaksi)**, status aktif/nonaktif. Setelah akun dibuat, saldo awal tidak bisa diubah lewat form — hanya lewat Koreksi Saldo Manual (§6.8).
- Form Master Produk: modal & jual hanya terlihat di sini (Owner/Admin); kasir tidak pernah melihat layar ini. Voucher / perdana / aksesoris diinput manual lengkap (nama, operator/kategori, modal, jual, stok awal). Produk pulsa / data / token dipilih dari daftar katalog Supabase (identitas terisi otomatis dari cache read-only), lalu modal + jual diisi manual.
- Form Master Pelanggan: nama (wajib), nomor HP, catatan; tambah / ubah / nonaktif.
- Form Master Tarif: meniru form Pengaturan_Margin BG-APP — field sesuai §5.4 (Tipe Perhitungan, Layanan Terkait multi-select, Nominal Awal/Akhir, nilai biaya) + tombol Tambah / Ubah / Hapus aturan dan Aktif/Nonaktif; dengan pratinjau aturan yang bentrok / celah saat mengetik range (validasi langsung, bukan setelah simpan). Daftar aturan dimulai KOSONG — user mengisi sendiri (keputusan user 8 Nov 2026, DIKUNCI).

**Shift:**
- Buka Shift: saldo awal dari serah terima sebelumnya + tombol konfirmasi penerimaan.
- Tutup Shift / Serah Terima: angka sistem per akun, kolom hitungan fisik (dengan rincian pecahan untuk kas), selisih otomatis per akun, kolom penjelasan selisih, tombol konfirmasi PIN pengirim + PIN penerima.
- Riwayat shift: daftar dokumen serah terima (tanggal, petugas lama → petugas baru, status selisih).

**Laporan:**
- Periode switcher (Shift ini / Hari ini / Minggu ini / Bulan ini / Pilih tanggal) → angka ringkasan (masuk, keluar, laba, pendapatan jasa) → laba per kategori → daftar transaksi periode itu (bisa diklik ke detail).
- Tab: Laba, Mutasi per Akun, Stok, Selisih Serah Terima, Hutang (MVP versi simpel: daftar piutang + Lunas penuh; cicilan = v1.1).

**Pengaturan:**
- Profil & PIN, petugas (Owner/Admin), akun saldo, koreksi saldo manual (Owner/Admin), backup/export, tema (Terang/Gelap/Otomatis), tentang + versi + pernyataan "Aplikasi ini hanya mencatat — tidak mengubah saldo di Server Pulsa / bank / e-wallet". (Saldo awal akun diisi di form Tambah Akun saat akun dibuat, §5.2 — tidak ada menu "Saldo Awal / Opname Awal" terpisah.)

### 8.3 Ikon & font (keputusan final, jangan diganti sembarangan)
- **Font utama: Plus Jakarta Sans** (Google Fonts). Semua teks UI. **Angka headline / saldo:** Plus Jakarta Sans Bold/ExtraBold. Ukuran acuan: saldo total 32–36px Bold; nominal transaksi 15–16px SemiBold; judul section 16px Bold; body 14px; label kecil 12px. Dukung font sistem membesar (accessibility) tanpa layout pecah.
- **Format Rupiah (wajib):** `Rp 1.250.000` — "Rp" + spasi + titik ribuan, tanpa ",00". Nominal negatif: `−Rp 50.000` (tanda minus di depan Rp). Jangan tampilkan "Rp. 50.000,-" atau "50000".
- **Ikon: Lucide** (via `lucide-vue-next` atau aset SVG Lucide) — gaya outline konsisten. Alternatif yang diterima: Material Symbols Rounded. **Jangan campur** Lucide + Material + emoji dalam satu layar. Jangan pakai emoji sebagai ikon kategori/aksi di UI produksi.
- Ikon jenis transaksi (saran): Transfer `arrow-right-left`, Tarik Tunai `banknote`, Top Up E-Wallet `wallet`, Pulsa `smartphone`, Paket Data `signal`, Token PLN `zap`, Voucher `ticket`, Perdana `sim-card`, Aksesoris `headphones`, PPOB `receipt`, Deposit Server `server`, Pengeluaran `trending-down`.

### 8.4 Numpad & interaksi mikro
- Numpad custom: tombol 1–9, 0, 00, hapus (backspace). Tombol besar (≥ 64px tinggi), feedback haptic ringan saat tekan (plugin Haptics Capacitor di APK; di web, getar bila didukung browser). Preview nominal besar di atas numpad, format Rupiah langsung.
- Animasi: transisi layar maks ~200ms ease-out, HANYA CSS (tanpa library animasi — lihat §8.6); donat / progress muncul dengan animasi sapuan; snackbar dengan aksi (mis. "Lihat struk"). Hormati `prefers-reduced-motion` — bila user mengaktifkan pengurangan gerak, semua animasi dimatikan.
- Haptic: ringan saat simpan berhasil, sedang saat selisih shift ditemukan (sekali saja).
- Loading: skeleton (garis abu-abu berdenyut) untuk daftar & laporan, bukan spinner di tengah layar kosong.
- Dark mode: bukan sekadar invert — latar #121212 / #0F1115, kartu #1E1E1E, teks putih 87%, warna kategori tetap pastel tapi lebih redup. Uji kedua tema di semua layar sebelum rilis.

### 8.5 Token desain (CSS variables / design tokens Vue — sama dengan BELANJAKU §8.6, disesuaikan)
| Token | Light | Dark |
|---|---|---|
| Latar | #F6F7F9 | #0F1115 |
| Kartu / Surface | #FFFFFF | #1C1E22 |
| Primer (tombol, FAB, link) | #059669 (Emerald 600) | #34D399 (Emerald 400) |
| Primer gradient kartu saldo | #059669 → #0D9488 (teal) | #059669 → #0F766E |
| Pemasukan / laba | #16A34A (hijau) | #4ADE80 |
| Pengeluaran | #F97316 (oranye) di ringkasan; #E11D48 hanya untuk hapus/void/peringatan keras | Sesuaikan terang 1 tingkat |
| Peringatan / selisih | #F59E0B (amber) | #FBBF24 |
| Teks utama / sekunder | #111827 / #6B7280 | #F9FAFB / #9CA3AF |
| Radius | Kartu 20px, tombol 16px, chip 999 (pill), bottom sheet 28px atas | Sama |

**Catatan:** token di atas adalah titik awal. Gemini boleh mengusulkan 1 alternatif palet TAPI harus tunjukkan screenshot Home + Tambah Transaksi + Serah Terima di kedua tema sebelum ganti — jangan ganti diam-diam.

### 8.6 Standar UI/UX — Cantik, Rapi, Ringan (DIKUNCI, keputusan user 8 Nov 2026)

UI/UX WAJIB cantik, susunan rapi, terlihat profesional, dan tidak berat. Ini standar terkunci, bukan selera — Gemini tidak boleh mengorbankan satu demi yang lain, dan tidak boleh ada layar yang asal jadi.

**Cantik & profesional:**
- Tampilan bersih dan konsisten — palet HANYA dari design token §8.5 yang sama di semua layar; hierarki jelas (judul, angka, aksi); whitespace cukup; kartu rapi; angka uang tabular dan mudah dibaca; warna status konsisten (profit, hutang, selisih) sesuai §8.1 poin 4.
- Tidak ada layar yang asal jadi: tiap layar mengikuti tata letak §8.2 dan prinsip §8.1.

**Rapi:**
- Satu pola layout untuk semua halaman (header, konten, aksi bawah); jarak dan ukuran konsisten mengikuti token §8.5; tidak ada elemen yang tumpang tindih atau terpotong saat font sistem diperbesar (uji dengan font sistem diperbesar — lihat §8.3).

**Tidak berat (ringan, terukur):**
- TANPA library animasi — transisi hanya CSS, maks ~200ms, dan hormati `prefers-reduced-motion` (lihat §8.4).
- TANPA gambar/foto latar besar — tidak ada aset gambar berat di layar mana pun.
- Ikon SVG Lucide tree-shaken saja (§8.3) — jangan bundel seluruh set ikon.
- SATU keluarga font saja — Plus Jakarta Sans yang sudah ada (§8.3), jangan tambah font kedua.
- TANPA framework UI berat — tanpa Vuetify / Quasar / PrimeVue dan sejenis; styling pakai CSS variables (§8.5) + komponen sendiri.
- Route di-lazy-load per halaman; tidak ada proses background berat; aplikasi harus terasa cepat di HP spek rendah dan tidak lag saat mengetik nominal.

**Bukti (wajib per fase):**
- Tiap fase Gemini WAJIB kirim screenshot layar utama (Home, Tambah Transaksi, Serah Terima) untuk review user sebelum fase dianggap selesai; palet tidak boleh diganti diam-diam (aturan §8.5 tetap berlaku).

---

## 9. Model Data (Vue 3 Local-First)

> Implementasi wajib pakai Dexie (IndexedDB) — lihat §10. Semua nominal = integer Rupiah (bukan double, bukan string "Rp ..."). Semua tanggal simpan sebagai ISO lokal + zona Asia/Makassar. Saldo akun TIDAK disimpan sebagai kolom yang diedit manual — dihitung dari saldo awal + mutasi (transaksi, mutasi internal, koreksi). Soft-delete TIDAK dipakai — hapus = void (§6.9), master nonaktif = `isActive = false`.

### 9.1 Entitas (11 tabel inti)

**users (Petugas)**
- id (String/UUID), name, pinHash (String — hash saja, JANGAN simpan PIN mentah), role (`owner` / `admin` / `kasir`), isActive (bool), createdAt, updatedAt
- PIN dipakai untuk login shift dan konfirmasi (void, serah terima, koreksi saldo, buka kunci tutup harian).

**accounts (Akun saldo catatan)**
- id, name, group (`cash` / `bank` / `ewallet` / `server` / `provider`), accountNumber (String, nullable — nomor rekening / HP), ownerName (String, nullable), initialBalance (int, default 0), isActive (bool), createdAt, updatedAt
- Saldo tampil = initialBalance + SUM(mutasi masuk akun itu) − SUM(mutasi keluar akun itu), dihitung via query dari `transactions` + `transaction_items` + koreksi (koreksi disimpan sebagai `transactions` tipe `adjustment`, lihat bawah). Jangan simpan kolom `balance` yang bisa drift.

**products (Master Produk lokal — semua produk)**
- id, name, category (`voucher` / `perdana` / `accessory` / `pulsa` / `data` / `token` / `game`), operator (String, nullable), denomination (String, nullable — mis. "5.000", "10 GB"), externalProductRef (String, nullable — referensi ke katalog Supabase, hanya identitas read-only), costPrice (int — modal dari master, hanya Owner/Admin yang boleh baca lewat API/repository ber-peran), sellPrice (int — harga jual), stock (int, default 0 — hanya untuk voucher/perdana/aksesoris; pulsa/data/token = 0 dan tidak dipakai), unit (String, nullable — pcs, dll.), isActive (bool), createdAt, updatedAt
- Aturan: produk pulsa/data/token yang belum ada `costPrice`/`sellPrice` di master lokal tidak bisa dipilih di form transaksi (§5.3).

**admin_fee_rules (Master Tarif Biaya Admin)**
- id, name, minAmount (int, inklusif `>=`), maxAmount (int, nullable — eksklusif `<`, null = tanpa batas atas), serviceTypes (List<String> — jenis transaksi yang berlaku, JSON), feeType (`fixed` / `percent` — enum, bukan substring), feeValue (int — Rupiah bila `fixed`; per-sepuluh-ribu bila `percent`, mis. 0,4% disimpan sebagai 40 per 10.000 — dokumentasikan di kode, jangan simpan string "0,4%"), roundingMode (String, nullable — `none` / `100` / `500` / `1000`), roundingDirection (`down` / `nearest` / `up`), isActive (bool), createdAt, updatedAt
- Validasi overlap & celah ada di §5.4.2.

**transactions (Kepala transaksi)**
- id, shiftId (FK → shifts), userId (FK → users), type (String — 12 jenis §6.2 + `internal_transfer` + `adjustment` + `deposit_record`), date (Date + jam, WITA), customerId (nullable, FK → customers — dipakai di MVP bila status bayar = Hutang), paymentStatus (`paid` / `debt` di MVP; `partial` = v1.1 untuk cicilan), totalAmount (int — total yang dibayar pelanggan), totalAdmin (int), totalProfit (int — hJual − hBeli, disimpan), totalCost (int — total modal), isInternalTransfer (bool), referenceNumber (String, nullable — nomor referensi transfer), note (String, nullable), status (`active` / `voided`), voidReason (String, nullable), voidedBy (String, nullable — userId), voidedAt (nullable), createdAt, updatedAt
- Contoh JSON: `{"type":"transfer","amount":500000,"admin":5000,"adminPayMethod":"cash","shiftId":"sh_...","userId":"u_kasir1","date":"2026-11-08T10:15:00+08:00"}`

**transaction_items (Rincian per item — satu baris per item, snapshot saat kejadian)**
- id, transactionId (FK), productId (nullable, FK → products — null bila item jasa tanpa produk), itemName (String — salinan nama produk/detail saat kejadian), itemType (String — jenis transaksi item itu), quantity (int, default 1), nominal (int — nominal pokok item), adminAmount (int), adminPayMethod (`cash` / `debit_rekening`), adminFeeRuleId (nullable, FK → admin_fee_rules — aturan tarif asal bila otomatis), adminFeeManualOverride (bool), costPriceSnapshot (int — modal saat kejadian, dari master lokal), sellPriceSnapshot (int — harga jual saat kejadian), sourceAccountId (nullable, FK → accounts — sumber dana item itu), destinationAccountId (nullable, FK → accounts — akun penerima / Diterima Di), receiveMethod (`cash` / `non_cash`), profit (int — sellPrice − costPrice per item, atau admin untuk jasa), createdAt
- Aturan: setiap item yang menggerakkan saldo mencatat `sourceAccountId` dan/atau `destinationAccountId` + saldo sebelum–sesudah dihitung dari urutan mutasi (lihat `audit_logs` bila perlu jejak perubahan saldo — saldo sebelum/sesudah per akun ditampilkan di ringkasan Simpan, §6.1, dihitung saat simpan dari state sebelum transaksi).

**shifts (Sesi shift)**
- id, userId (FK → users — petugas shift itu), openedAt, closedAt (nullable), openingCashNote (String, nullable — catatan penerimaan saldo awal), status (`open` / `closed`), createdAt, updatedAt
- Satu shift aktif per perangkat di MVP. Shift tidak bisa dibuka bila masih ada shift `open` di perangkat itu.

**shift_handovers (Dokumen serah terima)**
- id, shiftId (FK → shifts — shift yang ditutup), fromUserId, toUserId, handoverAt, status (`confirmed`), fromPinConfirmed (bool), toPinConfirmed (bool), note (String, nullable)
- Per akun: disimpan sebagai baris terpisah di tabel ini? Tidak — per akun disimpan sebagai JSON `accountChecks` (List: accountId, systemBalance, physicalBalance, difference, differenceReason, differenceNote) supaya dokumen serah terima satu kesatuan dan tidak bisa diubah setelah konfirmasi. Alternatif yang diterima: tabel anak `shift_handover_items` — pilih satu dan dokumentasikan di BUILD-SPEC.
- Koreksi setelah konfirmasi hanya lewat catatan tambahan owner (field `ownerFollowUpNote`, nullable + `followUpResolved` bool).

**stock_movements (Pergerakan stok catatan)**
- id, productId (FK → products), transactionId (nullable, FK), shiftId (nullable), type (`sale` / `void_return` / `opname_adjust` / `initial_stock`), quantityChange (int — negatif untuk penjualan, positif untuk void/opname tambah), stockBefore (int), stockAfter (int), reason (String, nullable), userId, createdAt
- Aturan: setiap perubahan stok harus lewat baris ini — jangan ubah `products.stock` tanpa baris `stock_movements`.

**customers (Pelanggan — MVP, untuk hutang versi simpel)**
- id, name, phone (String), note (String, nullable), createdAt, updatedAt
- MVP: tabel dipakai sejak awal untuk hutang versi simpel — daftar pelanggan sederhana, daftar piutang per pelanggan, dan tombol Lunas penuh. v1.1: ditambah cicilan, umur hutang, dan pengingat.

**receivables (Piutang — MVP versi simpel, tabel inti yang sudah ada di rancangan)**
- id, customerId (FK → customers), transactionId (FK → transactions), totalDebt (int), paidAmount (int, MVP selalu 0 sampai Lunas penuh), remaining (int), status (`open` / `paid`), paidAt (nullable), createdAt, updatedAt
- MVP hanya mengenal Lunas penuh: tombol Lunas membuat paidAmount = totalDebt, remaining = 0, status = `paid`. Riwayat cicilan (tabel pembayaran sebagian) = v1.1.

**audit_logs (Jejak audit)**
- id, userId, role (String saat kejadian), action (String — mis. `login`, `transaction_create`, `transaction_void`, `balance_adjust`, `master_price_change`, `tariff_change`, `shift_open`, `shift_close`, `handover_confirm`, `daily_close`, `daily_unlock`), entityType (String, nullable), entityId (String, nullable), oldValue (String/JSON, nullable), newValue (String/JSON, nullable), reason (String, nullable), createdAt
- Audit log tidak bisa diubah atau dihapus dari aplikasi (tidak ada UI edit/hapus, tidak ada API hapus).

### 9.2 Aturan migrasi & backup
- Versi skema dimulai dari 1. Setiap perubahan skema wajib ada migrasi (jangan hapus database user saat update).
- Backup lokal = export 1 file (dump JSON IndexedDB + folder foto bukti bila ada di v1.1 — di-zip) ke folder yang dipilih user (Downloads / Documents). Restore = pilih file backup → validasi → timpa dengan konfirmasi 2× ("Data lama akan diganti. Lanjutkan?").
- Export CSV: kolom = Tanggal, Shift, Petugas, Jenis, Detail, Sumber Dana, Nominal, Biaya Admin, Cara Bayar Admin, Diterima Di, Laba, Status. Format tanggal `YYYY-MM-DD HH:mm`, nominal angka polos (tanpa "Rp" / titik) supaya bisa dibuka di Excel/Sheets.
- Katalog produk Supabase (read-only) di-cache lokal di store terpisah `product_catalog_cache` (id, externalRef, name, operator, denomination, type, cachedAt) — cache boleh kedaluwarsa dan disegarkan manual oleh Owner/Admin; cache tidak pernah menulis balik. Tabel ini bukan bagian dari 11 tabel inti (tabel pendukung cache).

---

## 10. Teknologi — Vue 3 + Capacitor (Keputusan User 8 Nov 2026, DIKUNCI)

User memutuskan stack ini menggantikan Flutter: **Vue 3 + Capacitor**, dengan alasan persis dari user: lebih ringan dan lebih gampang update OTA-nya, tidak perlu install ulang. Keputusan ini berlaku untuk PRD ini, BUILD-SPEC, dan rancangan v1.6 — jangan ada sisa arahan Flutter di dokumen mana pun.

**Stack wajib / rekomendasi kuat:**
- **Vue 3 + TypeScript + Vite.** Android sebagai target utama uji lewat Capacitor; versi web-nya jalan di browser dari build yang sama. Struktur folder per fitur: `src/features/transactions/`, `src/features/masters/`, `src/features/shifts/`, `src/features/reports/`, `src/features/accounts/`, `src/features/settings/`, `src/core/theme/`, `src/core/data/`, komponen `.vue`, logika `.ts`.
- **State management:** Pinia — pilih satu, konsisten di semua fitur. Jangan campur state global liar di luar Pinia.
- **Navigasi:** Vue Router.
- **Database lokal:** Dexie (IndexedDB) — wajib, karena saldo/laporan butuh query terindeks dan transaksi atomik multi-akun (§6.1) lewat `db.transaction(...)`. IndexedDB berjalan sama di browser dan di WebView Capacitor, jadi tidak ada dua mesin database. Buktikan dengan test: saldo akun setelah 1.000 transaksi tetap benar.
- **Capacitor:** `@capacitor/core`, `@capacitor/android`, dan plugin resmi seperlunya (Preferences, Filesystem, Share, App). Shell Android dibuat dengan `npx cap add android`; konfigurasi di `capacitor.config.ts`. Izin / plugin native diatur di shell, bukan di kode web.
- **Supabase (hanya katalog, read-only):** dipakai HANYA untuk membaca daftar produk (SELECT) sebagai katalog pilihan di form. Supabase BUKAN backend utama — data pembukuan (transaksi, saldo catatan, master lokal, shift, audit) tinggal di database lokal perangkat. Jangan simpan anon key / service key di repo atau di chat; kunci, kalau dibutuhkan, diisi lewat jalur aman (env / secure storage) — dan hanya dengan persetujuan user.
- **UI:** CSS design tokens (§8.5) + Plus Jakarta Sans + `lucide-vue-next` (ikon Lucide untuk Vue), chart donat & batang yang ringan (mis. Chart.js) — asal interaktif (ketuk → filter).
- **Keamanan lokal:** hash PIN dengan Web Crypto API (garam per user, bukan PIN mentah); penyimpanan kecil sensitif lewat Capacitor Preferences bila perlu.
- **Struk:** Capacitor Share / Web Share API (WhatsApp), printer thermal Bluetooth lewat plugin Capacitor bila stabil; bila belum stabil di MVP, struk WhatsApp dulu — tetapi jangan hapus struk dari MVP.
- **Backup/export:** CSV dibuat di web layer, backup di-zip (JSZip) dan dibagikan / disimpan lewat Capacitor Filesystem + Share.
- **Repo:** **https://github.com/bengkelgadget-code/BG-VUE3** ("Aplikasi konterku") — repo aplikasi BUKU KONTER ini. **FAKTA: repo ini baru dibuat user 8 Nov 2026 dan saat ini KOSONG — hanya `.git`, belum ada kode, workflow, atau release.** Opsi monorepo di repo Server Pulsa yang lama DIGANTI: aplikasi ini tinggal di repo BG-VUE3 sendiri, bukan di repo Server Pulsa. Gemini mulai dari repo kosong (commit pertama di Fase 0). Push hanya atas persetujuan user dengan repo + branch yang jelas (BG-VUE3, branch `main`).

**Update OTA — via GitHub (keputusan user 8 Nov 2026), pola Setel:**
- User memilih update OTA memakai **fasilitas GitHub**. Mekanisme yang harus dibangun dari nol (workflow **BELUM ADA** — repo BG-VUE3 masih kosong, jangan klaim sudah ada): **GitHub Actions** yang berjalan tiap naik versi — build APK → publish ke **GitHub Release** → tulis/update **`version.json`** berisi `version_code`, `version_name`, `download_url`, `changelog`, `force_update` → aplikasi mengecek `version.json` saat dibuka dan menawarkan update ke user.
- **Pelajaran wajib dari Setel / BELANJAKU (jangan diulangi): keystore rilis HARUS sudah tersimpan di GitHub Secrets SEBELUM install pertama.** Kalau keystore belum ada saat build pertama, signature APK berubah tiap build dan Android menolak update menimpa instalasi lama — kejadian di BELANJAKU: Build 14 tidak bisa menimpa Build 9 karena kunci signing berbeda, user terpaksa backup data, uninstall, lalu install ulang. Di proyek ini: siapkan keystore rilis + GitHub Secrets di Fase 0, sebelum APK pertama dibagikan ke user.
- Alur OTA DIKUNCI oleh user 8 Nov 2026 (lihat §14 poin 8 dan Addendum poin 5): **GitHub Actions + Release APK, pola Setel — satu-satunya jalur OTA.** Deploy Vercel DITOLAK sebagai jalur OTA — jangan jadikan deploy Vercel sebagai mekanisme update aplikasi. Yang sudah pasti dibangun di Fase 0 adalah repo + keystore di Secrets; workflow OTA dibangun di Fase 2.
- Perubahan **shell native** tetap butuh **APK baru dan install ulang**: menambah plugin Capacitor native, mengubah izin Android, mengganti versi Capacitor, atau mengubah ikon / nama paket. Jangan janjikan "semua update tanpa install" — yang tanpa install hanya bagian web.

**Kualitas kode untuk Gemini:**
- Pisahkan: UI (komponen `.vue`) ↔ logika (Pinia store / composable) ↔ aturan tarif (`adminFeeEngine.ts` murni, bisa unit test tanpa UI) ↔ data (repository di atas Dexie). Aturan tarif WAJIB unit testable dengan Vitest: beri 20 contoh (nominal, jenis, aturan), assert admin yang cocok / tidak cocok / overlap ditolak / celah diperingatkan.
- Semua perhitungan uang di satu tempat (jangan ada rumus saldo tersebar di tiap komponen). Satu fungsi `applyTransaction` yang menjalankan §6.4 dalam satu transaksi database.
- Format & cek sebelum serah terima: `npm run build`, `npm run type-check` (vue-tsc), `npm run lint`, `npm run test` (Vitest) — semuanya harus bersih / hijau.
- Jangan hardcode warna/font/ukuran di tiap komponen — semua lewat CSS variables + token §8.5.
- Jangan hardcode nama brand di logika inti — nama aplikasi dari satu konstanta / env.

**Jangan pakai di MVP:** Firebase Auth/Firestore, iklan, analytics pihak ketiga, backend sendiri, atau koneksi Digiflazz (dilarang §1.4 poin 1).

## 11. Keamanan, Privasi & Kinerja

- PIN: simpan hash saja (bukan PIN mentah), di secure storage Capacitor (bukan di IndexedDB biasa). PIN salah 5× berturut-turut → jeda 5 menit (bukan kunci permanen tanpa jalan keluar — sediakan reset PIN oleh owner dengan verifikasi, dokumentasikan di BUILD-SPEC).
- Peran ditegakkan di lapisan repository / logika, bukan hanya dengan menyembunyikan tombol di UI. Kasir tidak bisa memanggil fungsi koreksi saldo / ubah master walau lewat jalan pintas — repository menolak berdasarkan peran user yang login.
- Modal (costPrice) tidak pernah dikirim ke widget kasir. Repository mengembalikan DTO berbeda per peran: kasir hanya menerima nama + harga jual + stok; owner/admin menerima modal + laba.
- Foto bukti (v1.1): lokal saja, tidak di-upload ke server mana pun. Tulis ini di halaman Tentang supaya user tenang.
- Izin aplikasi yang diminta: Bluetooth (printer thermal, bila dipakai), Notifikasi (untuk peringatan v1.1), Penyimpanan (backup/export). Minta izin tepat saat dibutuhkan + jelaskan kenapa dalam satu kalimat.
- Kinerja: daftar transaksi pakai lazy list / virtual scroll (jangan render 1.000 item sekaligus), query laporan pakai agregasi Dexie (index per akun / tanggal) bukan loop di JavaScript atas seluruh riwayat untuk 12 bulan, saldo akun dihitung via query agregasi (bukan dijumlah di memori dari seluruh riwayat setiap kali buka Home — gunakan ringkasan per akun yang diperbarui per transaksi, tetapi ringkasan itu dihitung ulang dari mutasi saat verifikasi, bukan angka yang diedit manual).
- Aksesibilitas: kontras teks ≥ 4.5:1, ukuran tombol ≥ 48px, dukung label screen reader / aria-label untuk tombol ikon (tombol ikon tanpa label = gagal).
- Privasi: tidak ada analytics pihak ketiga, tidak ada data transaksi yang keluar dari HP di MVP kecuali yang user export / bagikan sendiri (CSV, backup, struk WhatsApp).

---

## 12. Kriteria Penerimaan & Checklist QA (Gemini Wajib Centang Sebelum Serah)

### 12.1 Acceptance per fitur (uji manual di HP user, di konter)
- [ ] Buka shift: login PIN kasir → saldo awal dari serah terima sebelumnya tampil → konfirmasi → form transaksi terbuka.
- [ ] Tambah transaksi transfer Rp500.000 admin Cash: saldo Bank − Rp500.000, Kas + Rp505.000, laba Rp5.000, muncul di daftar & laporan (Contoh A §6.5).
- [ ] Tambah transaksi transfer Rp500.000 admin Debit Rekening: saldo Bank − Rp495.000, Kas + Rp500.000, laba Rp5.000 (Contoh B §6.5, keputusan dikunci 8 Nov 2026).
- [ ] Jual voucher + pulsa satu kunjungan: stok voucher −1, saldo catatan server − modal, Kas + total jual, laba = jumlah laba per item (Contoh C §6.5).
- [ ] Tarif admin: 10 transaksi dengan nominal sama diuji 2 petugas berbeda → admin otomatis sama persis 10/10.
- [ ] Tarif tidak cocok: nominal di luar semua range → admin Rp0 + banner "belum ada tarif" muncul, tidak ada angka fallback.
- [ ] Validasi tarif: simpan aturan yang overlap → ditolak dengan nama aturan yang bentrok; simpan aturan yang meninggalkan celah → peringatan celah tampil.
- [ ] Modal dari master: ubah modal di master → transaksi baru pakai modal baru, transaksi lama tetap pakai modal lama (snapshot).
- [ ] Kasir tidak melihat modal: login sebagai kasir → tidak ada angka modal di layar mana pun (form, detail, laporan shift kasir).
- [ ] Koreksi saldo manual: login kasir → menu tidak ada; login admin → koreksi dengan alasan → mutasi "Koreksi Manual" muncul di laporan + audit.
- [ ] Hutang versi simpel (MVP): buat transaksi Hutang tanpa nama pelanggan → ditolak; dengan nama → masuk daftar piutang; tekan Lunas penuh → piutang hilang dari daftar terbuka dan tercatat lunas. Cicilan tidak ada di MVP.
- [ ] Void: void transaksi voucher dengan alasan + PIN admin → saldo & stok kembali, baris asli berstatus Batal, audit log tercatat.
- [ ] Serah terima shift: tutup shift → hitung fisik (kas per pecahan) → selisih −Rp5.000 wajib penjelasan → PIN berdua → shift baru mulai dari angka fisik yang diterima.
- [ ] Tutup harian: owner mengesahkan → hari terkunci → tambah transaksi ke hari itu ditolak (atau tercatat sebagai susulan di hari berjalan dengan catatan).
- [ ] Stok: jual 5 voucher → stok −5; void 1 → stok +1; stok 0 → peringatan keras muncul, simpan butuh PIN owner.
- [ ] Laporan: laba per kategori + mutasi per akun bisa diklik → transaksi pembentuknya benar.
- [ ] Export CSV: dibuka di Sheets, kolom & angka benar.
- [ ] Backup-restore: restore di install ulang → semua transaksi + master kembali.
- [ ] Offline penuh: matikan internet & data → semua fitur MVP jalan; penyegaran katalog Supabase gagal diam-diam (pakai cache) tanpa banner error.
- [ ] Tema terang + gelap: semua layar dibaca nyaman, tidak ada teks putih di atas putih / hitam di atas hitam.
- [ ] Rotasi layar & font besar: layout tidak pecah, tombol Simpan tetap terlihat.
- [ ] Pure pencatatan: setelah seharian transaksi di aplikasi ini, saldo di aplikasi Server Pulsa tidak berubah karena pencatatan ini (dicek manual oleh user di aplikasi Server Pulsa).

### 12.2 Yang membuat PRD ini dianggap GAGAL (jangan sampai terjadi)
- Pencatatan di aplikasi ini mengubah saldo asli Server Pulsa / Digiflazz / bank / e-wallet, atau memanggil Digiflazz, atau menulis ke tabel produk Supabase.
- Modal tampil ke kasir, atau kasir bisa menginput modal di form transaksi.
- Biaya admin memakai angka fallback hardcoded saat tidak ada aturan cocok.
- Aturan tarif yang overlap bisa disimpan.
- Transaksi bisa dihapus permanen (hard-delete) tanpa jejak.
- Saldo akun tidak cocok dengan jumlah mutasi (saldo drift).
- Serah terima shift bisa selesai tanpa hitung fisik dan tanpa PIN berdua.
- Koreksi saldo manual bisa dilakukan kasir, atau tanpa alasan, atau tanpa jejak audit.
- Teks error Inggris mentah tampil ke user.

---

## 13. Rencana Rilis Bertahap (untuk Gemini)

- **Fase 0 — Fondasi (1–2 hari kerja):** Repo BG-VUE3 (kosong — clone, commit pertama, branch `main`), proyek Vue 3 + Vite + Capacitor, design token CSS + token §8.5, Vue Router, database Dexie + model §9 (11 tabel), **TIDAK ADA master bawaan — semua master lokal kosong saat install pertama (akun, produk voucher/perdana/aksesoris, pelanggan, tarif); user mengisi sendiri lewat form input di aplikasi (§5); pengecualian: identitas produk dari katalog Supabase Server Pulsa ditarik read-only ke cache (§5.3); saldo awal akun diisi manual di form Tambah Akun (§5.2)**, login PIN + peran, Home + daftar kosong yang membantu. **Wajib di Fase 0, sebelum APK pertama dibagikan: keystore rilis dibuat dan disimpan di GitHub Secrets** (pelajaran BELANJAKU — lihat §10).
- **Fase 1 — MVP Inti:** Akun saldo + mutasi, koreksi saldo manual (Owner/Admin), master lengkap (§5), form transaksi dinamis 12 jenis + keranjang, tarif admin otomatis + validasi (§5.4.1–§5.4.2), rumus saldo §6.4 + contoh §6.5, stok otomatis, **hutang-piutang versi simpel (status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang, tombol Lunas penuh)**, serah terima shift 7 langkah, tutup harian, void + audit, laporan per shift/hari, struk WhatsApp, export CSV + backup lokal. Uji §12.1 (semua kecuali yang bertanda v1.1/v2).
- **Fase 2 — Poles & Serah:** Dark mode penuh, animasi & haptic, cetak thermal Bluetooth (bila belum stabil di Fase 1), foto bukti? (tidak — foto bukti itu v1.1), peringatan saldo/stok menipis (v1.1 — jangan selipkan ke Fase 1), empty state, onboarding singkat 1 layar (bisa di-skip), perbaikan dari uji HP user, `npm run lint` + `vue-tsc` + `npm run test` hijau, README cara deploy ke Vercel + cara build APK Capacitor + cara test (§12.1). **Workflow OTA GitHub (Actions build APK → Release + `version.json` + cek update di aplikasi) dibangun di fase ini — alur OTA sudah DIKUNCI user 8 Nov 2026: GitHub Actions + Release APK pola Setel, deploy Vercel ditolak sebagai jalur OTA (lihat §14 poin 8 dan Addendum poin 5)**; keystore di Secrets sudah harus ada sejak Fase 0.
- **Fase 3 — Setelah MVP stabil (bukan bagian MVP):** baru v1.1 (hutang-piutang lanjutan: cicilan / pelunasan sebagian, umur hutang, pengingat; peringatan saldo/stok, foto bukti, opname terpandu, Top 10 layanan, laporan perbandingan). Jangan selipkan v1.1 ke tengah MVP. Setelah v1.1 stabil, baru v2 (sync antar perangkat, cadangan cloud, multi-cabang — semuanya butuh keputusan user dulu, §14).

---

## 14. Pertanyaan Terbuka & Default Bila User Diam

| # | Pertanyaan | Default yang dipakai Gemini bila user belum jawab |
|---|---|---|
| 1 | Daftar tarif admin awal lengkap? | **DIKUNCI — keputusan user 8 Nov 2026: TIDAK ADA daftar tarif awal.** Tabel `admin_fee_rules` kosong saat install pertama; user (Owner/Admin) membuat sendiri semua range tarifnya lewat form Master Tarif yang meniru Pengaturan_Margin BG-APP (lihat §5.4). Contoh §5.4 HANYA contoh + kasus uji, BUKAN data seed. Aturan pembulatan persentase SUDAH DIKUNCI (bulatkan ke atas, `Math.ceil`) — lihat §5.4 dan Addendum poin 7. Jangan tanyakan ulang. |
| 2 | Berapa shift per hari, dan apakah serah terima stok bergilir (1–2 kategori per shift) diterima, atau dituntut hitung penuh? | Default: 2 shift per hari; stok bergilir 1–2 kategori per shift, opname penuh mingguan. |
| 3 | Apakah ada lebih dari satu laci kas fisik? | Default: 1 laci kas (1 akun Kas). Bila ternyata lebih dari 1, kas diperlakukan sebagai akun terpisah per laci — tanyakan saat setup awal. |
| 4 | Siapa saja yang memegang peran Owner / Admin, dan siapa yang memegang buka kunci tutup harian? | Default: Owner = bengkel; Admin = ditunjuk owner saat setup awal (nama + PIN dibuat di layar setup pertama). Buka kunci tutup harian = Owner saja. |
| 5 | Sync multi-HP / cadangan cloud (v2) mau pakai apa? | Belum diputuskan — jangan mulai coding sync. MVP tetap local-first offline penuh. |
| 6 | Nama aplikasi final? | Pakai "BUKU KONTER" di UI, gampang diganti lewat satu konstanta. |
| 7 | iOS kapan? | Setelah Android/web stabil di HP user — codebase Vue 3 + Capacitor yang sama, tinggal build Capacitor iOS. |
| 8 | Alur OTA: GitHub Actions + Release APK (pola Setel) atau deploy Vercel? | **DIKUNCI — keputusan user 8 Nov 2026: GitHub Actions + Release APK, pola Setel.** Workflow build APK tiap naik versi → GitHub Release + `version.json` (`version_code`, `version_name`, `download_url`, `changelog`, `force_update`) → aplikasi mengecek `version.json` dan menawarkan update. **Deploy Vercel DITOLAK sebagai jalur OTA.** Workflow OTA dibangun di Fase 2 (§13). Jangan tanyakan ulang. |

**Keputusan yang sudah dikunci dan TIDAK boleh dibuka lagi tanpa persetujuan user:** murni pencatatan (§1.4 poin 1), modal dicatat di master lokal (§1.4 poin 2), koreksi saldo manual hanya Owner/Admin, admin Cash / Debit Rekening di sebelah nominal, tarif admin per range adalah MVP, **Debit Rekening = potong dari nominal (hBeli = nominal − admin, §6.3 — dikunci user 8 Nov 2026; varian bank −Rp505.000 ditolak)**, **stack Vue 3 + Capacitor (bukan Flutter)**, **hutang-piutang versi simpel masuk MVP (keputusan user 8 Nov 2026, DIKUNCI)**, **repo aplikasi ini BG-VUE3 (bukan monorepo Server Pulsa)**, **alur OTA = GitHub Actions + Release APK pola Setel, deploy Vercel ditolak sebagai jalur OTA (keputusan user 8 Nov 2026, DIKUNCI)**, **tidak ada data tarif awal — user mengisi sendiri lewat form Master Tarif seperti Pengaturan_Margin BG-APP (keputusan user 8 Nov 2026, DIKUNCI)**, **tidak ada data master awal — master lokal kosong saat install pertama, user mengisi sendiri lewat form input; produk Supabase tetap ditarik read-only (keputusan user 8 Nov 2026, DIKUNCI)**.

---

## Lampiran A — Contoh Hitungan Tarif Admin (untuk Unit Test `admin-fee-engine`)

| Nominal | Jenis | Aturan cocok | Admin |
|---|---|---|---|
| Rp20.000 | Tarik Tunai | 20rb–<100rb, Tetap | Rp3.000 |
| Rp50.000 | Tarik Tunai | 20rb–<100rb, Tetap | Rp3.000 |
| Rp99.999 | Transfer | 20rb–<100rb, Tetap | Rp3.000 |
| Rp100.000 | Transfer | 100rb–<1jt, Tetap | Rp5.000 (batas bawah inklusif, batas atas eksklusif — Rp100.000 tidak masuk aturan pertama) |
| Rp500.000 | Transfer | 100rb–<1jt, Tetap | Rp5.000 |
| Rp2.000.000 | Tarik Tunai | 1jt–<5jt, Tetap | Rp7.500 |
| Rp5.000.000 | Transfer | ≥5jt, 0,4% | Rp20.000 |
| Rp10.000.000 | Transfer | ≥5jt, 0,4% | Rp40.000 |
| Rp5.123.456 | Transfer | ≥5jt, 0,4% | Rp20.494 (0,4% = 20.493,824 → dibulatkan KE ATAS menjadi Rp20.494 — test pembulatan `Math.ceil`, bukan `Math.round`) |
| Rp10.000 | Transfer | Tidak ada aturan cocok | Rp0 + banner "belum ada tarif" |
| Rp150.000 | Pulsa | Tidak ada aturan untuk Pulsa (bila tidak tercentang) | Rp0 — pulsa memakai laba jual−modal, bukan admin tarif |

**Test validasi tarif (wajib lolos):** simpan aturan 50rb–<150rb untuk Transfer saat sudah ada 20rb–<100rb untuk Transfer → DITOLAK (overlap 50rb–<100rb). Simpan aturan 20rb–<100rb untuk Transfer + 200rb ke atas untuk Transfer (tanpa 100rb–200rb) → disimpan DENGAN peringatan celah Rp100.000–<Rp200.000. Urutan first-match: aturan dengan nominal awal terbesar dicek dulu. **Test pembulatan (wajib lolos):** Rp5.123.456 × 0,4% = 20.493,824 → admin Rp20.494 (`Math.ceil` — selalu ke atas, bukan `Math.round`).

## Lampiran B — Contoh Transaksi Lengkap (untuk QA Manual)

**Transaksi 1 — Transfer (Contoh A §6.5):** Shift pagi, kasir Andi. Jenis Transfer, detail Bank BCA tujuan (rek. 1234567890 a.n. Budi), sumber dana Bank BCA konter, nominal Rp500.000, admin otomatis Rp5.000 (aturan 100rb–<1jt), bayar admin Cash, terima dari pelanggan Tunai. Simpan → Bank BCA Rp10.000.000 → Rp9.500.000; Kas Rp750.000 → Rp1.255.000; laba Rp5.000.

**Transaksi 2 — Pulsa (Contoh C §6.5):** Jenis Pulsa, produk "Telkomsel 25.000" (dari katalog), nomor HP tujuan 0812xxxx, modal Rp24.500 (dari master lokal), jual Rp27.000, terima Tunai. Simpan → saldo catatan server − Rp24.500; Kas + Rp27.000; laba Rp2.500; saldo asli Server Pulsa tidak berubah.

**Transaksi 3 — Void:** Transaksi 1 ternyata salah nomor rekening. Admin membatalkan dengan alasan "Salah nomor rekening tujuan" + PIN admin → Bank BCA kembali + Rp500.000, Kas kembali − Rp505.000, laba Rp5.000 dibatalkan, stok tidak berubah (transfer tidak punya stok), baris Transaksi 1 berstatus Batal, audit log mencatat siapa membatalkan dan kapan.

## Lampiran C — Referensi untuk Dibuka Gemini Sebelum Coding
- Rancangan Aplikasi Pembukuan Transaksi Konter v1.9 (PDF, 12 halaman) — sumber kebenaran rancangan, ada di folder yang sama dengan PRD ini.
- Repo lama BG-APP — https://github.com/bengkelgadget-code/BG-APP (pola saja: Pengaturan_Margin, calculateDynamicMargin, updateBalances, master produk, sumber dana 5 kategori; JANGAN salin mentah — larangan di §5.7).
- Repo aplikasi ini — https://github.com/bengkelgadget-code/BG-VUE3 ("Aplikasi konterku", kosong — mulai dari commit pertama; OTA via GitHub Actions + Release + `version.json`, pola Setel).
- PRD BELANJAKU — `PRD-keuangan-pribadi-scan-nota.md` (pola struktur PRD ini; token desain §8.5 diselaraskan).
- Vue 3 — vuejs.org; Capacitor — capacitorjs.com; Pinia — pinia.vuejs.org; Dexie — dexie.org
- Plus Jakarta Sans — Google Fonts
- Lucide Icons — lucide.dev

---

*Akhir PRD v1.8 — BUKU KONTER, 8 November 2026. Perubahan setelah ini ditulis sebagai v1.9 dengan catatan apa yang berubah, bukan mengedit diam-diam bagian yang sudah disetujui. Keputusan user yang lebih baru selalu menang atas PRD ini.*

---

## Addendum — 8 November 2026 (keputusan user, v1.1)

**1. Debit Rekening = potong dari nominal — DIKUNCI (user konfirmasi 8 Nov 2026).**
Contoh yang benar dan satu-satunya: transfer Rp500.000, admin Rp5.000 Debit Rekening → hBeli = Rp500.000 − Rp5.000 = Rp495.000, hJual = Rp500.000, profit Rp5.000, bank sumber dana −Rp495.000 (saldo akhir Rp9.505.000 dari Rp10.000.000). Varian lama rancangan v1.3 Contoh B (bank −Rp505.000, admin ditambah di atas nominal dan dibebankan ke sumber dana) DITOLAK dan sudah dihapus sebagai alternatif di seluruh dokumen — §6.3, §6.4, §6.5 Contoh B, §12.1, dan §14 sudah diselaraskan ke rumus ini. Poin ini dipindahkan dari daftar pertanyaan terbuka (§14) ke daftar keputusan yang sudah dikunci. Jangan pakai dua rumus sekaligus, di dokumen maupun di kode.

**2. Stack diganti Flutter → Vue 3 + Capacitor (user, 8 Nov 2026).**
Alasan user: (a) lebih ringan — app ini hanya form + tabel + laporan, tidak butuh runtime Flutter yang berat; (b) update OTA lebih gampang — deploy baru ke Vercel langsung jalan di web, tidak perlu install APK ulang; (c) stack-nya sama dengan aplikasi Server Pulsa yang sudah ada (SERVERPULSA-VUE3: Vue + Capacitor). Yang berubah: §10 Teknologi ditulis ulang (Vue 3 + TypeScript + Vite, Pinia, Vue Router, Dexie/IndexedDB, Capacitor), §9 Model Data (Dexie, bukan Drift/SQLite), §8 token desain (CSS variables, bukan ThemeData; satuan px, bukan dp/sp; ikon `lucide-vue-next`), §11 (PIN hash di secure storage Capacitor; agregasi Dexie; aria-label), §13 Fase 0 dan Fase 2 (cek `npm run lint` + `vue-tsc` + Vitest, README deploy Vercel + build APK Capacitor), serta header dokumen (platform + versi v1.1). Yang TIDAK berubah: struktur §1–§15, user stories US-01..US-34, scope, dan semua keputusan lain — murni pencatatan v1.2, modal di master v1.3, koreksi saldo hanya Owner/Admin, tarif admin per range MVP, shift 7 langkah, void bukan hapus, uang tetap integer Rupiah, Bahasa Indonesia, timezone WITA. Catatan jujur soal OTA: yang langsung ter-update dari deploy Vercel adalah jalur web/PWA; APK Capacitor hanya perlu di-build ulang bila plugin native-nya berubah — jangan klaim APK ikut ter-update otomatis dari Vercel. Catatan perbedaan dengan Setel: di app Setel dulu Flutter menang karena butuh background playback audio; app pembukuan ini tidak butuh itu, jadi keunggulan Vue + Capacitor berlaku di sini. **Konsekuensi (sudah dikerjakan di revisi yang sama):** BUILD-SPEC pendamping (`BUILD-SPEC-pembukuan-konter-untuk-gemini.md`) sudah diselaraskan ke Vue 3 + Capacitor + Dexie (v1.1) dengan aturan yang sama (kontrak TypeScript §4, fee resolver, balance delta, keputusan debit, dan hutang simpel MVP di bawah).

**3. Hutang-piutang — versi simpel masuk MVP, DIKUNCI sebagai keputusan user 8 Nov 2026 (menggantikan status pilihan revisi / OPEN di v1.2).**
User memutuskan "kita pakai versi MVP". Yang dipindah ke v1.1 kemarin adalah seluruh fitur hutang, sehingga versi pertama tidak bisa mencatat hutang sama sekali. Keputusan finalnya: **versi simpel dikerjakan di MVP** (status Lunas/Hutang, nama pelanggan wajib bila Hutang, daftar piutang per pelanggan, tombol Lunas penuh — US-26, §4, §5.5, §6.1, §9), dan **yang ditunda ke v1.1 hanya lanjutannya** (pelunasan sebagian / cicilan, umur hutang, pengingat). §4 dan §14 sudah diselaraskan ke posisi ini; poin ini sudah dipindahkan dari daftar pertanyaan terbuka ke daftar keputusan yang sudah dikunci. Jangan tanyakan ulang.

**4. Repo pindah ke BG-VUE3 + OTA via GitHub (user, 8 Nov 2026).**
Repo aplikasi ini sekarang **https://github.com/bengkelgadget-code/BG-VUE3** ("Aplikasi konterku"). Opsi monorepo di repo Server Pulsa yang lama DIGANTI — aplikasi BUKU KONTER tinggal di repo BG-VUE3 sendiri. **FAKTA: repo ini baru dibuat user 8 Nov 2026 dan saat ini KOSONG — hanya `.git`, belum ada kode, workflow, atau release.** Gemini mulai dari repo kosong (commit pertama di Fase 0). Update OTA memakai fasilitas GitHub mengikuti pola Setel: GitHub Actions build APK tiap naik versi → GitHub Release + `version.json` (`version_code`, `version_name`, `download_url`, `changelog`, `force_update`) → aplikasi mengecek `version.json` dan menawarkan update. **Workflow OTA BELUM ADA dan harus dibangun dari nol** — jangan klaim sudah ada. **Pelajaran wajib dari Setel / BELANJAKU: keystore rilis HARUS sudah di GitHub Secrets SEBELUM install pertama** — kalau tidak, signature APK berubah tiap build dan Android menolak update menimpa instalasi lama (kejadian BELANJAKU Build 14 tidak bisa menimpa Build 9; user terpaksa backup data, uninstall, lalu install ulang). **Alur OTA detail sudah DIPUTUSKAN — lihat poin 5 di bawah.** Push ke repo hanya atas persetujuan user dengan repo + branch jelas (BG-VUE3, branch `main`).

**5. Alur OTA DIKUNCI — GitHub Actions + Releases APK, pola Setel; deploy Vercel ditolak sebagai jalur OTA (user, 8 Nov 2026).**
User memilih **GitHub Actions + Releases APK (pola Setel)** sebagai satu-satunya jalur OTA. Mekanisme: workflow GitHub Actions build APK tiap naik versi → publish ke **GitHub Release** → tulis/update **`version.json`** berisi `version_code`, `version_name`, `download_url`, `changelog`, `force_update` → aplikasi mengecek `version.json` saat dibuka dan menawarkan update ke user. **Deploy Vercel DITOLAK sebagai jalur OTA** — jangan jadikan deploy Vercel sebagai mekanisme update aplikasi. Workflow OTA tetap dibangun di **Fase 2** (§13); keystore rilis di GitHub Secrets tetap wajib sejak Fase 0, sebelum APK pertama dibagikan. §10, §13 Fase 2, §14 poin 8, dan daftar keputusan terkunci sudah diselaraskan ke posisi ini; poin ini dipindahkan dari daftar pertanyaan terbuka ke daftar keputusan yang sudah dikunci. Jangan tanyakan ulang.

**6. Standar UI/UX DIKUNCI — cantik, rapi, profesional, dan tidak berat (user, 8 Nov 2026).**
User minta UI/UX yang cantik, susunan rapi, terlihat profesional, dan tidak berat. Standar baru ini dikunci di **§8.6** (prinsip ke-6 di §8.1 merujuk ke sana; baris animasi §8.4 diselaraskan dari 200–300ms menjadi maks ~200ms). Isinya: **cantik & profesional** — tampilan bersih dan konsisten, palet hanya dari design token §8.5 yang sama di semua layar, hierarki jelas, whitespace cukup, kartu rapi, angka uang tabular dan mudah dibaca, warna status konsisten, tidak ada layar yang asal jadi; **rapi** — satu pola layout untuk semua halaman (header, konten, aksi bawah), jarak dan ukuran konsisten, tidak ada elemen yang tumpang tindih atau terpotong saat font sistem diperbesar; **tidak berat** — TANPA library animasi (transisi hanya CSS, maks ~200ms, hormati `prefers-reduced-motion`), TANPA gambar/foto latar besar, ikon SVG Lucide tree-shaken saja, SATU keluarga font saja (Plus Jakarta Sans yang sudah ada, jangan tambah font kedua), TANPA framework UI berat (tanpa Vuetify/Quasar/PrimeVue dan sejenis — styling pakai CSS variables + komponen sendiri), route di-lazy-load per halaman, tidak ada proses background berat, aplikasi harus terasa cepat di HP spek rendah dan tidak lag saat mengetik nominal; **bukti** — tiap fase Gemini WAJIB kirim screenshot layar utama (Home, Tambah Transaksi, Serah Terima) untuk review user sebelum fase dianggap selesai, dan palet tidak boleh diganti diam-diam (aturan §8.5 tetap berlaku). Prinsip lama §8.1–§8.5 tidak dihapus — standar ini menambah dan menguatkan.

**7. Aturan pembulatan biaya admin persentase DIKUNCI — bulatkan ke atas (user, 8 Nov 2026).**
User memutuskan: biaya admin dari tarif Persentase selalu dibulatkan **ke atas ke Rupiah terdekat** — rumusnya `admin = Math.ceil(nominal × persen / 100)` dalam integer Rupiah. Contoh yang benar: nominal Rp5.123.456, tarif 0,4% → 20.493,824 → admin **Rp20.494**. Biaya Tetap tidak dibulatkan (nilainya sudah bulat). Ini **MENGGANTIKAN** perilaku `Math.round` di BG-APP lama, yang membulatkan ke terdekat — jangan pakai `Math.round` untuk biaya admin persentase di aplikasi ini. Yang diselaraskan di revisi yang sama: field "Pembulatan" di tabel aturan tarif §5.4 (dari "pilihan + default sementara, belum diputuskan" menjadi aturan terkunci), rumus pencocokan §5.4.1 poin 3, contoh hitung §5.4, larangan §5.7, pertanyaan terbuka §14 poin 1 (pembulatan dihapus dari pertanyaan — yang tersisa OPEN hanya **daftar tarif awal lengkap**, menunggu daftar final dari user sebelum rilis — **catatan: status OPEN ini sudah diganti oleh poin 8 di bawah, tidak lagi OPEN**), serta Lampiran A (baris test Rp5.123.456 → Rp20.494 + test pembulatan wajib lolos). Jangan tanyakan ulang.

**8. TIDAK ADA data tarif awal — user mengisi sendiri lewat form Master Tarif seperti Pengaturan_Margin BG-APP (user, 8 Nov 2026, DIKUNCI).**
User memutuskan: daftar tarif admin TIDAK perlu disediakan sebagai data awal. Tabel `admin_fee_rules` **kosong** saat install pertama — tidak ada satu pun aturan tarif yang di-seed dari dokumen ini, dan Gemini dilarang men-seed contoh §5.4 sebagai data awal. User (Owner/Admin) membuat sendiri semua range tarifnya lewat **form Master Tarif di aplikasi, yang meniru form Pengaturan_Margin di app lama BG-APP**: field Tipe Perhitungan (Range Nominal / Persentase), Layanan Terkait multi-select (Transfer, Jasa Transfer, Tarik Tunai, E-Wallet, PPOB, Token PLN, dan layanan lain yang relevan), Nominal Awal (>=), Nominal Akhir (<, kosong = tanpa batas atas), nilai biaya (Tetap Rp / Persentase %), plus tombol Tambah / Ubah / Hapus aturan dan Aktif/Nonaktif — form ini hanya untuk Owner/Admin. Dua contoh user yang sudah ada (Rp20rb–<Rp100rb → Rp3.000; ≥Rp5jt → 0,4%, beserta dua baris tengah Rp100rb–<Rp1jt Rp5.000 dan Rp1jt–<Rp5jt Rp7.500) TETAP di dokumen **hanya sebagai contoh + kasus uji** (Lampiran A memakai aturan contoh sebagai fixture test), BUKAN sebagai data seed. Validasi yang sudah ada TETAP berlaku: tolak overlap untuk layanan yang sama, peringatkan celah nominal (§5.4.2); biaya admin di form transaksi terisi otomatis dari aturan ini, bisa di-override manual dan override tercatat (§5.4.1 poin 6); kalau belum ada aturan yang cocok, admin = Rp0 + banner "belum ada tarif" (§5.4.1 poin 4). Yang diselaraskan di revisi yang sama: prinsip §1.4 poin 10 (baru), intro §5.4 + caption contoh, layar Master Tarif, Fase 0 (master bawaan tanpa tarif contoh), pertanyaan terbuka §14 poin 1 (dihapus dari daftar OPEN — tidak ada lagi yang OPEN soal tarif awal), dan daftar keputusan terkunci §14. Jangan tanyakan ulang.

**9. TIDAK ADA data master awal — master lokal kosong saat install pertama, user mengisi sendiri lewat form input; produk Supabase tetap ditarik read-only (user, 8 Nov 2026, DIKUNCI).**
User memutuskan: untuk DATA MASTER berlaku sama seperti tarif — sediakan form inputnya saja, user yang menginput sendiri datanya. Saat install pertama, semua master lokal KOSONG: akun saldo (bank / e-wallet / kas / server pulsa / provider), produk voucher / perdana / aksesoris, pelanggan, dan aturan tarif. Tidak ada satu pun data contoh yang di-seed — "akun contoh, produk contoh" di Fase 0 versi lama sudah dihapus dan diganti aturan ini. Owner/Admin mengisi sendiri lewat form input di aplikasi: form Tambah Akun (nama, kelompok, nomor rekening/HP, nama pemilik, saldo awal wajib — tercatat sebagai saldo awal, bukan transaksi — status aktif/nonaktif), form Master Produk (voucher/perdana/aksesoris diinput manual lengkap: nama, operator/kategori, modal, jual, stok awal), form Master Pelanggan (nama, nomor HP, catatan), dan form Master Tarif (§5.4). **PENGECUALIAN:** identitas produk pulsa / paket data / token PLN dan produk katalog lainnya yang SUDAH ADA di katalog Supabase Server Pulsa tetap ditarik read-only ke `product_catalog_cache` (nama / operator / denominasi + `external_product_ref`) — user TIDAK perlu mengetik ulang produk-produk itu; di form Master Produk, produk Supabase dipilih dari daftar katalog lalu modal + harga jual diisi manual (keputusan v1.3 tetap berlaku: produk Supabase yang belum diisi modalnya tidak bisa dipilih di transaksi). Satu-satunya akun petugas yang dibuat di awal adalah akun Owner di layar setup pertama (nama + PIN, §14 poin 4) — tidak ada petugas contoh. Contoh-contoh di dokumen ini (nama bank seperti BCA/BRI, nama produk, angka hitungan) HANYA contoh penulisan + kasus uji, BUKAN data bawaan; template spreadsheet impor awal pun KOSONG (hanya judul kolom). Yang diselaraskan di revisi yang sama: prinsip §1.4 poin 11 (baru), §5.1 (prinsip master data + template kosong), §5.2 (saldo awal di form Tambah Akun, tanpa menu "Saldo Awal / Opname Awal" terpisah, tanpa akun contoh), §5.3 (Master Produk kosong + pengecualian Supabase), §5.5 (pelanggan kosong + form Master Pelanggan), §5.6 (tanpa petugas contoh), §8.2 (form Master Akun / Produk / Pelanggan + Pengaturan tanpa menu saldo awal), Fase 0 §13 (tanpa master bawaan), dan daftar keputusan terkunci §14. Jangan tanyakan ulang.
