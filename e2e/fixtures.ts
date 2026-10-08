import { test as base, expect, type Page } from '@playwright/test';

/**
 * Shared fixtures for the end-to-end suite.
 *
 * - `network` (automatic): every request that leaves localhost is aborted and recorded, and the
 *   test fails if any happened. No test can reach a real AI provider or spend real quota.
 * - `gemini`: a fake Gemini API that answers the model list and question generation from
 *   the prompt the app sends. Its questions always have key A (TKP: option A scores 5);
 *   reading passages come with exactly the questions asked for, and hard TKP options with reasons.
 */

const GEMINI_HOST = 'generativelanguage.googleapis.com';
export const FAKE_MODEL = 'gemini-3.5-flash';
/** Same set the app checks with mathjs; these topics get a `mathExpression`. */
const NUMERIC_TOPICS = new Set(['Aritmetika', 'Deret Angka', 'Soal Cerita', 'Perbandingan Kuantitatif']);
const LABELS = ['A', 'B', 'C', 'D', 'E'] as const;

export interface GeminiMock {
  /** generateContent calls received for writing questions. */
  generateCalls: number;
  /** Questions returned, per sub-test. */
  served: Record<string, number>;
  /** generateContent calls received from the cross-checker. */
  checkCalls: number;
  /** Prompts received by the tutor ("Tanya AI"). */
  tutorPrompts: string[];
  /** Page images received by the photo import: their type and size in base64 characters. */
  pageImages: { mimeType: string; length: number }[];
  /**
   * The checker's answer to question `no` (1-based) of a check request for `subtest`.
   * Defaults to the key (A; option A also scores 5 in TKP), i.e. agreement.
   */
  checkAnswer: (subtest: string, no: number, stem: string) => string;
}

let serial = 0;

/** Questions for one generation prompt, in the order and topics the prompt lists. */
export function fakeQuestions(prompt: string) {
  const subtest = /Sub-tes: ([A-Z][A-Z0-9-]+)/.exec(prompt)?.[1];
  if (!subtest) throw new Error(`Unexpected prompt: ${prompt.slice(0, 200)}`);
  // Graded sub-tests of other exam packages say their range, e.g. '"score" 1 sampai 4'.
  const graded = subtest === 'TKP' ? null : /"score" (\d+) sampai (\d+)/.exec(prompt);
  const slots = [...prompt.matchAll(/^\d+\. topik "([^"]+)", kesulitan (\w+)/gm)].map((m) => ({ topic: m[1], hard: m[2] === 'sulit' }));
  const questions = slots.map(({ topic, hard }) => {
    const n = ++serial;
    if (subtest === 'TKP') {
      return {
        topic,
        stem: `Situasi uji ${n} (${topic}): seorang warga meminta bantuan di luar jam layanan. Apa yang Anda lakukan?`,
        options: LABELS.map((label, i) => ({ label, text: `Tindakan ${label} untuk situasi ${n}`, score: 5 - i, ...(hard ? { rationale: `Alasan skor ${5 - i} untuk tindakan ${label} situasi ${n}` } : {}) })),
        explanation: `Tindakan A paling sesuai dengan nilai pelayanan publik (situasi ${n}).`,
        confidence: 'high',
      };
    }
    if (graded) {
      const [lo, hi] = [Number(graded[1]), Number(graded[2])];
      return {
        topic,
        stem: `Situasi uji ${subtest} ${n} (${topic}): apa yang paling tepat dilakukan?`,
        options: LABELS.map((label, i) => ({ label, text: `Jawaban ${label} untuk situasi ${n}`, score: Math.max(lo, hi - i) })),
        explanation: `Jawaban A paling tepat (situasi ${n}).`,
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

/** Reading passages for a passage prompt ("Wacana N: K soal"), or null for an ordinary prompt. */
export function fakePassages(prompt: string) {
  const plan = [...prompt.matchAll(/^Wacana \d+: (\d+) soal/gm)].map((m) => Number(m[1]));
  if (!plan.length) return null;
  const passages = plan.map((count) => {
    const p = ++serial;
    return {
      title: `Wacana uji ${p}`,
      text: `Ini wacana uji nomor ${p} tentang pelayanan publik di desa. Kantor desa membuka layanan daring agar warga tidak perlu antre. Sebagian warga lanjut usia masih memilih datang langsung, sehingga petugas tetap berjaga di loket.`,
      questions: Array.from({ length: count }, (_, k) => ({
        stem: `Pertanyaan ${k + 1} tentang wacana uji ${p}: apa gagasan yang tepat?`,
        options: LABELS.map((label) => ({ label, text: `Pernyataan ${label} untuk wacana ${p} soal ${k + 1}` })),
        answer: 'A',
        explanation: `Kalimat kedua wacana ${p} mendukung pernyataan A. Jawaban: A.`,
        confidence: 'high',
      })),
    };
  });
  return { passages, count: plan.reduce((a, b) => a + b, 0) };
}

export async function mockGemini(page: Page): Promise<GeminiMock> {
  const stats: GeminiMock = { generateCalls: 0, served: { TWK: 0, TIU: 0, TKP: 0 }, checkCalls: 0, tutorPrompts: [], pageImages: [], checkAnswer: () => 'A' };
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
      const body = req.postDataJSON() as { systemInstruction: { parts: { text: string }[] }; contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[] };
      const image = body.contents[0].parts.find((p) => p.inlineData)?.inlineData;
      if (image) {
        // Photo import: the same page every time, with a key printed, a key to propose, and a figure to skip.
        stats.pageImages.push({ mimeType: image.mimeType, length: image.data.length });
        const n = stats.pageImages.length;
        const questions = [
          { no: 1, subtest: 'TWK', topic: 'Pancasila', difficulty: 'mudah', stem: `Sila keempat Pancasila berbunyi … (halaman ${n})`, options: LABELS.map((label) => ({ label, text: `Bunyi sila ${label}` })), answer: 'D', answerFromPage: true, explanation: 'Sila keempat tentang kerakyatan.' },
          { no: 2, subtest: 'TIU', topic: 'Aritmetika', difficulty: 'sedang', stem: `Hasil dari 12 × 3 adalah … (halaman ${n})`, options: ['30', '33', '36', '39', '42'].map((text, i) => ({ label: LABELS[i], text })), answer: 'C', answerFromPage: false, explanation: '12 × 3 = 36.' },
          { no: 3, subtest: 'TIU', stem: 'Gambar manakah yang melanjutkan pola?', options: [], figure: true },
        ];
        return route.fulfill({
          json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 700 } },
        });
      }
      const prompt = body.contents[0].parts[0].text!;
      // "Uji koneksi" on the API Key page.
      if (prompt.startsWith('Balas tepat: {"ok": true}')) {
        return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '{"ok": true}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } } });
      }
      if (body.systemInstruction.parts[0].text.startsWith('Anda tutor')) {
        // The tutor doubts the key only when the learner asks whether it is wrong.
        stats.tutorPrompts.push(prompt);
        const question = /Pertanyaan pengguna: (.*)$/m.exec(prompt)?.[1] ?? '';
        const reply = { answer: `Penjelasan uji ${stats.tutorPrompts.length}: kunci A sesuai pembahasan.`, keyLooksWrong: /salah\?$/.test(question) && question.includes('kunci') };
        return route.fulfill({
          json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 80 } },
        });
      }
      if (body.systemInstruction.parts[0].text.includes('penguji')) {
        stats.checkCalls++;
        const subtest = /Untuk setiap soal (TWK|TIU|TKP)/.exec(prompt)?.[1] ?? '';
        const answers = [...prompt.matchAll(/^(\d+)\. (.*)$/gm)].map(([, no, stem]) => ({ no: Number(no), answer: stats.checkAnswer(subtest, Number(no), stem), reason: `alasan uji ${no}` }));
        return route.fulfill({
          json: { candidates: [{ content: { parts: [{ text: JSON.stringify({ answers }) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 60 * answers.length } },
        });
      }
      stats.generateCalls++;
      const reading = fakePassages(prompt);
      const reply = reading ? { subtest: 'TIU' as const, body: { passages: reading.passages }, count: reading.count } : (({ subtest, questions }) => ({ subtest, body: { questions }, count: questions.length }))(fakeQuestions(prompt));
      stats.served[reply.subtest] = (stats.served[reply.subtest] ?? 0) + reply.count;
      return route.fulfill({
        json: {
          candidates: [{ content: { parts: [{ text: JSON.stringify(reply.body) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300 * reply.count },
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

/** `unlimited` picks the paid-plan quota, for tests that send more than the free tier's 5 requests a minute. */
export async function addGeminiKey(page: Page, { unlimited = false } = {}) {
  await page.goto('#/keys');
  await page.getByPlaceholder('AIza…').fill('AIza-e2e-fake-key');
  if (unlimited) {
    await page.getByText('Pengaturan lanjutan (opsional)').click();
    await page.getByRole('combobox').filter({ has: page.getByRole('option', { name: /Tanpa batas/ }) }).selectOption({ label: 'Tanpa batas (akun berbayar)' });
  }
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
