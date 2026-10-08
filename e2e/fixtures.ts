import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared fixtures for the end-to-end suite.
 *
 * - `network` (automatic): every request that leaves localhost is aborted and recorded, and the
 *   test fails if any happened. No test can reach a real AI provider or spend real quota.
 * - `gemini`: a fake Gemini API that answers the model list and question generation from
 *   the prompt the app sends. Its questions always have key A (TKP: option A scores 5).
 */

const GEMINI_HOST = 'generativelanguage.googleapis.com';
export const FAKE_MODEL = 'gemini-3.5-flash';
/** Same set the app checks with mathjs; these topics get a `mathExpression`. */
const NUMERIC_TOPICS = new Set(['Aritmetika', 'Deret Angka', 'Soal Cerita', 'Perbandingan Kuantitatif']);
const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface GeminiMock {
  /** generateContent calls received. */
  generateCalls: number;
  /** Questions returned, per sub-test. */
  served: Record<'TWK' | 'TIU' | 'TKP', number>;
}

let serial = 0;

/** Questions for one generation prompt, in the order and topics the prompt lists. */
export function fakeQuestions(prompt: string) {
  const subtest = /Sub-tes: (TWK|TIU|TKP)/.exec(prompt)?.[1] as 'TWK' | 'TIU' | 'TKP' | undefined;
  if (!subtest) throw new Error(`Unexpected prompt: ${prompt.slice(0, 200)}`);
  const topics = [...prompt.matchAll(/^\d+\. topik "([^"]+)"/gm)].map((m) => m[1]);
  const questions = topics.map((topic) => {
    const n = ++serial;
    if (subtest === 'TKP') {
      return {
        topic,
        stem: `Situasi uji ${n} (${topic}): seorang warga meminta bantuan di luar jam layanan. Apa yang Anda lakukan?`,
        options: LABELS.map((label, i) => ({ label, text: `Tindakan ${label} untuk situasi ${n}`, score: 5 - i })),
        explanation: `Tindakan A paling sesuai dengan nilai pelayanan publik (situasi ${n}).`,
        confidence: 'high',
      };
    }
    if (subtest === 'TIU' && NUMERIC_TOPICS.has(topic)) {
      return {
        topic,
        stem: `Soal hitung uji ${n} (${topic}): berapakah ${n} + 2?`,
        options: LABELS.map((label, i) => ({ label, text: String(n + 2 + i) })),
        answer: 'A',
        mathExpression: `${n} + 2`,
        explanation: `${n} + 2 = ${n + 2}. Jawaban: A.`,
        confidence: 'high',
      };
    }
    return {
      topic,
      stem: `Soal uji ${subtest} ${n} tentang ${topic}: pernyataan manakah yang paling tepat?`,
      options: LABELS.map((label) => ({ label, text: `Pernyataan ${label} untuk soal ${n}` })),
      answer: 'A',
      explanation: `Pernyataan A tepat untuk soal ${n}. Jawaban: A.`,
      ...(subtest === 'TWK' ? { reference: 'UUD 1945 Pasal 1 ayat (1)' } : {}),
      confidence: 'high',
    };
  });
  return { subtest, questions };
}

export async function mockGemini(page: Page): Promise<GeminiMock> {
  const stats: GeminiMock = { generateCalls: 0, served: { TWK: 0, TIU: 0, TKP: 0 } };
  await page.route(`https://${GEMINI_HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET' && url.pathname.endsWith('/models')) {
      return route.fulfill({
        json: {
          models: [
            { name: `models/${FAKE_MODEL}`, displayName: 'Gemini 3.5 Flash', supportedGenerationMethods: ['generateContent'] },
            { name: 'models/text-embedding-004', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
          ],
        },
      });
    }
    if (req.method() === 'POST' && url.pathname.endsWith(':generateContent')) {
      stats.generateCalls++;
      const body = req.postDataJSON() as { contents: { parts: { text: string }[] }[] };
      const { subtest, questions } = fakeQuestions(body.contents[0].parts[0].text);
      stats.served[subtest] += questions.length;
      return route.fulfill({
        json: {
          candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 * questions.length },
        },
      });
    }
    return route.fulfill({ status: 404, json: { error: { message: `Not mocked: ${req.method()} ${url.pathname}` } } });
  });
  return stats;
}

export const test = base.extend<{ network: string[]; gemini: GeminiMock }>({
  network: [
    async ({ context }, use) => {
      const leaked: string[] = [];
      await context.route(
        (url) => url.hostname !== 'localhost',
        (route) => {
          leaked.push(route.request().url());
          return route.abort('blockedbyclient');
        },
      );
      await use(leaked);
      expect(leaked, 'requests that left localhost').toEqual([]);
    },
    { auto: true },
  ],
  gemini: [
    async ({ page }, use) => {
      await use(await mockGemini(page));
    },
    { auto: true },
  ],
});

export { expect };

/* ------------------------------------------------------------------ flows */

export async function addGeminiKey(page: Page) {
  await page.goto('#/keys');
  await page.getByPlaceholder('AIza…').fill('AIza-e2e-fake-key');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  // The picked model shows up in the key's model selector.
  await expect(page.locator('option', { hasText: FAKE_MODEL }).first()).toBeAttached();
}

/** "Latihan Singkat": 10 TWK, 10 TIU, 10 TKP, generated through the fake Gemini. Returns the set page URL. */
export async function createMiniSet(page: Page): Promise<string> {
  await page.goto('#/new');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('Semua soal selesai dibuat')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('(30 dari 30 soal)')).toBeVisible();
  return page.url();
}

/** Another "Latihan Singkat" from questions already in the bank: no AI, no quota. */
export async function createSetFromBank(page: Page): Promise<string> {
  await page.goto('#/new');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await page.getByRole('button', { name: 'Ambil dari Bank Soal (tanpa AI)' }).click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  return page.url();
}

/** Set up a key and a ready 30-question set. */
export async function keyAndSet(page: Page) {
  await addGeminiKey(page);
  return createMiniSet(page);
}

/** Option A is the key of every AI question; procedural figural ones have their own key. */
export const KEY = 'A';
