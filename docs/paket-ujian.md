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

**Tahap 2b: tampilan dan konten mengikuti paket.**
- Kemampuan konten per sub-tes (`features`): wajib rujukan, cek hitungan, jenis prosedural, wacana, rasional per opsi, analisis jawaban "kurang tepat".
- Pilihan paket saat membuat set (Buat Soal); preset, jumlah soal, dan durasi dari paket.
- Teks aturan skor (cetak, Word, Bantuan) dibuat dari paket.
- Progres dan kesiapan per paket, tidak dicampur.

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
