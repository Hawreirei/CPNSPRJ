# Impor soal dari foto atau PDF (#38)

Pengguna memotret halaman soal atau memilih gambar/PDF. Model multimodal pada API key pengguna menyalin soal di halaman itu, lalu pengguna meninjaunya sebelum disimpan ke Bank Soal.

## Alur

1. **Bank Soal → Impor dari foto/PDF** (`#/bank/import`, `src/pages/ImportPhoto.tsx`).
2. Pengingat hak cipta tampil di atas. Tombol kirim baru aktif setelah pengguna mencentang bahwa materinya milik sendiri atau berlisensi bebas.
3. Pengguna memilih ujian, dan bila mau, satu sub-tes untuk semua soal di halaman. Tanpa pilihan, AI menentukan sub-tes per soal.
4. Sebelum mengirim tampil: penyedia, key, model, perkiraan biaya halaman, dan sisa kuota harian key. Satu halaman sama dengan satu request, dan kuota key dihormati (`callModel`).
5. Hasilnya masuk ke layar tinjau. Gambar halaman tampil di samping soal-soalnya. Pengguna bisa mengganti sub-tes, mengedit, atau menghapus soal. "Simpan" menulis ke Bank Soal; "Batal" membuang semuanya.

## Keputusan

**PDF digambar di browser dengan pdf.js, bukan dikirim utuh ke penyedia.**
- Gambar diterima keempat penyedia. PDF hanya diterima Gemini dan Claude; OpenAI lewat Chat Completions dan banyak model OpenAI-compatible tidak menerimanya.
- Satu halaman per request (permintaan issue). Mengirim PDF utuh berarti membayar semua halamannya di setiap request. Memotongnya per halaman tetap butuh pustaka PDF.
- Halaman yang digambar bisa ditampilkan di samping soal hasil salinan untuk dicocokkan.
- Biaya gambar per halaman tetap dan bisa diperkirakan. Untuk PDF, Claude menghitung gambar dan teks halaman sekaligus.

pdf.js (build `legacy`, karena build biasa memakai `Map.getOrInsertComputed` yang belum ada di banyak browser) dan worker-nya dimuat hanya saat PDF dipilih. Keduanya tidak masuk bundle awal (`npm run check:bundle` memeriksanya). Decoder WebAssembly untuk halaman hasil pindai (JBIG2, JPEG 2000) disajikan di `pdfjs/` oleh `vite.config.ts`. Decoder ini tidak di-precache, karena impor butuh internet untuk AI.

**Ukuran gambar.** Sisi terpanjang paling banyak 1568 px (batas Claude, dan cukup untuk membaca huruf cetak), JPEG kualitas 0,85, dengan orientasi kamera dibetulkan. Perkiraan token gambar per halaman ada di `imageTokens`:

| Penyedia | Perkiraan token |
|---|---|
| Gemini | 1120 |
| OpenAI | 85 + 170 per petak 512 px |
| Claude | lebar × tinggi / 750, paling banyak 1600 |
| Lainnya | 1600 |

Keluaran diperkirakan paling banyak 5000 token per halaman.

**Penyedia yang tidak bisa membaca gambar** tidak ditebak dari nama model. Bila request bergambar ditolak (400, 415, atau 422), pesannya menjadi "Model … tampaknya tidak bisa membaca gambar", disertai pesan asli penyedia.

**Gambar halaman tidak disimpan.** Gambar halaman hanya ada selama halaman impor terbuka; object URL-nya dilepas saat halaman ditutup. Yang disimpan hanyalah teks soal, ditambah gambar soal yang dipotong pengguna sendiri (lihat bagian di bawah).

## Gambar soal (#49)

Soal yang memakai grafik, diagram, atau tabel bergambar tidak lagi dilewati, **bila opsinya berupa teks**. Soal seperti itu menjadi draf bertanda "Soal ini memakai gambar di halaman", dan tidak bisa disimpan sebelum diberi gambar atau dihapus. Soal yang opsinya berupa gambar tetap dilewati.

- **Memotong:** pengguna menyeret kotak di atas gambar halaman asli, atau memilih "Seluruh halaman". Lalu pengguna memilih soal tujuan dan mengisi keterangan gambar (teks alternatif). Model tidak pernah memotong gambar.
- **Dengan keyboard (#59):** kotak potong adalah tombol "Area potong".
  - Saat difokuskan dengan Tab, kotak mulai di tengah halaman, selebar 50% dan setinggi 30%.
  - Panah menggeser kotak; Shift + panah mengubah ukurannya dari sudut kiri atas. Langkahnya 2% dari halaman, atau 10% dengan Alt.
  - Kotak selalu di dalam halaman, dengan sisi paling kecil 5%.
  - Posisi dan ukuran diumumkan ke pembaca layar, misalnya "Area 40% × 25% mulai dari 10%, 20%".
  - Logikanya fungsi murni di `src/domain/cropArea.ts`; pikselnya tetap dihitung `cropBox`.
- **Bentuk simpanan:** potongan disimpan sebagai data URL JPEG di soal (`Question.image`):
  - sisi terpanjang paling banyak 1000 px;
  - mutu diturunkan bertahap sampai ukurannya paling besar ±300 KB;
  - hanya `data:image/jpeg` atau `data:image/png` yang diterima (`isImageSrc`), juga saat mengimpor set bersama, jadi tidak ada gambar yang dimuat dari tempat lain.

  Dengan menyimpannya di soal, tidak perlu tabel terpisah, dan gambar otomatis ikut cadangan.
- **Tampil di:** ujian, latihan, Bank Soal, Buku Kesalahan, cetak, PDF, dan Word (dengan teks alternatifnya).
- **Tanya AI:** gambar tidak dikirim ke tutor. Tutor hanya diberi tahu bahwa ada gambar dan apa keterangannya, supaya tidak menebak isinya.
- **Penyimpanan:** Pengaturan → Penyimpanan menunjukkan berapa soal bergambar dan berapa ruang yang dipakainya.
- **Berbagi:** gambar mengikuti aturan berbagi soal hasil impor, yaitu hanya ikut bila pengguna memilih menyertakan soal hasil impor.

## Penanganan hasil

`parseImportedPage` (`src/domain/photoImport.ts`) menerima jawaban model dalam bentuk JSON.

Soal yang **dilewati**, dengan alasannya:
- butuh gambar atau diagram (`figure`);
- terpotong atau tidak terbaca (`incomplete`);
- teks soal kosong;
- opsinya kurang dari 4.

Soal yang tetap **diambil**, dengan catatan untuk pengguna:
- **Sub-tes tidak dikenal:** dipasang ke sub-tes pertama paket.
- **Lebih dari 5 opsi:** hanya 5 yang pertama yang diambil.
- **Kunci jawaban:**
  - Bila kunci diusulkan AI (bukan dari halaman), ada catatannya.
  - Bila kunci tidak ada sama sekali, soal ditandai.
- **Sub-tes bertingkat:** skor diusulkan AI dan dibatasi ke rentang paketnya.

Halaman tanpa soal menghasilkan daftar kosong. Jawaban yang bukan JSON diminta ulang.

Setiap soal hasil impor:
- Diperiksa `validateQuestion` seperti soal buatan AI.
- Bersumber `source: 'import'`. Nilai ini aditif: data dan cadangan lama tetap valid.
- Berbendera `import-unchecked` (peringatan, jadi "perlu dicek"). Bendera ini bertahan sampai pengguna mencentang "Saya sudah memeriksa soal ini" di Bank Soal.
- Ditandai sebagai duplikat bila Bank Soal sudah memuat soal yang sama.

## Berbagi

Soal hasil impor tidak ikut ke berkas atau tautan set bersama (`toShared`), kecuali pengguna mencentang "Sertakan N soal hasil impor" di jendela Bagikan. Di jendela itu pengingat hak cipta tampil lagi. Penerima tetap melihatnya sebagai soal hasil impor yang perlu dicek.

## Gerbang keputusan

Issue meminta persetujuan pemilik produk atas batasan hak cipta dan adanya permintaan pengguna. Pemilik produk meminta issue ini dikerjakan (8 Oktober 2026), dengan batasan di atas.
