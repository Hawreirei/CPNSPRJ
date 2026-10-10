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

### Lembaga negara (#61)

Dek kedua di Kartu Hafalan: kedudukan, tugas, dan wewenang tujuh lembaga negara, **tanpa dokumen baru**. Jawaban setiap kartu adalah ayat UUD 1945 dari data yang sama (`src/data/uud1945.json`), jadi selalu kutipan persis teks resmi. Yang disusun manual hanya pemetaan ayat ke lembaga dan kalimat pertanyaannya, di `src/data/lembagaNegara.ts`.

| Lembaga | Pasal | Kartu |
|---|---|---|
| MPR | 2–3 | 6 |
| DPR | 19–22B | 14 |
| DPD | 22C–22D | 7 |
| BPK | 23E–23G | 6 |
| Mahkamah Agung | 24A | 4 |
| Komisi Yudisial | 24B | 3 |
| Mahkamah Konstitusi | 24C | 5 |

- **Tidak dijadikan kartu:** ayat yang hanya menyatakan suatu hal "diatur dengan undang-undang", yaitu 19(2), 20A(4), 22A, 22C(4), 23G(2), 24A(5), 24B(4), dan 24C(6).
- **Ditahan dulu: Pasal 20A ayat (3).** Di data, ayat ini berbunyi "... Dewan Perwakilan Rakyat mempunyai hak mengajukan pertanyaan ...", sedangkan rumusan yang lazim dikutip menyebut "setiap anggota Dewan Perwakilan Rakyat". Ayat ini perlu dicocokkan dengan PDF Setjen MPR sebelum dijadikan kartu lembaga, dan kartu ayatnya di dek BAB VII ikut diperiksa.
- **Sumber di setiap kartu:** saat jawaban ditampilkan, kartu menyebut pasal dan ayatnya (misalnya "Sumber: UUD 1945 Pasal 24C ayat (1)") dan perubahan UUD yang merumuskannya.
- **Pemeriksaan:** `src/__tests__/lembagaNegara.test.ts` membandingkan setiap jawaban dengan teks ayat di data. Tes yang sama memastikan setiap lembaga hanya memakai pasalnya sendiri, ID kartu tidak bentrok dengan kartu pasal, dan pertanyaan tidak memuat jawabannya.
- Kartu lembaga adalah kartu tersendiri. Ayat yang sama di dek bab dijadwalkan terpisah, karena isyarat hafalannya berbeda: dari nama pasal ke isinya, dan dari tugas lembaga ke isinya.

## Kamus Rumus TIU

25 rumus dan pola dari topik Deret Angka, Aritmetika, Soal Cerita, Perbandingan Kuantitatif, dan Silogisme ada di `src/data/kamusTiu.ts`.

- **Disusun manual.** Setiap contoh hitungan disertai ekspresi mathjs yang dihitung ulang oleh `src/__tests__/kamus.test.ts`, dan setiap rumus diperiksa valid di KaTeX.
- **Tautan dari pembahasan:** pembahasan soal TIU dengan topik yang sama menautkan ke bagian kamusnya.
