# Rancangan: Login Email dan Sinkronisasi Cloud (Supabase)

| | |
|---|---|
| **Dokumen** | Rancangan teknis per fase dan per issue |
| **Tanggal** | 12 Oktober 2026 |
| **Basis** | Kode di `main` setelah PR #89 (versi 1.9.0) |
| **Keputusan pemilik** | Supabase project **Hawreirei's Project 2** (`aehnismvyxgihmsftane`, region Singapura), login **email saja** |
| **Status** | Disetujui 12 Oktober 2026. Epic: [#90](https://github.com/Hawreirei/CPNSPRJ/issues/90), issue #91–#116 |

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
│   • cap per baris (tabel syncStamps)      │  (JWT)   │                                 │
│   • hapus dicatat sebagai cap deleted     │          │                                 │
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
| `src/sync/track.ts` | Middleware Dexie: cap per baris di `syncStamps`, termasuk penghapusan |
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

SQL yang terpasang di Project 2 ada di repo, bukan disalin di sini:

| Berkas | Isi |
|---|---|
| `supabase/migrations/20261012140453_sync_rows.sql` | Tabel `sync_rows` dan indeks pull. RLS aktif sejak awal (#93) |
| `supabase/migrations/20261012140524_sync_rows_access.sql` | Hak akses, policy, trigger penjaga, `sync_push`, `sync_pull` (#94) |
| `supabase/tests/sync_rows.sql` | 15 pemeriksaan keamanan dan aturan versi (#95) |

**Tabel `sync_rows`**: `user_id` (default `auth.uid()`), `tbl` (hanya `sets`, `questions`, `attempts`, `reviews`, `cards`, `meta`), `id`, `data jsonb` (null untuk tombstone), `deleted`, `mtime` (cap waktu klien), `device_id`, `updated_at` (waktu server). Primary key `(user_id, tbl, id)`. Batasan: tombstone selalu `data = null`, dan ukuran `data` di bawah 1,5 MB.

**Akses**
- `anon` tidak punya hak apa pun. `authenticated` hanya boleh `select`, `insert`, `update`, dan RLS membatasinya ke baris milik sendiri.
- Tidak ada hak `delete`. Penghapusan selalu lewat tombstone, dan tombstone disimpan selamanya agar data yang dihapus tidak muncul lagi dari perangkat yang lama offline.

**Trigger `sync_rows_guard`** berlaku untuk **semua** jalur penulisan:
- Mengisi `updated_at` dengan waktu server. Klien tidak bisa memilih nilainya sendiri.
- Melewati update yang membawa `mtime` lebih lama dari yang tersimpan. Versi lama tidak pernah menimpa versi baru, juga bila klien menulis langsung tanpa `sync_push`.

**`sync_push(rows jsonb)`**
- Mengunggah hingga 500 baris sekali panggil, sebagai upsert.
- Bila satu baris muncul dua kali dalam satu kiriman, hanya versi terbaru yang dipakai.
- Mengembalikan baris yang benar-benar tertulis. Baris yang tidak dikembalikan kalah oleh versi lebih baru di server.

**`sync_pull(after_at, after_tbl, after_id, max_rows)`**
- Mengembalikan satu halaman perubahan milik pengguna, urut `(updated_at, tbl, id)`, maksimal 1.000 baris.
- Kursornya berupa tiga nilai, karena semua baris dari satu push berbagi `updated_at` yang sama. Dengan begitu tidak ada baris yang terlewat di batas halaman.
- Klien memulai setiap pull 2 menit sebelum kursor terakhirnya. Ini menutup celah transaksi yang selesai tidak berurutan. Baris yang terunduh dua kali aman, karena penggabungan bersifat idempoten.

## 6. Mesin sinkronisasi

### 6.1 Pelacakan perubahan (Dexie versi 5, `src/sync/track.ts`)

- Tabel baru **`syncStamps`** (`[tbl+id]`, indeks `dirty`) berisi satu cap per baris yang disinkronkan: `mtime` (waktu perubahan terakhir), `dirty` (1 sampai server menerimanya), dan `deleted` (1 bila baris dihapus).
- Cap ditulis oleh **middleware DBCore Dexie**, di **transaksi yang sama** dengan penulisan datanya. Setiap transaksi baca-tulis pada tabel tersinkron otomatis ikut membuka `syncStamps`. Hasilnya:
  - Data dan capnya tersimpan bersama atau gagal bersama. Tidak ada celah, termasuk untuk penghapusan.
  - Semua jalur tulis tertangkap (`put`, `add`, `update`, `modify`, `delete`, `where().delete()`, `clear()`). **Tidak ada satu pun pemanggilan di halaman yang perlu diubah.**
  - Objek data aplikasi, berkas cadangan, dan berkas bagikan **tidak berubah bentuk**, karena cap disimpan di tabel terpisah, bukan sebagai kolom di dalam data.
- `mtime = max(Date.now(), cap terakhir di perangkat + 1, cap baris itu sebelumnya + 1)`. Cap baru sebuah baris selalu lebih besar dari cap lamanya, walau jam perangkat mundur, sehingga server tidak pernah mengabaikan editan baru.
- Upgrade ke versi 5 membuat cap untuk semua baris lama dengan waktu perubahan baris itu sendiri (`updatedAt`, `finishedAt`, `lastReviewedAt`, dan seterusnya). Bila dua perangkat lama sama-sama login, versi yang benar-benar diubah terakhir yang menang.
- Baris `meta` hanya dicap bila key-nya `settings` atau `reviewDays`. Tabel `keys` dan `requests` tidak pernah dicap.
- Versi aplikasi lama yang masih ter-cache tetap bisa membuka database v5 (teruji). Tulisannya tidak tercatat, jadi sebelum unggahan pertama mesin sinkronisasi mencatat baris yang belum punya cap (#99).

### 6.2 Push (unggah)

1. Catat baris yang belum punya cap (lihat 6.1). Lalu ambil cap dengan `dirty = 1`, beserta datanya.
2. Kirim per kelompok, maksimal 200 baris atau ±2 MB per permintaan, lewat `sync_push`.
3. Setelah berhasil, set `dirty = 0`, tetapi hanya bila `mtime` belum berubah selama pengiriman. Bila baris berubah lagi, cap barunya tetap `dirty` dan ikut dikirim berikutnya.
4. Kolom khusus perangkat (`settings.lastSeenVersion`) dibuang dari `data` sebelum dikirim.

Gagal karena offline, sesi habis, atau server dijeda: antrean tetap tersimpan di IndexedDB dan dicoba lagi dengan jeda bertambah (5 detik, 30 detik, 2 menit, 10 menit).

### 6.3 Pull (unduh) dan aturan gabung (`src/sync/merge.ts`, `src/sync/engine.ts`)

Untuk setiap baris dari server, bandingkan dengan baris lokal (fungsi murni `decide`):

| Tabel | Aturan |
|---|---|
| Umum (`sets`, `questions`, `reviews`, `cards`, `settings`) | **Versi terbaru menang** menurut `mtime`. Bila sama, tidak ada perubahan |
| `attempts` | Seperti umum, **kecuali** bila hanya satu salinan yang sudah selesai (`finishedAt`): salinan yang selesai selalu menang, **ke dua arah**. Tab ujian lama yang masih terbuka di perangkat lain bisa menulis belakangan, dan tulisannya tidak boleh membatalkan hasil |
| `reviewDays` | **Digabung** (gabungan himpunan tanggal), ke dua arah. Hasil gabungan yang berbeda dari server dikirim kembali |
| `questions.notes` | Catatan kedua sisi digabung berdasarkan `at`, ke dua arah, supaya catatan tutor tidak hilang |
| `settings.lastSeenVersion` | Tetap milik perangkat masing-masing. Tidak pernah dikirim, dan tidak ditimpa dari server |
| Tombstone | Menghapus baris lokal bila `mtime` tombstone lebih baru dari cap lokal |

Perbandingan isi memakai JSON dengan kunci terurut, sehingga isi yang sama tidak dianggap berbeda hanya karena urutan kolomnya.

Setiap halaman (500 baris) dibaca dan ditulis massal dalam satu transaksi: `bulkGet` cap dan baris, lalu `bulkPut`/`bulkDelete` per tabel, dan **cap ditulis terakhir** (`mtime` dari server, `dirty = 0`). Cap itu menggantikan cap yang baru saja ditulis middleware, sehingga baris itu tidak diunggah kembali (tidak ada pantulan tanpa akhir). Baris dari server yang tabel atau kuncinya tidak dikenal, atau yang kunci datanya tidak cocok dengan `id`, diabaikan.

Setelah menulis baris dari server, `getSettings()` dijalankan ulang bila `settings` berubah, supaya paket ujian impor terdaftar lagi.

### 6.4 Jadwal (`src/sync/runner.ts`)

- Setiap putaran: catat baris tanpa cap (hanya di putaran pertama sesi), **pull**, lalu **push**. Pull lebih dulu supaya perubahan lama di sini yang sudah kalah oleh versi lebih baru tidak dikirim percuma.
- **Kapan putaran berjalan:**
  - saat masuk;
  - 5 detik setelah perubahan terakhir (paling lama 60 detik saat AI sedang menulis soal);
  - saat tab disembunyikan, bila ada perubahan yang menunggu;
  - saat kembali online dan saat tab aktif lagi;
  - setiap 5 menit selama tab terbuka.
- Satu putaran pada satu waktu. Permintaan yang datang selama putaran berjalan memicu satu putaran lagi sesudahnya. Antartab dikoordinasi dengan Web Locks (`casn-sync`).
- **Gagal:** status `offline` (koneksi putus, antrean tetap) atau `error` (sesi habis, server dijeda). Putaran dicoba lagi setelah 5 detik, 30 detik, 2 menit, lalu tiap 10 menit.
- Status untuk tampilan: fase, waktu sinkron terakhir, jumlah perubahan menunggu, pesan galat, dan data yang terlalu besar.

### 6.5 Login pertama dan pergantian akun

- `meta: sync` (key yang tidak disinkronkan) menyimpan `owner` (akun pemilik data di perangkat ini), kursor pull, dan waktu sinkron terakhir.
- **Perangkat kosong** (tanpa set, soal, atau latihan; misalnya setelah browser menghapus data): langsung diikat ke akun. Cap pengaturan dan hari belajarnya diturunkan menjadi paling lama, supaya pengaturan bawaan perangkat baru tidak menimpa pengaturan di akun. Lalu semua data diunduh.
- **Login pertama di perangkat berisi data:** tampilkan ringkasan "Perangkat ini sudah berisi 1 set, 30 soal, 0 latihan. Akun Anda di cloud berisi …". Tindakan yang tersedia hanya **Gabungkan dan sinkronkan** atau **Keluar**. Tidak ada pilihan yang menghapus data.
- **Data milik akun lain:** tanyakan dulu, "Gabungkan ke akun ini" atau "Keluar". Bila digabung, tanda hapus milik akun lama dibuang. Tanda itu tidak boleh menghapus baris ber-id sama di akun baru, misalnya soal dari bundel yang sama.
- Selama beta, sebelum penggabungan disimpan cadangan lengkap perangkat (`meta: syncSnapshot`), yang bisa diunduh dari kartu Akun.

### 6.6 Keluar

- "Keluar, data tetap di perangkat ini". Keluar hanya dari browser ini (`scope: local`); perangkat lain tetap masuk.
- "Keluar dan hapus data dari perangkat ini" hanya aktif bila tidak ada perubahan yang menunggu. Data tersinkron dan cap dihapus dalam satu transaksi, dengan cap dihapus terakhir. Karena itu penghapusan lokal **tidak** ikut terkirim sebagai penghapusan ke cloud. API key tidak ikut terhapus.

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

**Issue 0.1 (#91): Aktifkan dan periksa Hawreirei's Project 2** · S
- Pulihkan project yang berstatus INACTIVE.
- Periksa isinya (`list_tables`, `list_migrations`, `list_extensions`). Bila ternyata sudah ada tabel atau data lain, **berhenti dan tanyakan ke pemilik** sebelum mengubah apa pun.
- Catat URL project dan publishable key.
- *Selesai bila:* project berstatus ACTIVE_HEALTHY, isinya diketahui, pemilik setuju melanjutkan.

**Issue 0.2 (#92): Konfigurasi Auth email OTP** · S
- Aktifkan email provider dengan OTP 6 digit dan masa berlaku 10 menit. Matikan metode lain.
- Ubah templat email ke bahasa Indonesia dengan `{{ .Token }}`.
- Isi Site URL. Pastikan email pemilik terdaftar sebagai anggota tim (syarat email bawaan).
- Sebagian pengaturan ini hanya bisa diubah di dashboard Supabase. Langkahnya akan saya tulis rinci untuk Anda klik.
- *Selesai bila:* kode OTP sampai ke email pemilik dan bisa diverifikasi dari halaman uji.

### Fase 1: Skema server dan keamanan

**Issue 1.1 (#93): Migrasi tabel `sync_rows`** · S
- Migrasi `apply_migration` sesuai bagian 5, disimpan juga di repo (`supabase/migrations/`, nama berkas sama dengan versi yang tercatat di server) agar bisa dibuat ulang.
- *Selesai bila:* tabel, indeks, dan batas ukuran ada.

**Issue 1.2 (#94): RLS dan fungsi `sync_push`** · M
- Policy select, insert, dan update. Fungsi `sync_push` dengan aturan "mtime lebih baru menang".
- *Selesai bila:* advisor security dan performance bersih.

**Issue 1.3 (#95): Uji keamanan di server** · S
- Dengan dua pengguna uji: A tidak bisa membaca atau menulis baris B. Versi lama tidak menimpa versi baru. Tombstone tersimpan. Baris > 1,5 MB ditolak.
- Skrip uji disimpan di `supabase/tests/`. Semua tulisan uji, termasuk pengguna uji, dibatalkan di akhir.
- *Selesai bila:* semua skenario lulus.

### Fase 2: Fondasi klien

**Issue 2.1 (#96): Dexie versi 5: tabel cap `syncStamps`** · M
- Skema v5 menambah tabel `syncStamps`; middleware DBCore mencatat cap setiap tulisan. Upgrade membuat cap untuk semua baris lama.
- Hook cap waktu monoton dan pencatatan hapus (`src/sync/track.ts`). Penanda "tulisan dari server" agar tidak dicap ulang.
- Format berkas cadangan tidak berubah, karena cap tidak disimpan di dalam data.
- *Selesai bila:* semua uji lama lulus, uji baru membuktikan setiap `put`/`update`/`modify`/`delete` di tabel tersinkron menghasilkan cap atau tombstone, dan `keys`/`requests` tidak tersentuh.

**Issue 2.2 (#97): Konfigurasi dan klien Supabase on-demand** · S
- Pasang `@supabase/supabase-js`. `src/sync/config.ts` dan `src/sync/client.ts`.
- Variabel `VITE_SUPABASE_URL` dan `VITE_SUPABASE_PUBLISHABLE_KEY` diisi di workflow deploy.
- Tambahkan supabase ke `LAZY` di `scripts/check-bundle.mjs`.
- *Selesai bila:* `npm run build && npm run check:bundle` lulus. Tanpa variabel, UI sinkronisasi tidak tampil.

**Issue 2.3 (#98): Login dengan kode email** · M
- `src/sync/auth.ts` dan formulir dua langkah (email → kode) di kartu Akun & Sinkronisasi.
- Pesan galat jelas: kode salah, kode kedaluwarsa, terlalu sering meminta kode, offline.
- *Selesai bila:* bisa login, menutup tab, membuka lagi dalam keadaan tetap login, lalu keluar.

### Fase 3: Mesin sinkronisasi

**Issue 3.1 (#99): Push** · M
- Kelompokkan baris berstatus `dirty`, kirim lewat `sync_push`, tandai terkirim bila tidak berubah selama pengiriman. Coba ulang dengan jeda bertambah.
- *Selesai bila:* uji dengan server tiruan membuktikan tidak ada perubahan yang terlewat, termasuk saat gagal di tengah kelompok.

**Issue 3.2 (#100): Pull dan aturan gabung** · L
- Kursor `updated_at` dengan tumpang-tindih 2 menit. Aturan gabung per tabel sesuai bagian 6.3.
- Registrasi ulang paket ujian setelah `settings` berubah.
- *Selesai bila:* uji membuktikan setiap aturan pada tabel di bagian 6.3, termasuk tidak ada pantulan unggah.

**Issue 3.3 (#101): Penjadwal dan status** · M
- Debounce push, pemicu pull (buka, online, tab aktif, 5 menit), satu tab aktif lewat Web Locks, status untuk UI.
- *Selesai bila:* dua tab terbuka tidak menyinkronkan bersamaan. Status berubah benar saat offline lalu online.

**Issue 3.4 (#102): Login pertama, perangkat kosong, dan pergantian akun** · M
- `syncOwner`, layar ringkasan dan "Gabungkan", unduh penuh dengan indikator kemajuan, konfirmasi bila akun berbeda.
- *Selesai bila:* tiga skenario di bagian 6.5 teruji. Tidak ada jalur yang menghapus data tanpa konfirmasi.

**Issue 3.5 (#103): Keluar** · S
- Dua pilihan keluar sesuai bagian 6.6. "Hapus dari perangkat" dikunci selama masih ada antrean.
- *Selesai bila:* teruji, termasuk upaya keluar dengan antrean tersisa.

### Fase 4: Tampilan dan teks

**Issue 4.1 (#104): Ikon status di header** · S
**Issue 4.2 (#105): Kartu Akun & Sinkronisasi lengkap di Pengaturan** · M (waktu sinkron terakhir, antrean, "Sinkronkan sekarang", perkiraan ruang terpakai di server)
**Issue 4.3 (#106): Kartu ajakan login di Beranda dan penyesuaian pengingat cadangan** · S
**Issue 4.4 (#107): Bantuan, privasi, CHANGELOG, dan "Apa yang baru" versi 2.0.0** · S

*Selesai bila (seluruh fase):* tampilan benar di layar HP 360 px dan desktop, mode terang dan gelap, dan lulus pemeriksaan aksesibilitas e2e yang sudah ada (axe).

### Fase 5: Pengujian menyeluruh dan rilis

**Issue 5.1 (#108): Uji unit mesin sinkronisasi** · M
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

**Issue 5.2 (#109): Uji e2e Playwright** · M
- Alur login dan sinkronisasi dengan server Supabase tiruan (route interception). Uji yang ada tetap lulus tanpa login.

**Issue 5.3 (#110): Uji nyata di Project 2** · S
- Login dari laptop dan HP Anda. Buat set di satu perangkat, kerjakan latihan, lihat muncul di perangkat lain. Hapus data situs di browser, login lagi, pastikan semuanya kembali.

**Issue 5.4 (#111): Rilis bertahap** · S
- Saklar fitur di Pengaturan ("Sinkronisasi cloud (beta)") selama satu–dua minggu pemakaian Anda sendiri. Setelah stabil, saklar dihapus dan versi 2.0.0 dirilis.

### Fase 6: Lanjutan (opsional, sesuai kebutuhan)

| Issue | Isi | Kapan perlu |
|---|---|---|
| 6.1 (#112) Hapus akun dan data cloud | Edge Function `delete-account` (butuh service role, tidak bisa dari browser) dan tombol di Pengaturan | Sebelum dibuka untuk orang lain |
| 6.2 (#113) Penjaga project tetap aktif | GitHub Action terjadwal yang memanggil server tiap 3 hari | Bila Anda sering tidak belajar lebih dari seminggu |
| 6.3 (#114) Gambar soal ke Storage | Bucket privat `question-images/{user_id}/…`, baris hanya menyimpan referensi | Bila ruang database mendekati 400 MB |
| 6.4 (#115) Realtime | Perubahan muncul di perangkat lain tanpa menunggu | Bila sering memakai dua perangkat bersamaan |
| 6.5 (#116) SMTP sendiri (misalnya Resend) | Email kode bisa terkirim ke siapa saja | **Wajib** sebelum pembeli bundel memakai login |

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

## 15. Keputusan atas pertanyaan terbuka

1. **Login untuk siapa:** untuk pemilik dulu (12 Oktober 2026). Issue 6.1 (#112) dan 6.5 (#116) baru wajib sebelum login dibuka untuk pembeli bundel.
2. **Ujian yang sedang berjalan ikut disinkronkan:** ya (bawaan rancangan, tidak ada keberatan).
