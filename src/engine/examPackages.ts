import { db, getSettings, saveSettings } from '../db';
import { packageOf, packages, type ExamPackage } from '../domain/examPackage';
import { parsePackageFile } from '../domain/packageFile';

/** Read a package file and add it (or replace the package with the same id). */
export async function importPackage(text: string): Promise<ExamPackage> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Berkas bukan JSON yang valid.');
  }
  const pkg = parsePackageFile(raw);
  const clash = subtestClash(pkg);
  if (clash) throw new Error(`${clash} Ganti id sub-tesnya di berkas.`);
  await savePackage(pkg);
  return pkg;
}

/** Sub-test ids decide scoring, so they may not be shared with another package. Says which one clashes, if any. */
function subtestClash(pkg: ExamPackage): string | null {
  for (const s of pkg.subtests) {
    const owner = packages().find((p) => p.id !== pkg.id && p.subtests.some((x) => x.id === s.id));
    if (owner) return `Sub-tes "${s.id}" sudah dipakai paket "${owner.name}".`;
  }
  return null;
}

/** Add a package, or replace the one with the same id. */
async function savePackage(pkg: ExamPackage) {
  const list = (await getSettings()).examPackages ?? [];
  await saveSettings({ examPackages: list.some((p) => p.id === pkg.id) ? list.map((p) => (p.id === pkg.id ? pkg : p)) : [...list, pkg] });
}

/** The same package, whatever the order of its keys. */
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, canonical(x)]),
        )
      : v;

/**
 * Packages a shared set carries (#45), checked against the learner's own: which are new, and an error
 * when one would change a package they already have or clash with another. A package they have is
 * never replaced from a set, since its questions are scored by it.
 */
export function carriedPackages(carried: readonly ExamPackage[] = []): ExamPackage[] {
  const fresh: ExamPackage[] = [];
  for (const pkg of carried) {
    const mine = packages().find((p) => p.id === pkg.id);
    if (mine) {
      if (!sameJson(mine, pkg))
        throw new Error(
          `Anda sudah punya paket ujian "${mine.name}", tetapi isinya berbeda dengan paket di set ini. Samakan dulu lewat Pengaturan → Paket ujian (minta berkas paketnya dari pengirim).`,
        );
      continue;
    }
    const clash = subtestClash(pkg);
    if (clash) throw new Error(`Paket ujian "${pkg.name}" di set ini tidak bisa ditambahkan: ${clash}`);
    fresh.push(pkg);
  }
  return fresh;
}

/** Add the new packages a shared set carries, so its questions are scored by their own rules. */
export async function addCarriedPackages(carried: readonly ExamPackage[] = []): Promise<ExamPackage[]> {
  const fresh = carriedPackages(carried);
  for (const pkg of fresh) await savePackage(pkg);
  return fresh;
}

/** Questions stored for a package's sub-tests. */
export async function questionsInPackage(id: string): Promise<number> {
  return db.questions.filter((q) => packageOf(q.subtest).id === id).count();
}

/**
 * Remove an imported package. Refused while questions of it remain: without the package they
 * could no longer be scored by its rules.
 */
export async function deletePackage(id: string): Promise<void> {
  const n = await questionsInPackage(id);
  if (n) throw new Error(`Masih ada ${n} soal paket ini di Bank Soal. Hapus set dan soalnya dulu, atau biarkan paketnya terpasang.`);
  const settings = await getSettings();
  await saveSettings({ examPackages: (settings.examPackages ?? []).filter((p) => p.id !== id) });
}
