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

**Tahap 3: paket PPPK.** Data paket (sub-tes, aturan skor, jumlah soal, durasi, ambang batas atau tidak ada) dari dokumen resmi, prompt per sub-tes, e2e satu ujian PPPK lengkap.

## Paket PPPK: yang dibutuhkan dari dokumen resmi

Angka di aplikasi hanya diambil dari dokumen resmi. Dokumen yang relevan menurut pencarian: **Keputusan MenPAN-RB Nomor 347 Tahun 2024** tentang mekanisme seleksi PPPK tahun anggaran 2024, serta 348/2024 (guru) dan 349/2024 (kesehatan). Teksnya **belum bisa dibaca** dari lingkungan pengembangan ini, jadi belum ada angka PPPK di kode.

Yang perlu dipastikan dari teksnya:
1. Daftar komponen seleksi kompetensi dan jumlah soal masing-masing.
2. Aturan skor per komponen (jawaban benar/salah, rentang skor per opsi, nilai tidak menjawab).
3. Durasi tes.
4. Ada atau tidak ada nilai ambang batas, dan bila tidak ada, bagaimana kelulusan ditentukan.
5. Apakah aturan ini berlaku umum atau berbeda untuk guru, kesehatan, dan teknis.

Klaim dari pemberitaan, **belum terverifikasi dan tidak dipakai di kode**:
- Komponen: teknis, manajerial, sosial kultural, wawancara; disebut 90, 25, 20, dan 10 soal.
- Teknis: benar 5, salah atau kosong 0. Manajerial, sosial kultural, wawancara: 1–4 per opsi, kosong 0.
- Tidak ada nilai ambang batas pada 2024; kelulusan berdasarkan peringkat.

## Keputusan untuk PPPK

- **Kompetensi teknis dari nama jabatan** (diputuskan pemilik produk, 8 Oktober 2026). Pengguna menulis nama jabatannya; soal teknis dibuat AI dari nama itu dan ditandai "bukan kisi-kisi resmi".
- **Wawancara** di PPPK adalah tes tertulis berbasis komputer menurut pemberitaan; formatnya perlu dipastikan dari dokumen sebelum dibuatkan soal.
