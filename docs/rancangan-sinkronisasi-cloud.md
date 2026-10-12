# Rancangan: Login Email dan Sinkronisasi Cloud (Supabase)

| | |
|---|---|
| **Dokumen** | Rancangan teknis per fase dan per issue |
| **Tanggal** | 12 Oktober 2026 |
| **Basis** | Kode di `main` setelah PR #89 (versi 1.9.0) |
| **Keputusan pemilik** | Supabase project **Hawreirei's Project 2** (`aehnismvyxgihmsftane`, region Singapura), login **email saja** |
| **Status** | Usulan untuk ditinjau. Belum ada kode, database, atau pengaturan Supabase yang diubah |

---

## 1. Ringkasan

Saat ini seluruh data (set, bank soal, riwayat latihan, Buku Kesalahan, kartu hafalan, pengaturan) hanya ada di IndexedDB browser. Bila browser membersihkan data situs, semuanya hilang tanpa sisa, karena tidak ada salinan di tempat lain.

Rancangan ini menambahkan **salinan di server** tanpa mengubah cara aplikasi bekerja:

- **Local-first.** IndexedDB tetap menjadi sumber kerja utama. Aplikasi tetap cepat, tetap bisa dipakai offline, dan tetap bisa dipakai **tanpa login** (penting untuk pembeli bundel di Lynk yang dijanjikan "tanpa daftar").
- **Login opsional dengan kode email 6 digit (OTP).** Pengguna mengetik kode di dalam aplikasi, bukan mengeklik link. Ini sengaja: link email sering terbuka di browser lain atau di browser bawaan aplikasi email, sehingga sesi login berakhir di penyimpanan yang berbeda dari aplikasi. Masalah itu persis yang ingin kita hindari.
- **Sinkronisasi dua arah otomatis.** Setiap perubahan diunggah beberapa detik kemudian. Saat aplikasi dibuka, kembali online, atau tab kembali aktif, perubahan dari perangkat lain diunduh.
- **Pemulihan.** Bila data browser hilang, cukup login lagi dan semua data diunduh kembali.
- **API key tidak pernah diunggah.** Kunci tetap terenkripsi di perangkat seperti sekarang.

Catatan jujur: data yang sudah hilang sebelum fitur ini ada **tidak bisa dipulihkan** oleh fitur ini.

---

## 2. Tujuan dan bukan tujuan

**Tujuan**

1. Tidak ada lagi kehilangan data karena browser membersihkan penyimpanan, selama pengguna sudah login dan perangkat sempat online.
2. Data yang sama bisa dibuka di HP dan laptop.
3. Aplikasi tetap berfungsi penuh tanpa login dan tanpa internet.
4. Data setiap akun hanya bisa dibaca dan diubah oleh pemiliknya, dijaga oleh database (Row Level Security), bukan hanya oleh kode aplikasi.
5. Tetap di paket gratis Supabase untuk pemakaian pribadi.

**Bukan tujuan (untuk rilis ini)**

- Kolaborasi atau berbagi set antar akun secara langsung (fitur bagikan lewat berkas tetap seperti sekarang).
- Login Google atau penyedia lain.
- Server yang memanggil AI. Pembuatan soal tetap memakai API key pengguna, langsung dari browser.
- Sinkronisasi waktu nyata (Realtime). Disediakan sebagai opsi di Fase 6.

---

## 3. Arsitektur

```
 Perangkat (browser / PWA)                              Supabase (Singapura)
┌──────────────────────────────────────────┐          ┌─────────────────────────────────┐
│ Halaman React                             │          │ Auth: email OTP                 │
│   │ baca/tulis seperti sekarang           │          │                                 │
│   ▼                                       │          │ Postgres                        │
│ Dexie / IndexedDB  (sumber kerja utama)   │          │   sync_rows  (RLS per user)     │
│   │ hook creating/updating/deleting       │          │   sync_push() / sync_pull()     │
│   ▼                                       │  HTTPS   │                                 │
│ Mesin sinkronisasi (src/sync/)            │◀────────▶│                                 │
│   • cap waktu _mtime per baris            │  (JWT)   │                                 │
│   • antrean hapus (syncDeletes)           │          │                                 │
│   • push berkala, pull saat buka/online   │          │                                 │
│   • aturan gabung per tabel               │          │                                 │
└──────────────────────────────────────────┘          └─────────────────────────────────┘
```

Komponen baru di klien:

| Berkas | Isi |
|---|---|
| `src/sync/config.ts` | URL dan publishable key Supabase dari `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`. Bila kosong, fitur sinkronisasi disembunyikan (fork dan build lokal tetap jalan) |
| `src/sync/client.ts` | Memuat `@supabase/supabase-js` **secara on-demand** (tidak masuk bundle awal) |
| `src/sync/auth.ts` | Kirim kode, verifikasi kode, sesi, keluar |
| `src/sync/tables.ts` | Daftar tabel yang disinkronkan, cara membaca id, dan aturan gabung per tabel |
| `src/sync/track.ts` | Hook Dexie: cap `_mtime`, catat penghapusan |
| `src/sync/engine.ts` | Push, pull, gabung, jadwal, status |
| `src/sync/status.ts` | Status untuk UI (tersinkron, menunggu, offline, gagal) |
| `src/components/SyncCard.tsx`, `SyncBadge.tsx` | Kartu Akun & Sinkronisasi di Pengaturan, ikon status di header |

---

## 4. Data yang disinkronkan

| Data (Dexie) | Disinkronkan? | Alasan |
|---|---|---|
| `sets` | Ya | Set Saya |
| `questions` | Ya, termasuk gambar soal hasil impor | Bank soal. Gambar disimpan sebagai data URL (maks. ±400 KB per soal), masih muat di satu baris |
| `attempts` | Ya, termasuk yang belum selesai | Riwayat dan rekap latihan. Ujian yang sedang berjalan bisa dilanjutkan di perangkat lain |
| `reviews` | Ya | Buku Kesalahan dan jadwal ulangan |
| `cards` | Ya | Kartu Hafalan |
| `meta: settings` | Ya, kecuali kolom khusus perangkat (lihat bawah) | Pengaturan, rencana belajar, paket ujian, profil kisi-kisi, streak |
| `meta: reviewDays` | Ya | Hari belajar untuk streak |
| `keys` | **Tidak** | API key tetap hanya di perangkat |
| `requests` | Tidak | Log kuota per perangkat |
| `meta: deviceKey, backupHandle, backup, errorLog, reminderLast, quotaBlocked:*` | Tidak | Khusus perangkat |
| `localStorage` (tema, ukuran teks, dll.) | Tidak | Preferensi tampilan per perangkat |

Kolom `settings` yang **tidak** ikut disinkronkan: `lastSeenVersion` (kartu "Apa yang baru" per perangkat), dan referensi `keyId` di `crossCheck` dibiarkan apa adanya (bila id kunci tidak ada di perangkat lain, aplikasi sudah jatuh ke kunci bawaan).

---

## 5. Skema server

Satu tabel generik berisi dokumen JSON. Pilihan ini sengaja: semua logika aplikasi ada di klien, jadi server cukup menyimpan dan mengembalikan baris dengan aman. Menambah tabel lokal baru nanti tidak memerlukan migrasi server.

```sql
create table public.sync_rows (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  tbl        text        not null check (tbl in ('sets','questions','attempts','reviews','cards','meta')),
  id         text        not null check (length(id) between 1 and 200),
  data       jsonb,                                   -- null bila dihapus
  deleted    boolean     not null default false,
  mtime      bigint      not null,                    -- cap waktu perubahan dari klien (ms)
  device_id  text,                                    -- perangkat yang terakhir menulis
  updated_at timestamptz not null default now(),      -- waktu server, untuk kursor pull
  primary key (user_id, tbl, id),
  constraint row_size check (data is null or pg_column_size(data) < 1500000)
);
create index sync_rows_pull on public.sync_rows (user_id, updated_at);

alter table public.sync_rows enable row level security;
create policy "own rows: select" on public.sync_rows for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.sync_rows for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.sync_rows for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Tidak ada policy delete: penghapusan selalu lewat tombstone (deleted = true).
```

Penulisan lewat satu fungsi agar aturan "versi lebih baru menang" dijaga server, bukan hanya klien:

```sql
create function public.sync_push(rows jsonb) returns table (tbl text, id text, applied boolean, mtime bigint)
language sql security invoker set search_path = '' as $$
  insert into public.sync_rows as s (user_id, tbl, id, data, deleted, mtime, device_id, updated_at)
  select (select auth.uid()), r.tbl, r.id, r.data, coalesce(r.deleted, false), r.mtime, r.device_id, now()
  from jsonb_to_recordset(rows) as r(tbl text, id text, data jsonb, deleted boolean, mtime bigint, device_id text)
  on conflict (user_id, tbl, id) do update
    set data = excluded.data, deleted = excluded.deleted, mtime = excluded.mtime,
        device_id = excluded.device_id, updated_at = now()
    where excluded.mtime >= s.mtime
  returning s.tbl, s.id, true, s.mtime;
$$;
```

Pull memakai query biasa (RLS membatasi ke baris milik sendiri):
`select * from sync_rows where updated_at > :cursor - interval '2 minutes' order by updated_at limit 500`.
Jendela tumpang-tindih 2 menit menutup celah transaksi yang selesai tidak berurutan. Baris yang terunduh dua kali aman karena penggabungan bersifat idempoten.

Tombstone (baris terhapus) disimpan selamanya. Ukurannya kecil, dan ini mencegah data yang sudah dihapus muncul lagi dari perangkat yang lama offline.

---

## 6. Mesin sinkronisasi

### 6.1 Pelacakan perubahan (Dexie versi 5)

- Setiap tabel yang disinkronkan mendapat kolom `_mtime` yang terindeks. Hook `creating` dan `updating` mengisinya otomatis, jadi **tidak ada satu pun pemanggilan `put`/`update`/`modify` di halaman yang perlu diubah**. Hook seperti ini sudah dipakai untuk cadangan otomatis (`src/lib/autoBackup.ts`).
- `_mtime = max(Date.now(), _mtime terakhir + 1)`, sehingga tetap naik walau jam perangkat mundur.
- Upgrade ke versi 5 mengisi `_mtime` untuk semua baris lama. Dengan begitu, data yang sudah ada ikut terunggah pada login pertama.
- Tabel baru `syncDeletes` (`[tbl+id]`, `at`) mencatat penghapusan. Hook `deleting` tidak bisa menulis ke tabel lain di dalam transaksi yang sama, jadi pencatatan dilakukan saat transaksi selesai. Bila tab tertutup tepat di celah itu, akibat terburuknya baris yang dihapus muncul lagi. Arah kesalahannya aman: data tidak pernah hilang.
- Baris `meta` hanya dicap bila key-nya termasuk yang disinkronkan (`settings`, `reviewDays`).

### 6.2 Push (unggah)

1. Ambil baris dengan `_mtime > pushedUpTo` per tabel, ditambah isi `syncDeletes`.
2. Kirim per kelompok, maksimal 200 baris atau ±2 MB per permintaan, lewat `sync_push`.
3. Setelah berhasil, majukan `pushedUpTo` dan kosongkan `syncDeletes` yang sudah terkirim.
4. Kolom `_mtime` dan kolom khusus perangkat dibuang dari `data` sebelum dikirim.

Gagal karena offline, sesi habis, atau server dijeda: antrean tetap tersimpan di IndexedDB dan dicoba lagi dengan jeda bertambah (5 detik, 30 detik, 2 menit, 10 menit).

### 6.3 Pull (unduh) dan aturan gabung

Untuk setiap baris dari server, bandingkan dengan baris lokal:

| Tabel | Aturan |
|---|---|
| Umum (`sets`, `questions`, `reviews`, `cards`, `settings`) | **Versi terbaru menang** menurut `mtime`. Bila sama, tidak ada perubahan |
| `attempts` | Seperti umum, **kecuali** latihan yang sudah selesai (`finishedAt` ada) tidak pernah ditimpa versi yang belum selesai |
| `reviewDays` | **Digabung** (gabungan himpunan tanggal), tidak pernah ditimpa |
| `questions.notes` | Catatan dari kedua sisi digabung berdasarkan `at`, supaya catatan tutor tidak hilang |
| Tombstone | Menghapus baris lokal bila `mtime` tombstone ≥ `_mtime` lokal |

Baris hasil pull ditulis dengan penanda "dari server", sehingga hook tidak mencapnya ulang dan tidak mengunggahnya kembali (tidak ada pantulan tanpa akhir).

Setelah menulis baris dari server, `setCustomPackages` dijalankan ulang bila `settings` berubah, sama seperti saat memulihkan cadangan.

### 6.4 Jadwal

- **Push:** beberapa detik setelah perubahan terakhir (debounce 5 detik, paling lama 60 detik saat AI sedang menulis soal). Juga saat tab disembunyikan (`visibilitychange`) agar perubahan terakhir sempat terkirim sebelum aplikasi ditutup.
- **Pull:** saat aplikasi dibuka, saat kembali online, saat tab aktif lagi, dan setiap 5 menit selama tab terbuka.
- Hanya satu tab yang menjalankan sinkronisasi, dikoordinasi dengan Web Locks API. Tab lain cukup membaca IndexedDB yang sama.

### 6.5 Login pertama dan pergantian akun

- Perangkat menyimpan `syncOwner` (id pengguna yang datanya ada di perangkat ini).
- **Login pertama di perangkat yang sudah berisi data:** tampilkan ringkasan "Di perangkat ini: 12 set, 340 soal, 25 latihan. Di akun: 0 set". Satu-satunya tindakan yang ditawarkan adalah **Gabungkan**. Tidak ada pilihan yang menghapus data.
- **Perangkat kosong (misalnya setelah browser menghapus data):** langsung unduh semuanya, tampilkan kemajuan.
- **Login dengan akun lain** di perangkat yang berisi data milik akun sebelumnya: tanyakan dulu. Pilihannya: gabungkan ke akun baru, atau keluar dan batalkan. Data tidak pernah otomatis berpindah akun.

### 6.6 Keluar

- "Keluar, data tetap di perangkat ini" (bawaan).
- "Keluar dan hapus data dari perangkat ini", hanya bisa dipilih setelah semua perubahan terunggah. Bila masih ada antrean, tombol ini dikunci dan diberi penjelasan.

---

## 7. Alur login (email OTP)

1. Pengaturan → Akun & Sinkronisasi → isi email → **Kirim kode**.
2. `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
3. Email berisi kode 6 digit. Templat email Supabase diubah agar menampilkan `{{ .Token }}` dalam bahasa Indonesia.
4. Pengguna mengetik kode → `verifyOtp({ email, token, type: 'email' })`.
5. Sesi disimpan oleh supabase-js dan diperbarui otomatis. Bila browser menghapus data, sesi ikut hilang. Pengguna cukup login lagi, lalu data diunduh.

Pengaturan Auth di Supabase:
- Email provider aktif, "Confirm email" aktif, masa berlaku OTP 10 menit, panjang kode 6.
- Site URL `https://hawreirei.github.io/CPNSPRJ/` (dibutuhkan walau tidak memakai link).
- Login lain (password, magic link, sosial) dimatikan.

---

## 8. Tampilan

| Tempat | Perubahan |
|---|---|
| Header (`Layout.tsx`) | Ikon awan kecil: ✓ tersinkron, ↻ menyinkronkan, ⏸ offline (perubahan menunggu), ⚠ gagal. Diklik membuka kartu sinkronisasi |
| Pengaturan | Kartu **Akun & Sinkronisasi**: status login, email, waktu sinkron terakhir, jumlah perubahan menunggu, tombol "Sinkronkan sekarang", tombol keluar |
| Beranda | Bila belum login: kartu kecil sekali tampil "Data Anda hanya tersimpan di browser ini. Masuk dengan email agar tidak hilang." Bisa ditutup |
| Pengingat cadangan (`BackupReminder`) | Tidak muncul bila sinkronisasi berhasil dalam 7 hari terakhir |
| Bantuan | Bagian baru: cara kerja sinkronisasi, data apa yang diunggah, lokasi server (Singapura), API key tidak diunggah, cara menghapus akun |
| Apa yang baru / CHANGELOG | Entri versi 2.0.0 |

Semua teks dalam bahasa Indonesia, mengikuti gaya yang sudah ada.

---

## 9. Keamanan dan privasi

- **RLS** pada `sync_rows`: setiap baris terikat `auth.uid()`. Publishable key memang publik dan aman ada di kode, karena RLS yang menjaga data.
- Tidak ada policy `delete`. Fungsi `sync_push` memakai `security invoker`, jadi tetap tunduk pada RLS.
- Pemeriksaan `get_advisors` (security dan performance) Supabase dijalankan setelah setiap migrasi. Temuan harus nol sebelum fase berikutnya.
- API key, cipher, dan `deviceKey` tidak pernah masuk payload. Ada uji otomatis yang memastikan payload tidak memuat field `cipher`, `iv`, atau tabel `keys`.
- Batas ukuran baris 1,5 MB di database mencegah satu baris rusak memenuhi kuota.
- CSP sudah mengizinkan `connect-src https:`, jadi tidak perlu diubah.
- Service worker tidak meng-cache permintaan ke Supabase (workbox hanya meng-cache aset aplikasi, sudah benar).

---

## 10. Batas paket gratis dan risikonya

| Batas (paket Free) | Dampak | Penanganan |
|---|---|---|
| 2 project aktif | Project 2 + Year6-Algebra = 2, pas | Tidak ada project ketiga yang aktif |
| Project dijeda setelah ±7 hari tidak dipakai | Sinkronisasi berhenti. Data di server **tidak hilang**, data lokal tetap jalan, antrean menunggu | Pemakaian harian sudah cukup menjaga project tetap aktif. Opsi: GitHub Action terjadwal yang memanggil server tiap 3 hari (Issue 6.2) |
| Database 500 MB | Cukup untuk puluhan ribu soal teks. Gambar impor ±300 KB per soal adalah pemakan terbesar | Ditampilkan di kartu sinkronisasi. Bila mendekati batas, pindahkan gambar ke Storage (Issue 6.3) |
| Email bawaan Supabase: hanya terkirim ke anggota tim project, dan jumlahnya per jam sangat terbatas | Untuk Anda sendiri cukup. **Untuk pembeli bundel tidak cukup** | Sebelum dibuka untuk orang lain: SMTP sendiri, misalnya Resend (Issue 6.5) |
| Project Paused bisa dipulihkan dalam 90 hari | Project 2 dibuat 18 Juli 2026 | Dicek di Issue 0.1 sebelum hal lain |

Risiko lain:

| Risiko | Penanganan |
|---|---|
| Jam perangkat salah membuat versi lama "menang" | Jarang terjadi. `device_id` dicatat agar mudah dilacak. Latihan selesai tidak pernah ditimpa versi belum selesai |
| Pengaturan diubah di dua perangkat saat offline | Versi terakhir menang untuk seluruh `settings`. Bisa diterima untuk data pengaturan |
| Bug di mesin sinkronisasi merusak data | Rilis di balik saklar fitur. Cadangan otomatis tetap ada. Setiap pull besar didahului cadangan lokal otomatis ke `meta` (snapshot terakhir) selama masa uji |
| Bundle awal membesar | supabase-js dimuat on-demand dan ditambahkan ke daftar `LAZY` di `scripts/check-bundle.mjs` |

---

## 11. Fase dan issue

Setiap fase menjadi satu PR (Fase 0 tanpa PR). Ukuran: **S** kecil, **M** sedang, **L** besar.

### Fase 0: Persiapan Supabase (tanpa kode)

**Issue 0.1: Aktifkan dan periksa Hawreirei's Project 2** · S
- Pulihkan project yang berstatus INACTIVE.
- Periksa isinya (`list_tables`, `list_migrations`, `list_extensions`). Bila ternyata sudah ada tabel atau data lain, **berhenti dan tanyakan ke pemilik** sebelum mengubah apa pun.
- Catat URL project dan publishable key.
- *Selesai bila:* project berstatus ACTIVE_HEALTHY, isinya diketahui, pemilik setuju melanjutkan.

**Issue 0.2: Konfigurasi Auth email OTP** · S
- Aktifkan email provider dengan OTP 6 digit dan masa berlaku 10 menit. Matikan metode lain.
- Ubah templat email ke bahasa Indonesia dengan `{{ .Token }}`.
- Isi Site URL. Pastikan email pemilik terdaftar sebagai anggota tim (syarat email bawaan).
- Sebagian pengaturan ini hanya bisa diubah di dashboard Supabase. Langkahnya akan saya tulis rinci untuk Anda klik.
- *Selesai bila:* kode OTP sampai ke email pemilik dan bisa diverifikasi dari halaman uji.

### Fase 1: Skema server dan keamanan

**Issue 1.1: Migrasi tabel `sync_rows`** · S
- Migrasi `apply_migration` sesuai bagian 5, disimpan juga di repo (`supabase/migrations/0001_sync_rows.sql`) agar bisa dibuat ulang.
- *Selesai bila:* tabel, indeks, dan batas ukuran ada.

**Issue 1.2: RLS dan fungsi `sync_push`** · M
- Policy select, insert, dan update. Fungsi `sync_push` dengan aturan "mtime lebih baru menang".
- *Selesai bila:* advisor security dan performance bersih.

**Issue 1.3: Uji keamanan di server** · S
- Dengan dua pengguna uji: A tidak bisa membaca atau menulis baris B. Versi lama tidak menimpa versi baru. Tombstone tersimpan. Baris > 1,5 MB ditolak.
- Skrip uji disimpan di `supabase/tests/`. Pengguna uji dihapus setelahnya.
- *Selesai bila:* semua skenario lulus.

### Fase 2: Fondasi klien

**Issue 2.1: Dexie versi 5: `_mtime` dan `syncDeletes`** · M
- Skema v5 menambah indeks `_mtime` dan tabel `syncDeletes`. Upgrade mengisi `_mtime` semua baris lama.
- Hook cap waktu monoton dan pencatatan hapus (`src/sync/track.ts`). Penanda "tulisan dari server" agar tidak dicap ulang.
- Ekspor cadangan dan impor cadangan membuang `_mtime` agar format berkas tetap sama.
- *Selesai bila:* semua uji lama lulus, uji baru membuktikan setiap `put`/`update`/`modify`/`delete` di tabel tersinkron menghasilkan cap atau tombstone, dan `keys`/`requests` tidak tersentuh.

**Issue 2.2: Konfigurasi dan klien Supabase on-demand** · S
- Pasang `@supabase/supabase-js`. `src/sync/config.ts` dan `src/sync/client.ts`.
- Variabel `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` diisi di workflow deploy.
- Tambahkan supabase ke `LAZY` di `scripts/check-bundle.mjs`.
- *Selesai bila:* `npm run build && npm run check:bundle` lulus. Tanpa variabel, UI sinkronisasi tidak tampil.

**Issue 2.3: Login dengan kode email** · M
- `src/sync/auth.ts` dan formulir dua langkah (email → kode) di kartu Akun & Sinkronisasi.
- Pesan galat jelas: kode salah, kode kedaluwarsa, terlalu sering meminta kode, offline.
- *Selesai bila:* bisa login, menutup tab, membuka lagi dalam keadaan tetap login, lalu keluar.

### Fase 3: Mesin sinkronisasi

**Issue 3.1: Push** · M
- Kelompokkan baris, kirim lewat `sync_push`, majukan `pushedUpTo`, kosongkan `syncDeletes`. Coba ulang dengan jeda bertambah.
- *Selesai bila:* uji dengan server tiruan membuktikan tidak ada perubahan yang terlewat, termasuk saat gagal di tengah kelompok.

**Issue 3.2: Pull dan aturan gabung** · L
- Kursor `updated_at` dengan tumpang-tindih 2 menit. Aturan gabung per tabel sesuai bagian 6.3.
- Registrasi ulang paket ujian setelah `settings` berubah.
- *Selesai bila:* uji membuktikan setiap aturan pada tabel di bagian 6.3, termasuk tidak ada pantulan unggah.

**Issue 3.3: Penjadwal dan status** · M
- Debounce push, pemicu pull (buka, online, tab aktif, 5 menit), satu tab aktif lewat Web Locks, status untuk UI.
- *Selesai bila:* dua tab terbuka tidak menyinkronkan bersamaan. Status berubah benar saat offline lalu online.

**Issue 3.4: Login pertama, perangkat kosong, dan pergantian akun** · M
- `syncOwner`, layar ringkasan dan "Gabungkan", unduh penuh dengan indikator kemajuan, konfirmasi bila akun berbeda.
- *Selesai bila:* tiga skenario di bagian 6.5 teruji. Tidak ada jalur yang menghapus data tanpa konfirmasi.

**Issue 3.5: Keluar** · S
- Dua pilihan keluar sesuai bagian 6.6. "Hapus dari perangkat" dikunci selama masih ada antrean.
- *Selesai bila:* teruji, termasuk upaya keluar dengan antrean tersisa.

### Fase 4: Tampilan dan teks

**Issue 4.1: Ikon status di header** · S
**Issue 4.2: Kartu Akun & Sinkronisasi lengkap di Pengaturan** · M (waktu sinkron terakhir, antrean, "Sinkronkan sekarang", perkiraan ruang terpakai di server)
**Issue 4.3: Kartu ajakan login di Beranda dan penyesuaian pengingat cadangan** · S
**Issue 4.4: Bantuan, privasi, CHANGELOG, dan "Apa yang baru" versi 2.0.0** · S

*Selesai bila (seluruh fase):* tampilan benar di layar HP 360 px dan desktop, mode terang dan gelap, dan lulus pemeriksaan aksesibilitas e2e yang sudah ada (axe).

### Fase 5: Pengujian menyeluruh dan rilis

**Issue 5.1: Uji unit mesin sinkronisasi** · M
- `fake-indexeddb` dan server tiruan di memori yang meniru `sync_push` dan pull.
- Skenario wajib:
  1. Perangkat baru memulihkan semua data.
  2. Dua perangkat mengubah baris yang sama.
  3. Hapus di A hilang juga di B.
  4. Offline lalu online.
  5. Jam perangkat mundur.
  6. Latihan selesai tidak ditimpa.
  7. Pergantian akun.
  8. Payload tidak pernah memuat API key.

**Issue 5.2: Uji e2e Playwright** · M
- Alur login dan sinkronisasi dengan server Supabase tiruan (route interception). Uji yang ada tetap lulus tanpa login.

**Issue 5.3: Uji nyata di Project 2** · S
- Login dari laptop dan HP Anda. Buat set di satu perangkat, kerjakan latihan, lihat muncul di perangkat lain. Hapus data situs di browser, login lagi, pastikan semuanya kembali.

**Issue 5.4: Rilis bertahap** · S
- Saklar fitur di Pengaturan ("Sinkronisasi cloud (beta)") selama satu–dua minggu pemakaian Anda sendiri. Setelah stabil, saklar dihapus dan versi 2.0.0 dirilis.

### Fase 6: Lanjutan (opsional, sesuai kebutuhan)

| Issue | Isi | Kapan perlu |
|---|---|---|
| 6.1 Hapus akun dan data cloud | Edge Function `delete-account` (butuh service role, tidak bisa dari browser) dan tombol di Pengaturan | Sebelum dibuka untuk orang lain |
| 6.2 Penjaga project tetap aktif | GitHub Action terjadwal yang memanggil server tiap 3 hari | Bila Anda sering tidak belajar lebih dari seminggu |
| 6.3 Gambar soal ke Storage | Bucket privat `question-images/{user_id}/…`, baris hanya menyimpan referensi | Bila ruang database mendekati 400 MB |
| 6.4 Realtime | Perubahan muncul di perangkat lain tanpa menunggu | Bila sering memakai dua perangkat bersamaan |
| 6.5 SMTP sendiri (misalnya Resend) | Email kode bisa terkirim ke siapa saja | **Wajib** sebelum pembeli bundel memakai login |

---

## 12. Urutan dan ketergantungan

```
0.1 → 0.2 → 1.1 → 1.2 → 1.3
                      │
2.1 ──────────────────┼──→ 3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 4.x → 5.1 → 5.2 → 5.3 → 5.4
2.2 → 2.3 ────────────┘
```

Fase 2.1 dan 2.2 tidak bergantung pada server, jadi bisa dikerjakan bersamaan dengan Fase 1.

---

## 13. Rencana mundur

- Selama beta, sinkronisasi bisa dimatikan dari Pengaturan tanpa memengaruhi data lokal.
- Skema Dexie v5 hanya **menambah** indeks dan tabel. Issue 2.1 juga menguji bahwa versi aplikasi lama yang masih ter-cache di service worker tetap bisa membuka database v5 (Dexie 4 mengizinkan versi deklarasi yang lebih rendah). Bila ternyata tidak bisa, pembaruan PWA dipaksa sebelum upgrade.
- Bila server bermasalah, aplikasi tetap berjalan sepenuhnya secara lokal. Antrean menunggu sampai server pulih.
- Fitur cadangan berkas yang ada sekarang tetap dipertahankan sebagai lapisan pengaman kedua.

---

## 14. Yang perlu Anda lakukan sendiri

1. Menyetujui rancangan ini, atau memberi koreksi.
2. Di Issue 0.2: beberapa klik di dashboard Supabase (templat email, pengaturan OTP). Langkahnya akan saya tulis.
3. Di Issue 5.3: mencoba di HP dan laptop Anda sendiri.
4. Bila nanti ingin pembeli bundel ikut login: mendaftar layanan SMTP (Issue 6.5).

## 15. Pertanyaan terbuka

1. Apakah ujian yang **sedang berjalan** perlu bisa dilanjutkan di perangkat lain? Rancangan ini menjawab ya. Bila tidak, latihan yang belum selesai bisa dikecualikan agar sinkronisasi lebih hemat.
2. Untuk saat ini, apakah login hanya untuk Anda sendiri, atau langsung ingin dibuka untuk pembeli bundel? Jawabannya menentukan apakah Issue 6.1 dan 6.5 masuk sebelum rilis.
