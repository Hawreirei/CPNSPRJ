/*
 * Kartu Hafalan TWK, lembaga negara (#61): which ayat of the 1945 Constitution goes on which card.
 * Curated by hand; the text itself is never written here. Every card's answer is read from
 * src/data/uud1945.json (the official text), so it is always an exact quote, and
 * src/__tests__/lembagaNegara.test.ts checks every reference.
 *
 * Left out: ayat that only say a matter "diatur dengan undang-undang" (19(2), 20A(4), 22A, 22C(4),
 * 23G(2), 24A(5), 24B(4), 24C(6)), nothing to memorise there; and 20A(3), held back until its
 * wording in the data is checked against the PDF (see docs/kartu-hafalan.md).
 */

export interface LembagaRef {
  pasal: string;
  /** Absent for an article without ayat. */
  ayat?: number;
  /** The prompt on the front. It names the subject only; the answer is the quoted ayat. */
  front: string;
}

export interface Lembaga {
  id: string;
  name: string;
  /** The articles of its own chapter (or section) in the Constitution; every reference must fall in it. */
  pasal: string[];
  refs: LembagaRef[];
}

export const LEMBAGA_NEGARA: Lembaga[] = [
  {
    id: 'mpr',
    name: 'Majelis Permusyawaratan Rakyat (MPR)',
    pasal: ['2', '3'],
    refs: [
      { pasal: '2', ayat: 1, front: 'Keanggotaan MPR' },
      { pasal: '2', ayat: 2, front: 'Persidangan MPR' },
      { pasal: '2', ayat: 3, front: 'Cara MPR menetapkan putusan' },
      { pasal: '3', ayat: 1, front: 'Wewenang MPR atas Undang-Undang Dasar' },
      { pasal: '3', ayat: 2, front: 'Peran MPR saat Presiden dan/atau Wakil Presiden mulai menjabat' },
      { pasal: '3', ayat: 3, front: 'MPR dan pemberhentian Presiden dan/atau Wakil Presiden' },
    ],
  },
  {
    id: 'dpr',
    name: 'Dewan Perwakilan Rakyat (DPR)',
    pasal: ['19', '20', '20A', '21', '22', '22A', '22B'],
    refs: [
      { pasal: '19', ayat: 1, front: 'Cara anggota DPR dipilih' },
      { pasal: '19', ayat: 3, front: 'Persidangan DPR' },
      { pasal: '20', ayat: 1, front: 'Kekuasaan yang dipegang DPR' },
      { pasal: '20', ayat: 2, front: 'Pembahasan rancangan undang-undang' },
      { pasal: '20', ayat: 3, front: 'Rancangan undang-undang yang tidak mendapat persetujuan bersama' },
      { pasal: '20', ayat: 4, front: 'Pengesahan rancangan undang-undang yang telah disetujui bersama' },
      { pasal: '20', ayat: 5, front: 'Rancangan undang-undang yang telah disetujui bersama tetapi tidak disahkan Presiden' },
      { pasal: '20A', ayat: 1, front: 'Fungsi DPR' },
      { pasal: '20A', ayat: 2, front: 'Hak DPR dalam melaksanakan fungsinya' },
      { pasal: '21', front: 'Hak anggota DPR atas rancangan undang-undang' },
      { pasal: '22', ayat: 1, front: 'Peraturan pemerintah sebagai pengganti undang-undang: kapan dan oleh siapa' },
      { pasal: '22', ayat: 2, front: 'Persetujuan DPR atas peraturan pemerintah sebagai pengganti undang-undang' },
      { pasal: '22', ayat: 3, front: 'Peraturan pemerintah sebagai pengganti undang-undang yang tidak disetujui DPR' },
      { pasal: '22B', front: 'Pemberhentian anggota DPR' },
    ],
  },
  {
    id: 'dpd',
    name: 'Dewan Perwakilan Daerah (DPD)',
    pasal: ['22C', '22D'],
    refs: [
      { pasal: '22C', ayat: 1, front: 'Cara anggota DPD dipilih' },
      { pasal: '22C', ayat: 2, front: 'Jumlah anggota DPD' },
      { pasal: '22C', ayat: 3, front: 'Persidangan DPD' },
      { pasal: '22D', ayat: 1, front: 'Rancangan undang-undang yang dapat diajukan DPD kepada DPR' },
      { pasal: '22D', ayat: 2, front: 'Keikutsertaan DPD dalam membahas rancangan undang-undang, dan pertimbangan yang diberikannya' },
      { pasal: '22D', ayat: 3, front: 'Pengawasan oleh DPD' },
      { pasal: '22D', ayat: 4, front: 'Pemberhentian anggota DPD' },
    ],
  },
  {
    id: 'bpk',
    name: 'Badan Pemeriksa Keuangan (BPK)',
    pasal: ['23E', '23F', '23G'],
    refs: [
      { pasal: '23E', ayat: 1, front: 'Tugas dan sifat BPK' },
      { pasal: '23E', ayat: 2, front: 'Kepada siapa hasil pemeriksaan keuangan negara diserahkan' },
      { pasal: '23E', ayat: 3, front: 'Tindak lanjut hasil pemeriksaan BPK' },
      { pasal: '23F', ayat: 1, front: 'Pemilihan dan peresmian anggota BPK' },
      { pasal: '23F', ayat: 2, front: 'Pemilihan pimpinan BPK' },
      { pasal: '23G', ayat: 1, front: 'Kedudukan dan perwakilan BPK' },
    ],
  },
  {
    id: 'ma',
    name: 'Mahkamah Agung (MA)',
    pasal: ['24A'],
    refs: [
      { pasal: '24A', ayat: 1, front: 'Wewenang Mahkamah Agung' },
      { pasal: '24A', ayat: 2, front: 'Syarat hakim agung' },
      { pasal: '24A', ayat: 3, front: 'Pengusulan, persetujuan, dan penetapan calon hakim agung' },
      { pasal: '24A', ayat: 4, front: 'Pemilihan ketua dan wakil ketua Mahkamah Agung' },
    ],
  },
  {
    id: 'ky',
    name: 'Komisi Yudisial (KY)',
    pasal: ['24B'],
    refs: [
      { pasal: '24B', ayat: 1, front: 'Sifat dan wewenang Komisi Yudisial' },
      { pasal: '24B', ayat: 2, front: 'Syarat anggota Komisi Yudisial' },
      { pasal: '24B', ayat: 3, front: 'Pengangkatan dan pemberhentian anggota Komisi Yudisial' },
    ],
  },
  {
    id: 'mk',
    name: 'Mahkamah Konstitusi (MK)',
    pasal: ['24C'],
    refs: [
      { pasal: '24C', ayat: 1, front: 'Wewenang Mahkamah Konstitusi' },
      { pasal: '24C', ayat: 2, front: 'Kewajiban Mahkamah Konstitusi' },
      { pasal: '24C', ayat: 3, front: 'Jumlah hakim konstitusi, siapa yang menetapkan, dan siapa yang mengajukan' },
      { pasal: '24C', ayat: 4, front: 'Pemilihan Ketua dan Wakil Ketua Mahkamah Konstitusi' },
      { pasal: '24C', ayat: 5, front: 'Syarat hakim konstitusi' },
    ],
  },
];
