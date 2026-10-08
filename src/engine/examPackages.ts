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
  const settings = await getSettings();
  // Sub-test ids decide scoring, so they may not be shared with another package.
  for (const s of pkg.subtests) {
    const owner = packages().find((p) => p.id !== pkg.id && p.subtests.some((x) => x.id === s.id));
    if (owner) throw new Error(`Sub-tes "${s.id}" sudah dipakai paket "${owner.name}". Ganti id sub-tesnya di berkas.`);
  }
  const list = settings.examPackages ?? [];
  await saveSettings({ examPackages: list.some((p) => p.id === pkg.id) ? list.map((p) => (p.id === pkg.id ? pkg : p)) : [...list, pkg] });
  return pkg;
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
