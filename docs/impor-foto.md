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

**Gambar tidak disimpan.** Gambar hanya hidup selama halaman impor terbuka (object URL dilepas saat halaman ditutup). Yang disimpan hanya teks soal. Menyimpan gambar sebagai gambar soal belum ditawarkan.

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
