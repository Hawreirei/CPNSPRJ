import { z } from 'zod';
import { PROCEDURAL_TOPICS } from './blueprint';
import { SUBTESTS } from './types';
import type { KisiProfile, KisiTopic, Subtest } from './types';

export const PROFILE_VERSION = 1;

/* ------------------------------------------------------------------ files */

const perSubtest = <T extends z.ZodType>(t: T) => z.object({ TWK: t, TIU: t, TKP: t });

const topicSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'nama topik kosong')
    .max(60, 'nama topik lebih dari 60 karakter')
    .refine((n) => !n.includes('|'), 'nama topik tidak boleh memuat "|"'),
  weight: z.number({ error: 'bobot harus berupa angka' }).positive('bobot harus lebih dari 0').max(10, 'bobot paling besar 10').optional(),
});

const profileSchema = z.object({
  name: z.string().trim().min(1, 'nama profil kosong').max(80, 'nama profil lebih dari 80 karakter'),
  source: z.string().trim().max(200).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'tanggal harus berformat YYYY-MM-DD')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  topics: perSubtest(z.array(topicSchema).min(1, 'butuh minimal satu topik').max(40, 'paling banyak 40 topik')),
  exam: z
    .object({
      counts: perSubtest(z.number().int().min(1, 'jumlah soal minimal 1').max(200, 'jumlah soal paling banyak 200')),
      passing: perSubtest(z.number().min(0, 'ambang batas tidak boleh negatif')),
      durationMinutes: z.number().int().min(1).max(600),
    })
    .optional(),
});

/**
 * Validate a profile from a file or the editor. Topic names are trimmed and de-duplicated; the
 * result gets the given id. Throws with a message in Indonesian that says what is wrong.
 */
export function parseProfile(raw: unknown, id: string): KisiProfile {
  if (!raw || typeof raw !== 'object') throw new Error('Berkas bukan profil kisi-kisi.');
  const version = (raw as { version?: unknown }).version;
  if (typeof version !== 'number' || !('topics' in raw)) throw new Error('Berkas bukan profil kisi-kisi.');
  if (version > PROFILE_VERSION) throw new Error('Profil ini dibuat oleh versi aplikasi yang lebih baru. Perbarui aplikasi lalu coba lagi.');
  if (version < 1) throw new Error(`Versi profil ${version} tidak dikenal.`);
  // Later versions migrate here, one step at a time, before validation.

  const r = profileSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new Error(`Profil tidak valid${i.path.length ? ` (${i.path.join('.')})` : ''}: ${i.message}.`);
  }
  const p = r.data;
  const topics = {} as Record<Subtest, KisiTopic[]>;
  for (const s of SUBTESTS) {
    const seen = new Set<string>();
    topics[s] = p.topics[s].filter((t) => {
      const key = t.name.toLocaleLowerCase('id-ID');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // Figural questions are drawn by the app for TIU only; a profile can use them there, not invent new ones.
    const misplaced = topics[s].find((t) => PROCEDURAL_TOPICS.has(t.name) && s !== 'TIU');
    if (misplaced) throw new Error(`Profil tidak valid: topik "${misplaced.name}" hanya bisa dipakai di TIU.`);
  }
  if (p.exam) {
    const over = SUBTESTS.find((s) => p.exam!.passing[s] > p.exam!.counts[s] * 5);
    if (over) throw new Error(`Profil tidak valid: ambang batas ${over} melebihi skor maksimal (${p.exam.counts[over] * 5}).`);
  }
  return { version: 1, id, name: p.name, ...(p.source ? { source: p.source } : {}), ...(p.date ? { date: p.date } : {}), topics, ...(p.exam ? { exam: p.exam } : {}) };
}

/** The file a profile is shared as. */
export function profileFile(p: KisiProfile): string {
  const { id: _id, ...rest } = p;
  return JSON.stringify({ app: 'cpns-skd-builder', kind: 'kisi', ...rest }, null, 2);
}

/** One topic per line, with an optional weight after a bar: "Pancasila | 2". */
export function topicsToText(topics: KisiTopic[]): string {
  return topics.map((t) => (t.weight !== undefined && t.weight !== 1 ? `${t.name} | ${t.weight}` : t.name)).join('\n');
}

export function textToTopics(text: string): KisiTopic[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, w] = line.split('|').map((x) => x.trim());
      const weight = w === undefined || w === '' ? undefined : Number(w.replace(',', '.'));
      return weight === undefined ? { name } : { name, weight };
    });
}
