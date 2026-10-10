# CASN Set Builder

Aplikasi web untuk membuat set latihan seleksi **CASN** (calon ASN) dengan AI, untuk dua jalurnya: **CPNS** (SKD: TWK, TIU, TKP) dan **PPPK**. Buat Soal dimulai dengan memilih salah satunya. Set dibuat memakai **API key milik pengguna sendiri**. Ujian lain bisa ditambahkan lewat berkas paket ujian. Tanpa server dan tanpa login: semua data tersimpan di browser.

Setiap set terdiri dari tiga keluaran yang saling terhubung:

- **Set Soal**: dikelompokkan per sub-tes, misalnya TWK → TIU → TKP
- **Kunci Jawaban & Skor**: kunci untuk sub-tes berkunci (TWK/TIU: 5/0) dan skor per opsi untuk sub-tes bertingkat (TKP: 1–5)
- **Pembahasan**: langkah demi langkah, beserta rujukan untuk TWK

> Aplikasi latihan, bukan produk resmi BKN. Periksa materi TWK ke sumber resmi. Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci resmi.

## Fitur

| Fitur | Keterangan |
|---|---|
| Set builder | Preset (SKD lengkap, Mini SKD, TWK saja, drill TIU, drill TKP), pilihan topik, jumlah, dan kesulitan |
| CPNS dan PPPK | Dua seleksi bawaan, dipilih di awal Buat Soal; ujian lain diimpor sebagai berkas paket di Pengaturan. Soal kompetensi teknis PPPK dibuat dari nama jabatan yang diisi pengguna. Lihat [docs/paket-ujian.md](docs/paket-ujian.md) |
| Profil kisi-kisi | Daftar topik per sub-tes SKD (dengan bobot opsional), plus jumlah soal, durasi, dan ambang batas bila perlu. Bisa dibuat, diimpor, dan diekspor di Pengaturan tanpa menunggu aplikasi diperbarui. |
| Panel rencana | Jumlah permintaan API, perkiraan token, biaya, dan waktu sebelum generasi |
| Generasi | Batch campuran topik, progres, stop/lanjut, coba ulang batch gagal, autosave per batch |
| Pemeriksaan keandalan | TIU numerik dihitung ulang dengan mathjs (kunci dikoreksi otomatis bila jelas); TKP wajib skor 1–5 tanpa skor tertinggi kembar; TWK wajib rujukan, ditandai bila meragukan; deteksi duplikat |
| TIU figural | Deret dan analogi gambar dibuat oleh aplikasi (SVG) dari aturan pasti: gratis dan kuncinya selalu benar |
| TIU analisis data dan bacaan | Analisis Data: tabel, grafik batang, garis, atau lingkaran dibuat aplikasi dari angka acak dengan konteks rekaan, dan kuncinya dihitung dari angka itu (gratis). Pemahaman Bacaan: AI menulis bacaan dengan beberapa soal sekaligus |
| Kontrol soal | Edit, tulis ulang dengan AI, kunci, bintangi, pindah, hapus, "Serupa+" |
| Simulasi CAT | Timer (default 100 menit), grid nomor, ragu-ragu, pintasan keyboard, kirim otomatis, bisa dilanjutkan setelah refresh |
| Mode CAT | Opsional saat memulai ujian: layar penuh bila perangkat mendukung, dan setiap kali meninggalkan tab ujian dicatat di Laporan Skor tanpa pengurangan nilai. Opsi "Kunci urutan sub-tes" melatih pembagian waktu; ini bukan aturan resmi yang sudah dipastikan |
| Buku Kesalahan | Soal yang salah, kosong, atau ragu-ragu dari ujian dan latihan masuk otomatis, lalu diulang terjadwal (spaced repetition SM-2): jawab dulu, lihat pembahasan, nilai diri Lupa/Sulit/Baik/Mudah. Batas ulangan per hari, tag alasan salah, daftar semua catatan dengan filter |
| Mode Latihan | Kunci, skor TKP, dan pembahasan tampil langsung setelah menjawab; jawaban terkunci setelah dipilih; pilih topik tertentu; timer opsional. Tidak masuk grafik skor ujian di Progres |
| Laporan skor | Skor per sub-tes vs ambang batas, maksimal 3 saran konkret dengan tautan ke latihan, topik lemah, analisis waktu (rata-rata, soal lama, waktu di soal salah), ketepatan tanda ragu-ragu, kemungkinan tebakan, pola jawaban TKP, tinjau jawaban, set latihan topik lemah (bank dulu, AI bila kurang) |
| Perbandingan percobaan | Bila set yang sama sudah pernah diujikan, Laporan Skor membandingkannya dengan ujian sebelumnya: skor per sub-tes, waktu, dan soal yang membaik, memburuk, atau tetap salah. Soal yang memburuk atau tetap salah bisa langsung dilatih ulang |
| Tanya AI | Tutor per soal di kartu soal yang menampilkan pembahasan (tidak saat ujian): jelaskan dengan cara lain, mengapa jawaban salah, trik cepat, pertanyaan bebas, atau buat 2 soal serupa yang lebih mudah. Tutor hanya menjelaskan dari kunci dan pembahasan yang ada dan berterus terang bila kuncinya tampak keliru. Jawabannya bisa disimpan sebagai catatan soal. Memakai API key pengguna (1 permintaan per pertanyaan, perkiraan biaya tampil) |
| Nilai dan laporkan soal | Beri bintang 1–5, atau laporkan soal (kunci salah, ambigu, usang, salah ketik, lainnya). Soal yang dilaporkan ditandai "perlu dicek", bisa difilter di Bank Soal, dan tidak diambil untuk set baru kecuali dicentang di Set Baru. Soal bernilai rendah dipilih paling akhir |
| Pemeriksa silang (opsional) | Setelah soal dibuat, model AI lain menjawab soal TWK, TIU non-hitungan, dan TKP tanpa melihat kunci. Jawaban berbeda ditandai "perlu dicek" beserta alasannya; kunci tidak diubah otomatis. Bisa dijalankan juga untuk soal lama dari halaman set. Menambah permintaan AI, ditampilkan di panel rencana |
| Bank soal | Pencarian dan filter; susun set baru tanpa biaya AI |
| Impor dari foto/PDF | Potret halaman soal atau pilih gambar/PDF milik sendiri. Satu halaman dikirim sebagai satu request ke model AI pada key pengguna (perkiraan biaya tampil sebelum mengirim). Hasilnya ditinjau di samping gambar halaman sebelum disimpan, bertanda "perlu dicek". Soal yang memakai grafik atau diagram bisa diberi gambar yang dipotong dari halaman. Lihat [docs/impor-foto.md](docs/impor-foto.md) |
| Bundel soal | Set Saya → **Ekspor bundel** menggabungkan beberapa set jadi satu berkas `.cpnsbundle.json` (tanpa soal hasil impor foto/PDF). Penerima memilihnya di **Impor set** (atau beberapa berkas sekaligus); semua set masuk ke Set Saya dan soalnya ke Bank Soal, dengan soal yang sudah ada dipakai ulang |
| Bagikan set | Sebagai berkas `.cpnsset.json`, tautan, atau kode QR. Penerima mengimpornya tanpa akun. API key, riwayat ujian, Buku Kesalahan, nilai, dan laporan tidak ikut; catatan soal dan soal hasil impor foto/PDF hanya ikut bila dipilih |
| Set varian | Set baru dengan topik dan kesulitan yang sama |
| Rencana belajar | Tanggal ujian (opsional), waktu belajar per hari, hari simulasi mingguan, dan skor target. Beranda menampilkan hitung mundur, target hari ini (ulangan Buku Kesalahan, latihan topik lemah, simulasi mingguan) dan kesiapan menurut ujian terakhir. Jadwal bisa diunduh sebagai berkas kalender `.ics`. Pengingat harian lewat notifikasi browser (hanya saat aplikasi terbuka) |
| Streak dan lencana | Hari berturut-turut menyelesaikan latihan, ujian, ulangan Buku Kesalahan, atau Kartu Hafalan. Hari di luar hari belajar tidak memutus streak, ada tombol "Jeda streak", dan semuanya bisa dimatikan di Pengaturan |
| Kartu Hafalan TWK | Pancasila, alinea Pembukaan, dan setiap ayat UUD 1945 dari teks resmi Setjen MPR ("UUD NRI Tahun 1945 Dalam Satu Naskah"), bukan buatan AI, diulang terjadwal. Dek Lembaga negara (MPR, DPR, DPD, BPK, MA, KY, MK) mengutip ayat UUD tentang kedudukan, tugas, dan wewenangnya, dengan pasal di setiap kartu. Rujukan soal TWK yang menyebut pasal UUD menautkan ke teks pasalnya. Lihat [docs/kartu-hafalan.md](docs/kartu-hafalan.md) |
| Kamus Rumus TIU | 25 rumus dan pola (deret, aritmetika, soal cerita, perbandingan kuantitatif, silogisme) dengan contoh yang hitungannya diperiksa ulang di unit test. Pembahasan soal TIU dengan topik yang cocok menautkan ke kamus. Lihat [docs/kartu-hafalan.md](docs/kartu-hafalan.md#kamus-rumus-tiu) |
| Progres | Grafik riwayat skor per sub-tes, tren dan perkiraan kasar ujian berikutnya (mulai 3 ujian), topik paling membaik/menurun, alasan salah tersering dari Buku Kesalahan, penguasaan topik |
| Unduh PDF / Word | Tombol **Unduh** di halaman set, atau pilih soal di Bank Soal lalu unduh. Isi: soal saja, soal + kunci jawaban, lengkap (dengan pembahasan), atau kunci saja; dengan nama lembaga, tanggal, dan logo. PDF berisi teks asli dan gambar soal figural |
| Cadangan | Ekspor/impor JSON antar perangkat (API key tidak ikut). Beranda mengingatkan bila cadangan terakhir lebih dari 7 hari atau sudah ada 3 set baru. Di Chrome/Edge desktop, cadangan bisa disimpan otomatis ke satu berkas pilihan setiap ada perubahan |
| Penyimpanan | Pengaturan → Penyimpanan menunjukkan ruang yang dipakai (termasuk gambar soal) dan bisa menghapus data lama; Beranda memperingatkan bila ruang browser hampir penuh |
| Keamanan API key | Halaman API Key memperingatkan bahwa ekstensi browser yang bisa membaca halaman dapat melihat key, disertai panduan membatasi key per penyedia. Lihat juga [Penyedia AI](#penyedia-ai) |
| Aksesibilitas | Bisa dipakai penuh dengan keyboard (fokus pindah ke judul soal, status tiap nomor dibacakan), cincin fokus jelas, kontras teks memenuhi WCAG AA di tema terang dan gelap, tombol nomor soal dan pilihan jawaban setinggi minimal 44px di ponsel, menghormati "kurangi gerakan" sistem, dan pilihan ukuran teks (Normal/Besar/Sangat besar). Diperiksa otomatis dengan axe di uji e2e |
| PWA | Bisa dipasang; set tersimpan dan simulasi berjalan offline |
| Apa yang baru | Nomor versi di Pengaturan dan log galat; setelah pembaruan, Beranda menampilkan perubahan sejak versi terakhir yang dilihat. Riwayat lengkap di Bantuan dan [CHANGELOG.md](CHANGELOG.md) |

## Penyedia AI

Gemini, OpenAI, Anthropic Claude, dan endpoint OpenAI-compatible (misal OpenRouter). Permintaan dikirim langsung dari browser ke penyedia.

**Pemilihan model otomatis.** Nama model tidak dikunci di kode, karena penyedia rutin menghentikan model lama:

- Saat key disimpan, aplikasi membaca daftar model akun Anda dan memilih model **stabil dengan versi terbaru** di kelas seimbang: Gemini Flash, GPT mini, atau Claude Sonnet. Model preview/eksperimental dan model non-teks (embedding, gambar, audio) dilewati.
- Pilihan dicek ulang tiap 7 hari sebelum generasi.
- Bila penyedia menolak model karena sudah dihentikan (misal 404), aplikasi berpindah ke model stabil terbaru lalu mengulang permintaan.
- **Bebas memilih model.** Semua model di akun ditampilkan dengan nama dari penyedia, misalnya "Gemini 3.5 Flash (gemini-3.5-flash)", dan dikelompokkan: direkomendasikan, hemat, paling kuat, alias "latest", preview, lainnya, dan khusus. Model khusus seperti agen atau audio tetap ditampilkan, hanya ditempatkan paling akhir.
  - Memilih model tertentu mengubah key ke mode manual: model itu dipakai apa adanya dan tidak diganti otomatis.
  - Opsi "Otomatis" di urutan pertama mengembalikan pemilihan ke aplikasi.
  - Model juga bisa dipilih per set di halaman Set Baru, tanpa mengubah pengaturan key.

**Hemat kuota free tier.** Free tier sangat terbatas (Gemini misalnya 5 request/menit dan 20 request/hari), jadi aplikasi:

- Meminta **30 soal per request** secara default, dan pada key free tier **menggabungkan TWK, TIU, dan TKP dalam satu request** selama muat. Latihan Singkat (30 soal) cukup 1 request dan SKD lengkap (110 soal) sekitar 5 request (soal wacana selalu diminta tersendiri), sehingga satu key gratis bisa membuat sekitar 4 set lengkap atau 20 latihan singkat per hari. Nilainya bisa diubah di Pengaturan.
- Membatasi mode *thinking* Gemini (`thinkingLevel: low`, atau `thinkingBudget` 0 di Gemini 2.5 Flash). Tanpa ini, Gemini 3 berpikir panjang secara default: token pikirannya ikut dihitung, memperlambat pembuatan, dan bisa membuat jawaban terpotong lalu diminta ulang.
- Membaca jawaban Gemini sambil ditulis (*streaming*): setiap soal disimpan dan tampil begitu objek JSON-nya lengkap, dan progres naik per nomor. Bila sambungan putus di tengah jawaban, soal yang sudah jadi tetap disimpan dan permintaan berikutnya hanya meminta soal yang kurang.
- Soal bergambar (figural dan Analisis Data) digambar oleh aplikasi sendiri, tidak memakai AI maupun kuota, sehingga tidak terpengaruh pengaturan *thinking*.
- "Uji koneksi" memeriksa key lewat daftar model, sehingga tidak memakai kuota. Perbaikan otomatis soal yang kunci dan pembahasannya tidak cocok memakai paling banyak 1 request per set.
- Menyimpan **batas kuota per key** (preset "Gemini free tier", "tanpa batas", atau kustom) dan menghitung pemakaian sendiri. Aplikasi menunggu bila batas per menit tercapai, dan berhenti rapi bila kuota harian habis; set bisa dilanjutkan setelah reset (Gemini: tengah malam waktu Pasifik).
- Membaca waktu tunggu dan jenis kuota dari error 429. Request yang ditolak tidak dihitung, dan tidak ada percobaan ulang beruntun yang menghabiskan kuota.
- Tidak membuang request: soal yang lengkap dari respons yang terpotong tetap disimpan, dan hanya soal yang kurang yang diminta ulang. Soal figural (gratis) dikerjakan lebih dulu.
- Panel rencana menampilkan sisa kuota hari ini dan berapa set yang masih bisa dibuat.

API key dienkripsi AES-GCM dengan kunci perangkat non-extractable (WebCrypto) di IndexedDB. Enkripsi ini melindungi data tersimpan, tetapi tidak melindungi dari kode berbahaya yang berjalan di halaman (misal ekstensi browser). Build produksi memasang Content-Security-Policy yang ketat.

Kunci enkripsi itu juga ada di perangkat yang sama, jadi siapa pun yang bisa membuka profil browser bisa memakai key yang disimpan. Untuk komputer bersama, pilih **"Jangan simpan, hanya untuk sesi ini"** saat menambah key: key hanya ada di `sessionStorage` tab itu, tidak pernah ditulis ke IndexedDB atau cadangan, dan hilang saat tab ditutup (pembuatan soal lalu meminta key dimasukkan lagi).

Galat dicatat di perangkat (paling banyak 200 terakhir, sudah disaring dari API key, isi soal, dan prompt) dan bisa diunduh dari Pengaturan → Log galat untuk dilampirkan saat melaporkan masalah. Tidak ada yang dikirim ke luar.

## Privasi

Aplikasi tidak punya server. Yang keluar dari browser hanya permintaan ke penyedia AI pilihan pengguna, dikirim langsung dari browser dan tunduk pada kebijakan privasi penyedia itu:
- **teks prompt**: topik dan aturan soal, soal yang ditulis ulang atau diperiksa silang, dan soal yang ditanyakan ke tutor beserta jawaban pengguna untuk soal itu;
- **gambar halaman** yang dipilih untuk dikirim saat impor dari foto/PDF. Gambar ini tidak disimpan;
- **API key**, hanya ke penyedianya sendiri sebagai kredensial.

Riwayat ujian, Buku Kesalahan, catatan, nilai, laporan soal, rencana belajar, dan cadangan tidak pernah dikirim ke mana pun. Tautan set bersama menyimpan isinya di bagian `#` URL, yang tidak dikirim browser ke server mana pun.

## Struktur SKD (dapat diubah)

| Sub-tes | Soal | Skor maks. | Ambang batas default |
|---|---|---|---|
| TWK | 30 | 150 | 65 |
| TIU | 35 | 175 | 80 |
| TKP | 45 | 225 | 166 |

Durasi default 100 menit. Angka-angka SKD ini adalah bawaan aplikasi ("Bawaan aplikasi" di `src/domain/examPackage.ts`), belum disertai rujukan dokumen resmi; preset formasi khusus dengan sumber resmi menunggu dokumennya (#19). Semua angka dapat diubah di **Pengaturan** karena aturan bisa berubah per tahun dan formasi. Untuk set yang lebih pendek, ambang batas diskalakan proporsional.

**Sumber angka tidak ditampilkan di aplikasi.** Pengguna hanya melihat nama seperti "CPNS" dan "PPPK", tanpa nomor keputusan atau tahun (keputusan pemilik produk, 10 Oktober 2026). Sumbernya dicatat di kode dan di `docs/`, dan diperbarui pemilik produk secara berkala.

Angka paket **PPPK** (145 soal, nilai tertinggi 670, 120 + 10 menit, tanpa ambang batas) berasal dari **Keputusan MenPAN-RB Nomor 347 Tahun 2024** tentang Mekanisme Seleksi PPPK Tahun Anggaran 2024. Rincian per diktum ada di [docs/paket-ujian.md](docs/paket-ujian.md#paket-pppk-2024-dan-rujukannya).

## Pengembangan

```bash
npm install
npm run dev        # server pengembangan
npm test           # unit test (vitest)
npm run test:e2e   # uji end-to-end di browser (Playwright, memakai build produksi)
npm run typecheck
npm run lint
npm run format     # Prettier (.prettierrc.json); CI menjalankan format:check
npm run build      # build statis ke dist/
npm run preview
npm run changelog  # tulis ulang CHANGELOG.md dari src/data/changelog.ts
```

### Rilis

Versi aplikasi mengikuti semver di `package.json` dan tampil sebagai `1.0.0 (7a73b52)` (versi dan commit) di menu, Pengaturan, dan log galat. Catatan rilis ada di [CHANGELOG.md](CHANGELOG.md).

Fitur yang terasa bagi pengguna dirilis di PR yang sama dengan fiturnya:

1. Naikkan `version` di `package.json` (dan `package-lock.json`, misalnya dengan `npm version minor --no-git-tag-version`): patch untuk perbaikan, minor untuk fitur baru, mayor bila data lama atau berkas lama tidak lagi terbaca.
2. Tambahkan entri versi itu di awal `src/data/changelog.ts`: tanggal dan butir singkat yang dirasakan pengguna, tanpa detail teknis.
3. Jalankan `npm run changelog`. Unit test gagal bila `CHANGELOG.md` tidak sama dengan datanya atau bila entri terbaru tidak sama dengan versi di `package.json`.

Setelah pembaruan, Beranda menampilkan kartu "Apa yang baru" sekali untuk versi yang belum dilihat, sampai ditutup. Pengguna baru tidak melihatnya, dan kartu ini tidak muncul saat ujian atau latihan karena hanya ada di Beranda. Riwayat lengkapnya ada di Bantuan.

### Uji end-to-end

`npm run test:e2e` membangun aplikasi lalu menjalankan Playwright terhadap `vite preview`, sehingga CSP, router hash, dan base relatif sama dengan yang dipakai pengguna. Sekali saja di mesin baru: `npx playwright install chromium`.

- Penyedia AI tidak pernah dihubungi. `e2e/fixtures.ts` berisi Gemini tiruan yang menjawab daftar model dan pembuatan soal sesuai prompt (kunci selalu A, opsi A TKP bernilai 5). Setiap request lain ke luar `localhost` dibatalkan dan membuat tes gagal.
- Waktu tidak ditunggu sungguhan: timer ujian, jeda cadangan otomatis, dan "besok" di Buku Kesalahan dimajukan dengan `page.clock`.
- Simpan otomatis ke berkas memakai berkas asli di origin-private file system karena dialog pilih berkas tidak bisa tampil di browser headless.
- Bila gagal, trace dan screenshot ada di `test-results/` (`npx playwright show-trace <trace.zip>`). Di CI (`.github/workflows/e2e.yml`) keduanya diunggah sebagai artefak.

Proyek Playwright kedua, `mobile`, menjalankan berkas `*.mobile.e2e.ts` di layar ponsel sentuh (Pixel 7, selebar 360 px). Uji di sana mengerjakan ujian, latihan, dan Buku Kesalahan dengan ketukan, memotong gambar soal dengan seret jari, serta memeriksa setiap halaman utama: tidak ada gulir ke samping, target sentuh minimal 44 px, dan axe di tema terang maupun gelap.

Aksesibilitas diperiksa dengan axe (`@axe-core/playwright`) di semua halaman utama dan dialog, tema terang dan gelap; tes gagal bila ada pelanggaran WCAG A/AA tingkat serius atau kritis.

Cakupan: tambah API key → buat set → ujian (termasuk kirim otomatis saat waktu habis) → laporan & progres; unduh PDF/Word; cadangan ekspor/impor ke browser bersih, pengingat, dan simpan otomatis; Mode Latihan; Buku Kesalahan; paket ujian dan PPPK; berbagi set; impor foto/PDF dan gambar soal; Kartu Hafalan dan Kamus; tutor; uji performa dan offline. Daftar lengkapnya ada di `e2e/`.

Dependabot (`.github/dependabot.yml`) membuka PR pembaruan dependensi npm dan GitHub Actions setiap Senin: pembaruan minor dan patch dikelompokkan jadi satu PR per ekosistem, dan setiap pembaruan mayor mendapat PR sendiri.

Commit yang hanya memformat ulang kode tercatat di `.git-blame-ignore-revs`, supaya `git blame` menunjuk perubahan isinya. GitHub membacanya sendiri; di lokal jalankan sekali `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

Setiap PR menjalankan typecheck, lint (`--deny-warnings`), pemeriksaan format (Prettier), unit test, e2e, dan `npm run check:bundle`, yang gagal bila JavaScript dan CSS yang diunduh saat aplikasi pertama dibuka melebihi 210 KB (gzip) atau memuat library yang seharusnya dimuat saat dipakai.

Hasil build adalah situs statis (router berbasis hash, `base: './'`), sehingga bisa di-host di Netlify, Cloudflare Pages, GitHub Pages, dan sejenisnya tanpa konfigurasi rewrite.

### Deploy ke GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` menjalankan test, membangun aplikasi, lalu men-deploy folder `dist/` setiap ada push ke `main`.

1. Buka **Settings → Pages** di repo.
2. Pada **Build and deployment → Source**, pilih **GitHub Actions** (bukan "Deploy from a branch").
3. Push ke `main`, atau jalankan workflow secara manual di tab **Actions**.

Situs akan tersedia di `https://<username>.github.io/<nama-repo>/`. Mode "Deploy from a branch" tidak bisa dipakai, karena mode itu menyajikan kode sumber yang belum di-build sehingga halaman tampil kosong.

### Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB), Zod, mathjs, KaTeX, docx, pdfmake, pdf.js, qrcode-generator, vite-plugin-pwa, @anthropic-ai/sdk.

### Struktur kode

```
src/
  domain/      tipe, paket ujian, blueprint & preset, skoring, validator, parser angka, generator figural & analisis data, prompt, skema output AI, berbagi, impor foto
  engine/      rencana batch & estimasi biaya, orkestrasi generasi, operasi set, simulasi, ulangan terjadwal, tutor, manajemen key
  providers/   adapter Gemini / OpenAI / Claude / OpenAI-compatible
  db/          skema Dexie, enkripsi key, cadangan
  data/        teks UUD 1945 untuk Kartu Hafalan (uud1945.json), Kamus Rumus TIU (kamusTiu.ts)
  lib/         render SVG figural & grafik, unduh PDF & Word, gambar halaman & PDF, tema
  components/  komponen UI
  pages/       Dashboard, Set Baru, Set Tersimpan, Detail Set, Bank Soal, Impor Foto, Impor Set, Simulasi, Latihan, Laporan, Progres, Buku Kesalahan,
               Kartu Hafalan, Kamus, API Keys, Pengaturan, Bantuan, Cetak
scripts/
  extract-uud.mjs    teks PDF UUD 1945 (pdftotext) → src/data/uud1945.json
  check-bundle.mjs   pemeriksaan ukuran bundle awal
docs/                paket ujian, impor foto/PDF, Kartu Hafalan & Kamus, proposal pengembangan
```
