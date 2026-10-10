import AxeBuilder from '@axe-core/playwright';
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
  /** Whether fake questions keep their key at A (see `pinned`); false lets the app move answers. */
  pinKeys: boolean;
  /** Repair requests ("Perbaiki"): questions marked "perlu dicek" sent back to be rewritten. */
  repairCalls: number;
  /** How many of those were streamed (questions shown one by one as they are written). */
  streamCalls: number;
  /** The thinking setting each of those calls carried (Gemini 3 thinks at length unless told otherwise). */
  thinking: unknown[];
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

/**
 * The app moves each AI question's answer to a balanced random position (domain/shuffle), except
 * when an option points at the others. By default every fake question ends with such an option,
 * so its key stays at A and tests can answer with KEY; `pinKey: false` lets the app move it.
 */
const PINNED = 'Tidak ada pilihan di atas yang tepat';
function pinned<T extends { options: { text: string }[] }>(q: T, pinKey: boolean): T {
  return pinKey ? { ...q, options: q.options.map((o, i) => (i === q.options.length - 1 ? { ...o, text: PINNED } : o)) } : q;
}

/** Questions for one generation prompt, in the order and topics the prompt lists. */
export function fakeQuestions(prompt: string, pinKey = true) {
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
        options: LABELS.map((label, i) => ({
          label,
          text: `Tindakan ${label} untuk situasi ${n}`,
          score: 5 - i,
          ...(hard ? { rationale: `Alasan skor ${5 - i} untuk tindakan ${label} situasi ${n}` } : {}),
        })),
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
  return { subtest, questions: questions.map((q) => pinned(q, pinKey)) };
}

/**
 * Questions for a prompt that covers several sub-tests in one request ("=== Bagian N: K soal X"),
 * as free-tier keys send them: each part is answered on its own and every question names its sub-test.
 */
export function fakeMultiQuestions(prompt: string, pinKey = true) {
  if (!/^=== Bagian \d+: /m.test(prompt)) return null;
  return prompt
    .split(/^=== Bagian \d+: .*$/m)
    .slice(1)
    .map((part) => {
      const { subtest, questions } = fakeQuestions(part, pinKey);
      return { subtest, questions: questions.map((q) => ({ subtest, ...q })) };
    });
}

/** Reading passages for a passage prompt ("Wacana N: K soal"), or null for an ordinary prompt. */
export function fakePassages(prompt: string, pinKey = true) {
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
      })).map((q) => pinned(q, pinKey)),
    };
  });
  return { passages, count: plan.reduce((a, b) => a + b, 0) };
}

export async function mockGemini(page: Page): Promise<GeminiMock> {
  const stats: GeminiMock = {
    generateCalls: 0,
    pinKeys: true,
    repairCalls: 0,
    streamCalls: 0,
    thinking: [],
    served: { TWK: 0, TIU: 0, TKP: 0 },
    checkCalls: 0,
    tutorPrompts: [],
    pageImages: [],
    checkAnswer: () => 'A',
  };
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
    // Question generation streams its reply (streamGenerateContent, server-sent events); the rest don't.
    const streamed = url.pathname.endsWith(':streamGenerateContent');
    if (req.method() === 'POST' && (url.pathname.endsWith(':generateContent') || streamed)) {
      const body = req.postDataJSON() as {
        systemInstruction: { parts: { text: string }[] };
        contents: { parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] }[];
        generationConfig?: { thinkingConfig?: unknown };
      };
      const image = body.contents[0].parts.find((p) => p.inlineData)?.inlineData;
      if (image) {
        // Photo import: the same page every time, with a key printed, a key to propose, and a figure to skip.
        stats.pageImages.push({ mimeType: image.mimeType, length: image.data.length });
        const n = stats.pageImages.length;
        const questions = [
          {
            no: 1,
            subtest: 'TWK',
            topic: 'Pancasila',
            difficulty: 'mudah',
            stem: `Sila keempat Pancasila berbunyi … (halaman ${n})`,
            options: LABELS.map((label) => ({ label, text: `Bunyi sila ${label}` })),
            answer: 'D',
            answerFromPage: true,
            explanation: 'Sila keempat tentang kerakyatan.',
          },
          {
            no: 2,
            subtest: 'TIU',
            topic: 'Aritmetika',
            difficulty: 'sedang',
            stem: `Hasil dari 12 × 3 adalah … (halaman ${n})`,
            options: ['30', '33', '36', '39', '42'].map((text, i) => ({ label: LABELS[i], text })),
            answer: 'C',
            answerFromPage: false,
            explanation: '12 × 3 = 36.',
          },
          { no: 3, subtest: 'TIU', stem: 'Gambar manakah yang melanjutkan pola?', options: [], figure: true },
          {
            no: 4,
            subtest: 'TIU',
            topic: 'Aritmetika',
            difficulty: 'sedang',
            stem: `Berdasarkan grafik di atas, penjualan tertinggi terjadi pada tahun … (halaman ${n})`,
            options: ['2020', '2021', '2022', '2023', '2024'].map((text, i) => ({ label: LABELS[i], text })),
            answer: 'C',
            answerFromPage: true,
            explanation: 'Batang tertinggi ada pada tahun 2022.',
            figure: true,
          },
        ];
        return route.fulfill({
          json: {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 1800, candidatesTokenCount: 700 },
          },
        });
      }
      const prompt = body.contents[0].parts[0].text!;
      // "Uji koneksi" on the API Key page.
      if (prompt.startsWith('Balas tepat: {"ok": true}')) {
        return route.fulfill({
          json: { candidates: [{ content: { parts: [{ text: '{"ok": true}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } },
        });
      }
      if (body.systemInstruction.parts[0].text.startsWith('Anda tutor')) {
        // The tutor doubts the key only when the learner asks whether it is wrong.
        stats.tutorPrompts.push(prompt);
        const question = /Pertanyaan pengguna: (.*)$/m.exec(prompt)?.[1] ?? '';
        const reply = { answer: `Penjelasan uji ${stats.tutorPrompts.length}: kunci A sesuai pembahasan.`, keyLooksWrong: /salah\?$/.test(question) && question.includes('kunci') };
        return route.fulfill({
          json: {
            candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 80 },
          },
        });
      }
      if (body.systemInstruction.parts[0].text.includes('penguji')) {
        stats.checkCalls++;
        const subtest = /Untuk setiap soal (TWK|TIU|TKP)/.exec(prompt)?.[1] ?? '';
        const answers = [...prompt.matchAll(/^(\d+)\. (.*)$/gm)].map(([, no, stem]) => ({
          no: Number(no),
          answer: stats.checkAnswer(subtest, Number(no), stem),
          reason: `alasan uji ${no}`,
        }));
        return route.fulfill({
          json: {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ answers }) }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 800, candidatesTokenCount: 60 * answers.length },
          },
        });
      }
      if (prompt.includes('ditandai "perlu dicek"')) {
        // A repair: one rewritten question per "N. Masalah:" entry, in the same order, consistent again.
        stats.repairCalls++;
        const count = [...prompt.matchAll(/^\d+\. Masalah:/gm)].length;
        const slots = Array.from({ length: count }, (_, i) => `${i + 1}. topik "Perbaikan", kesulitan sedang`).join('\n');
        const { questions } = fakeQuestions(`${prompt}\n${slots}`, stats.pinKeys);
        return route.fulfill({
          json: {
            candidates: [{ content: { parts: [{ text: JSON.stringify({ questions }) }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 300 * count },
          },
        });
      }
      stats.generateCalls++;
      if (streamed) stats.streamCalls++;
      stats.thinking.push(body.generationConfig?.thinkingConfig);
      const reading = fakePassages(prompt, stats.pinKeys);
      const parts = reading
        ? [{ subtest: 'TIU', count: reading.count }]
        : (fakeMultiQuestions(prompt, stats.pinKeys) ?? [fakeQuestions(prompt, stats.pinKeys)]).map((p) => ({ ...p, count: p.questions.length }));
      for (const p of parts) stats.served[p.subtest] = (stats.served[p.subtest] ?? 0) + p.count;
      const reply = reading ? { passages: reading.passages } : { questions: parts.flatMap((p) => ('questions' in p ? p.questions : [])) };
      const count = parts.reduce((n, p) => n + p.count, 0);
      const usageMetadata = { promptTokenCount: 1200, candidatesTokenCount: 300 * count };
      if (streamed) {
        // The reply in pieces of 500 characters, as Gemini sends it, with the totals on the last one.
        const text = JSON.stringify(reply);
        const pieces = Array.from({ length: Math.ceil(text.length / 500) }, (_, i) => text.slice(i * 500, (i + 1) * 500));
        const events = pieces.map((piece, i) => ({
          candidates: [{ content: { parts: [{ text: piece }] }, ...(i === pieces.length - 1 ? { finishReason: 'STOP' } : {}) }],
          ...(i === pieces.length - 1 ? { usageMetadata } : {}),
        }));
        return route.fulfill({ contentType: 'text/event-stream', body: events.map((e) => `data: ${JSON.stringify(e)}\r\n\r\n`).join('') });
      }
      return route.fulfill({
        json: { candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] }, finishReason: 'STOP' }], usageMetadata },
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
    await page
      .getByRole('combobox')
      .filter({ has: page.getByRole('option', { name: /Tanpa batas/ }) })
      .selectOption({ label: 'Tanpa batas (akun berbayar)' });
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

/** Option A is the key of every fake AI question while `gemini.pinKeys` is on (the default); procedural figural ones have their own key. */
export const KEY = 'A';

/**
 * Serious and critical WCAG A/AA violations on the page as it is now, as "rule: element | element"
 * lines, so a failure says where. CSS transitions finish first: after a theme switch or a button
 * becoming enabled, colours fade for 150 ms and axe would measure them halfway (#68).
 */
export async function seriousViolations(page: Page, include?: string): Promise<string[]> {
  await page.waitForFunction(() => document.getAnimations().every((a) => !(a instanceof CSSTransition) || a.playState !== 'running'));
  const axe = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  const r = await (include ? axe.include(include) : axe).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
}
