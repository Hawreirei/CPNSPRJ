# Proposal Pengembangan Fitur: CPNS SKD Set Builder

| | |
|---|---|
| **Dokumen** | Proposal pengembangan fitur tahap berikutnya |
| **Tanggal** | 8 Oktober 2026 |
| **Basis analisis** | Kode di repo `hawreirei/cpnsprj` (branch `main`, setelah PR #8), riset pasar dan konteks seleksi CPNS 2026 |
| **Status** | Usulan untuk ditinjau; belum ada kode yang diubah |

---

## 1. Ringkasan Eksekutif

CPNS SKD Set Builder sudah punya fondasi yang jarang dimiliki aplikasi sejenis: soal dibuat AI dengan **API key milik pengguna**, **tanpa server dan tanpa login**, **berjalan offline (PWA)**, dan jawaban **diverifikasi otomatis** (mathjs untuk TIU numerik, generator SVG untuk TIU figural, aturan skor TKP, rujukan wajib untuk TWK). Fitur siklus intinya sudah lengkap: buat set → tinjau → simulasi CAT → laporan skor → bank soal → progres → unduh PDF/Word.

Celah terbesarnya ada **setelah** ujian simulasi selesai. Aplikasi mengukur skor dan topik lemah, tetapi belum membantu pengguna *memperbaikinya secara terjadwal*. Ini adalah titik di mana pengguna belajar, dan di mana aplikasi bimbel berbayar bersaing.

**Rekomendasi utama (urut prioritas):**

1. **Buku Kesalahan + Ulangan Terjadwal** (spaced repetition) dari soal yang salah atau ragu-ragu.
2. **Mode Latihan** dengan umpan balik instan per soal (berbeda dari mode ujian CAT).
3. **Rencana Belajar + Hitung Mundur + Pengingat** berbasis tanggal target dan skor target.
4. **Tutor AI per soal** ("jelaskan lagi", "kenapa opsi B salah", "beri contoh serupa").
5. **Cadangan otomatis & sinkronisasi opsional** untuk mengurangi risiko kehilangan data browser, risiko terbesar arsitektur tanpa server.
6. **Perluasan kualitas & jenis soal**: pemeriksa silang model kedua, TIU analisis data/grafik, bacaan panjang, impor soal dari PDF/foto.

Tiga fitur pertama memakai data yang **sudah dikumpulkan** (`Attempt.answers`, `timeSpent`, `flagged`, `TopicResult`), sehingga biayanya rendah dan risikonya kecil.

---

## 2. Latar Belakang dan Konteks

### 2.1 Kondisi aplikasi saat ini

Berdasarkan kode dan README:

- **Stack**: React 19, TypeScript, Vite, Tailwind v4, Dexie/IndexedDB, Zod, mathjs, KaTeX, pdfmake, docx, vite-plugin-pwa. Sekitar 7.300 baris kode, hash router, dapat di-host statis (GitHub Pages).
- **Model data** (`src/db/index.ts`): tabel `questions`, `sets`, `attempts`, `keys`, `meta`, `requests` (Dexie v2).
- **Sub-tes** TWK/TIU/TKP dengan 32 topik (`src/domain/blueprint.ts`), dua topik TIU figural dibuat prosedural.
- **Halaman**: Dashboard, Set Baru, Set Tersimpan, Detail Set, Bank Soal, Simulasi, Laporan, Progres, API Keys, Pengaturan, Bantuan, Cetak.
- **Data yang sudah direkam per percobaan**: jawaban, soal ditandai ragu, waktu per soal, hasil per sub-tes dan per topik.

### 2.2 Konteks seleksi CPNS 2026 (riset web)

Temuan berikut berasal dari pemberitaan, bukan dokumen resmi. Verifikasi di sscasn.bkn.go.id sebelum dijadikan klaim di dalam aplikasi.

- Per pernyataan BKN yang dikutip media pada 13 Juli 2026, **jadwal pendaftaran CPNS 2026 belum ditetapkan**; saat proposal ini ditulis tidak ditemukan pengumuman resmi yang lebih baru. Artinya masih ada **jendela persiapan**, dan pengguna butuh alat perencanaan berbasis tanggal yang bisa diubah sendiri.
- Formasi diisyaratkan sekitar 160 ribu (angka awal Januari: 300–400 ribu), belum final.
- Passing grade formasi umum yang dirujuk: TWK 65, TIU 80, TKP 166 (Kepmen PANRB 321/2024, yang masih dipakai sebagai rujukan); formasi khusus punya ambang nilai kumulatif dan TIU berbeda. Default aplikasi sudah sama, dan bisa diubah di Pengaturan.
- Satu sumber latihan soal mengklaim bahwa soal 2026 memakai soal-soal baru yang berbeda dari tahun sebelumnya. Klaim ini belum terkonfirmasi, tetapi mendukung perlunya generator yang bisa mengikuti kisi-kisi terbaru.

### 2.3 Lanskap pesaing

| Pemain | Yang mereka tawarkan | Catatan |
|---|---|---|
| Simulasi CAT BKN | Gratis, mengenalkan sistem pengerjaan dan penilaian | Tanpa analisis; sumber media menyebut aplikasi swasta menambah fitur yang tidak ada di simulasi resmi |
| Impia | Belasan ribu latihan soal dan try out, penilaian mengikuti BKN | Klaim promosi |
| MisiPNS (iOS) | Tryout SKD dengan timer per kategori, analitik kelemahan, penjelasan berbasis AI, paket gratis terbatas + berbayar | Model berlangganan |
| Proyek GitHub gratis | Mengklaim 10 paket / 1.100 soal berpembahasan, analisis kelemahan, peta persaingan formasi | Pihak ketiga, kualitas belum terverifikasi |
| Aplikasi belajar umum (Anki-like, StudyNow, dsb.) | Spaced repetition (SM-2), "smart review", streak, XP, badge, leaderboard, kuis dari catatan | Dasar pola fitur di bagian 4 |

**Posisi unik aplikasi ini:** satu-satunya yang (a) tanpa langganan karena memakai key sendiri, (b) soal tak terbatas dan bisa disesuaikan per topik, (c) data tidak keluar dari perangkat, (d) ada verifikasi otomatis jawaban, (e) bisa offline. Fitur yang diusulkan harus **memperkuat** posisi ini, bukan menggantinya dengan model server dan langganan.

---

## 3. Prinsip Pengembangan

1. **Local-first.** Fitur baru harus tetap berfungsi tanpa server. Layanan cloud hanya opsional.
2. **Tidak menambah biaya AI tanpa persetujuan.** Setiap fitur yang memanggil AI menampilkan perkiraan biaya (pola `plan.ts` yang sudah ada) dan lebih dulu memakai bank soal.
3. **Manfaatkan data yang ada.** Prioritaskan fitur yang hanya butuh query atas `attempts` dan `questions`.
4. **Keandalan di atas kuantitas.** Fitur konten harus lolos validator (`validators.ts`) atau menandai ketidakpastian secara jujur.
5. **Sederhana untuk pengguna non-teknis** (arah PR #5–#8). Fitur baru tidak boleh menambah layar pengaturan yang rumit; gunakan nilai bawaan yang masuk akal.
6. **Skema data berversi.** Setiap penambahan tabel melalui `db.version(n)` Dexie dan masuk ke ekspor/impor cadangan (`db/backup.ts`).

---

## 4. Usulan Fitur

Skala **Dampak** (1–5) dan **Upaya** (S ≈ 1–3 hari, M ≈ 4–8 hari, L ≈ 9–20 hari, XL > 20 hari, satu pengembang). Upaya adalah perkiraan kasar, belum diukur.

### Kategori A: Belajar dan Retensi (nilai tertinggi)

#### A1. Buku Kesalahan + Ulangan Terjadwal (spaced repetition) ★ Prioritas 1
**Masalah:** setelah simulasi, pengguna melihat topik lemah dan bisa membuat set remedial sekali, tetapi tidak ada mekanisme yang memastikan soal yang pernah salah dipelajari ulang pada waktu yang tepat.

**Solusi:**
- Setiap soal yang salah, kosong, atau ditandai ragu otomatis masuk **Buku Kesalahan**.
- Tiap entri punya jadwal ulang memakai algoritma SM-2 sederhana (opsi lanjutan: FSRS). Pengguna menilai dirinya setelah melihat pembahasan: *Lupa / Sulit / Baik / Mudah*.
- Halaman **Ulangan Hari Ini** menampilkan antrean soal jatuh tempo, dengan batas harian yang dapat diatur (misal 20).
- **Alasan salah** (tag opsional satu ketuk): *Salah konsep, Salah hitung, Terburu-buru, Tebakan, Tidak paham soal, Kehabisan waktu*. Tag ini memberi data untuk A5.
- Untuk TKP, ulangan menekankan *mengapa opsi skor 5 paling tepat*, bukan "benar/salah".

**Perubahan teknis:** tabel baru `reviews` (`questionId`, `due`, `interval`, `ease`, `reps`, `lapses`, `reasonTags`, `lastReviewedAt`), indeks `due`. Pembaruan otomatis saat `finishAttempt` (di `engine/attempts.ts`). Halaman baru `/review`, kartu "Jatuh tempo hari ini" di Dashboard. Tanpa panggilan AI.

**Kriteria penerimaan:** soal salah muncul di antrean paling lambat besok; penilaian "Mudah" memperlama interval; ekspor/impor cadangan menyertakan `reviews`; unit test algoritma jadwal.

**Dampak 5 · Upaya M · Risiko rendah**

#### A2. Mode Latihan (umpan balik instan)
**Masalah:** simulasi CAT sengaja menyembunyikan jawaban sampai selesai. Untuk belajar, pengguna perlu tahu benar/salah saat itu juga.

**Solusi:** mode kedua selain "Ujian": jawab → langsung tampil kunci, pembahasan, dan rujukan; timer opsional; bisa dibatasi per sub-tes/topik; hasil tetap direkam ke `attempts` dengan penanda `mode: 'practice'` dan **tidak** dihitung sebagai skor ujian di grafik Progres (atau ditampilkan terpisah).

**Perubahan teknis:** `Attempt.mode`, reuse komponen `QuestionCard`/`Simulation`. Pecahan besar sudah ada; sebagian besar pekerjaan di UI.

**Dampak 5 · Upaya M · Risiko rendah**

#### A3. Rencana Belajar, Hitung Mundur, dan Pengingat
**Solusi:** pengguna mengisi (1) tanggal target ujian (default kosong, karena jadwal resmi belum ada), (2) skor target per sub-tes, (3) waktu belajar per hari. Aplikasi menyusun rencana mingguan: jumlah ulangan, latihan topik lemah, dan jadwal simulasi penuh. Dashboard menampilkan hitung mundur, target harian, dan **perkiraan kesiapan** (misal "3 dari 3 percobaan terakhir di atas ambang TWK, TIU masih 12 poin di bawah").
- Pengingat lokal lewat Notifications API/service worker bila diizinkan, dengan batasan jujur: di browser tertentu pengingat tidak muncul bila aplikasi tidak aktif. Alternatif tanpa izin: ekspor jadwal ke file kalender `.ics`.

**Perubahan teknis:** field baru di `Settings` (atau tabel `plan`), modul `engine/studyPlan.ts` (fungsi murni, mudah di-test), komponen Dashboard.

**Dampak 4 · Upaya M · Risiko sedang** (izin notifikasi tidak seragam antar perangkat)

#### A4. Tutor AI per Soal
**Solusi:** di Detail Soal dan Laporan, tombol **Tanya AI**: "jelaskan dengan cara lain", "mengapa opsi C salah", "beri trik cepat", "buat 2 soal serupa lebih mudah". Konteks yang dikirim hanya soal, kunci, pembahasan, dan jawaban pengguna. Jawaban dapat disimpan sebagai catatan pada soal. Pesan sistem mewajibkan menjawab hanya berdasarkan kunci/pembahasan yang sudah diverifikasi dan menandai bila ragu, untuk menekan halusinasi pada TWK.

**Perubahan teknis:** fungsi `chat` di lapisan `providers/` (saat ini berorientasi satu-kali-generate), kolom `Question.notes`. Perkiraan biaya per pertanyaan ditampilkan.

**Dampak 4 · Upaya M · Risiko sedang** (kualitas jawaban TWK; mitigasi: rujukan wajib dan penanda "cek sumber resmi")

#### A5. Analitik Mendalam
Memanfaatkan `timeSpent`, `flagged`, dan tag alasan salah:
- **Manajemen waktu:** rata-rata detik per soal per sub-tes dan topik, soal yang melewati ±2× rata-rata, "waktu terbuang pada soal yang akhirnya salah".
- **Kalibrasi:** perbandingan antara soal yang ditandai ragu vs hasil sebenarnya (apakah ragu Anda akurat?).
- **Tebakan vs paham:** soal benar dengan waktu sangat singkat dan tanpa penanda ragu = kemungkinan tebakan.
- **Tren kenaikan** per topik, prediksi sederhana skor percobaan berikutnya dengan interval (regresi linear atas N percobaan terakhir, ditampilkan hanya bila data ≥ 3 percobaan, dengan peringatan).
- **Strategi TKP:** distribusi skor yang dipilih (apakah cenderung memilih opsi 3–4 padahal 5 tersedia).
- **Rekomendasi tindakan** satu kalimat per temuan ("Latih Deret Angka: rata-rata 94 detik, 60% salah").

**Perubahan teknis:** modul `engine/analytics.ts` murni (test mudah), perluasan `ScoreReport` dan `Progress`. Tanpa AI.

**Dampak 4 · Upaya M · Risiko rendah**

#### A6. Kartu Hafalan TWK dan Kamus Rumus TIU
- **TWK:** kartu belajar (flashcard) untuk pasal UUD 1945, sila dan butir Pancasila, tonggak sejarah, lembaga negara. Dibuat AI sekali, ditandai "perlu dicek", lalu dipakai ulang lewat mekanisme A1. Opsi perluasan: teks UUD 1945 lengkap sebagai data statis yang di-bundle untuk rujukan offline (sumber resmi, bukan hasil AI).
- **TIU:** lembar contekan rumus dan pola (deret aritmetika/geometri/Fibonacci/bertingkat, rumus persen, jarak-waktu, perbandingan, bentuk silogisme).

**Dampak 3 · Upaya M (konten) · Risiko sedang** (akurasi konten TWK; sumber statis yang dikurasi manual lebih aman)

---

### Kategori B: Simulasi dan Ujian

#### B1. Mode "Mirip CAT BKN"
Penyempurnaan Simulasi agar pengguna terbiasa dengan antarmuka ujian sesungguhnya: tata letak soal + panel nomor berwarna (terjawab / belum / ragu), konfirmasi sebelum kirim, layar penuh, penguncian tab (peringatan bila pindah tab), kalkulator dimatikan, dan opsi **urutan sub-tes tetap** atau bebas. Detail antarmuka resmi harus diverifikasi lewat simulasi CAT BKN sendiri sebelum ditiru, supaya tidak menyesatkan.

**Dampak 3 · Upaya M · Risiko rendah**

#### B2. Try Out Terjadwal dan Perbandingan Hasil
Jadwal try out mingguan (bagian dari A3), dan laporan perbandingan antar percobaan pada set yang sama: soal mana yang berubah dari salah menjadi benar, dan sebaliknya.

**Dampak 3 · Upaya S–M · Risiko rendah**

#### B3. Simulasi Formasi Khusus dan Skenario Kelulusan
Preset ambang batas untuk formasi umum dan beberapa formasi khusus (cumlaude, disabilitas, dst.), dengan **tanggal dan sumber aturan** tertera dan bisa diubah. Kalkulator "berapa poin lagi" per sub-tes. Catatan: nilai formasi khusus berubah antar tahun dan hanya diketahui dari pemberitaan; tampilkan sebagai nilai bawaan yang bisa diedit, dengan tautan ke sumber resmi.

**Dampak 3 · Upaya S · Risiko sedang** (kebenaran data; wajib disclaimer)

---

### Kategori C: Konten dan Kualitas Soal

#### C1. Pemeriksa Silang Model Kedua ("Second Opinion")
Setelah generasi, soal TWK/TKP dikirim ke model kedua (atau key kedua) yang diminta menjawab tanpa melihat kunci. Jika jawabannya berbeda, soal diberi penanda `cross-check-mismatch` (tambahan pada `FlagKind`). Opsional dan menampilkan perkiraan biaya. Ini menutup kelemahan terbesar yang diakui README: konten TWK AI bisa keliru.

**Dampak 5 · Upaya M · Risiko rendah** (menambah biaya, maka opsional)

#### C2. Umpan Balik Soal dan Kualitas Bank
Tombol "Laporkan soal bermasalah" (kunci salah, ambigu, usang), penilaian bintang, dan skor kualitas per soal yang menurunkan prioritasnya saat bank dipakai menyusun set. Kesulitan **terkalibrasi**: kesulitan nyata (persentase salah dari semua percobaan pengguna) ditampilkan di samping label AI.

**Dampak 3 · Upaya S–M · Risiko rendah**

#### C3. Jenis Soal Baru
- **TIU figural lanjutan** (prosedural, kuncinya selalu benar): matriks 3×3, pencerminan, rotasi, soal "gambar yang tidak sesuai". Memperluas `domain/figural.ts`.
- **TIU analisis data:** soal berbasis tabel dan grafik batang/garis/lingkaran yang dihasilkan prosedural dari angka acak sehingga jawabannya dapat dihitung oleh mathjs.
- **Pemahaman bacaan dengan satu wacana dan beberapa soal** (struktur grup soal, saat ini satu soal berdiri sendiri).
- **TKP berbasis situasi dengan tingkat kesulitan dilema**, dan penjelasan *mengapa* tiap skor.

**Dampak 4 · Upaya L (bertahap) · Risiko sedang**

#### C4. Impor Soal dari PDF/Foto
Pengguna memotret atau mengunggah halaman soal latihan; model multimodal mengekstrak soal, opsi, dan memberi usulan kunci, yang ditandai "perlu dicek" sebelum masuk Bank Soal. Hanya untuk materi yang hak ciptanya milik pengguna atau berlisensi bebas; tampilkan pengingat ini.

**Dampak 3 · Upaya L · Risiko sedang** (akurasi OCR/ekstraksi, hak cipta)

#### C5. Profil Kisi-kisi
Profil topik dan bobot bisa diperbarui (impor/ekspor JSON "profil kisi-kisi 2026") tanpa mengubah kode, sehingga bila kisi-kisi resmi berubah, pengguna atau komunitas dapat berbagi profil.

**Dampak 3 · Upaya S · Risiko rendah**

---

### Kategori D: Data, Sinkronisasi, dan Berbagi

#### D1. Cadangan Otomatis ★ Prioritas tinggi (mitigasi risiko)
**Masalah:** README mengakui data hanya ada di browser dan hilang bila situs dibersihkan. Cadangan sekarang manual.

**Solusi bertahap:**
1. **Pengingat cadangan** (mis. setelah 7 hari atau 3 set baru) dan indikator "terakhir dicadangkan".
2. **File System Access API** (Chrome/Edge desktop): pilih satu file/folder, tulis ulang otomatis setelah perubahan.
3. **Google Drive / Dropbox opsional** lewat OAuth di browser, data dienkripsi sisi klien dengan frasa sandi pengguna. API key tetap tidak ikut.

**Dampak 5 · Upaya S (1) / M (2) / L (3) · Risiko rendah–sedang**

#### D2. Berbagi Set
Bagikan satu set atau soal terpilih lewat **berkas** (`.cpnsset.json`), **tautan** (data dikompresi di fragmen URL untuk set kecil), atau **kode QR**. Penerima mengimpor tanpa akun. Cocok untuk belajar berkelompok dan untuk tutor yang mengirim soal ke murid.

**Dampak 3 · Upaya M · Risiko rendah**

#### D3. Sinkronisasi Antar Perangkat (opsional, jangka panjang)
Server ringan (Supabase/Cloudflare D1) dengan login tautan-ajaib, sinkron *end-to-end encrypted*. Ditandai **opsional**, karena menghilangkan keunggulan "tanpa server". Lakukan hanya bila permintaan pengguna jelas setelah D1 dirilis.

**Dampak 3 · Upaya XL · Risiko tinggi**

---

### Kategori E: Keterlibatan (Engagement)

#### E1. Streak, Target Harian, dan Lencana
Rangkaian hari belajar, target soal harian (terkait A1/A3), lencana (mis. "7 hari beruntun", "TIU naik 20 poin", "100 soal dibahas"). Semua lokal. Hindari tekanan berlebih: tombol "jeda streak" dan pesan netral. Bukti dari aplikasi belajar umum menunjukkan streak mendorong konsistensi, tetapi tidak membuktikan skor ujian naik; ukur dampaknya sendiri (bagian 8).

**Dampak 3 · Upaya S–M · Risiko rendah**

#### E2. Papan Peringkat Opsional dan Mode Kelompok
Hanya bila D3 ada. Anonim, bisa dimatikan. Prioritas rendah.

**Dampak 2 · Upaya L · Risiko sedang**

---

### Kategori F: Aksesibilitas, Mutu, dan Teknis

| ID | Usulan | Alasan | Upaya |
|---|---|---|---|
| F1 | **Uji e2e Playwright** untuk alur: tambah key (mock penyedia) → generate → simulasi → laporan → unduh | Saat ini hanya unit test (vitest) atas domain/engine; alur UI belum terlindungi regresi | M |
| F2 | **Audit aksesibilitas** (kontras, fokus keyboard, label ARIA, ukuran sentuh, `prefers-reduced-motion`), mode teks besar | Pengguna beragam usia dan perangkat; layar ujian harus bisa dipakai penuh dengan keyboard | S–M |
| F3 | **Penanganan kuota penyimpanan** (`navigator.storage.estimate`) dan pembersihan riwayat lama | Gambar SVG dan banyak soal bisa membesar; peringatan sebelum penuh | S |
| F4 | **Telemetri lokal & log galat yang bisa diekspor** (tanpa kirim keluar) | Memudahkan pengguna melaporkan bug tanpa mengorbankan privasi | S |
| F5 | **Bahasa/dukungan i18n dasar** (Indonesia bawaan; struktur siap multi-bahasa) | Persiapan bila ada ujian lain (PPPK, kedinasan, BUMN) | M |
| F6 | **Paket ujian lain**: PPPK, SKD kedinasan/STAN, tes BUMN (TKD), dengan blueprint berbeda | Pasar lebih luas dengan mesin yang sama; `Blueprint` dan `PRESETS` sudah generik | M per paket |
| F7 | **Peningkatan keamanan key**: opsi "jangan simpan key" (sesi saja), peringatan ekstensi browser, dan opsi proxy sendiri bagi yang mengelola | Mengurangi eksposur seperti dicatat README | S |
| F8 | **Performa**: pecah bundle (pdfmake, docx, mathjs dimuat malas), uji Lighthouse di perangkat entry-level | Target pengguna banyak memakai ponsel Android murah | S–M |

---

## 5. Matriks Prioritas

| Peringkat | ID | Fitur | Dampak | Upaya | Alasan singkat |
|---|---|---|---|---|---|
| 1 | A1 | Buku Kesalahan + Ulangan Terjadwal | 5 | M | Menutup celah belajar terbesar; data sudah ada |
| 2 | A2 | Mode Latihan | 5 | M | Prasyarat belajar efektif; reuse UI |
| 3 | D1 | Cadangan otomatis | 5 | S–M | Mengurangi risiko kehilangan data |
| 4 | C1 | Pemeriksa silang model kedua | 5 | M | Menjawab kelemahan utama akurasi TWK |
| 5 | A5 | Analitik mendalam | 4 | M | Diferensiasi vs simulasi BKN; tanpa AI |
| 6 | A3 | Rencana belajar + hitung mundur | 4 | M | Jendela persiapan masih terbuka |
| 7 | A4 | Tutor AI per soal | 4 | M | Setara fitur "penjelasan AI" pesaing |
| 8 | C3 | Jenis soal baru (figural, data, bacaan) | 4 | L | Variasi dan realisme |
| 9 | F1 | Uji e2e | 4 | M | Pondasi agar rilis fitur berikutnya aman |
| 10 | B1/B3 | Mode mirip CAT BKN, preset formasi khusus | 3 | M/S | Pembiasaan dan akurasi ambang |
| 11 | D2, E1, C2, C5, A6 | Berbagi set, streak, umpan balik soal, profil kisi-kisi, kartu hafalan | 3 | S–M | Peningkatan bertahap |
| 12 | C4, F6, D3, E2 | Impor foto/PDF, paket ujian lain, sinkron cloud, papan peringkat | 2–3 | L–XL | Pertimbangkan setelah data penggunaan ada |

---

## 6. Peta Jalan (Roadmap)

Perkiraan untuk satu pengembang penuh waktu, tanpa buffer; sesuaikan bila paruh waktu.

### Fase 1: "Dari ukur ke belajar" (± 4–5 minggu)
- A2 Mode Latihan
- A1 Buku Kesalahan + Ulangan Terjadwal (skema Dexie v3: `reviews`)
- D1 langkah 1–2 (pengingat + penyimpanan otomatis ke berkas)
- F1 kerangka uji e2e untuk alur utama
- **Hasil:** pengguna dapat berlatih dengan umpan balik instan, soal salah kembali terjadwal, data aman.

### Fase 2: "Wawasan dan keandalan" (± 4–5 minggu)
- A5 Analitik mendalam
- C1 Pemeriksa silang model kedua
- A3 Rencana belajar + hitung mundur + ekspor `.ics`
- B3 Preset formasi khusus (dengan sumber dan tanggal)
- F2 audit aksesibilitas, F8 performa
- **Hasil:** rekomendasi belajar yang personal dan kepercayaan konten lebih tinggi.

### Fase 3: "Variasi dan kolaborasi" (± 6–8 minggu)
- A4 Tutor AI per soal
- C3 Jenis soal baru (bertahap: matriks 3×3 → analisis data → bacaan berkelompok)
- D2 Berbagi set, E1 streak & lencana, C2 umpan balik soal, C5 profil kisi-kisi
- B1 Mode mirip CAT BKN
- **Hasil:** diferensiasi konten dan siap dipakai kelompok belajar/tutor.

### Fase 4: Eksplorasi (menunggu bukti kebutuhan)
D3 sinkronisasi cloud, F6 paket ujian lain, C4 impor foto/PDF, E2 papan peringkat.

---

## 7. Rancangan Teknis Ringkas

### 7.1 Perubahan skema data (Dexie v3)

```ts
// src/db/index.ts (usulan)
this.version(3).stores({
  reviews: 'questionId, due, lastReviewedAt',   // A1
  notes:   'questionId',                          // A4 (catatan/tutor)
});
```

| Tabel/field | Fitur | Keterangan |
|---|---|---|
| `reviews` | A1 | `interval`, `ease`, `reps`, `lapses`, `reasonTags[]` |
| `Attempt.mode` | A2 | `'exam' \| 'practice'`, default `'exam'` untuk data lama |
| `Attempt.reasons` | A1/A5 | `Record<questionId, ReasonTag>` |
| `Settings.studyPlan` | A3 | tanggal target, skor target, menit/hari |
| `FlagKind` + `'cross-check-mismatch'` | C1 | penanda baru di `domain/types.ts` |
| `Question.notes`, `Question.userRating` | A4/C2 | opsional |

Semua perubahan **aditif**; data lama tetap valid. Versi cadangan JSON dinaikkan dan impor harus tetap menerima versi lama.

### 7.2 Modul baru (semua fungsi murni bila mungkin)

```
src/engine/srs.ts          # penjadwalan SM-2 (A1)
src/engine/analytics.ts    # agregasi waktu, kalibrasi, tebakan (A5)
src/engine/studyPlan.ts    # rencana & estimasi kesiapan (A3)
src/engine/crosscheck.ts   # pemeriksa model kedua (C1)
src/pages/Review.tsx       # antrean ulangan (A1)
src/pages/Practice.tsx     # mode latihan (A2)
src/providers/chat.ts      # percakapan tutor (A4)
```

### 7.3 Kebutuhan layanan eksternal
Fase 1–2 **tidak** memerlukan server. D1 langkah 3 memerlukan pendaftaran aplikasi OAuth (Google/Dropbox). D3 memerlukan backend.

### 7.4 Strategi pengujian
Setiap modul engine baru wajib punya unit test (gaya `quota.test.ts`/`domain.test.ts`), termasuk kasus tepi (set kosong, zona waktu, perpindahan hari, data lama tanpa field baru). Ditambah e2e (F1) untuk alur lintas halaman.

---

## 8. Metrik Keberhasilan

Karena aplikasi tidak memiliki server dan tidak mengirim telemetri, metrik dikumpulkan **lokal** (ditampilkan ke pengguna, opsional diekspor) dan lewat survei singkat sukarela.

| Tujuan | Metrik | Target indikatif |
|---|---|---|
| Retensi belajar | Persentase pengguna yang menyelesaikan ulangan ≥ 3 hari dalam seminggu | ≥ 40% pengguna aktif |
| Efektivitas | Kenaikan rata-rata skor antar simulasi berturut-turut pada pengguna yang memakai A1 vs yang tidak | Positif, diukur setelah ≥ 3 simulasi |
| Keandalan konten | Persentase soal TWK dengan penanda `cross-check-mismatch` dan proporsinya yang akhirnya dikoreksi | Turun seiring perbaikan prompt |
| Beban pengguna | Waktu dari buka aplikasi sampai soal pertama (set siap) | < 3 menit bila bank cukup |
| Keamanan data | Persentase pengguna dengan cadangan terakhir < 7 hari | ≥ 60% |
| Kualitas teknis | Waktu muat awal di 4G, skor Lighthouse PWA/Aksesibilitas | LCP < 3 dtk; skor ≥ 90 |

Target adalah titik awal diskusi, bukan hasil pengukuran; kalibrasi setelah ada data nyata.

---

## 9. Risiko dan Mitigasi

| Risiko | Kemungkinan | Dampak | Mitigasi |
|---|---|---|---|
| Soal TWK buatan AI keliru dan pengguna menghafal informasi salah | Sedang | Tinggi | C1 pemeriksa silang, rujukan wajib, penanda "cek sumber resmi", sumber statis UUD 1945 untuk A6 |
| Biaya AI membengkak (tutor, pemeriksa silang) | Sedang | Sedang | Tampilkan perkiraan biaya sebelum aksi, pakai kuota per key yang sudah ada, utamakan bank soal |
| Data browser hilang | Sedang | Tinggi | D1 cadangan otomatis, `requestPersistence` yang sudah ada, pengingat |
| Aturan/ambang batas berubah tiap tahun | Tinggi | Sedang | Semua angka dapat diubah; preset memuat tanggal dan sumber (B3, C5) |
| Jadwal CPNS 2026 belum pasti sehingga rencana belajar kehilangan acuan | Sedang | Rendah | Tanggal target opsional dan dapat diubah; rencana berbasis jam belajar/minggu bila tanpa tanggal |
| Pelanggaran hak cipta lewat impor soal pihak ketiga (C4) | Sedang | Sedang | Pengingat hak cipta, soal tidak dibagikan otomatis, fitur ditunda ke Fase 4 |
| Pembengkakan kompleksitas dan regresi | Sedang | Sedang | F1 e2e, migrasi Dexie aditif, rilis bertahap per fase |
| Klaim performa/kelulusan yang menyesatkan | Rendah | Tinggi | Prediksi hanya tampil dengan interval dan jumlah data minimal; disclaimer "bukan produk resmi BKN" tetap di semua layar hasil |

---

## 10. Pertanyaan Terbuka (perlu keputusan pemilik produk)

1. **Sasaran pengguna utama:** pembelajar mandiri, atau juga tutor/bimbel? Jika tutor, D2 dan sebagian D3 naik prioritas.
2. **Model bisnis:** tetap gratis dan sumber terbuka, donasi, atau paket kurasi berbayar? Proposal ini mengasumsikan tetap gratis dan tanpa server pada Fase 1–3.
3. **Cakupan ujian:** hanya SKD CPNS, atau juga PPPK/kedinasan/BUMN (F6)?
4. **Kesediaan memakai backend** (D3, E2). Bila tidak, fitur-fitur itu dicoret dari peta jalan.
5. **Perangkat target utama:** ponsel Android entry-level atau desktop? Menentukan prioritas F8 dan batasan File System Access API (D1 langkah 2 hanya desktop Chromium).
6. **Sumber kebenaran ambang batas formasi khusus:** siapa yang memperbarui bila aturan berubah?

---

## 11. Langkah Selanjutnya

1. Pemilik produk memilih fitur Fase 1 dan menjawab pertanyaan 10.1–10.5.
2. Buat issue GitHub per fitur (A1, A2, D1, F1) dengan kriteria penerimaan dari bagian 4.
3. Mulai A2 (Mode Latihan) karena ia menyiapkan UI umpan balik yang dipakai A1 dan A4.
4. Tinjau ulang proposal ini setelah Fase 1, dengan data pemakaian nyata.

---

## Lampiran A: Sumber Riset

Temuan pasar dan konteks seleksi berasal dari hasil pencarian web (8 Oktober 2026). Perlu diverifikasi ke sumber resmi sebelum dipakai di dalam aplikasi.

- [Jelang Seleksi CPNS 2026, Pahami Mekanisme CAT (RCTI+)](https://www.rctiplus.com/news/detail/ekonomi/5411964/jelang-seleksi-cpns-2026--pahami-mekanisme-cat)
- [MisiPNS di App Store](https://apps.apple.com/app/misipns/id6759079870)
- [Rangkuman 12 Link Latihan Soal CPNS (Katadata)](https://katadata.co.id/lifestyle/varia/6a793de19d5ea/rangkuman-12-link-latihan-soal-cpns-dari-tkd-twk-tiu)
- [Formasi CPNS 2026 dan passing grade formasi khusus (Bisnis.com)](https://kabar24.bisnis.com/read/20260408/243/1965078/ini-formasi-cpns-2026-yang-dibuka-untuk-lulusan-smasmk-hingga-passing-grade-formasi-khusus)
- [Prediksi jadwal pendaftaran dan formasi CPNS 2026 (Bisnis.com)](https://kabar24.bisnis.com/read/20260414/15/1966440/prediksi-jadwal-pendaftaran-dan-formasi-lengkap-cpns-2026)
- [Passing grade CPNS 2026 (Bisnis.com)](https://kabar24.bisnis.com/read/20260203/243/1949597/passing-grade-cpns-2026-resmi-ditetapkan-ini-nilai-ambang-batas-skd)
- [Kapan Sebenarnya CPNS 2026 Dibuka? BKN Kembali Buka Suara (Katadata)](https://katadata.co.id/lifestyle/varia/6a58561ec7878/kapan-sebenarnya-cpns-2026-dibuka-bkn-kembali-buka-suara)
- Pola fitur belajar (spaced repetition, streak, XP): listing aplikasi seperti [StudyCards](https://apps.apple.com/app/id1534325530) dan [StudyNow](https://apps.apple.com/app/id6755723107). Ini klaim pengembang, bukan uji independen.

## Lampiran B: Pemetaan Fitur ke Kode yang Ada

| Fitur | File terkait sekarang | Perubahan utama |
|---|---|---|
| A1 | `engine/attempts.ts`, `pages/ScoreReport.tsx`, `db/index.ts`, `db/backup.ts` | Tabel `reviews`, halaman `Review`, hook di akhir percobaan |
| A2 | `pages/Simulation.tsx`, `components/QuestionCard.tsx`, `domain/types.ts` | `Attempt.mode`, umpan balik instan |
| A3 | `pages/Dashboard.tsx`, `pages/Settings.tsx`, `lib/pwa.ts` | `studyPlan`, pengingat, `.ics` |
| A4 | `providers/*`, `pages/SetDetail.tsx`, `engine/quota.ts` | Antarmuka `chat`, catatan soal |
| A5 | `pages/ScoreReport.tsx`, `pages/Progress.tsx`, `domain/scoring.ts` | `engine/analytics.ts` |
| C1 | `engine/generator.ts`, `domain/validators.ts`, `domain/types.ts` | Langkah verifikasi tambahan, `FlagKind` baru |
| C3 | `domain/figural.ts`, `lib/figureSvg.ts`, `domain/numeric.ts` | Generator prosedural baru |
| D1 | `db/backup.ts`, `pages/Settings.tsx` | Pengingat, File System Access API |
| D2 | `db/backup.ts`, `components/DownloadDialog.tsx` | Format berbagi set |
