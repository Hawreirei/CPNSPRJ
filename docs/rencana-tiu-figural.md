# Rencana: TIU Figural yang Lebih Variatif dan Lebih Kompleks

Status: **dikerjakan di versi 1.11.0** (lihat [Hasil 1.11.0](#hasil-1110) di bawah). Ukuran pekerjaan memakai skala S/M/L seperti di [PROPOSAL-PENGEMBANGAN-FITUR.md](PROPOSAL-PENGEMBANGAN-FITUR.md).

Rancangan mesinnya, disusun dari contoh soal bergaya SKD (deret orbit, kotak berdiagonal, figur garis, jaring kubus), ada di [rancangan-figural-v2.md](rancangan-figural-v2.md). Model "sel komposit" di §3.1 digantikan oleh model adegan di sana.

## Ringkasan

Soal figural dibuat aplikasi dari aturan pasti (`src/domain/figural.ts`), jadi kuncinya selalu benar. Masalahnya ada di tiga hal:

1. **Ragam pola sempit.** Deret dan Analogi hanya punya 4 aturan dengan urutan tetap. Paling banyak ada 9 pola di tingkat sulit, dan semua Transformasi sulit memakai satu pola yang sama.
2. **Gambar terlihat seragam.** Satu sel selalu berisi satu jenis bangun, diulang 1–4 kali di tengah kotak.
3. **Jawaban bisa ditebak tanpa memecahkan pola.** Ini paling mendesak. Setiap pengecoh dibuat dengan mengubah satu sifat dari jawaban, sehingga jawaban selalu menjadi opsi yang paling mirip dengan keempat opsi lainnya.

Rencananya bertumpu pada empat bagian:

- **Model gambar komposit**: bangun di dalam bangun, titik penanda, bangun tak simetris, dan arsiran baru.
- **Pustaka aturan dengan pemecah otomatis**: banyak aturan bisa digabung, dan setiap soal dibuktikan hanya punya satu jawaban yang dapat dipertahankan.
- **Pengecoh berbasis salah paham** yang tidak bisa diakali dengan trik "pilih yang paling mirip".
- **Kendali variasi di tingkat set dan bank soal**, ditambah topik baru (Gabungan Gambar dan Jaring-jaring Kubus).

Pekerjaan dibagi enam tahap yang masing-masing bisa dirilis sendiri. Tahap 0 memperbaiki celah tebakan tanpa mengubah format data.

---

## 1. Kondisi sekarang (diukur)

Pengukuran: 1.000 soal per topik dan tingkat, dibuat dengan generator yang ada sekarang (commit `040d10e`).

- **Medoid** adalah persentase soal yang jawabannya sama dengan satu-satunya opsi yang paling mirip dengan opsi lain. Jarak antaropsi dihitung dari jumlah sifat yang berbeda (bentuk, arsiran, jumlah, arah). Bila jawaban dipilih secara acak, angkanya 20%.
- **Pola** adalah jumlah aturan berbeda yang muncul, tanpa menghitung bentuk dan arsiran acak.
- **Pola terbanyak** adalah porsi pola yang paling sering muncul.

| Topik | Tingkat | Medoid | Pola | Pola terbanyak | Ada panah |
|---|---|---|---|---|---|
| Deret Figural | mudah / sedang / sulit | **100% / 100% / 100%** | 4 / 6 / 9 | 27% / 26% / 21% | ~30% |
| Analogi Figural | mudah / sedang / sulit | **100% / 100% / 100%** | 4 / 6 / 9 | 26% / 28% / 22% | ~40% |
| Matriks Figural | mudah / sedang / sulit | **100% / 100% / 100%** | 8 / 8 / 8 | ~14% | ~24% |
| Transformasi Figural | mudah / sedang / sulit | **100% / 100% / 100%** | 3 / 2 / **1** | 35% / 51% / **100%** | **100%** |
| Figural Berbeda | mudah / sedang / sulit | 0% (tidak berlaku) | 1 / 2 / 2 | 100% / 50% / 51% | 0% |

Artinya, peserta yang tahu triknya bisa menjawab benar 100% soal Deret, Analogi, Matriks, dan Transformasi tanpa membaca soalnya. Latihan seperti ini justru melatih kebiasaan yang tidak berguna di ujian sungguhan.

### Penyebab di kode

| Gejala | Penyebab | Lokasi |
|---|---|---|
| Jawaban = opsi paling mirip | `distractors()` membuat setiap pengecoh dari jawaban dengan satu sifat diubah | `src/domain/figural.ts:93` |
| Pola Deret/Analogi sedikit | `rules()` hanya punya 4 aturan. Urutan bentuk selalu lingkaran → segitiga → persegi → segi lima, arsiran selalu hitam → kosong → arsir, jumlah selalu +1. Tingkat sulit hanya 5 pasangan aturan (`COMPATIBLE`) | `figural.ts:36–90` |
| Transformasi selalu panah | Pencerminan dihitung lewat trik sudut yang hanya berlaku untuk panah. Tingkat sulit hanya punya `rot90mirrorH` | `figural.ts:327–353` |
| Rotasi jarang dan monoton | Hanya panah dan segitiga yang boleh diputar (`ROTATABLE`) | `figural.ts:27` |
| Gambar seragam | `FigureCell` = satu bangun × arsiran × arah × jumlah (1–4) | `src/domain/types.ts:23` |
| Tata letak tetap | Yang hilang selalu suku terakhir, dan deret selalu 4 suku + "?" | `generateFiguralSeries` |
| Kalimat soal sama | Satu kalimat per topik | `buildQuestion` |
| Pola berulang dalam satu set | `generateFigural` hanya menolak hash yang kembar. Pola tidak diratakan dalam satu set, dan bank soal tidak ikut diperhitungkan | `figural.ts:423` |
| Belum ada tipe yang sering muncul di SKD/psikotes | Belum ada jaring-jaring kubus, gabungan gambar, cermin bangun tak simetris, atau titik yang berpindah posisi | — |

---

## 2. Sasaran dan ukuran keberhasilan

Setiap sasaran dijadikan tes otomatis (`src/__tests__/figuralVariety.test.ts`) agar tidak mundur lagi di kemudian hari.

| Ukuran | Sekarang | Target |
|---|---|---|
| Medoid (jawaban = opsi paling mirip), semua topik × tingkat | 100% | **≤ 25%** |
| Heuristik "nilai unik" (jawaban satu-satunya opsi yang punya suatu nilai sifat) | belum diukur | ≤ 25% |
| Pola berbeda per 1.000 soal, Deret sulit | 9 | ≥ 40 |
| Pola berbeda per 1.000 soal, Transformasi sulit | 1 | ≥ 12 |
| Porsi pola terbanyak per topik × tingkat | hingga 100% | ≤ 12% |
| Soal Transformasi yang memakai panah | 100% | ≤ 30% |
| Soal yang lolos pemecah (tepat satu opsi bisa dipertahankan) | diuji per topik | 100%, satu pemecah yang sama untuk semua topik |
| Skor kompleksitas (lihat §3.3) | tidak ada | mudah 1–2, sedang 3–4, sulit ≥ 5, tanpa tumpang tindih |
| Waktu membuat satu soal di ponsel kelas bawah | < 1 ms | < 20 ms |
| Soal lama di bank | — | tampil identik (uji snapshot SVG) |

---

## 3. Rancangan

### 3.1 Model gambar komposit (kompatibel dengan data lama)

Field lama tetap ada. Field baru semuanya opsional, jadi soal lama tetap sah tanpa migrasi.

```ts
export type ShapeKind =
  | 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'arrow' | 'pentagon'   // sudah ada
  | 'hexagon' | 'cross' | 'semicircle' | 'lshape' | 'flag' | 'rtriangle';         // baru
export type Fill = 'solid' | 'empty' | 'striped' | 'dotted' | 'half';             // 'half' bergantung arah

export interface FigureCell {
  shape: ShapeKind; fill: Fill; rotation: number; count: number; // v1, tidak berubah
  mirrored?: boolean;                                   // bangun tak simetris yang dicerminkan
  inner?: { shape: ShapeKind; fill: Fill; rotation?: number; mirrored?: boolean }; // bangun di dalam bangun
  marks?: { kind: 'dot' | 'ring' | 'cross' | 'bar'; slot: number; fill?: Fill }[]; // slot 0–7 keliling, 8 tengah
  segments?: number[];                                  // ruas garis pada kisi 3×3 titik (Gabungan Gambar)
}
```

- **Bangun tak simetris** (`lshape`, `flag`, `semicircle`, `rtriangle`) memungkinkan soal rotasi dan cermin tanpa panah. Pencerminan bangun ini tidak bisa ditiru dengan rotasi, dan inilah inti soal "mana yang bukan putaran dari gambar ini".
- **`inner` dan `marks`** membuat sel punya dua atau tiga unsur yang bisa berubah dengan aturan masing-masing, misalnya bangun dalam berputar sementara titik luar berpindah.
- **Batas kepadatan**: paling banyak 3 unsur per sel dan paling banyak 4 penanda, agar tetap terbaca pada ukuran 56 px di PDF.

### 3.2 Arah sebagai grup dihedral, dengan simetri per bangun

Sekarang `looksSame` dan `TRANSFORMS` berisi aturan khusus untuk panah dan segitiga. Keduanya diganti dengan cara umum:

- Setiap bangun menyatakan grup simetrinya. Lingkaran: semua putaran dan cermin. Persegi: D4. Segitiga: putaran 120° dan cermin. Panah: cermin pada sumbunya sendiri. L dan bendera: tidak punya simetri.
- `canonical(cell)` menormalkan arah bangun luar, bangun dalam, dan penanda sesuai simetri tersebut. Dua sel "terlihat sama" jika bentuk kanoniknya sama, termasuk sel komposit.
- Transformasi adalah anggota D4 (atau D8 untuk langkah 45°): `{ putar: k, cermin: boolean }`, dengan komposisi yang tepat. Transformasi sulit lalu bisa berupa gabungan acak dua atau tiga langkah, tidak lagi selalu `rot90mirrorH`.

### 3.3 Pustaka aturan

Aturan = `{ id, keluarga, sasaran (unsur + sifat), operasi, parameter, bobot, describe(), apply(cell, langkah) }`.

| Keluarga | Contoh | Bobot |
|---|---|---|
| Siklus | urutan nilai diacak (tidak lagi tetap), langkah 1 atau 2 | 1 |
| Progresi | jumlah 1, 3, 5, …; jumlah sisi 3, 4, 5, 6 | 1 |
| Rotasi | 45°, 90°, atau 135°, searah atau berlawanan jarum jam | 1 |
| Bolak-balik | ABAB, atau 1-2-3-2-1 | 2 |
| Gerak posisi | titik berpindah k slot di keliling | 2 |
| Tukar dalam–luar | bangun dalam dan luar bertukar tempat dan arsiran | 2 |
| Akumulasi | satu garis atau penanda bertambah atau hilang setiap langkah | 2 |
| Dua kecepatan | bangun dalam berputar 90° sementara titik luar berpindah 1 slot | 3 |
| Selang-seling | suku ganjil dan suku genap mengikuti aturan berbeda | 3 |
| Gabungan | sel 3 = sel 1 ∪ sel 2, atau XOR (garis yang sama hilang) | 3 |
| Jumlah tetap | total sisi atau titik di setiap baris matriks sama | 3 |

- **Komposisi**: sedang = 2 aturan pada sifat yang berbeda. Sulit = 2–3 aturan, atau satu aturan berbobot 3 ditambah satu aturan biasa. Dua aturan tidak boleh menyentuh sifat yang sama. Rotasi hanya dipasang pada bangun yang tidak simetris terhadap besar langkahnya.
- **Skor kompleksitas** = jumlah bobot aturan + 1 per unsur tambahan dalam sel + 1 bila "?" tidak berada di akhir. Tingkat kesulitan ditentukan oleh rentang skor, tidak lagi oleh daftar tetap per tingkat.

### 3.4 Pemecah dan uji keunikan

Makin kompleks soalnya, makin besar risiko ada dua jawaban yang sama-sama bisa dipertahankan. Aplikasi ini menjanjikan bahwa kunci figural selalu benar, jadi risiko itu harus ditutup dengan pemecah.

`solveFigural(question)` mencoba semua hipotesis dari pustaka aturan yang cocok dengan sel-sel yang terlihat. Ruangnya terbatas: keluarga × parameter × sasaran, sekitar beberapa ribu hipotesis. Pemecah lalu mencatat opsi mana yang diramalkan setiap hipotesis. Soal hanya diterima bila:

1. ada hipotesis yang meramalkan kunci;
2. tidak ada hipotesis yang meramalkan opsi lain;
3. hipotesis paling sederhana yang cocok (skor terendah) adalah aturan yang dimaksud. Ini prinsip Occam: tidak boleh ada penjelasan lebih sederhana yang menghasilkan jawaban lain.

Soal yang gagal dibuang lalu dibuat ulang, dengan batas jumlah percobaan. Pemecah yang sama dipakai di tes, menggantikan pemeriksa khusus seperti `fitsMatrix` dan `singledOut`. Pemecah ini juga bisa dipakai nanti untuk memeriksa soal figural yang diimpor.

### 3.5 Pengecoh berbasis salah paham, dan penyeimbang anti-medoid

Untuk setiap aturan, didaftarkan kesalahan yang umum dilakukan peserta, lalu setiap kesalahan dijadikan pengecoh:

- langkah salah (memutar 90°, padahal langkahnya 135°);
- arah terbalik;
- hanya satu dari dua aturan yang diterapkan;
- suku sebelumnya diulang;
- dicerminkan, padahal seharusnya diputar;
- bangun dalam dan luar tertukar;
- jumlah titik meleset satu.

Setelah itu dipilih 4 dari sekitar 15 calon pengecoh (C(15,4) = 1.365 kombinasi, cukup ringan untuk dicoba semua) dengan syarat:

- jawaban bukan satu-satunya opsi yang paling mirip dengan opsi lain;
- setiap nilai sifat pada jawaban juga muncul di minimal satu pengecoh, sehingga heuristik "nilai unik" gagal;
- sebanyak mungkin pengecoh mewakili satu salah paham yang punya nama.

Setiap opsi diberi `rationale` (field ini sudah ada di skema `share.ts`). Contoh: *"C muncul bila Anda memutar 90°, padahal langkahnya 135°."* Pembahasan pun bisa menjelaskan mengapa pengecoh yang menarik itu salah.

### 3.6 Kendali variasi di tingkat set dan bank

- **Kantong acak (shuffle-bag)** per topik × tingkat: keluarga aturan diambil tanpa pengembalian sampai semuanya terpakai. Dengan begitu, 10 soal Deret dalam satu set mencakup sebanyak mungkin keluarga yang berbeda.
- **Tanda pola**: soal menyimpan `figureMeta?: { families: string[]; signature: string; complexity: number }`. `generateFigural` menerima tanda pola dari sekitar 200 soal figural terakhir di bank, lalu menurunkan peluang pola yang baru saja dipakai.
- **Variasi tata letak**: "?" di tengah deret (sedang/sulit), deret 5–6 suku, dan deret dua baris pada layar sempit.
- **Variasi kalimat soal**: 3–4 versi per topik.
- **Serupa+** pada soal figural mempertahankan keluarga aturan tetapi mengganti parameter dan bangunnya.

### 3.7 Topik baru dan perluasan topik lama

| Topik | Isi | Ukuran |
|---|---|---|
| Deret Figural (perluasan) | aturan dari pustaka, "?" di tengah, selang-seling dua deret, dua kecepatan | M |
| Analogi Figural (perluasan) | A → B mengubah 2–3 sifat sekaligus, tukar dalam–luar | M |
| Matriks Figural (perluasan) | gabungan atau XOR per baris, jumlah tetap per baris | M |
| Transformasi Figural (perluasan) | bangun tak simetris dan komposit, gabungan 2–3 langkah D4 | M |
| Figural Berbeda (perluasan) | sulit: empat opsi adalah putaran dari satu gambar komposit, satu opsi adalah cerminnya. Juga paritas jumlah sisi | M |
| **Gabungan Gambar** (baru) | A + B = ? (garis digabung) atau garis yang sama hilang, memakai `segments` | M |
| **Jaring-jaring Kubus** (baru) | 11 jaring kubus, simbol berarah di setiap sisi. Ada dua bentuk soal: "kubus mana yang bisa dibentuk dari jaring ini" dan "jaring mana yang membentuk kubus ini". Lipatan dihitung dengan model 3D sederhana (sisi berhadapan, sisi berdampingan, dan arah simbol). Kubus digambar isometrik dengan 3 sisi terlihat. Pengecohnya: sisi yang berhadapan ditampilkan berdampingan, atau simbol terputar salah | L |

Nama topik lama tidak berubah, jadi profil kisi-kisi dan bank soal yang sudah ada tetap jalan. Topik baru ditambahkan ke `TOPICS.TIU` dan `PROCEDURAL_TOPICS` (`src/domain/blueprint.ts`).

### 3.8 Tampilan, aksesibilitas, ekspor

- `src/lib/figureSvg.ts` dipecah menjadi penggambar per unsur (bangun luar, bangun dalam, penanda, ruas garis). Tanda tangan `cellSvg` dan `figureSvg` tidak berubah, jadi `FigureView`, `exportPdf`, dan `exportDocx` tetap bekerja.
- Arsiran `dotted` dan `half` harus tetap terbaca pada cetakan hitam-putih ukuran 56 px. Ini diperiksa dengan sampel PDF.
- `describeCell` untuk sel komposit, contohnya: *"segi lima kosong, di dalamnya segitiga hitam penuh menghadap kanan; titik di pojok kanan atas"*. Tes memastikan dua opsi yang berbeda tidak pernah punya deskripsi yang sama, supaya pembaca layar tetap mendapat soal yang setara.
- Uji e2e pada layar 360 px untuk deret 6 suku dan matriks komposit: tidak boleh ada gulir horizontal pada halaman.

### 3.9 Kompatibilitas data

- **Bagikan set dan bundel**: skema `cell` di `src/domain/share.ts:36` memakai `z.object`, yang diam-diam membuang field yang tidak dikenal. Aplikasi versi lama akan menampilkan soal komposit tanpa bangun dalam atau penanda, sehingga soalnya salah. Karena itu, set yang memuat soal figural v2 perlu nomor versi baru (`SHARE_VERSION_FIGURAL`), agar aplikasi lama meminta pembaruan. Pola ini sama dengan `SHARE_VERSION_PACKAGES` (lihat komentar di `share.ts:18`).
- **Cadangan**: `importBackup` tidak memvalidasi skema. Aplikasi lama yang memulihkan cadangan baru akan menampilkan soal v2 tanpa unsur tambahan. Aplikasi lama tidak bisa diubah, jadi risiko ini diterima: PWA memperbarui dirinya sendiri, dan cadangan biasanya dipulihkan di versi yang sama atau lebih baru. Hal ini dicatat di CHANGELOG.
- **Hash duplikat**: karena hash dihitung dari `JSON.stringify(cells)`, field baru ikut terhitung otomatis.

---

## 4. Tahapan

Setiap tahap bisa dirilis sendiri dan disertai tes.

### Tahap 0: Ukur, pasang pagar, dan tutup celah tebakan (S)
- Tambahkan `figuralVariety.test.ts` berisi metrik §2, dengan seed tetap agar hasilnya stabil.
- Ganti cara memilih pengecoh di `withDistractors` dengan penyeimbang anti-medoid (§3.5) memakai model data lama. Calon pengecoh diperbanyak dengan perubahan dua sifat dan pengecoh dari pengecoh.
- Hasil: medoid turun dari 100% ke ≤ 25% tanpa mengubah format data. **Ini kemenangan cepat yang paling penting.**

### Tahap 1: Variasi murah dengan model lama (S–M)
- Urutan siklus bentuk dan arsiran diacak, langkah 1 atau 2, rotasi berlawanan arah, bolak-balik, selang-seling.
- "?" di tengah deret, deret 5–6 suku, 3–4 versi kalimat soal.
- Transformasi sulit memakai gabungan acak D4 (masih pada panah).
- Kantong acak per set.
- Target: pola Deret sulit naik dari 9 ke ≥ 30.

### Tahap 2: Model komposit dan simetri (M–L)
- Perubahan tipe di `types.ts`, penggambar per unsur, `describeCell` komposit, `canonical` dan grup simetri, bangun dan arsiran baru.
- Versi format bagikan dinaikkan.
- Uji snapshot: semua soal v1 tampil sama persis seperti sebelumnya.

### Tahap 3: Pustaka aturan dan pemecah (L)
- `src/domain/figural/` dipecah menjadi `rules.ts`, `solver.ts`, `distractors.ts`, `symmetry.ts`, dan satu berkas per topik.
- Deret, Analogi, Matriks, Transformasi, dan Berbeda ditulis ulang di atas pustaka aturan.
- `figureMeta` disimpan, dan tanda pola dari bank diperhitungkan.
- Semua target §2 lulus.

### Tahap 4: Topik baru (L)
- Gabungan Gambar lebih dulu (memakai `segments`, lebih ringan), lalu Jaring-jaring Kubus.
- Profil kisi-kisi bawaan diperbarui, termasuk pemetaan Sekolah Kedinasan di `src/data/kisiSekolahKedinasan2026.ts`.

### Tahap 5: Pembahasan dan analitik (M)
- `rationale` per opsi tampil di pembahasan.
- Laporan Skor dan Progres mengelompokkan kesalahan figural per keluarga aturan, misalnya "sering salah di pola rotasi dua kecepatan", dan menawarkan latihan dengan keluarga itu.
- Kamus Rumus TIU mendapat entri pola figural dengan contoh gambar.

---

## 5. Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Soal kompleks punya dua jawaban yang bisa dipertahankan | Pemecah dengan prinsip Occam (§3.4), dijalankan di setiap pembuatan soal dan di tes |
| Terlalu sulit atau tidak mirip SKD | Tingkat mudah tetap sederhana dan skor kompleksitas dibatasi. Sebelum rilis, tinjau manual 50 soal per tingkat |
| Gambar terlalu padat di layar kecil atau PDF | Paling banyak 3 unsur per sel, uji e2e 360 px, cek sampel cetak |
| Pemecah lambat di ponsel | Ruang hipotesis dibatasi dan diukur di tes (< 20 ms per soal). Pembuatan soal tetap per batch |
| Aplikasi lama salah menampilkan soal v2 | Versi format bagikan dinaikkan (§3.9) |
| Pembaca layar kesulitan dengan soal komposit dan kubus | Deskripsi dibuat injektif dan dites. Untuk kubus, sisi dideskripsikan satu per satu |

---

## 6. Keputusan dari pemilik

1. **Urutan topik baru**: Gabungan Gambar dulu (lebih ringan), atau langsung Jaring-jaring Kubus (lebih sering muncul di psikotes kedinasan, tetapi pekerjaannya L)?
2. **Soal figural lama di bank** masih punya celah tebakan, dan aturannya tidak tersimpan sehingga pengecohnya tidak bisa dibuat ulang. Ada tiga pilihan: (a) dibiarkan saja; (b) diberi prioritas paling akhir saat menyusun set; atau (c) disarankan dibuat ulang lewat tombol di Bank Soal.
3. **Bobot bawaan topik figural** di profil SKD setelah ada topik baru.

---

## Hasil 1.11.0

Diukur dengan cara yang sama seperti §1, kini pada semua resep. Ambang di §2 dijaga oleh `src/__tests__/figuralVariety.test.ts`.

| Ukuran | Sebelum | Sesudah |
|---|---|---|
| Medoid (jawaban = opsi paling mirip), terburuk di semua resep × tingkat | 100% | 24% (kertas lipat sulit); umumnya 9–15% |
| Pola berbeda per 200 soal, Deret sulit | 9 per 1.000 | 152 |
| Pola terbanyak, Deret / Analogi / Matriks / Transformasi | hingga 100% | 6–10% |
| Transformasi yang memakai panah | 100% | sekitar 25% (satu dari empat resep) |
| Resep (jenis soal) | 5 | 23, di 7 topik |

Keputusan di §6 diambil dengan usulan bawaan:
1. Kedua topik baru dikerjakan sekaligus: Gabungan Gambar dan Ruang dan Kubus.
2. Soal figural lama di bank dibiarkan (pilihan a). Soal baru dibuat dengan generator baru, dan Serupa+ pada soal lama memakai generator baru.
3. Topik baru masuk daftar topik TIU dengan bobot sama seperti topik lain.

Yang berbeda dari rencana:
- **Kertas lipat, figur garis, dan matriks adegan** ikut dibuat; "gambar tersembunyi" belum.
- Untuk Figural Berbeda, Ruang dan Kubus, dan Gabungan Gambar, ambang pola terbanyak adalah 30%, bukan 12%. Soal jenis ini memang hanya punya sedikit aturan, jadi yang bervariasi adalah resep dan setelannya.
- Entri Kamus untuk pola figural digantikan oleh **Lab Pola Figural**: setiap jenis soal tampil dengan penjelasan singkat, contoh langsung, dan jejak polanya.
