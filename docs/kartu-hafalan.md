# Kartu Hafalan TWK dan Kamus Rumus TIU (#47)

## Kartu Hafalan TWK

Kartu dibuat dari **teks resmi**, tidak dari AI dan tidak dari pemberitaan atau bimbel.

| | |
|---|---|
| Dokumen | Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 Dalam Satu Naskah |
| Penerbit | Sekretariat Jenderal Majelis Permusyawaratan Rakyat |
| Tanggal berkas | 12 Januari 2007 (metadata PDF; dokumen tidak mencantumkan tanggal) |
| Diberikan oleh | pemilik produk, 8 Oktober 2026 |
| SHA-256 PDF | `6d629da7bdbec439629899c30ffea9df0aba842bf2406fad8ff6cc393edd3854` |

Isi dokumen: Pembukaan, pasal-pasal setelah Perubahan Pertama sampai Keempat, Aturan Peralihan, dan Aturan Tambahan. Setiap bagian yang diubah diberi tanda perubahan (`*)` sampai `****)`). Rumusan Pancasila diambil dari alinea keempat Pembukaan, karena butir-butir pengamalan tidak ada di dokumen ini.

### Dari PDF ke data

```
pdftotext -layout UUD45_SatuNaskah.pdf uud.txt
node scripts/extract-uud.mjs uud.txt        # menulis src/data/uud1945.json
```

Skrip tidak mengubah kata apa pun. Yang dilakukannya:
- membuang kepala halaman dan keterangan tanda perubahan di setiap halaman;
- menyambung baris dan kata yang terpotong;
- mengganti tanda hubung lunak PDF dengan tanda hubung biasa;
- memindahkan tanda perubahan ke field `amendments` (`***/****)` menjadi `[3, 4]`).

Ejaan dokumen dipertahankan apa adanya. Contohnya "hak assi manusia" di Pasal 28I ayat (5), dan tidak adanya titik di akhir Pasal 5 ayat (1).

Hasilnya diperiksa dengan dua cara:
- Kata-kata di data dibandingkan dengan kata-kata di teks PDF; tidak ada yang hilang atau bertambah.
- `src/__tests__/cards.test.ts` memeriksa struktur dan teks pasal yang sudah diketahui:
  - 4 alinea dan 5 sila;
  - 21 bab ditambah Aturan Peralihan dan Aturan Tambahan;
  - BAB IV dihapus;
  - Pasal 1–37 lengkap dengan pasal sisipan, total 199 ayat atau pasal tanpa ayat.

### Kartu dan ulangan

- **Isi kartu:** satu kartu per sila, per alinea Pembukaan, dan per ayat (atau per pasal tanpa ayat), dikelompokkan per bab. Setiap kartu pasal menyebut perubahan yang merumuskannya, atau "Rumusan asli 1945".
- **Jadwal ulangan:** sama dengan Buku Kesalahan (`schedule` di `src/engine/srs.ts`), dengan penilaian Lupa/Sulit/Baik/Mudah. Kartu baru paling banyak 20 per hari. Menilai kartu juga dihitung sebagai hari belajar untuk streak.
- **Penyimpanan:** status kartu disimpan di tabel Dexie `cards` (v4, aditif) dan ikut cadangan.
- **Rujukan soal:** rujukan soal TWK yang menyebut UUD dan pasalnya (misalnya "UUD 1945 Pasal 28I ayat (1)") menautkan ke teks resmi pasal itu (`#/kartu?pasal=28I`), untuk mencocokkan rujukan buatan AI.

## Kamus Rumus TIU

25 rumus dan pola dari topik Deret Angka, Aritmetika, Soal Cerita, Perbandingan Kuantitatif, dan Silogisme ada di `src/data/kamusTiu.ts`.

- **Disusun manual.** Setiap contoh hitungan disertai ekspresi mathjs yang dihitung ulang oleh `src/__tests__/kamus.test.ts`, dan setiap rumus diperiksa valid di KaTeX.
- **Tautan dari pembahasan:** pembahasan soal TIU dengan topik yang sama menautkan ke bagian kamusnya.
