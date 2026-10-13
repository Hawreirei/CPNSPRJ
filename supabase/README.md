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
3. **Authentication → Sign In / Providers → User Signups**: "Allow new users to sign up" **aktif untuk sementara**, supaya akun pemilik bisa dibuat pada login pertama. Setelah pemilik berhasil login (#98), **matikan** agar orang lain tidak bisa membuat akun selama login hanya untuk pemilik.
4. **SMTP sendiri (wajib untuk login dengan kode).** Supabase hanya mengizinkan templat email diubah bila project memakai SMTP sendiri, dan templat bawaan hanya berisi link, bukan kode. Untuk pemakaian pribadi, cara termudah adalah Gmail dengan *App Password*:
   1. Di akun Google: **myaccount.google.com → Keamanan → Verifikasi 2 Langkah**, aktifkan bila belum.
   2. Buka **myaccount.google.com/apppasswords**, buat sandi aplikasi bernama `Supabase CASN`, lalu salin 16 hurufnya (tanpa spasi). Sandi ini hanya untuk mengirim email dan bisa dicabut kapan saja dari halaman yang sama.
   3. Di Supabase: **Authentication → Emails → SMTP Settings**, aktifkan **Enable custom SMTP**, lalu isi:

      | Kolom | Isi |
      |---|---|
      | Sender email | alamat Gmail Anda (harus sama dengan Username) |
      | Sender name | `CASN Set Builder` |
      | Host | `smtp.gmail.com` |
      | Port number | `465` |
      | Minimum interval between emails | `60` (bawaan) |
      | Username | alamat Gmail Anda |
      | Password | 16 huruf App Password dari langkah 2 |

   4. Simpan. Setelah itu batas email menjadi 30 per jam (bisa diubah di **Authentication → Rate Limits**), dan email tidak lagi dibatasi hanya untuk anggota tim.
5. **Authentication → Emails → Templates**: untuk **Magic Link** dan **Confirm signup**, ganti:
   - Subject: `Kode masuk CASN Set Builder: {{ .Token }}`
   - Body: isi `templates/kode-masuk.html`.

   Aplikasi memakai kode, bukan link, karena link sering terbuka di browser lain sehingga login tersimpan di tempat yang salah.
6. **Authentication → URL Configuration**: Site URL `https://hawreirei.github.io/CPNSPRJ/`.

Bila kode tidak datang, periksa folder spam, lalu **Authentication → Logs** di Supabase untuk pesan galat SMTP (misalnya App Password salah).
