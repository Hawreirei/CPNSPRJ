# Pindah dari GitHub Pages ke Cloudflare (domain sendiri)

Kode tetap di GitHub. Cloudflare mengambil kode dari repo, membangunnya, dan menayangkannya di domain Anda. Pushing ke `main` otomatis memperbarui situs. Biaya: hosting gratis, Anda hanya membayar nama domain per tahun.

> Catatan: dokumentasi resmi Cloudflare tidak bisa dibuka saat tutorial ini disusun, jadi langkah ditulis dari pengetahuan umum. Nama menu bisa sedikit berbeda dari tampilan terbaru. Jika berbeda, cari menu yang artinya sama.

## Baca dulu: data pengguna terikat pada alamat

Set, Bank Soal, riwayat ujian, dan Buku Kesalahan disimpan di browser **per alamat situs**. Alamat baru berarti penyimpanan kosong.

- **Belum ada pembeli:** aman. Lakukan pindahan **sebelum** mulai menjual.
- **Anda punya data di alamat lama:** di alamat lama buka **Pengaturan → Cadangan** dan ekspor. Di alamat baru, impor berkas itu di menu yang sama. API key tidak ikut cadangan, masukkan ulang.
- Aplikasi yang sudah dipasang (PWA) dari alamat lama harus dipasang ulang dari alamat baru.

## Langkah 1: Pilih dan beli nama domain

Ide nama (cek ketersediaannya sendiri): `latihanskd.id`, `siapcpns.id`, `skdlatihan.com`.

- **Opsi A: Cloudflare Registrar.** Harga pokok tanpa markup. Perlu akun dan kartu pembayaran. Tidak semua akhiran tersedia (misalnya `.id`), jadi cek dulu.
- **Opsi B: registrar Indonesia** (misalnya Niagahoster, Rumahweb, IDwebhost). Domain `.id` biasanya butuh data identitas, `.my.id` lebih murah, `.com` paling umum. Setelah beli, arahkan nameserver ke Cloudflare (langkah 3).
- Harga berubah-ubah, cek di situs registrar. Pilih nama yang pendek, mudah dieja, dan tidak memakai kata "resmi", "BKN", atau "kemenpan".

## Langkah 2: Buat akun Cloudflare

Daftar di cloudflare.com dengan email, lalu verifikasi emailnya.

## Langkah 3: Pasang domain ke Cloudflare (hanya jika dibeli di luar Cloudflare)

1. Di dashboard klik **Add a site** (atau **Add domain**), masukkan nama domain, pilih paket **Free**.
2. Cloudflare menampilkan dua alamat **nameserver**. Buka panel registrar Anda dan ganti nameserver domain dengan kedua alamat itu.
3. Tunggu sampai status domain di Cloudflare menjadi **Active** (beberapa menit sampai 24 jam).

## Langkah 4: Buat proyek dari repo GitHub

1. Buka **Workers & Pages → Create → Pages → Connect to Git**.
2. Izinkan Cloudflare mengakses GitHub, pilih repo **Hawreirei/CPNSPRJ**, lalu **Begin setup**.
3. Isi pengaturan build:

   | Pengaturan | Isi |
   |---|---|
   | Production branch | `main` |
   | Framework preset | Vite (atau None) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Environment variable | `NODE_VERSION` = `22` |

4. Klik **Save and Deploy**. Build pertama sekitar 1 sampai 3 menit. Hasilnya tayang di alamat `namaproyek.pages.dev`.

**Jika dashboard hanya menawarkan jalur Workers** (Cloudflare kini mengarahkan situs baru ke Workers dengan aset statis): pilih Connect to Git di sana, pakai build command yang sama, lalu tambahkan berkas `wrangler.jsonc` di akar repo:

```jsonc
{
  "name": "cpns-skd",
  "compatibility_date": "2026-10-01",
  "assets": { "directory": "./dist" }
}
```

Aplikasi memakai router berbasis `#`, jadi tidak perlu aturan pengalihan halaman. Pages lebih sederhana untuk situs statis seperti ini.

## Langkah 5: Uji di alamat sementara

Buka `namaproyek.pages.dev` dan pastikan:

- Nomor versi di **Pengaturan** adalah 1.3.0 atau lebih baru.
- **Set Saya → Ekspor bundel** ada.
- Impor bundel dan simulasi CAT berjalan.

## Langkah 6: Pasang domain sendiri

1. Buka proyek → **Custom domains → Set up a custom domain**.
2. Masukkan alamat, misalnya `latihan.domainanda.id`, lalu lanjutkan dan aktifkan.
3. Jika DNS domain ada di Cloudflare, rekamnya dibuat otomatis. Sertifikat HTTPS terbit sendiri dalam beberapa menit.

Saran susunan: domain utama (`domainanda.id`) untuk halaman penjualan nanti, dan subdomain (`latihan.` atau `app.`) untuk aplikasi.

## Langkah 7: Uji ulang di domain sendiri

HTTPS aktif, versi benar, impor bundel berhasil, aplikasi bisa dipasang, dan bisa dibuka tanpa internet setelah sekali dimuat. Jika masih tampil versi lama, muat ulang paksa (Ctrl+Shift+R), karena aplikasi ini PWA.

## Langkah 8: Matikan GitHub Pages (setelah yakin)

1. Selama masa uji biarkan keduanya berjalan.
2. Setelah domain baru stabil, hapus berkas `.github/workflows/deploy-pages.yml` (saya bisa membuatkan PR-nya) dan matikan Pages di **Settings → Pages**.
3. Alamat lama `hawreirei.github.io/CPNSPRJ` lalu berhenti diperbarui. Pastikan tidak ada pengguna yang masih menyimpan data di sana (lihat bagian "Baca dulu").

## Langkah 9: Perbarui semua tautan

- Ganti alamat di `docs/jual-di-lynk.md` dan di halaman produk Lynk.
- Ganti alamat di panduan pembeli dan Free Sample.
- Perbarui bio TikTok/Instagram.

## Opsional

- **Statistik pengunjung:** Cloudflare Web Analytics gratis dan tanpa cookie, cukup untuk menghitung kunjungan.
- **Pembatasan akses:** Cloudflare Access bisa membatasi aplikasi hanya untuk email tertentu (cek batas pengguna di paket gratis). Lihat bagian 7 di `docs/rancangan-penjualan.pdf`.
- **Pratinjau per cabang:** setiap cabang atau PR otomatis mendapat alamat pratinjau sendiri.

## Masalah umum

| Masalah | Penyebab dan solusi |
|---|---|
| Build gagal soal versi Node | Tambahkan variabel `NODE_VERSION` = `22` di pengaturan proyek |
| Halaman kosong | Pastikan Build output directory adalah `dist` |
| Masih tampil versi lama | Muat ulang paksa; hapus data situs bila perlu (ekspor cadangan dulu) |
| Domain tidak aktif | Nameserver belum berubah atau belum menyebar; tunggu dan cek ulang |
| Pembuatan soal AI gagal | Penyebabnya key atau kuota penyedia AI, bukan Cloudflare. Aplikasi memanggil penyedia langsung dari browser |
