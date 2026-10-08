# Paket ujian: inventaris dan rencana migrasi (#37)

Tujuan: ujian selain SKD CPNS (PPPK lebih dulu) bisa ditambahkan sebagai **data** dari dokumen resmi, tanpa mengubah kode penilaian. SKD CPNS tetap paket bawaan dan hasilnya tidak berubah.

## Inventaris (per 8 Oktober 2026, setelah Fase 3)

Sub-tes `TWK | TIU | TKP` tertanam di 44 berkas di luar test. Pemakaiannya terbagi lima kelompok:

| Kelompok | Contoh | Jumlah kira-kira | Ditangani di |
|---|---|---|---|
| **Aturan skor** ("TKP dinilai per opsi, TWK/TIU satu kunci bernilai 5") | `scoring.ts`, `practice.ts`, `validators.ts`, `schemas.ts`, `crosscheck.ts`, `AnswerOptions`, `QuestionCard`, `QuestionEditor`, ekspor PDF/Word, `Practice`, `ScoreReport`, `analytics.ts` | ±40 baris | **Tahap 1 (selesai)** |
| **Daftar sub-tes dan angka per sub-tes** (`SUBTESTS`, `Record<Subtest, …>` untuk jumlah soal, ambang batas, warna, nama) | `types.ts`, `blueprint.ts`, `kisi.ts`, `share.ts`, `sets.ts`, `plan.ts`, `analytics.ts`, `studyPlan.ts`, `streak.ts`, `Progress`, `Settings`, `ui.tsx` | ±25 berkas | Tahap 2 |
| **Fitur konten khusus satu sub-tes** (TWK wajib rujukan; TIU numerik/figural/analisis data/wacana; TKP rasional per opsi dan saran belajar TKP) | `prompts.ts`, `validators.ts`, `generator.ts`, `figural.ts`, `dataAnalysis.ts`, `Review.tsx`, `analytics.ts` (analisis TKP) | ±15 lokasi | Tahap 2: menjadi *kemampuan* sub-tes (`features`), bukan nama |
| **Teks aturan SKD di layar dan berkas** ("TWK & TIU: benar 5, salah 0. TKP: 1–5") | `exportPdf.ts`, `exportDocx.ts`, `PrintView`, `Help` | 4 lokasi | Tahap 2: dibuat dari paket |
| **Format data tersimpan** (set, soal, percobaan, cadangan, berkas berbagi, profil kisi-kisi) | `types.ts`, `backup.ts`, `share.ts`, `kisi.ts` | — | Tahap 2: `packageId` opsional, tanpa field = SKD CPNS |

## Tahapan

**Tahap 1: aturan skor sebagai data (selesai).** `src/domain/examPackage.ts` mendefinisikan paket (`ExamPackage`, `SubtestSpec`, `ScoringRule`) dan SKD CPNS sebagai satu-satunya paket. Aturan skor ada dua jenis:
- `keyed`: satu opsi benar bernilai `correct`, lainnya 0.
- `graded`: setiap opsi punya skor `min`–`max`.

Kode menanyakan `isGraded`, `maxPerQuestion`, `isTopOption`, dan `topOptions`, bukan lagi `subtest === 'TKP'`. `Subtest` masih union tetap, jadi perilakunya sama persis; seluruh unit test dan e2e lama lulus tanpa diubah.

**Tahap 2a: registri paket dan ambang batas opsional (selesai).**
- `Subtest` sekarang id string. Id sub-tes **unik di semua paket** (SKD: `TWK`, `TIU`, `TKP`; paket lain memakai awalan, misalnya `PPPK-…`), jadi sub-tes sebuah soal saja sudah menentukan paket dan aturan skornya. Karena itu `packageId` di data tersimpan tidak diperlukan.
- `registerPackage`, `packageOf`, `specOf`, dan `inExamOrder` di `examPackage.ts`. Id yang tidak dikenal (data dari versi lebih baru) dinilai sebagai sub-tes berkunci, tidak dibuang.
- `computeResult` menilai sub-tes yang ada di soal, dalam urutan paket. Ambang batas opsional per sub-tes; tanpa ambang batas tidak ada lulus/belum, dan Laporan Skor menjelaskan bahwa kelulusan ditentukan peringkat.
- Progres, kesiapan, dan streak tetap khusus SKD; sub-tes paket lain tidak masuk skala SKD.
- `SKD_SUBTESTS` dan tipe `SkdSubtest` untuk bagian yang memang khusus SKD (profil kisi-kisi, berkas berbagi).
- Diuji dengan paket fiktif khusus tes (sub-tes bernilai 1–4, tanpa ambang batas), bukan angka PPPK.

**Tahap 2b: paket sebagai berkas, dan seluruh alur mengikutinya (selesai).**
- Pengaturan → **Paket ujian**: impor, ekspor, dan hapus berkas paket. Paket disimpan di Pengaturan (ikut cadangan) dan didaftarkan setiap kali Pengaturan dibaca, termasuk sebelum halaman pertama tampil. Paket yang soalnya masih ada di Bank Soal tidak bisa dihapus.
- **Buat Soal**: pilihan ujian bila ada paket selain SKD, preset "Latihan Singkat" (paling banyak 10 soal per sub-tes) dan "lengkap" (jumlah dan waktu dari berkas), isian **nama jabatan** untuk sub-tes `fromJobTitle`, dan ambang batas yang boleh kosong.
- **Pembuatan soal**: prompt generik untuk sub-tes paket lain (nama paket, nama sub-tes, topik atau jabatan, aturan skor). Prompt SKD tidak berubah.
- **Validasi**: skor bertingkat diperiksa terhadap rentang paket (misalnya 1–4).
- **Ujian, laporan, cetak, PDF/Word, Detail Set, Bank Soal, Buku Kesalahan**: mengikuti sub-tes yang ada di soal; teks aturan skor dibuat dari paket.
- **Progres**: tabel riwayat terpisah per paket; grafik dan kesiapan tetap SKD.
- Diuji dengan paket fiktif (unit test dan e2e lengkap dari impor sampai Progres).

### Format berkas paket

```json
{
  "app": "cpns-skd-builder",
  "kind": "exam-package",
  "version": 1,
  "package": {
    "id": "huruf-kecil-angka-minus",
    "name": "Nama ujian",
    "source": "Sumber angka dalam beberapa kata",
    "official": { "title": "Judul dokumen resmi", "date": "YYYY-MM-DD", "url": "https://…" },
    "durationMinutes": 0,
    "subtests": [
      { "id": "HURUF-BESAR", "name": "Nama sub-tes", "scoring": { "kind": "keyed", "correct": 0 }, "count": 0, "passing": 0, "topics": ["…"] },
      { "id": "HURUF-BESAR-2", "name": "…", "scoring": { "kind": "graded", "min": 0, "max": 0 }, "count": 0, "fromJobTitle": true }
    ]
  }
}
```

- `official` boleh tidak ada; paketnya lalu ditandai "bukan data resmi" di Pengaturan dan Buat Soal.
- `passing` boleh tidak ada (ujian dengan peringkat).
- `topics` wajib kecuali `fromJobTitle: true`.
- Id sub-tes tidak boleh TWK, TIU, TKP, atau id milik paket lain.

**Tahap 3: paket PPPK 2024 (selesai).** Paket bawaan `PPPK_2024` di `src/domain/examPackage.ts`, dari **Keputusan MenPAN-RB Nomor 347 Tahun 2024** tentang Mekanisme Seleksi PPPK Tahun Anggaran 2024, ditetapkan 19 Agustus 2024 (salinan dari jdih.menpan.go.id). Bawaan berarti langsung bisa dipilih tanpa impor, dan tidak bisa dihapus atau ditimpa berkas impor.

## Paket PPPK 2024 dan rujukannya

| Isi paket | Nilai | Diktum |
|---|---|---|
| Sub-tes | Kompetensi teknis, manajerial, sosial kultural; wawancara berbasis komputer | KETIGA BELAS, KEEMPAT BELAS |
| Jumlah soal | 145: teknis 90, manajerial 25, sosial kultural 20, wawancara 10 | KEDUA PULUH DUA |
| Penilaian teknis | benar 5, salah atau tidak menjawab 0 | KEDUA PULUH TIGA huruf a |
| Penilaian manajerial, sosial kultural, wawancara | jawaban 1 sampai 4, tidak menjawab 0 | KEDUA PULUH TIGA huruf b |
| Nilai tertinggi | 670: teknis 450, manajerial dan sosial kultural 180, wawancara 40 (cocok dengan jumlah soal × nilai tertinggi) | KEDUA PULUH EMPAT |
| Waktu | 120 menit untuk tiga kompetensi, 10 menit wawancara; di aplikasi satu sesi 130 menit | KETUJUH BELAS, KEDELAPAN BELAS |
| Ambang batas | tidak ada; lulus bila berperingkat terbaik | KEDUA PULUH SEMBILAN |
| Topik manajerial | integritas, kerja sama, komunikasi, orientasi pada hasil, pelayanan publik, pengembangan diri dan orang lain, mengelola perubahan, pengambilan keputusan | KELIMA BELAS huruf b |
| Topik sosial kultural | kepekaan terhadap keberagaman, kemampuan berhubungan sosial, kepekaan terhadap pentingnya persatuan, empati | KELIMA BELAS huruf c |
| Aspek wawancara | kejujuran, komitmen, keadilan, etika, kepatuhan | KELIMA BELAS huruf d |
| Kompetensi teknis | spesifik bidang teknis jabatan; di aplikasi dibuat dari nama jabatan yang diisi pengguna, berlabel bukan kisi-kisi resmi | KELIMA BELAS huruf a |

Ditampilkan sebagai catatan saat paket dipilih, karena tidak bisa dinyatakan sebagai satu angka:
- Pelamar disabilitas sensorik netra: 150 menit dan 15 menit (KEDUA PULUH, KEDUA PULUH SATU).
- Jabatan Pengelola Umum Operasional: teknis 45 soal, nilai tertinggi 445 (KEDUA PULUH TUJUH, KEDUA PULUH DELAPAN). Jumlah soal teknis bisa diubah di "Sesuaikan lebih lanjut".
- Guru di instansi pusat dengan sertifikat pendidik yang linear mendapat nilai teknis tertinggi 100% (KEDUA PULUH LIMA): tidak relevan untuk latihan, tidak dimodelkan.

Keputusan ini khusus tahun anggaran 2024. Bila aturan tahun berikutnya berbeda, tambahkan paket baru (misalnya `pppk-2025` dengan id sub-tes baru), jangan mengubah angka paket 2024.

## Keputusan untuk PPPK

- **Kompetensi teknis dari nama jabatan** (diputuskan pemilik produk, 8 Oktober 2026). Pengguna menulis nama jabatannya; soal teknis dibuat AI dari nama itu dan ditandai "bukan kisi-kisi resmi".
- **Wawancara** dilaksanakan berbasis komputer dengan CAT BKN (Diktum KEEMPAT BELAS dan KEENAM BELAS) dan dinilai 1–4 per jawaban, jadi di aplikasi dibuat sebagai sub-tes pilihan ganda bertingkat.
