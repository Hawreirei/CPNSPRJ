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

### Berbagi set dari paket lain (#45)

- **Set SKD** tetap dibagikan dengan versi berkas 1 dan bentuk yang sama seperti sebelum #37, jadi versi aplikasi lama tetap bisa membacanya.
- **Set dengan sub-tes paket lain** memakai versi 2. Versi aplikasi lama lalu meminta pengguna memperbarui aplikasi, bukan menolak sub-tes yang tidak dikenalnya.
- **Paket bawaan** (PPPK 2024) tidak ikut di berkas, karena sudah ada di setiap aplikasi.
- **Paket impor** ikut di berkas (`packages`) dan diperiksa dengan aturan berkas paket.
  - Penerima yang belum punya paket itu mendapatkannya saat mengimpor set. Halaman impor menyebutkannya, termasuk label "bukan data resmi".
  - Paket milik penerima **tidak pernah diganti dari set**, karena soal-soalnya dinilai dengan paket itu. Bila penerima punya paket dengan id sama tetapi isi berbeda, atau id sub-tesnya dipakai paket lain, impor ditolak dengan penjelasan.

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

## Sumber tidak ditampilkan di aplikasi

Keputusan pemilik produk (10 Oktober 2026):
- Pengguna hanya melihat nama seleksi, yaitu "CPNS" dan "PPPK", tanpa nomor keputusan, diktum, atau tahun.
- Label "bukan data resmi" juga tidak ditampilkan lagi.
- Sumber setiap angka tetap dicatat di kode (field `source` dan `official`, serta komentar per diktum) dan di dokumen ini. Pemilik produk memperbaruinya secara berkala.
- Unit test `src/__tests__/examPackage.test.ts` memastikan nama, catatan, dan nama sub-tes paket bawaan tidak memuat tahun, "Keputusan", "Diktum", atau "MenPAN".

Nama aplikasi menjadi **CASN Set Builder** dengan dua seleksi, CPNS dan PPPK. Id internal tidak berubah, supaya data, cadangan, dan berkas bersama lama tetap terbaca. Contohnya `skd-cpns`, `pppk-2024`, nama database `cpns-skd-builder`, dan `app: 'cpns-skd-builder'` di berkas.

## SKD Sekolah Kedinasan 2026 (dikeluarkan dari aplikasi di 1.4.0)

Profil ini sempat menjadi profil kisi-kisi bawaan di versi 1.2.0 dan 1.3.0. Di versi 1.4.0 profil ini dikeluarkan atas keputusan pemilik produk, karena Sekolah Kedinasan bukan seleksi CASN.
- Datanya tetap disimpan di `src/data/kisiSekolahKedinasan2026.ts` beserta unit test angkanya, untuk dipakai lagi bila diperlukan.
- Pengguna yang masih memakai profil ini dikembalikan ke profil bawaan saat aplikasi dibuka, termasuk jumlah soal, durasi, dan ambang batasnya (`src/lib/retiredProfiles.ts`).

Seleksi Sekolah Kedinasan memakai SKD yang sama dengan CPNS: TWK, TIU, dan TKP dengan penilaian yang sama. Karena itu, keputusan ini dulu dimasukkan sebagai **profil kisi-kisi bawaan**, bukan paket ujian baru.

| | |
|---|---|
| Dokumen | Keputusan Menteri PANRB Nomor 406 Tahun 2026 tentang Nilai Ambang Batas Seleksi Kompetensi Dasar Seleksi Penerimaan Peserta Didik Sekolah Kedinasan Tahun Anggaran 2026 |
| Ditetapkan | 27 Juli 2026 (Diktum KESEBELAS: berlaku sejak tanggal ditetapkan) |
| Diberikan oleh | pemilik produk, Oktober 2026 (Google Drive, `2026kepmenpanrb406.pdf`, 7 halaman) |
| SHA-256 PDF | `144afaaa4459a13b7a94e0209eb64a132dacaa72f14c9bf0cb54fddbe0003d93` |
| Data | `src/data/kisiSekolahKedinasan2026.ts`, diperiksa oleh `src/__tests__/sekolahKedinasan.test.ts` |

Nomor keputusan hanya tercetak di halaman 1, yang berupa gambar. Nomor itu dibaca dari gambar halaman tersebut, bukan dari teks PDF.

| Isi profil | Nilai | Diktum |
|---|---|---|
| Jumlah soal | 110: TWK 30, TIU 35, TKP 45 | KEEMPAT |
| Durasi | 100 menit | KETIGA |
| Penilaian | TWK dan TIU: benar 5, salah atau kosong 0. TKP: 1 sampai 5, kosong 0 (sama dengan SKD CPNS di aplikasi) | KELIMA |
| Nilai tertinggi | 550: TWK 150, TIU 175, TKP 225 (cocok dengan jumlah soal × 5) | KEENAM |
| Ambang batas | TWK 65, TIU 80, TKP 156 | KEDELAPAN |
| Afirmasi daerah tertentu | nilai kumulatif minimal 281 dan TIU minimal 55. Tidak bisa dinyatakan sebagai ambang per sub-tes, jadi tampil sebagai catatan profil | KESEMBILAN, KESEPULUH |

Topik diambil dari sub-materi Diktum KEDUA. Bila aplikasi sudah punya nama topik untuk sub-materi yang sama, nama itu yang dipakai. Dengan begitu, hitungan dicek ulang dengan mathjs, soal figural digambar aplikasi, dan pembahasan TIU tetap menautkan ke Kamus Rumus.

| Sub-tes | Sub-materi di keputusan | Topik di aplikasi |
|---|---|---|
| TWK | nasionalisme, integritas, bela negara, pilar negara, bahasa negara | Nasionalisme, Integritas, Bela Negara, Pilar Negara, Bahasa Negara |
| TIU verbal | analogi, silogisme, analitis | Analogi Verbal, Silogisme, Penalaran Analitis |
| TIU numerik | berhitung, deret angka, perbandingan kuantitatif, soal cerita | Aritmetika, Deret Angka, Perbandingan Kuantitatif, Soal Cerita |
| TIU figural | analogi, ketidaksamaan, serial | Analogi Figural, Figural Berbeda, Deret Figural |
| TKP | pelayanan publik, jejaring kerja, sosial budaya, teknologi informasi dan komunikasi, profesionalisme, anti radikalisme | Pelayanan Publik, Jejaring Kerja, Sosial Budaya, Teknologi Informasi & Komunikasi, Profesionalisme, Anti Radikalisme |

- **Bukan angka CPNS.** Ambang batas TKP 156 hanya berlaku untuk Sekolah Kedinasan 2026. Angka bawaan aplikasi untuk SKD CPNS tidak berubah.
- **Salinan milik pengguna tetap berlaku.** Saat masih bawaan, profil ini tidak bisa diubah atau dihapus, hanya diduplikat. Salinan yang sempat dibuat pengguna adalah profil milik pengguna, jadi tidak ikut dihapus.
- **Field `notes` di berkas profil.** Ini field opsional dan aditif: paling banyak 5 catatan, masing-masing paling panjang 400 karakter. Berkas lama tanpa field ini tetap terbaca, dan aplikasi versi lama mengabaikannya.
