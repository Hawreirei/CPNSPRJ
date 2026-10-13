# Rancangan Mesin Figural v2: Dari Contoh Soal Nyata

Dokumen ini melanjutkan [rencana-tiu-figural.md](rencana-tiu-figural.md). Rencana itu menjawab pertanyaan *apa yang salah dan urutan perbaikannya*. Dokumen ini menjawab pertanyaan *bentuk mesinnya*: model data, aturan, pemecah, dan pengecoh. Rancangan disusun dari empat contoh soal figural bergaya SKD dan dibuat lebih luas daripada keempat contoh itu.

Status: rancangan, belum dikerjakan. Model "sel komposit" di §3.1 rencana digantikan oleh **model adegan** di §2 dokumen ini.

## Daftar isi

1. [Bedah empat contoh soal](#1-bedah-empat-contoh-soal)
2. [Model adegan](#2-model-adegan)
3. [Lintasan dan struktur deret](#3-lintasan-dan-struktur-deret)
4. [Katalog arketipe soal](#4-katalog-arketipe-soal)
5. [Pemecah dan aturan keadilan](#5-pemecah-dan-aturan-keadilan)
6. [Pengecoh](#6-pengecoh)
7. [Sisi eksploratif bagi pelajar](#7-sisi-eksploratif-bagi-pelajar)
8. [Struktur kode dan data](#8-struktur-kode-dan-data)
9. [Urutan pengerjaan](#9-urutan-pengerjaan)
10. [Pertanyaan terbuka](#10-pertanyaan-terbuka)

---

## 1. Bedah empat contoh soal

Pelajaran terpenting dari keempat contoh: **soal nyata tidak dibangun dari satu bangun yang sifatnya berubah, seperti generator sekarang. Soal nyata dibangun dari sebuah *adegan*.** Ada bingkai yang punya tempat-tempat (sisi, ruang, sudut). Ada beberapa objek di tempat-tempat itu, dan setiap objek bergerak dengan aturannya sendiri.

### Contoh 1: Figur garis dan titik (deret 4 suku)

| Sifat | Suku 1 | Suku 2 | Suku 3 | Suku 4 |
|---|---|---|---|---|
| Jumlah ruas garis | 3 | 2 | 2 | ? |
| Arah puncak | bawah | atas | kiri | ? |
| Garis tersambung ke titik | ya | tidak | ya | ? |
| Jumlah titik / letaknya | 3, atas | 3, atas | 2, kanan | ? |

- **Struktur**: berpasangan. Hubungan 1 → 2 diulang pada 3 → 4: puncak dibalik 180°, garis dilepas dari titik, jumlah garis berubah, sementara jumlah dan letak titik tetap.
- **Pilihan**: opsi tersusun berpasangan. A dan C sama-sama berpuncak kanan dengan 3 ruas dan 2 titik. D dan E hanya berbeda jumlah titik.
- **Pelajaran**:
  - Ada sifat yang bersifat **struktural**: jumlah ruas, tersambung atau tidak, arah puncak.
  - Pengecoh **nyaris kembar** memaksa peserta mengamati dengan teliti.
  - Pada gambar ini, beda A dan C terlalu halus untuk dipastikan dari resolusi yang tersedia. Generator kita **tidak boleh** membuat beda yang tak terlihat seperti itu (lihat §5, aturan K3).

### Contoh 2: Kotak berdiagonal, 4 ruang (deret 5 suku)

Bingkai: persegi yang dibagi dua diagonal menjadi ruang Atas, Kanan, Bawah, dan Kiri. Setiap suku berisi 3 objek dan satu ruang kosong.

Bacaan kami:
- **Persegi panjang** ada di setiap suku dan pindah dengan dua gerakan yang bergantian: ke ruang seberang, lalu geser satu ruang berlawanan jarum jam. Urutannya Bawah → Atas → Kiri → Kanan → Atas → (Bawah).
- **Estafet simbol**: simbol baru muncul di setiap suku, ikut ke suku berikutnya, lalu hilang. Saat ikut, gerakannya bergantung pada jenis simbol:
  - simbol **berarah** (pin, ⇑, ↓) melompat ke ruang seberang dan terbalik;
  - simbol **tak berarah** (□, ○) bergeser satu ruang berlawanan jarum jam.

Dengan aturan itu, suku 6 punya ↑ di Atas dan persegi panjang di Bawah, sehingga jawabannya A atau B. Penentu terakhirnya adalah simbol baru (S atau =), dan simbol baru tidak diatur pola apa pun.

**Pelajaran**:
- Ada **aturan bersyarat jenis objek**.
- Ada **gerakan yang bergantian**.
- Ada **siklus hidup objek** (muncul, ikut, hilang).
- Unsur yang tidak diatur pola **tidak boleh** menjadi satu-satunya pembeda antara kunci dan pengecoh.

### Contoh 3: Persegi bertanda segitiga dan panah yang mengorbit (deret 5 suku)

| Objek | Sifat | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|
| Panah | letak | atas | kiri | bawah | kanan | atas | **kiri** |
| Panah | arah | ← | ↑ | → | ↓ | ← | **↑** |
| Segitiga hitam | sisi persegi | kanan | atas | atas | kiri | kiri | **bawah** |
| Segitiga hitam | dalam/luar | dalam | luar | dalam | luar | dalam | **luar** |

- **Lintasan panah**: letaknya mengorbit berlawanan jarum jam, sedangkan arahnya berputar 90° searah jarum jam. Dua putaran berlawanan pada satu objek membuat soal ini sulit.
- **Lintasan segitiga**: dua gerakan bergantian, "keluar ke sisi berikutnya (berlawanan jarum jam)" lalu "masuk di sisi yang sama". Arah segitiga **mengikuti letaknya**: di dalam ia menunjuk ke pusat, di luar ia menunjuk keluar.
- **Jawaban: E.**
- **Pengecohnya faktorial**: A (↓, luar-kiri), B (↓, luar-bawah), C (↑, luar-kiri), D (↑, dalam-bawah), E (↑, luar-bawah). Setiap nilai benar juga muncul di pengecoh, jadi satu sifat saja tidak cukup untuk menebak.
- **Catatan**: dengan ukuran jarak dari rencana §1, E tetap menjadi opsi yang paling mirip dengan opsi lain. Soal nyata pun bocor. Kita menargetkan hasil yang lebih baik daripada soal nyata.

### Contoh 4: Jaring-jaring kubus

Jaring: hitam | putih-bertitik | hitam | putih, satu sisi putih di atas sisi bertitik, dan satu sisi putih di bawah sisi putih paling kanan. Setelah dilipat dengan sisi bertitik di depan, hasilnya:

- **sisi berhadapan**: bertitik ↔ putih; hitam ↔ hitam; putih ↔ putih;
- **urutan keliling sisi bertitik**: putih (atas), hitam (kanan), putih (bawah), hitam (kiri), selang-seling.

Pemeriksaan tiap opsi:
- **B, C, D salah** karena dua sisi hitam terlihat bersebelahan, padahal keduanya berhadapan.
- **E salah** karena dua sisi putih bersebelahan dengan sisi bertitik, padahal di keliling sisi bertitik putih dan hitam selalu selang-seling.
- **Jawaban: A.**

**Pelajaran**:
- Soal kubus diselesaikan dengan **sisi berhadapan** dan **urutan keliling**.
- Setiap pengecoh melanggar tepat satu batasan.
- Bila simbol di sisi punya arah (misalnya panah atau huruf), soal naik satu tingkat karena arah simbol juga harus dilacak.

---

## 2. Model adegan

### 2.1 Bingkai dan topologi tempat

Setiap bingkai menyatakan tempat-tempatnya beserta tiga relasi: urutan searah jarum jam, pasangan seberang, dan sumbu cermin. Dengan begitu, aturan seperti "geser k langkah", "ke seberang", atau "cerminkan" berlaku untuk bingkai apa pun.

| Bingkai | Tempat | Dipakai di |
|---|---|---|
| `plain` | 4 sisi × {dalam, luar, pada garis}, 4 sudut, pusat | Contoh 3 |
| `diag4` | 4 ruang segitiga A/Ka/B/Ki | Contoh 2 |
| `quad4` | 4 kuadran (bingkai bersilang +) | deret kuadran |
| `ring8` | 8 titik keliling + pusat | titik atau bangun yang mengorbit |
| `grid9` | kisi 3×3 | matriks posisi, hitam/putih |
| `pie6`, `pie8` | juring lingkaran | arsiran yang berputar |
| `lattice` | kisi titik 3×3 untuk ruas garis | Contoh 1, Gabungan Gambar |

### 2.2 Objek

```ts
interface SceneObject {
  id: string;                 // identitas lintasan, stabil antarsuku
  glyph: GlyphKind;           // arrow, dblarrow, pin, tab (segitiga tempel), rect, square, circle, letterC, eq, L, flag, ...
  slot: SlotRef;              // mis. { side: 'T', anchor: 'in' } | { region: 'L' } | { ring: 3 }
  orient: { mode: 'abs'; deg: number } | { mode: 'rel'; facing: 'center' | 'out' | 'cw' | 'ccw' };
  mirrored?: boolean;
  fill?: Fill;
  size?: 's' | 'm' | 'l';
}
interface SceneCell { v: 2; frame: FrameKind; base?: BaseShape; objects: SceneObject[]; strokes?: StrokeFigure }
```

Pembeda utama model ini adalah **arah relatif** (`orient.mode = 'rel'`). Segitiga tempel di Contoh 3 tidak menyimpan sudut. Ia menyimpan "menghadap ke pusat" atau "menghadap keluar", sehingga arahnya ikut berubah saat ia pindah sisi. Dari sini muncul tiga gerakan yang berbeda, dan perbedaan ketiganya yang diuji soal nyata:

| Gerakan | Letak | Arah absolut | Contoh |
|---|---|---|---|
| **Bergeser** | berubah | tetap | panah tetap menunjuk ke atas walau pindah sisi |
| **Mengorbit** | berubah | ikut berputar bersama letaknya | segitiga tempel di Contoh 3 |
| **Berputar di tempat** | tetap | berubah | panah diputar 90° tanpa pindah |

Satu objek boleh menggabungkan gerakan, misalnya panah di Contoh 3 bergeser berlawanan jarum jam sambil berputar searah jarum jam.

### 2.3 Figur garis (`StrokeFigure`)

Figur di Contoh 1 dimodelkan sebagai graf kecil di `lattice`: puncak, n ruas (2–4), lebar sebaran, arah puncak, hiasan ujung (titik, tanpa hiasan, kepala panah), serta mode `attached` (titik di ujung ruas) atau `detached` (titik berjajar di satu sisi bingkai).

Sifat yang bisa diatur aturan:
- jumlah ruas;
- jumlah titik;
- tersambung atau tidak;
- arah puncak;
- sisi tempat titik berjajar;
- turunan seperti "jumlah ujung bebas" atau "jumlah perpotongan".

### 2.4 Kubus dan kertas lipat

Keduanya bukan adegan 2D, jadi punya model sendiri:

```ts
interface CubeFigure { net: NetId /* 11 jaring */; faces: Face[6] /* simbol + arah 0–3 */; }
interface CubeView   { front: Face; top: Face; right: Face }      // opsi: kubus isometrik 3 sisi
interface FoldFigure { folds: FoldLine[] /* 1–3 lipatan */; holes: Point[] }   // kertas dilipat lalu dilubangi
```

---

## 3. Lintasan dan struktur deret

### 3.1 Operasi pada satu objek

| Operasi | Parameter |
|---|---|
| `move` | k langkah searah atau berlawanan jarum jam, ke seberang, cermin terhadap sumbu |
| `turn` | ±45°, ±90°, 180° (hanya pada arah absolut) |
| `flip` | cermin objek di tempatnya |
| `toggleAnchor` | dalam ↔ luar |
| `cycle` | glyph, fill, atau size menurut urutan acak |
| `count` | tambah atau kurang (titik, ruas) |
| `attach` | tersambung ↔ terlepas (figur garis) |

### 3.2 Lintasan dan struktur waktu

Lintasan adalah rangkaian operasi yang diterapkan pada satu objek dari suku ke suku. Strukturnya bisa salah satu dari berikut:

| Struktur | Arti | Contoh |
|---|---|---|
| **Tetap** | operasi yang sama di setiap langkah | panah Contoh 3 |
| **Bergantian** | `[op1, op2]` berselang-seling | persegi panjang Contoh 2, segitiga Contoh 3 |
| **Bersyarat jenis** | operasi bergantung pada sifat objek | estafet Contoh 2: berarah ke seberang dan terbalik, tak berarah geser 1 |
| **Akumulasi** | objek atau ruas bertambah satu tiap langkah | — |
| **Siklus hidup** | muncul, ikut k langkah, lalu hilang | estafet Contoh 2 |

### 3.3 Struktur deret (cara suku disusun)

| Struktur | Arti |
|---|---|
| Linear | suku n = lintasan diterapkan n kali (yang ada sekarang) |
| **Berpasangan** | 1→2 sama dengan 3→4 (Contoh 1). Ini persilangan deret dan analogi |
| **Selang-seling** | suku ganjil dan genap adalah dua deret terpisah |
| **Multi-lintasan** | 2–3 objek, masing-masing dengan lintasannya (Contoh 2, 3) |
| **"?" di tengah** | peserta harus menyimpulkan pola dari kedua sisi |

### 3.4 Skor kompleksitas

Skor dihitung dari bobot yang bisa dijumlahkan, sebagai pengganti tabel tingkat yang tetap:

| Unsur | Bobot |
|---|---|
| Per lintasan | +1 |
| Lintasan bergantian | +1 |
| Lintasan bersyarat jenis | +2 |
| Mengorbit (arah relatif) | +1 |
| Dua putaran berlawanan pada satu objek | +2 |
| Siklus hidup atau estafet | +2 |
| Struktur berpasangan atau selang-seling | +1 |
| "?" di tengah | +1 |
| Pengecoh nyaris kembar | +1 |

Rentang per tingkat: mudah 1–2, sedang 3–5, sulit ≥ 6. Sebagai kalibrasi, Contoh 3 bernilai 6 (dua lintasan +2, segitiga bergantian +1, mengorbit +1, dua putaran berlawanan pada panah +2). Contoh 2 bernilai 7 (dua lintasan +2, persegi panjang bergantian +1, estafet bersyarat jenis +2, siklus hidup +2).

---

## 4. Katalog arketipe soal

Setiap arketipe adalah satu "resep" generator. Katalog ini sengaja dibuat lebih luas daripada empat contoh di atas.

| Kode | Arketipe | Bentuk soal | Model | Rujukan | Ukuran | Prioritas |
|---|---|---|---|---|---|---|
| F1 | Deret satu bangun (sekarang) | deret, analogi | sel lama | — | — | sudah ada |
| F2 | **Deret orbit** | deret 4–6 suku | `plain`/`ring8`, 1–2 objek | Contoh 3 | M | 1 |
| F3 | **Deret ruang** | deret | `diag4`/`quad4`, 2–3 objek, estafet | Contoh 2 | M | 1 |
| F4 | **Figur garis** | deret berpasangan, analogi | `lattice` + `StrokeFigure` | Contoh 1 | M | 2 |
| F5 | **Jaring kubus → kubus** | pilih kubus yang bisa dibentuk | `CubeFigure` | Contoh 4 | L | 2 |
| F6 | Kubus → jaring | pilih jaring yang membentuk kubus | `CubeFigure` | — | M (setelah F5) | 3 |
| F7 | Sisi berhadapan | tiga pandangan kubus yang sama, sisi mana di seberang X | `CubeFigure` | — | S (setelah F5) | 3 |
| F8 | Analogi adegan | A : B = C : ? dengan 2–3 perubahan | adegan | — | S (setelah F2/F3) | 2 |
| F9 | Ketidaksamaan adegan | 4 adegan hasil putaran dari satu adegan, 1 hasil cermin | adegan | — | S | 2 |
| F10 | Matriks adegan | 3×3, baris = lintasan, kolom = lintasan lain | adegan | — | M | 3 |
| F11 | Gabungan gambar | A + B = ? (gabung / XOR ruas) | `lattice` | — | M | 3 |
| F12 | Kertas lipat berlubang | lipat 1–3 kali, lubangi, buka | `FoldFigure` | — | M | 3 |
| F13 | Bayangan cermin dan air | cermin adegan atau huruf terhadap sumbu tegak atau mendatar | adegan | — | S | 3 |
| F14 | Juring berputar | arsiran pada `pie8` berputar dengan langkah berbeda | `pie8` | — | S | 3 |

Topik di aplikasi tetap sedikit dan dikenal peserta. Setiap arketipe dipetakan ke topik yang ada, atau ke satu topik baru:

| Topik | Arketipe |
|---|---|
| Deret Figural | F1, F2, F3, F4, F14 |
| Analogi Figural | F1, F4, F8 |
| Matriks Figural | F1, F10 |
| Transformasi Figural | F1, F13, F12 |
| Figural Berbeda | F1, F9 |
| **Ruang dan Kubus** (baru) | F5, F6, F7 |
| **Gabungan Gambar** (baru) | F11 |

Kantong acak (rencana §3.6) memilih **arketipe** lebih dulu, lalu parameternya. Dengan cara itu, 10 soal Deret dalam satu set bisa berisi orbit, ruang, figur garis, dan juring.

---

## 5. Pemecah dan aturan keadilan

### 5.1 Pemecah adegan

1. **Korespondensi objek.** Generator menjamin setiap jenis glyph muncul paling banyak sekali per suku, kecuali dalam estafet yang ditandai `id`. Dengan begitu, pemecah tahu objek mana di suku n yang sama dengan objek di suku n+1.
2. **Hipotesis per objek.** Untuk setiap objek, pemecah mencoba semua lintasan dari pustaka §3 yang cocok dengan suku-suku yang terlihat. Ruangnya kecil: sekitar 10 operasi × 5 struktur × parameter. Hipotesis antarobjek tidak saling bergantung, sehingga bisa dihitung terpisah.
3. **Ramalan.** Setiap kombinasi hipotesis yang cocok meramalkan satu suku "?".

### 5.2 Aturan keadilan

Setiap soal harus lolos semua aturan ini. Yang gagal dibuang dan dibuat ulang.

| Kode | Aturan |
|---|---|
| K1 | Tepat satu opsi diramalkan oleh hipotesis apa pun yang cocok |
| K2 | Hipotesis paling sederhana (skor §3.4 terendah) adalah aturan yang dimaksud |
| K3 | Setiap beda antara kunci dan pengecoh terletak pada sifat yang diatur pola, dan terlihat pada 56 px (beda sudut ≥ 45°, beda posisi ≥ satu tempat, tanpa beda ketebalan garis) |
| K4 | Tidak ada opsi yang sama secara visual setelah dinormalkan dengan simetri bangun (rencana §3.2) |
| K5 | Heuristik medoid dan "nilai unik" tidak menunjuk kunci melebihi target (rencana §2), diukur per arketipe |
| K6 | Kubus: tepat satu opsi bisa dibentuk dalam salah satu dari 24 orientasi kubus |

Aturan K3 menjawab masalah Contoh 1 (A dan C sulit dibedakan). Aturan K1 dan K2 menjawab masalah Contoh 2 (penentu terakhirnya simbol yang tidak diatur pola).

---

## 6. Pengecoh

Ada tiga resep, dan generator memilih salah satu menurut arketipe:

1. **Faktorial** (Contoh 3). Setiap lintasan adalah satu dimensi, dan setiap pengecoh adalah kombinasi nilai benar dan nilai salah-paham per dimensi. Dengan 2 lintasan × 3 nilai ada 9 kombinasi, dan 4 di antaranya dipilih sebagai pengecoh. Dengan begitu, setiap nilai benar muncul di lebih dari satu opsi.
2. **Nyaris kembar** (Contoh 1). Pasangan opsi yang hanya berbeda pada satu sifat terhitung, misalnya jumlah titik atau jumlah ruas. Kunci boleh punya kembaran, dan **pengecoh juga harus punya kembaran**. Bila hanya kunci yang punya kembaran, pasangan kembar itu sendiri menjadi petunjuk.
3. **Satu pelanggaran** (Contoh 4). Setiap pengecoh kubus melanggar tepat satu batasan: sisi berhadapan tampil bersebelahan, urutan keliling terbalik (cerminan), atau arah simbol salah.

Daftar salah paham per operasi (sumber pengecoh):

| Operasi | Salah paham yang dijadikan pengecoh |
|---|---|
| Bergeser dan mengorbit | memperlakukan orbit sebagai geser, atau sebaliknya. Ini salah paham paling khas dan paling berharga untuk dilatih |
| Putaran | arah terbalik; langkah ±45° |
| Bergantian | menerapkan operasi yang sama dua kali |
| Bersyarat jenis | menerapkan aturan simbol tak berarah pada simbol berarah |
| Berpasangan | membaca soal sebagai deret linear |
| Kubus | cerminan jaring (urutan keliling terbalik) |

Penyeimbang anti-medoid dari rencana §3.5 tetap dipakai di atas ketiga resep. Bila perlu, sengaja dipasang satu **pengecoh umpan pusat** yang lebih mirip dengan opsi lain daripada kuncinya.

---

## 7. Sisi eksploratif bagi pelajar

Mesin ini bisa membuat pelajar menjelajahi pola, tidak hanya menjawab soal.

1. **Pembahasan per lintasan.** Tombol "Telusuri pola" memberi warna pada setiap objek dan menampilkan lintasannya suku demi suku. Contoh: panah ditandai biru dengan teks "letak: atas → kiri → bawah → kanan → atas → **kiri**", lalu satu langkah lagi "arah: ← ↑ → ↓ ← **↑**". Untuk kubus, pembahasannya adalah animasi lipatan sederhana (2D, langkah demi langkah) disertai daftar pasangan sisi berhadapan.
2. **Mengapa pengecoh itu menarik.** Setiap opsi menyimpan `rationale` dari daftar salah paham (§6). Contoh: *"D muncul bila segitiga dianggap tetap di dalam. Padahal ia keluar dan masuk bergantian."*
3. **Lab Pola**, halaman baru tanpa biaya AI. Pelajar memilih arketipe, bingkai, dan 1–3 lintasan, lalu langsung melihat deret yang terbentuk dan bisa melangkahkannya maju-mundur. Tombol "Jadikan soal" mengubah hasilnya menjadi soal latihan dengan pengecoh otomatis. Ini cara cepat memahami beda "bergeser", "mengorbit", dan "berputar di tempat".
4. **Latihan terarah per keluarga.** `figureMeta.families` (rencana §3.6) memungkinkan Laporan Skor menyimpulkan, misalnya, *"Anda sering salah pada lintasan bergantian"*, lalu menawarkan 5 soal F2/F3 yang semuanya memakai lintasan bergantian.
5. **Tingkat bertahap dalam satu arketipe.** Pelajar bisa naik dari 1 lintasan tetap, ke 2 lintasan, ke lintasan bergantian, lalu ke bersyarat jenis, dengan bingkai yang sama. Setiap tingkat hanya menambah satu konsep baru.

---

## 8. Struktur kode dan data

```
src/domain/figural/
  index.ts          generateFigural(topic, difficulty, count, recentSignatures)  (API lama dipertahankan)
  legacy.ts         generator F1 sekarang, dipindah tanpa diubah
  symmetry.ts       grup simetri glyph, canonical(), looksSame()
  frames.ts         topologi bingkai: urutan, seberang, sumbu cermin
  tracks.ts         operasi dan struktur lintasan, skor kompleksitas
  scene.ts          menjalankan lintasan → SceneCell per suku
  solver.ts         pemecah §5 dan aturan keadilan K1–K6
  distractors.ts    resep faktorial, nyaris kembar, satu pelanggaran, dan anti-medoid
  cube.ts           11 jaring, lipat (BFS + orientasi), 24 orientasi, validasi pandangan
  fold.ts           pantulan titik lubang terhadap garis lipat
  archetypes/       f2-orbit.ts, f3-regions.ts, f4-strokes.ts, f5-cube.ts, …
src/lib/figureSvg.ts → src/lib/figure/  (legacy.ts, scene.ts, strokes.ts, cube.ts (isometrik), fold.ts)
src/domain/describe.ts                  describeScene, describeCube (injektif, dites)
```

- **Tipe**: `Figure` menjadi union berdiskriminan, yaitu `LegacyFigure | SceneFigure | CubeFigure | FoldFigure`. `option.figure` menjadi `FigureCell | SceneCell | CubeView | HolePattern`. Data lama dibaca sebagai `LegacyFigure` tanpa migrasi.
- **Bagikan, bundel, dan cadangan**: berlaku `SHARE_VERSION_FIGURAL` seperti di rencana §3.9. Skema zod untuk tipe baru ditulis ketat dengan `.strict()`, agar field asing tidak dibuang diam-diam.
- **Rendering**: tanda tangan `figureSvg(fig, size, color)` dan `cellSvg(cell, size, color)` tetap sama, jadi `FigureView`, `exportPdf`, dan `exportDocx` tidak berubah. Kubus digambar isometrik: simbol tiap sisi ditransformasi dengan matriks miring, dan sisi depan, atas, serta kanan diberi tingkat abu-abu berbeda (aman untuk cetak hitam-putih).
- **Tes**: setiap arketipe diuji dengan 150 seed × 3 tingkat terhadap K1–K6. Ada snapshot SVG untuk F1 (tidak boleh berubah). Keempat contoh di §1 dikodekan ulang sebagai tes **ekspresivitas**: model harus bisa menyatakan Contoh 3 dan Contoh 4 persis, dan pemecah harus menemukan jawaban E dan A. Contoh 1 dan Contoh 2 dikodekan sebagai tes yang **harus ditolak** oleh aturan keadilan, karena K3 dan K1 dilanggar.

---

## 9. Urutan pengerjaan

Urutan ini menyisip ke tahapan di rencana §4.

| Langkah | Isi | Bergantung pada |
|---|---|---|
| 0 | Rencana Tahap 0 (anti-medoid pada F1) dan Tahap 1 (variasi murah) | — |
| 1 | `symmetry`, `frames`, `tracks`, `scene`, renderer adegan, `describeScene` | 0 |
| 2 | `solver` dan aturan K1–K5; F2 Deret orbit | 1 |
| 3 | F3 Deret ruang (bergantian, bersyarat jenis, estafet); F8 dan F9 | 2 |
| 4 | Pembahasan per lintasan dan `rationale` per opsi (§7.1–7.2) | 2 |
| 5 | `cube.ts`, renderer isometrik, F5 (K6); lalu F7 dan F6 | 1 |
| 6 | F4 Figur garis; F11 Gabungan Gambar (berbagi `lattice`) | 2 |
| 7 | Lab Pola dan latihan per keluarga (§7.3–7.4) | 3, 4 |
| 8 | F10, F12, F13, F14 | 2 |

Langkah 2 dan 5 bisa dikerjakan paralel karena kubus tidak memakai pemecah adegan.

---

## 10. Pertanyaan terbuka

1. **Cetakan**: apakah PDF untuk dicetak tetap harus hitam-putih murni? Ini menentukan apakah kubus boleh memakai abu-abu, atau hanya hitam, putih, dan arsir.
2. **Kubus tiga dimensi interaktif** (bisa diputar di layar): menarik untuk Lab Pola, tetapi menambah pustaka 3D. Usulan kami: tidak dulu, cukup animasi lipatan 2D.
3. **Kalibrasi tingkat**: rentang skor §3.4 adalah tebakan awal. Usulan kami: kalibrasi dari data jawaban pengguna (persentase benar per skor) setelah dua minggu, lalu sesuaikan rentangnya.
4. **Simbol huruf** (C, S) di Contoh 2 mudah dibaca, tetapi bisa diputar dan dicerminkan secara ambigu bagi sebagian peserta. Usulan kami: hanya memakai huruf yang tidak simetris dan jelas (F, R, J, L), dan hanya di arketipe cermin F13.
