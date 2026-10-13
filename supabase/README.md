# Supabase: login email dan sinkronisasi cloud

Rancangan lengkap: [`docs/rancangan-sinkronisasi-cloud.md`](../docs/rancangan-sinkronisasi-cloud.md). Epic: #90.

| | |
|---|---|
| Project | Hawreirei's Project 2 (`aehnismvyxgihmsftane`), region Singapura, paket Free |
| URL | `https://aehnismvyxgihmsftane.supabase.co` |
| Publishable key | `sb_publishable_09va7LfWS5CqOngbFLUgPw_ypLulcHe` (publik; data dijaga RLS) |

- `migrations/`: SQL yang diterapkan ke project, berurutan (#93, #94). Nama berkas sama dengan versi di `supabase_migrations`.
- `tests/`: uji RLS dan aturan versi di server (#95).

## Menjalankan uji server

Jalankan isi `tests/sync_rows.sql` di SQL Editor (sebagai `postgres`). Uji membuat dua pengguna sementara, mencoba setiap aturan, lalu selalu berakhir dengan galat agar semuanya dibatalkan:

- `SYNC_ROWS TESTS PASSED: 15 checks` berarti lulus. Tidak ada data yang tertinggal.
- `FAIL: ...` menyebut aturan pertama yang rusak.

Setelah mengubah migrasi, jalankan juga advisor security dan performance. Hasil yang diharapkan: tanpa temuan, kecuali "unused index" selama tabel belum dipakai.
- `templates/`: templat email Auth.

## Pengaturan Auth (#92)

Pengaturan ini tidak tersimpan di SQL; diatur di dashboard Supabase (`supabase.com/dashboard/project/aehnismvyxgihmsftane`). Nama menu bisa sedikit berbeda bila dashboard diperbarui.

1. **Authentication → Sign In / Providers → Email**
   - Enable Email provider: **aktif**.
   - Confirm email: **aktif**.
   - Email OTP Expiration: **600** detik.
   - Email OTP Length: **6**.
   - Simpan.
2. **Authentication → Sign In / Providers**: semua penyedia lain (Google, GitHub, Phone, dan lainnya) **mati**. Anonymous sign-ins **mati**.
3. **Authentication → Sign In / Providers → User Signups**: "Allow new users to sign up" **tetap aktif**. Aplikasi dijual, dan pembeli harus bisa membuat akun. Menyimpan data di cloud tetap hanya untuk akun yang sudah memasukkan kode akses (#117).
4. **SMTP sendiri dengan Brevo (wajib).** Supabase hanya mengizinkan templat email diubah bila project memakai SMTP sendiri, dan templat bawaan hanya berisi link, bukan kode. Aplikasi dijual, jadi dipakai layanan email aplikasi (Brevo), bukan Gmail (#116):
   1. Daftar di **brevo.com** (paket gratis: 300 email/hari).
   2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**: isi nama `CASN Set Builder` dan alamat Gmail Anda, lalu klik link verifikasi yang dikirim Brevo ke Gmail itu.
   3. **SMTP & API → SMTP**: catat **Login** (bentuknya seperti `xxxxxx@smtp-brevo.com`), lalu **Generate a new SMTP key** dan salin kuncinya.
   4. Di Supabase: **Authentication → Emails → SMTP Settings**, aktifkan **Enable custom SMTP**, lalu isi:

      | Kolom | Isi |
      |---|---|
      | Sender email | alamat Gmail yang sudah diverifikasi di Brevo |
      | Sender name | `CASN Set Builder` |
      | Host | `smtp-relay.brevo.com` |
      | Port number | `587` |
      | Minimum interval between emails | `60` (bawaan) |
      | Username | Login Brevo dari langkah 3 |
      | Password | SMTP key dari langkah 3 |

   5. Simpan. Lalu **Authentication → Rate Limits**: batas email sekitar `60` per jam.

   Tanpa domain sendiri, email kode lebih sering masuk folder spam. Bila nanti banyak keluhan, beli domain dan verifikasi di Brevo; kode aplikasi tidak perlu diubah.
5. **Authentication → Emails → Templates**: untuk **Magic Link** dan **Confirm signup**, ganti:
   - Subject: `Kode masuk CASN Set Builder: {{ .Token }}`
   - Body: isi `templates/kode-masuk.html`.

   Aplikasi memakai kode, bukan link, karena link sering terbuka di browser lain sehingga login tersimpan di tempat yang salah.
6. **Authentication → URL Configuration**: Site URL `https://hawreirei.github.io/CPNSPRJ/`.

Bila kode tidak datang, periksa folder spam, lalu **Authentication → Logs** di Supabase untuk pesan galat SMTP (misalnya App Password salah).
