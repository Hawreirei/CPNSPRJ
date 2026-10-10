# Catatan rilis

Perubahan yang terasa bagi pengguna, per versi. Berkas ini dibuat dari `src/data/changelog.ts` dengan `npm run changelog`; jangan diedit langsung.

## 1.7.1 (2026-10-10)

- Perbaikan PPPK Manajerial dan Sosial Kultural (juga TKP): skor tiap pilihan jawaban di Kunci Jawaban kini sama dengan yang disebut di pembahasan. Sebelumnya, bila AI hanya menulis skor di pembahasan, semua pilihan tercatat 0.
- Soal lama yang skornya tercatat 0 diperbaiki otomatis dari pembahasannya saat aplikasi dibuka. Bila pembahasannya tidak menyebut skor, soal ditandai "perlu dicek" dan bisa diperbaiki dengan tombol 🔧 Perbaiki.

## 1.7.0 (2026-10-10)

- Jauh lebih hemat kuota API key gratis: Latihan Singkat kini cukup 1 permintaan AI (sebelumnya 3) dan SKD Lengkap sekitar 5 (sebelumnya 8), karena soal TWK, TIU, dan TKP diminta sekaligus. Satu key Gemini gratis kini cukup untuk sekitar 20 latihan singkat sehari.
- Pembuatan soal dengan Gemini lebih cepat dan lebih jarang terpotong: mode "berpikir" Gemini dibatasi, sehingga tidak menghabiskan token.
- Soal muncul satu per satu begitu selesai ditulis AI, dan angka progres ikut naik per nomor. Bila sambungan terputus di tengah jalan, soal yang sudah jadi tetap tersimpan dan hanya soal yang kurang yang diminta lagi.
- Tombol Uji koneksi di halaman API Key tidak lagi memakai kuota.

## 1.6.0 (2026-10-10)

- Progres Belajar: pilih "5 terakhir" untuk melihat grafik, angka, dan tren dari lima ujian terakhir saja; tombol 1, 2, dan 3 menampilkan TWK, TIU, atau TKP sebagai grafik utama; Unduh CSV menyimpan riwayat skor untuk dibuka di Excel atau Google Sheets.
- Kartu Hafalan TWK: buka pasal UUD 1945 langsung dari kolom di atas halaman, misalnya "28I"; ulangan hari ini dan daftar materi kini berdampingan.
- Kamus Rumus TIU: pencarian di atas halaman, daftar topik tetap terlihat di samping, dan rumus tampil dua kolom di layar lebar.

## 1.5.0 (2026-10-10)

- Tampilan baru yang lebih lega. Beranda kini muat satu layar di laptop: target hari ini, kesiapan per sub-tes, dan konsistensi di baris atas, lalu angka ringkas, set terbaru, dan pintasan. Pengingat cadangan dan penyimpanan tampil sebagai satu baris tipis.
- Progres Belajar: satu grafik besar dan dua grafik kecil. Klik grafik kecil untuk menukarnya jadi besar; skala fokus memperjelas naik-turun skor, Skala penuh menampilkan sumbu dari 0. Daftar topik dan riwayat skor pindah ke tab Topik dan Riwayat.
- Menu samping dikelompokkan (Belajar, Soal, Materi, Sistem) dengan ikon, dan Buku Kesalahan menampilkan jumlah soal yang perlu diulang hari ini.
- Latihan Ujian menampilkan pengaturan dan riwayat berdampingan; Set Saya bisa disaring menurut status; bilah filter Bank Soal tetap terlihat saat digulir; Pengaturan punya daftar isi di layar lebar.

## 1.4.0 (2026-10-10)

- Nama aplikasi kini CASN Set Builder, untuk dua jalur seleksi ASN: CPNS dan PPPK. Buat Soal dimulai dengan memilih salah satunya.
- Paket dan profil kini memakai nama singkat, misalnya "PPPK", tanpa nomor keputusan atau tahun.
- Profil kisi-kisi Sekolah Kedinasan dihapus. Bila Anda sedang memakainya, topik, jumlah soal, dan ambang batas kembali ke bawaan aplikasi.

## 1.3.0 (2026-10-10)

- Bundel soal: Set Saya → Ekspor bundel menggabungkan beberapa set jadi satu berkas (.cpnsbundle.json). Impor set menerimanya, atau beberapa berkas sekaligus, lalu semua set masuk ke Set Saya dan soalnya ke Bank Soal. Beranda yang masih kosong menautkan ke Impor set.

## 1.2.0 (2026-10-09)

- Profil kisi-kisi baru "SKD Sekolah Kedinasan": topik per sub-tes, 110 soal dalam 100 menit, dan ambang batas TWK 65, TIU 80, TKP 156. Pilih di Pengaturan → Profil kisi-kisi. Aturan afirmasi daerah tertentu tampil sebagai catatan.

## 1.1.0 (2026-10-09)

- Kartu Hafalan TWK: dek baru Lembaga negara untuk MPR, DPR, DPD, BPK, Mahkamah Agung, Komisi Yudisial, dan Mahkamah Konstitusi. Jawabannya kutipan ayat UUD 1945 tentang kedudukan, tugas, dan wewenangnya, dan setiap kartu menyebut pasal serta ayatnya.

## 1.0.0 (2026-10-09)

- Aplikasi kini punya nomor versi. Setelah pembaruan, Beranda menampilkan kartu "Apa yang baru" satu kali; riwayat lengkapnya ada di Bantuan.
- Buat set CPNS (SKD) dan PPPK dengan AI memakai API key Anda sendiri, lalu unduh sebagai PDF atau Word. Ujian lain bisa ditambahkan sebagai berkas paket ujian.
- Soal TIU bergambar, analisis data (tabel dan grafik), dan bacaan; soal hitungan diperiksa ulang otomatis, dan pemeriksa silang opsional meminta model AI lain menjawab tanpa melihat kunci.
- Simulasi CAT dengan timer, grid nomor, dan Mode CAT layar penuh, plus Mode Latihan yang langsung menampilkan kunci dan pembahasan.
- Laporan Skor dengan saran latihan, analisis waktu, dan perbandingan dengan ujian sebelumnya; Progres menampilkan tren dan penguasaan topik.
- Buku Kesalahan dengan ulangan terjadwal, Tanya AI per soal, Kartu Hafalan TWK dari teks resmi UUD 1945, dan Kamus Rumus TIU.
- Rencana belajar dengan hitung mundur dan target harian, pengingat dan jadwal kalender (.ics), serta streak dan lencana.
- Impor soal dari foto atau PDF, termasuk memotong gambar grafik dari halaman dengan jari, mouse, atau keyboard.
- Bagikan set lewat berkas, tautan, atau kode QR; cadangan data bisa disimpan otomatis ke berkas, dan Pengaturan menunjukkan ruang penyimpanan yang dipakai.
- Nyaman di ponsel: tidak ada halaman yang bergeser ke samping, tombol cukup besar untuk jari, dan halaman utama tetap cepat di ponsel lambat. Bisa dipasang dan dipakai offline.
