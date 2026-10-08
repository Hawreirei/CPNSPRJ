# CPNS SKD Set Builder

Aplikasi web untuk membuat set latihan **SKD CPNS** (TWK, TIU, TKP) dengan AI, memakai **API key milik pengguna sendiri**. Tanpa server dan tanpa login: semua data tersimpan di browser.

Setiap set terdiri dari tiga keluaran yang saling terhubung:

- **Set Soal**: dikelompokkan TWK → TIU → TKP
- **Kunci Jawaban & Skor**: kunci TWK/TIU (5/0) dan skor 1–5 untuk setiap opsi TKP
- **Pembahasan**: langkah demi langkah, beserta rujukan untuk TWK

> Aplikasi latihan, bukan produk resmi BKN. Periksa materi TWK ke sumber resmi. Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci resmi.

## Fitur

| Fitur | Keterangan |
|---|---|
| Set builder | Preset (SKD lengkap, Mini SKD, TWK saja, drill TIU, drill TKP), pilihan topik, jumlah, dan kesulitan |
| Panel rencana | Jumlah permintaan API, perkiraan token, biaya, dan waktu sebelum generasi |
| Generasi | Batch campuran topik, progres, stop/lanjut, coba ulang batch gagal, autosave per batch |
| Pemeriksaan keandalan | TIU numerik dihitung ulang dengan mathjs (kunci dikoreksi otomatis bila jelas); TKP wajib skor 1–5 tanpa skor tertinggi kembar; TWK wajib rujukan, ditandai bila meragukan; deteksi duplikat |
| TIU figural | Deret dan analogi gambar dibuat oleh aplikasi (SVG) dari aturan pasti: gratis dan kuncinya selalu benar |
| Kontrol soal | Edit, tulis ulang dengan AI, kunci, bintangi, pindah, hapus, "Serupa+" |
| Simulasi CAT | Timer (default 100 menit), grid nomor, ragu-ragu, pintasan keyboard, kirim otomatis, bisa dilanjutkan setelah refresh |
| Mode Latihan | Kunci, skor TKP, dan pembahasan tampil langsung setelah menjawab; jawaban terkunci setelah dipilih; pilih topik tertentu; timer opsional. Tidak masuk grafik skor ujian di Progres |
| Laporan skor | Skor per sub-tes vs ambang batas, topik lemah, waktu per soal, tinjau jawaban, set latihan topik lemah (bank dulu, AI bila kurang) |
| Bank soal | Pencarian dan filter; susun set baru tanpa biaya AI |
| Set varian | Set baru dengan topik dan kesulitan yang sama |
| Progres | Grafik riwayat skor per sub-tes dan penguasaan topik |
| Unduh PDF / Word | Tombol **Unduh** di halaman set, atau pilih soal di Bank Soal lalu unduh. Isi: soal saja, soal + kunci jawaban, lengkap (dengan pembahasan), atau kunci saja; dengan nama lembaga, tanggal, dan logo. PDF berisi teks asli dan gambar soal figural |
| Cadangan | Ekspor/impor JSON antar perangkat (API key tidak ikut) |
| PWA | Bisa dipasang; set tersimpan dan simulasi berjalan offline |

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

- Meminta **20 soal per request** secara default, dibagi rata. SKD lengkap (110 soal) cukup sekitar 7 request dan Mini SKD 3 request, sehingga satu key gratis bisa membuat sekitar 2 set lengkap per hari. Nilainya bisa diubah di Pengaturan.
- Menyimpan **batas kuota per key** (preset "Gemini free tier", "tanpa batas", atau kustom) dan menghitung pemakaian sendiri. Aplikasi menunggu bila batas per menit tercapai, dan berhenti rapi bila kuota harian habis; set bisa dilanjutkan setelah reset (Gemini: tengah malam waktu Pasifik).
- Membaca waktu tunggu dan jenis kuota dari error 429. Request yang ditolak tidak dihitung, dan tidak ada percobaan ulang beruntun yang menghabiskan kuota.
- Tidak membuang request: soal yang lengkap dari respons yang terpotong tetap disimpan, dan hanya soal yang kurang yang diminta ulang. Soal figural (gratis) dikerjakan lebih dulu.
- Panel rencana menampilkan sisa kuota hari ini dan berapa set yang masih bisa dibuat.

API key dienkripsi AES-GCM dengan kunci perangkat non-extractable (WebCrypto) di IndexedDB. Enkripsi ini melindungi data tersimpan, tetapi tidak melindungi dari kode berbahaya yang berjalan di halaman (misal ekstensi browser). Build produksi memasang Content-Security-Policy yang ketat.

## Struktur SKD (dapat diubah)

| Sub-tes | Soal | Skor maks. | Ambang batas default |
|---|---|---|---|
| TWK | 30 | 150 | 65 |
| TIU | 35 | 175 | 80 |
| TKP | 45 | 225 | 166 |

Durasi default 100 menit. Semua angka dapat diubah di **Pengaturan** karena aturan bisa berubah per tahun dan formasi. Untuk set yang lebih pendek, ambang batas diskalakan proporsional.

## Pengembangan

```bash
npm install
npm run dev        # server pengembangan
npm test           # unit test (vitest)
npm run typecheck
npm run lint
npm run build      # build statis ke dist/
npm run preview
```

Hasil build adalah situs statis (router berbasis hash, `base: './'`), sehingga bisa di-host di Netlify, Cloudflare Pages, GitHub Pages, dan sejenisnya tanpa konfigurasi rewrite.

### Deploy ke GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` menjalankan test, membangun aplikasi, lalu men-deploy folder `dist/` setiap ada push ke `main`.

1. Buka **Settings → Pages** di repo.
2. Pada **Build and deployment → Source**, pilih **GitHub Actions** (bukan "Deploy from a branch").
3. Push ke `main`, atau jalankan workflow secara manual di tab **Actions**.

Situs akan tersedia di `https://<username>.github.io/<nama-repo>/`. Mode "Deploy from a branch" tidak bisa dipakai, karena mode itu menyajikan kode sumber yang belum di-build sehingga halaman tampil kosong.

### Stack

React 19, TypeScript, Vite, Tailwind CSS v4, Dexie (IndexedDB), Zod, mathjs, KaTeX, docx, pdfmake, vite-plugin-pwa, @anthropic-ai/sdk.

### Struktur kode

```
src/
  domain/      tipe, blueprint & preset, skoring, validator, parser angka, generator figural, prompt, skema output AI
  engine/      rencana batch & estimasi biaya, orkestrasi generasi, operasi set, simulasi, manajemen key
  providers/   adapter Gemini / OpenAI / Claude / OpenAI-compatible
  db/          skema Dexie, enkripsi key, cadangan
  lib/         render SVG figural, unduh PDF & Word, tema
  components/  komponen UI
  pages/       Dashboard, Set Baru, Set Tersimpan, Detail Set, Bank Soal, Simulasi, Laporan, Progres, API Keys, Pengaturan, Bantuan, Cetak
```
