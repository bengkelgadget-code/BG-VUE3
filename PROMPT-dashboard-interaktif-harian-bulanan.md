# Prompt — Dashboard Interaktif Harian / Bulanan BUKU KONTER

Tempel ke Gemini di Antigravity (repo BG-VUE3, branch `main`). Kerjakan setelah perbaikan F1–F3 selesai. Jangan push sebelum aku menyetujui push.

---

Buatkan Dashboard interaktif di aplikasi BUKU KONTER (halaman Laporan / `ReportsView` — perbaiki halaman yang sudah ada, jangan buat halaman baru yang menduplikasi laporan). Dashboard harus bisa dipilih **Harian** atau **Bulanan**, dan user bisa memilih hari maupun bulannya.

## 1. Pemilih periode (wajib)

- Toggle di atas dashboard: **Harian | Bulanan** (satu pilihan aktif, tampil jelas).
- Mode Harian: date picker pilih tanggal (default = hari ini, WITA). Tampilkan tanggal yang dipilih dengan jelas (mis. "Senin, 8 Nov 2026").
- Mode Bulanan: month picker pilih bulan + tahun (default = bulan ini). Tampilkan bulan yang dipilih (mis. "November 2026").
- Ganti periode → semua angka, grafik, dan daftar di bawah langsung ikut berubah (tanpa reload halaman).
- Semua tanggal memakai zona WITA (Asia/Makassar), konsisten dengan `formatTanggalWita` yang sudah ada.

## 2. Isi dashboard (wajib, semua mengikuti periode yang dipilih)

- 4 kartu ringkasan: **Pemasukan, Pengeluaran, Laba, Jumlah Transaksi** — angka integer Rupiah via `formatRupiah` yang sudah ada, plus selisih vs periode sebelumnya (hari kemarin / bulan lalu, cukup angka + panah naik/turun).
- **Donat per layanan** (pemasukan/laba per layanan: Transfer, Tarik Tunai, Pulsa, Token, dll.) — pakai `chart.js` yang sudah ter-install, datanya dari `reportService.byLayanan` yang sudah ada. (Donat ini sekaligus menutup temuan F3 audit Fase 1 — kalau donat F3 sudah dibuat, pakai ulang komponennya, jangan buat dua donat.)
- **Grafik tren batang**: mode Bulanan → batang per tanggal dalam bulan itu; mode Harian → batang per layanan hari itu (atau daftar transaksi hari itu bila batang per jam terlalu ramai — pilih yang paling gampang dibaca, dan tulis pilihanmu di laporan).
- **Top produk** periode itu (5 teratas, nama + jumlah + laba).
- **Per kasir** periode itu (nama + jumlah transaksi + laba) — bila datanya sudah ada di `reportService.byKasir`.
- Bila periode yang dipilih tidak ada transaksi: tampilkan empty state yang rapi ("Belum ada transaksi di periode ini"), bukan angka 0 yang membingungkan dan bukan layar kosong.

## 3. Aturan yang wajib dipatuhi

- Pakai ulang logika yang sudah ada: `ReportService` (totalIn/totalOut/laba, byLayanan, byProduct, trend, byKasir) dan `formatRupiah` — JANGAN tulis ulang rumus hitung uang. Nominal selalu integer Rupiah, jangan pakai `toFixed` untuk uang.
- Jangan tambah dependensi baru apa pun (chart.js sudah ada — pakai itu; jangan tambah library chart/date lain). Jangan tambah font kedua.
- UI ikut standar yang sudah dikunci: design token CSS yang sudah ada, satu pola layout, teks Bahasa Indonesia semua, angka uang mudah dibaca (tabular), ringan (tanpa animasi berat, transisi CSS saja).
- Semua filter/penjumlahan harus diuji: logika periode (harian vs bulanan) ditaruh di service/helper yang bisa di-unit-test, bukan menempel di komponen Vue saja.

## 4. Test wajib (Vitest, harus hijau)

- Agregasi harian: transaksi tanggal 8 Nov hanya masuk ke 8 Nov, tidak bocor ke 7 atau 9 Nov.
- Agregasi bulanan: transaksi 31 Okt tidak masuk ke November; transaksi 1 Nov masuk.
- Batas bulan: Februari tahun kabisat (29 Feb 2028) terhitung benar; pindah bulan Desember → Januari tahun berikut benar.
- Periode kosong → semua kartu 0 + empty state muncul, tidak error.
- Donat per layanan memakai data `byLayanan` periode yang dipilih (bukan data semua waktu).

## 5. Setelah selesai

1. Jalankan `npm run typecheck` (harus 0 error), `npm run lint` (0 masalah), `npm test` (semua hijau, termasuk test baru di atas), `npm run build` (sukses).
2. Kirim screenshot dashboard mode Harian dan mode Bulanan untuk review (aturan UI/UX: tiap fase wajib screenshot).
3. Laporkan: file yang dibuat/diubah, hasil keempat perintah di atas, dan hasil test baru.
4. Commit secara lokal saja. JANGAN push sebelum aku menyetujui push. Jangan lanjut ke pekerjaan lain sebelum aku bilang OK.
