import type { KisiProfile } from '../domain/types';

/*
 * SKD Sekolah Kedinasan 2026, from Keputusan MenPAN-RB Nomor 406 Tahun 2026 (27 Juli 2026), given
 * by the product owner in October 2026; see docs/paket-ujian.md for the file's hash. Every
 * number cites its diktum. It is the same SKD as for CPNS, with its own pass marks: these numbers
 * are not CPNS ones.
 *
 * Topics are the decree's sub-materials (Diktum KEDUA). Where the app already has a topic for one
 * (TIU's numeric and figural ones in particular), that name is used, so the app's own checks and
 * drawings still apply: "berhitung" is Aritmetika, figural "ketidaksamaan" is Figural Berbeda and
 * figural "serial" is Deret Figural.
 */
export const SEKOLAH_KEDINASAN_2026: KisiProfile = {
  version: 1,
  id: 'sekolah-kedinasan-2026',
  name: 'SKD Sekolah Kedinasan 2026',
  source: 'Keputusan MenPAN-RB Nomor 406 Tahun 2026',
  date: '2026-07-27',
  topics: {
    // Diktum KEDUA huruf a.
    TWK: [{ name: 'Nasionalisme' }, { name: 'Integritas' }, { name: 'Bela Negara' }, { name: 'Pilar Negara' }, { name: 'Bahasa Negara' }],
    // Diktum KEDUA huruf b: verbal (1), numerik (2), figural (3).
    TIU: [
      { name: 'Analogi Verbal' },
      { name: 'Silogisme' },
      { name: 'Penalaran Analitis' },
      { name: 'Aritmetika' },
      { name: 'Deret Angka' },
      { name: 'Perbandingan Kuantitatif' },
      { name: 'Soal Cerita' },
      { name: 'Analogi Figural' },
      { name: 'Figural Berbeda' },
      { name: 'Deret Figural' },
    ],
    // Diktum KEDUA huruf c.
    TKP: [
      { name: 'Pelayanan Publik' },
      { name: 'Jejaring Kerja' },
      { name: 'Sosial Budaya' },
      { name: 'Teknologi Informasi & Komunikasi' },
      { name: 'Profesionalisme' },
      { name: 'Anti Radikalisme' },
    ],
  },
  exam: {
    // Diktum KEEMPAT: 110 questions.
    counts: { TWK: 30, TIU: 35, TKP: 45 },
    // Diktum KEDELAPAN.
    passing: { TWK: 65, TIU: 80, TKP: 156 },
    // Diktum KETIGA.
    durationMinutes: 100,
  },
  notes: [
    'Peserta dari daerah tertentu yang mendapat afirmasi (diusulkan Kementerian/Lembaga penyelenggara dan disetujui Menteri) memakai ambang lain: nilai kumulatif SKD paling rendah 281 dan nilai TIU paling rendah 55 (Diktum KESEMBILAN dan KESEPULUH). Laporan Skor aplikasi menilai dengan ambang per sub-tes di atas.',
    'Angka ini khusus seleksi Sekolah Kedinasan 2026, bukan CPNS.',
  ],
};
