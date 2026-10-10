import { z } from 'zod';
import { isBuiltIn, type ExamPackage } from './examPackage';
import { SKD_SUBTESTS } from './types';

/**
 * Exam package files (#37): another exam's sub-tests, scoring rules and numbers, so an exam can
 * be added from its official document without a new app version. Numbers in such a file are only
 * as good as their source; a package without an official document is labelled "bukan data resmi".
 */

export const PACKAGE_VERSION = 1;

const int = (min: number, max: number, what: string) =>
  z
    .number({ error: `${what} harus berupa angka` })
    .int(`${what} harus bilangan bulat`)
    .min(min, `${what} minimal ${min}`)
    .max(max, `${what} paling besar ${max}`);

const scoringSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('keyed'), correct: int(1, 10, 'nilai jawaban benar') }),
  z
    .object({ kind: z.literal('graded'), min: int(0, 9, 'skor terendah'), max: int(1, 10, 'skor tertinggi') })
    .refine((r) => r.max > r.min, 'skor tertinggi harus lebih besar dari skor terendah'),
]);

const subtestSchema = z.object({
  id: z
    .string()
    .regex(/^[A-Z][A-Z0-9-]{1,23}$/, 'id sub-tes hanya huruf besar, angka, dan tanda minus (2–24 karakter)')
    .refine((id) => !(SKD_SUBTESTS as string[]).includes(id), 'id TWK, TIU, dan TKP milik SKD CPNS'),
  name: z.string().trim().min(1, 'nama sub-tes kosong').max(80),
  scoring: scoringSchema,
  count: int(1, 200, 'jumlah soal'),
  passing: z.number({ error: 'ambang batas harus berupa angka' }).min(0, 'ambang batas tidak boleh negatif').optional(),
  topics: z.array(z.string().trim().min(1).max(60)).max(40, 'paling banyak 40 topik').optional(),
  fromJobTitle: z.boolean().optional(),
  guide: z.string().trim().max(600, 'keterangan sub-tes paling panjang 600 karakter').optional(),
});

const packageSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{2,40}$/, 'id paket hanya huruf kecil, angka, dan tanda minus')
    .refine((id) => !isBuiltIn({ id }), 'id itu milik paket bawaan'),
  name: z.string().trim().min(1, 'nama paket kosong').max(80),
  source: z.string().trim().min(1, 'sumber kosong').max(200),
  official: z
    .object({
      title: z.string().trim().min(1, 'judul dokumen kosong').max(200),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'tanggal dokumen harus berformat YYYY-MM-DD'),
      url: z.url('alamat dokumen tidak valid').optional(),
    })
    .optional(),
  durationMinutes: int(1, 600, 'durasi'),
  notes: z.array(z.string().trim().min(1).max(400)).max(10).optional(),
  subtests: z.array(subtestSchema).min(1, 'butuh minimal satu sub-tes').max(10, 'paling banyak 10 sub-tes'),
});

const fileSchema = z.object({ app: z.literal('cpns-skd-builder'), kind: z.literal('exam-package'), version: z.number(), package: z.unknown() });

const maxScore = (s: ExamPackage['subtests'][number]) => (s.scoring.kind === 'keyed' ? s.scoring.correct : s.scoring.max);

/** Validate a package file. Throws with a message in Indonesian that says what is wrong. */
export function parsePackageFile(raw: unknown): ExamPackage {
  const file = fileSchema.safeParse(raw);
  if (!file.success) throw new Error('Berkas bukan paket ujian.');
  if (file.data.version > PACKAGE_VERSION) throw new Error('Paket ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi lalu coba lagi.');
  if (file.data.version < 1) throw new Error(`Versi paket ${file.data.version} tidak dikenal.`);

  const r = packageSchema.safeParse(file.data.package);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`Paket tidak valid${i.path.length ? ` (${i.path.join('.')})` : ''}: ${i.message}.`);
  }
  const p = r.data;
  const ids = new Set<string>();
  for (const s of p.subtests) {
    if (ids.has(s.id)) throw new Error(`Paket tidak valid: id sub-tes "${s.id}" dipakai dua kali.`);
    ids.add(s.id);
    if (!s.fromJobTitle && !s.topics?.length) throw new Error(`Paket tidak valid: sub-tes ${s.id} butuh daftar topik, atau "fromJobTitle": true.`);
    if (s.passing !== undefined && s.passing > s.count * maxScore(s)) throw new Error(`Paket tidak valid: ambang batas ${s.id} melebihi skor maksimal (${s.count * maxScore(s)}).`);
  }
  return {
    ...p,
    subtests: p.subtests.map((s) => ({
      ...s,
      ...(s.fromJobTitle ? { topics: undefined } : { topics: [...new Set(s.topics)] }),
    })),
  };
}

/** The file a package is shared as. */
export const packageFile = (pkg: ExamPackage): string => JSON.stringify({ app: 'cpns-skd-builder', kind: 'exam-package', version: PACKAGE_VERSION, package: pkg }, null, 2);
