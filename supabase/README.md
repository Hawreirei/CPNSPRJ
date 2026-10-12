# Supabase: login email dan sinkronisasi cloud

Rancangan lengkap: [`docs/rancangan-sinkronisasi-cloud.md`](../docs/rancangan-sinkronisasi-cloud.md). Epic: #90.

| | |
|---|---|
| Project | Hawreirei's Project 2 (`aehnismvyxgihmsftane`), region Singapura, paket Free |
| URL | `https://aehnismvyxgihmsftane.supabase.co` |
| Publishable key | `sb_publishable_09va7LfWS5CqOngbFLUgPw_ypLulcHe` (publik; data dijaga RLS) |

- `migrations/`: SQL yang diterapkan ke project, berurutan (#93, #94).
- `tests/`: uji RLS dan aturan versi di server (#95).
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
4. **Authentication → Emails → Templates**: untuk **Magic Link** dan **Confirm signup**, ganti:
   - Subject: `Kode masuk CASN Set Builder: {{ .Token }}`
   - Body: isi `templates/kode-masuk.html`.

   Aplikasi memakai kode, bukan link, karena link sering terbuka di browser lain sehingga login tersimpan di tempat yang salah.
5. **Authentication → URL Configuration**: Site URL `https://hawreirei.github.io/CPNSPRJ/`.
6. **Organization → Team**: pastikan email yang dipakai untuk login terdaftar sebagai anggota tim. Email bawaan Supabase hanya mengirim ke anggota tim; untuk pengguna lain perlu SMTP sendiri (#116).

Email bawaan dibatasi beberapa email per jam. Bila kode tidak datang, tunggu beberapa menit dan periksa folder spam.
