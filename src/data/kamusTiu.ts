import type { KamusEntry } from '../domain/kamus';

/**
 * Kamus Rumus TIU, curated by hand (#47). Every example with arithmetic carries it as a mathjs
 * expression, recomputed by src/__tests__/kamus.test.ts, so a wrong number cannot ship.
 */
export const KAMUS_TIU: KamusEntry[] = [
  /* ------------------------------------------------------------ Deret Angka */
  {
    id: 'deret-aritmetika',
    topic: 'Deret Angka',
    title: 'Deret aritmetika (beda tetap)',
    formula: 'Suku ke-n: $U_n = a + (n-1)b$. Jumlah n suku: $S_n = \\frac{n}{2}\\,(2a + (n-1)b)$, dengan $a$ suku pertama dan $b$ beda.',
    note: 'Cirinya: selisih dua suku berurutan selalu sama.',
    example: {
      question: 'Suku ke-10 dari deret 3, 7, 11, 15, … adalah …',
      solution: '$a = 3$, $b = 4$, jadi $U_{10} = 3 + 9 \\times 4 = 39$.',
      expression: '3 + (10 - 1) * 4',
      answer: 39,
    },
  },
  {
    id: 'deret-aritmetika-jumlah',
    topic: 'Deret Angka',
    title: 'Jumlah deret aritmetika',
    formula: '$S_n = \\frac{n}{2}\\,(a + U_n)$: banyak suku dikali rata-rata suku pertama dan terakhir.',
    example: {
      question: 'Jumlah 10 suku pertama deret 3, 7, 11, … adalah …',
      solution: '$U_{10} = 39$, jadi $S_{10} = \\frac{10}{2}(3 + 39) = 210$.',
      expression: '10 / 2 * (3 + 39)',
      answer: 210,
    },
  },
  {
    id: 'deret-geometri',
    topic: 'Deret Angka',
    title: 'Deret geometri (rasio tetap)',
    formula: 'Suku ke-n: $U_n = a \\cdot r^{n-1}$. Jumlah n suku: $S_n = \\frac{a(r^n - 1)}{r - 1}$ untuk $r \\ne 1$.',
    note: 'Cirinya: hasil bagi dua suku berurutan selalu sama.',
    example: {
      question: 'Suku ke-6 dari deret 2, 6, 18, 54, … adalah …',
      solution: '$a = 2$, $r = 3$, jadi $U_6 = 2 \\times 3^5 = 486$.',
      expression: '2 * 3^5',
      answer: 486,
    },
  },
  {
    id: 'deret-fibonacci',
    topic: 'Deret Angka',
    title: 'Deret Fibonacci',
    formula: 'Setiap suku adalah jumlah dua suku sebelumnya: $U_n = U_{n-1} + U_{n-2}$.',
    example: {
      question: '2, 3, 5, 8, 13, … suku berikutnya adalah …',
      solution: '$8 + 13 = 21$.',
      expression: '8 + 13',
      answer: 21,
    },
  },
  {
    id: 'deret-bertingkat',
    topic: 'Deret Angka',
    title: 'Deret bertingkat',
    formula: 'Bila selisihnya tidak tetap, hitung selisih dari selisih. Pola sering muncul di tingkat kedua.',
    example: {
      question: '2, 5, 10, 17, 26, … suku berikutnya adalah …',
      solution: 'Selisihnya 3, 5, 7, 9, jadi selisih berikutnya 11, dan $26 + 11 = 37$.',
      expression: '26 + 11',
      answer: 37,
    },
  },
  {
    id: 'deret-loncat',
    topic: 'Deret Angka',
    title: 'Deret loncat (dua deret berselang-seling)',
    formula: 'Pisahkan suku ganjil dan suku genap. Masing-masing biasanya deret sederhana.',
    example: {
      question: '1, 10, 3, 20, 5, 30, … suku berikutnya adalah …',
      solution: 'Suku ganjil 1, 3, 5 (beda 2), suku genap 10, 20, 30. Suku ke-7 adalah suku ganjil: $5 + 2 = 7$.',
      expression: '5 + 2',
      answer: 7,
    },
  },

  /* ------------------------------------------------------------ Aritmetika */
  {
    id: 'persen',
    topic: 'Aritmetika',
    title: 'Persen dari suatu bilangan',
    formula: '$a\\%$ dari $b$ $= \\frac{a}{100} \\times b$.',
    note: 'Trik: $a\\%$ dari $b$ sama dengan $b\\%$ dari $a$.',
    example: {
      question: '15% dari 240 adalah …',
      solution: '$\\frac{15}{100} \\times 240 = 36$.',
      expression: '15 / 100 * 240',
      answer: 36,
    },
  },
  {
    id: 'perubahan-persen',
    topic: 'Aritmetika',
    title: 'Kenaikan atau penurunan dalam persen',
    formula: 'Perubahan $= \\frac{\\text{baru} - \\text{lama}}{\\text{lama}} \\times 100\\%$.',
    note: 'Pembaginya selalu nilai lama, bukan nilai baru.',
    example: {
      question: 'Harga naik dari Rp80.000 menjadi Rp92.000. Kenaikannya … persen.',
      solution: '$\\frac{92.000 - 80.000}{80.000} \\times 100\\% = 15\\%$.',
      expression: '(92000 - 80000) / 80000 * 100',
      answer: 15,
    },
  },
  {
    id: 'diskon-bertingkat',
    topic: 'Aritmetika',
    title: 'Diskon bertingkat',
    formula: 'Harga akhir $= \\text{harga} \\times (1 - d_1)(1 - d_2)$.',
    note: 'Diskon 20% lalu 10% bukan diskon 30%, melainkan 28%.',
    example: {
      question: 'Barang Rp200.000 didiskon 20%, lalu didiskon lagi 10%. Harga akhirnya …',
      solution: '$200.000 \\times 0{,}8 \\times 0{,}9 = 144.000$.',
      expression: '200000 * (1 - 0.2) * (1 - 0.1)',
      answer: 144000,
    },
  },
  {
    id: 'rata-rata-gabungan',
    topic: 'Aritmetika',
    title: 'Rata-rata gabungan',
    formula: '$\\bar{x}_{gab} = \\frac{n_1 \\bar{x}_1 + n_2 \\bar{x}_2}{n_1 + n_2}$.',
    note: 'Bukan rata-rata dari kedua rata-rata, kecuali banyak datanya sama.',
    example: {
      question: 'Kelas A (30 siswa) rata-ratanya 70, kelas B (20 siswa) rata-ratanya 80. Rata-rata gabungannya …',
      solution: '$\\frac{30 \\times 70 + 20 \\times 80}{50} = \\frac{3.700}{50} = 74$.',
      expression: '(30 * 70 + 20 * 80) / (30 + 20)',
      answer: 74,
    },
  },

  /* ------------------------------------------------------------ Soal Cerita */
  {
    id: 'jarak-waktu-kecepatan',
    topic: 'Soal Cerita',
    title: 'Jarak, waktu, dan kecepatan',
    formula: '$s = v \\times t$, jadi $v = \\frac{s}{t}$ dan $t = \\frac{s}{v}$.',
    note: 'Samakan satuan dulu: menit ke jam dibagi 60.',
    example: {
      question: 'Mobil melaju 60 km/jam selama 2 jam 30 menit. Jarak yang ditempuh … km.',
      solution: '$2$ jam $30$ menit $= 2{,}5$ jam, jadi $60 \\times 2{,}5 = 150$ km.',
      expression: '60 * 2.5',
      answer: 150,
    },
  },
  {
    id: 'berpapasan',
    topic: 'Soal Cerita',
    title: 'Berpapasan (saling mendekat)',
    formula: '$t = \\frac{\\text{jarak}}{v_1 + v_2}$ bila keduanya berangkat bersamaan.',
    example: {
      question: 'Kota A dan B berjarak 300 km. Dari A melaju 70 km/jam, dari B 50 km/jam, berangkat bersamaan. Mereka berpapasan setelah … jam.',
      solution: '$\\frac{300}{70 + 50} = 2{,}5$ jam.',
      expression: '300 / (70 + 50)',
      answer: 2.5,
    },
  },
  {
    id: 'menyusul',
    topic: 'Soal Cerita',
    title: 'Menyusul',
    formula: '$t = \\frac{\\text{jarak yang sudah ditempuh yang di depan}}{v_2 - v_1}$, dihitung sejak yang menyusul berangkat.',
    example: {
      question: 'A berangkat pukul 07.00 dengan 40 km/jam. B menyusul pukul 08.00 dengan 60 km/jam. B menyusul A setelah berkendara … jam.',
      solution: 'Saat B berangkat, A sudah menempuh $40$ km. Jadi $\\frac{40}{60 - 40} = 2$ jam (pukul 10.00).',
      expression: '40 * 1 / (60 - 40)',
      answer: 2,
    },
  },
  {
    id: 'kerja-bersama',
    topic: 'Soal Cerita',
    title: 'Kerja bersama',
    formula: '$\\frac{1}{T} = \\frac{1}{A} + \\frac{1}{B}$, jadi untuk dua orang $T = \\frac{A \\times B}{A + B}$.',
    example: {
      question: 'A menyelesaikan pekerjaan dalam 6 hari, B dalam 3 hari. Bila bekerja bersama, selesai dalam … hari.',
      solution: '$\\frac{6 \\times 3}{6 + 3} = 2$ hari.',
      expression: '6 * 3 / (6 + 3)',
      answer: 2,
    },
  },
  {
    id: 'untung-rugi',
    topic: 'Soal Cerita',
    title: 'Untung dan rugi',
    formula: 'Untung $= \\text{jual} - \\text{beli}$. Persentase untung $= \\frac{\\text{untung}}{\\text{beli}} \\times 100\\%$.',
    note: 'Persentase untung atau rugi dihitung dari harga beli.',
    example: {
      question: 'Barang dibeli Rp50.000 dan dijual Rp60.000. Persentase untungnya …',
      solution: '$\\frac{10.000}{50.000} \\times 100\\% = 20\\%$.',
      expression: '(60000 - 50000) / 50000 * 100',
      answer: 20,
    },
  },
  {
    id: 'bunga-tunggal',
    topic: 'Soal Cerita',
    title: 'Bunga tunggal',
    formula: 'Bunga $= M \\times p \\times t$, dengan $M$ modal, $p$ suku bunga per tahun, dan $t$ lama dalam tahun.',
    example: {
      question: 'Tabungan Rp5.000.000 dengan bunga tunggal 6% per tahun. Bunga setelah 2 tahun …',
      solution: '$5.000.000 \\times 0{,}06 \\times 2 = 600.000$.',
      expression: '5000000 * 0.06 * 2',
      answer: 600000,
    },
  },

  /* ------------------------------------------------------------ Perbandingan Kuantitatif */
  {
    id: 'perbandingan-senilai',
    topic: 'Perbandingan Kuantitatif',
    title: 'Perbandingan senilai',
    formula: '$\\frac{a_1}{b_1} = \\frac{a_2}{b_2}$: bila yang satu naik, yang lain naik sebanding.',
    example: {
      question: '4 kg beras seharga Rp30.000. Harga 10 kg …',
      solution: '$\\frac{30.000}{4} \\times 10 = 75.000$.',
      expression: '30000 / 4 * 10',
      answer: 75000,
    },
  },
  {
    id: 'perbandingan-berbalik-nilai',
    topic: 'Perbandingan Kuantitatif',
    title: 'Perbandingan berbalik nilai',
    formula: '$a_1 \\times b_1 = a_2 \\times b_2$: bila yang satu naik, yang lain turun.',
    note: 'Contoh khas: banyak pekerja dan lama pekerjaan.',
    example: {
      question: '12 pekerja menyelesaikan bangunan dalam 15 hari. Dengan 18 pekerja, selesai dalam … hari.',
      solution: '$\\frac{12 \\times 15}{18} = 10$ hari.',
      expression: '12 * 15 / 18',
      answer: 10,
    },
  },
  {
    id: 'membagi-perbandingan',
    topic: 'Perbandingan Kuantitatif',
    title: 'Membagi menurut perbandingan',
    formula: 'Bagian $= \\frac{\\text{angka perbandingannya}}{\\text{jumlah angka perbandingan}} \\times \\text{total}$.',
    example: {
      question: 'Uang Rp1.200.000 dibagi kepada tiga orang dengan perbandingan 2 : 3 : 5. Bagian terbesar …',
      solution: '$\\frac{5}{2 + 3 + 5} \\times 1.200.000 = 600.000$.',
      expression: '5 / (2 + 3 + 5) * 1200000',
      answer: 600000,
    },
  },
  {
    id: 'membandingkan-p-q',
    topic: 'Perbandingan Kuantitatif',
    title: 'Membandingkan dua besaran (P dan Q)',
    formula: 'Hitung atau sederhanakan P dan Q sampai bentuknya sama, lalu bandingkan: P > Q, P < Q, P = Q, atau tidak dapat ditentukan.',
    note: 'Pilih "tidak dapat ditentukan" hanya bila hubungannya bergantung pada nilai yang tidak diketahui.',
    example: {
      question: 'P = 25% dari 80, Q = 80% dari 25. Hubungan P dan Q …',
      solution: '$P = 0{,}25 \\times 80 = 20$ dan $Q = 0{,}8 \\times 25 = 20$, jadi $P = Q$.',
      expression: '0.25 * 80 - 0.8 * 25',
      answer: 0,
    },
  },

  /* ------------------------------------------------------------ Silogisme */
  {
    id: 'modus-ponens',
    topic: 'Silogisme',
    title: 'Modus ponens',
    formula: 'Jika $p$ maka $q$. $p$ terjadi. Kesimpulan: $q$.',
    example: {
      question: 'Jika hujan, jalan basah. Hari ini hujan. Kesimpulannya …',
      solution: 'Jalan basah.',
    },
  },
  {
    id: 'modus-tollens',
    topic: 'Silogisme',
    title: 'Modus tollens',
    formula: 'Jika $p$ maka $q$. $q$ tidak terjadi. Kesimpulan: $p$ tidak terjadi.',
    example: {
      question: 'Jika hujan, jalan basah. Jalan tidak basah. Kesimpulannya …',
      solution: 'Tidak hujan.',
    },
  },
  {
    id: 'silogisme-hipotetis',
    topic: 'Silogisme',
    title: 'Silogisme (rantai jika–maka)',
    formula: 'Jika $p$ maka $q$. Jika $q$ maka $r$. Kesimpulan: jika $p$ maka $r$.',
    example: {
      question: 'Jika rajin belajar, nilai bagus. Jika nilai bagus, lulus seleksi. Kesimpulannya …',
      solution: 'Jika rajin belajar, lulus seleksi.',
    },
  },
  {
    id: 'silogisme-kategoris',
    topic: 'Silogisme',
    title: 'Silogisme kategoris (semua dan sebagian)',
    formula: 'Semua A adalah B, dan semua B adalah C, jadi semua A adalah C. Semua A adalah B, dan sebagian C adalah A, jadi sebagian C adalah B.',
    note: 'Bila kedua premis memakai "sebagian", tidak ada kesimpulan yang pasti.',
    example: {
      question: 'Semua pegawai negeri wajib mengikuti apel. Sebagian warga desa adalah pegawai negeri. Kesimpulannya …',
      solution: 'Sebagian warga desa wajib mengikuti apel.',
    },
  },
  {
    id: 'kekeliruan-penalaran',
    topic: 'Silogisme',
    title: 'Dua kekeliruan yang sering menjebak',
    formula:
      'Dari "jika $p$ maka $q$" dan "$q$ terjadi" **tidak** bisa disimpulkan $p$ (menegaskan konsekuen). Dari "jika $p$ maka $q$" dan "$p$ tidak terjadi" **tidak** bisa disimpulkan $q$ tidak terjadi (mengingkari anteseden).',
    example: {
      question: 'Jika hujan, jalan basah. Jalan basah. Apakah pasti hujan?',
      solution: 'Tidak pasti: jalan bisa basah karena hal lain, misalnya disiram. Jawaban yang benar biasanya "tidak dapat disimpulkan".',
    },
  },
];
