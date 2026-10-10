import { db } from '../db';
import { isGraded } from '../domain/examPackage';
import { CROSS_CHECK_KINDS } from '../domain/quality';

const VALIDATOR_VERSION = '2';

/**
 * Re-run the answer checks on saved questions once, after the checks themselves improve. Runs at
 * every startup, so the checks (and the code they share with other pages) load only when needed (#57).
 */
export async function revalidateStored() {
  try {
    if (localStorage.getItem('validatorVersion') === VALIDATOR_VERSION) return;
  } catch {
    return;
  }
  const qs = await db.questions.filter((q) => !isGraded(q.subtest) && q.source !== 'procedural' && !q.locked).toArray();
  if (qs.length) {
    const { loadMath, validateQuestion } = await import('../domain/validators');
    await loadMath();
    const changed = qs.flatMap((q) => {
      const v = validateQuestion(q);
      // Flags from outside the validator (duplicates, a second model's opinion) survive re-checking.
      const next = { ...v, flags: [...v.flags, ...q.flags.filter((f) => f.kind === 'duplicate' || CROSS_CHECK_KINDS.has(f.kind))] };
      return JSON.stringify(next.flags) !== JSON.stringify(q.flags) || next.answer !== q.answer ? [next] : [];
    });
    if (changed.length) await db.questions.bulkPut(changed);
  }
  try {
    localStorage.setItem('validatorVersion', VALIDATOR_VERSION);
  } catch {
    // Private mode: the check simply runs again next time.
  }
}
