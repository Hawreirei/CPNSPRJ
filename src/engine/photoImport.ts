import { db, getSettings } from '../db';
import { topicsFor } from '../domain/blueprint';
import type { ExamPackage } from '../domain/examPackage';
import { buildImportPrompt, IMPORT_SYSTEM, imageTokens, pageCost, parseImportedPage, type ImportTarget, type PageResult } from '../domain/photoImport';
import type { Question, Subtest } from '../domain/types';
import { loadMath, validateQuestion } from '../domain/validators';
import type { LlmImage } from '../providers';
import { PROVIDERS } from '../providers';
import { resolveKey } from './keys';
import { priceFor } from './plan';
import { keyUsage } from './quota';
import { callModel, openSession } from './session';

/** A page ready to send: scaled, compressed, and its size for the cost estimate. */
export interface PageImage extends LlmImage {
  width: number;
  height: number;
}

export async function importTarget(pkg: ExamPackage, subtest?: Subtest): Promise<ImportTarget> {
  const settings = await getSettings();
  return { pkg, subtest, topics: Object.fromEntries(pkg.subtests.map((s) => [s.id, topicsFor(settings, s.id)])) };
}

export interface PageEstimate {
  provider: string;
  label: string;
  model: string;
  usd: number;
  /** Requests left today under the key's own limit; null when it has none. */
  remainingToday: number | null;
}

/** Where one page would go and what it would roughly cost; null without a key. */
export async function pageEstimate(target: ImportTarget, image: Pick<PageImage, 'width' | 'height'>): Promise<PageEstimate | null> {
  const key = await resolveKey();
  if (!key) return null;
  const price = priceFor(key.model, await getSettings());
  const usd = pageCost(buildImportPrompt(target), imageTokens(key.provider, image.width, image.height), price);
  return { provider: PROVIDERS[key.provider].name, label: key.label, model: key.model, usd, remainingToday: (await keyUsage(key)).remainingToday };
}

/** Send one page to the default key's model, within its quota, and read the questions on it. Stores nothing. */
export async function extractPage(target: ImportTarget, image: PageImage, signal: AbortSignal): Promise<PageResult> {
  await loadMath();
  const known = new Set<string>();
  await db.questions.each((q) => known.add(q.hash));
  const session = await openSession();
  const { mimeType, data } = image;
  return callModel(
    session,
    { system: IMPORT_SYSTEM, prompt: buildImportPrompt(target), images: [{ mimeType, data }] },
    (text) => parseImportedPage(text, target, known),
    signal,
    async () => {},
  );
}

/** Save the reviewed questions to the bank, still marked "perlu dicek" until the learner checks each one there. */
export async function saveImported(questions: Question[]): Promise<number> {
  await loadMath();
  const now = Date.now();
  const checked = questions.map((q) => validateQuestion({ ...q, source: 'import', confidence: 'low', createdAt: now, updatedAt: now }));
  await db.questions.bulkPut(checked);
  return checked.length;
}
