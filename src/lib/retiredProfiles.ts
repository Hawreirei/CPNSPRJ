import { getSettings, saveSettings } from '../db';
import { BUILTIN_ID, BUILTIN_PROFILE } from '../domain/blueprint';

/**
 * Built-in profiles taken out of the app: SKD Sekolah Kedinasan 2026 (in 1.2.0 and 1.3.0). A learner
 * still using one goes back to the app's own profile, numbers included, so its pass marks do not
 * stay on under another name. Runs at start-up, so it stays out of engine/kisi.ts and its zod.
 */
const RETIRED_PROFILES = new Set(['sekolah-kedinasan-2026']);

export async function retireRemovedProfiles(): Promise<void> {
  try {
    const k = (await getSettings()).kisi;
    if (!k || !RETIRED_PROFILES.has(k.activeId)) return;
    const exam = BUILTIN_PROFILE.exam!;
    await saveSettings({ kisi: { ...k, activeId: BUILTIN_ID }, counts: { ...exam.counts }, passing: { ...exam.passing }, durationMinutes: exam.durationMinutes });
  } catch {
    // Storage unavailable: nothing to change.
  }
}
