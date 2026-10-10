/*
 * What changed for the learner, per version, newest first (#71). The one source for the "Apa yang
 * baru" card on the dashboard, the history in Bantuan, and CHANGELOG.md (`npm run changelog`
 * writes it; a unit test fails when it is out of date). Only changes a learner notices, briefly.
 *
 * Releasing: raise `version` in package.json and add its entry here, in the same PR as the change.
 */

export interface Release {
  /** Semver, e.g. "1.2.0"; the newest must equal package.json's version (unit test). */
  version: string;
  /** YYYY-MM-DD. */
  date: string;
  /** One line each, as the learner would put it. */
  items: string[];
}

export const CHANGELOG: Release[] = [
  {
    version: '1.3.0',
    date: '2026-10-10',
    items: [
      'Bundel soal: Set Saya → Ekspor bundel menggabungkan beberapa set jadi satu berkas (.cpnsbundle.json). Impor set menerimanya, atau beberapa berkas sekaligus, lalu semua set masuk ke Set Saya dan soalnya ke Bank Soal. Beranda yang masih kosong menautkan ke Impor set.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-10-09',
    items: [
      'Profil kisi-kisi baru "SKD Sekolah Kedinasan 2026" dari Keputusan MenPAN-RB Nomor 406 Tahun 2026: topik per sub-tes, 110 soal dalam 100 menit, dan ambang batas TWK 65, TIU 80, TKP 156. Pilih di Pengaturan → Profil kisi-kisi. Aturan afirmasi daerah tertentu tampil sebagai catatan.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-10-09',
    items: [
      'Kartu Hafalan TWK: dek baru Lembaga negara untuk MPR, DPR, DPD, BPK, Mahkamah Agung, Komisi Yudisial, dan Mahkamah Konstitusi. Jawabannya kutipan ayat UUD 1945 tentang kedudukan, tugas, dan wewenangnya, dan setiap kartu menyebut pasal serta ayatnya.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-09',
    items: [
      'Aplikasi kini punya nomor versi. Setelah pembaruan, Beranda menampilkan kartu "Apa yang baru" satu kali; riwayat lengkapnya ada di Bantuan.',
      'Buat set SKD CPNS dan PPPK 2024 dengan AI memakai API key Anda sendiri, lalu unduh sebagai PDF atau Word. Ujian lain bisa ditambahkan sebagai berkas paket ujian.',
      'Soal TIU bergambar, analisis data (tabel dan grafik), dan bacaan; soal hitungan diperiksa ulang otomatis, dan pemeriksa silang opsional meminta model AI lain menjawab tanpa melihat kunci.',
      'Simulasi CAT dengan timer, grid nomor, dan Mode CAT layar penuh, plus Mode Latihan yang langsung menampilkan kunci dan pembahasan.',
      'Laporan Skor dengan saran latihan, analisis waktu, dan perbandingan dengan ujian sebelumnya; Progres menampilkan tren dan penguasaan topik.',
      'Buku Kesalahan dengan ulangan terjadwal, Tanya AI per soal, Kartu Hafalan TWK dari teks resmi UUD 1945, dan Kamus Rumus TIU.',
      'Rencana belajar dengan hitung mundur dan target harian, pengingat dan jadwal kalender (.ics), serta streak dan lencana.',
      'Impor soal dari foto atau PDF, termasuk memotong gambar grafik dari halaman dengan jari, mouse, atau keyboard.',
      'Bagikan set lewat berkas, tautan, atau kode QR; cadangan data bisa disimpan otomatis ke berkas, dan Pengaturan menunjukkan ruang penyimpanan yang dipakai.',
      'Nyaman di ponsel: tidak ada halaman yang bergeser ke samping, tombol cukup besar untuk jari, dan halaman utama tetap cepat di ponsel lambat. Bisa dipasang dan dipakai offline.',
    ],
  },
];
