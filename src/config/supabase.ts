/**
 * Kredensial proyek Supabase Server Pulsa (sinkronisasi data Buku Konter).
 * Kunci publishable ini bersifat publik by design (sudah tertanam di bundle web Server Pulsa).
 * RLS tabel bk_sync masih terbuka — kencangkan (auth/enkripsi) sebelum data asli dipakai.
 */
export const SUPABASE_URL = 'https://slkdoaeacjxgkviicaot.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_Hb_fii3GCvufN1N9Wqs60g_Mkkm_U9W';
