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

**Tahap 2: sub-tes dari paket aktif.** Dikerjakan setelah angka paket kedua terverifikasi, karena bentuk paket kedua menentukan desainnya.
- `Subtest` menjadi id string dari paket aktif. `Record<Subtest, …>` menjadi peta dari daftar sub-tes paket.
- Kemampuan konten per sub-tes (`features`): wajib rujukan, cek hitungan, jenis prosedural, wacana, rasional per opsi, analisis jawaban "kurang tepat".
- **Ambang batas menjadi opsional per paket.** Menurut berita (belum terverifikasi, lihat di bawah), PPPK 2024 tidak memakai ambang batas, sedangkan kelulusan ditentukan dari peringkat. Laporan Skor, Progres, kesiapan, dan Mode CAT perlu bisa tampil tanpa "lulus/belum lulus".
- `packageId` opsional di set, soal, percobaan, berkas berbagi, dan profil kisi-kisi. Data lama tanpa field itu adalah SKD CPNS.
- Pilihan paket aktif di Pengaturan. Progres dan kesiapan tidak mencampur skor antar paket.

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

## Pertanyaan desain untuk PPPK

- **Kompetensi teknis berbeda per jabatan.** Ada ratusan jabatan; topiknya tidak bisa dibawa sebagai daftar tetap. Kemungkinan: pengguna menulis nama jabatannya dan topik teknis dibuat dari situ (dengan label "bukan kisi-kisi resmi"), atau profil kisi-kisi per jabatan yang diimpor pengguna.
- **Wawancara** di PPPK adalah tes tertulis berbasis komputer menurut pemberitaan; formatnya perlu dipastikan dari dokumen sebelum dibuatkan soal.
