-- Sinkronisasi data Buku Konter (b9). Jalankan SEKALI di SQL Editor
-- project Supabase Server Pulsa (project yang sama dengan tabel products).
-- Satu baris = satu baris data lokal (table_name + row_id), isi di jsonb.
create table if not exists public.bk_sync (
  table_name text not null,
  row_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (table_name, row_id)
);

alter table public.bk_sync enable row level security;

-- Aplikasi single-user dengan anon key (model kepercayaan sama seperti
-- pembacaan katalog products). Data saat ini masih dummy/percobaan.
create policy "anon kelola sync" on public.bk_sync
  for all using (true) with check (true);

create index if not exists bk_sync_updated_at_idx
  on public.bk_sync (updated_at desc);
