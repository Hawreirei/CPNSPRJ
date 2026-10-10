import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, keyAndSet, KEY, test } from './fixtures';

/** Exam on the set: answer the first questions (TWK) as given, leave the rest empty. */
async function takeExam(page: Page, setUrl: string, answers: string[]) {
  await page.goto(setUrl);
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (const answer of answers) {
    await page.keyboard.press(answer.toLowerCase());
    await page.keyboard.press('ArrowRight');
  }
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
}

test('the report explains the score and the progress page shows the trend', async ({ page }) => {
  const setUrl = await keyAndSet(page);

  const right = KEY;
  const wrong = KEY === 'A' ? 'B' : 'A';
  await takeExam(page, setUrl, []);
  await takeExam(page, setUrl, Array(5).fill(right));
  // Last exam: 4 right, 6 wrong, 20 empty.
  await takeExam(page, setUrl, [...Array(4).fill(right), ...Array(6).fill(wrong)]);

  // Report of the last exam: concrete advice first.
  const advice = page.locator('section', { hasText: 'Saran untuk latihan berikutnya' });
  await expect(advice).toBeVisible();
  await expect(advice).toContainText('20 soal tidak dijawab.');
  await expect(page.getByRole('heading', { name: 'Waktu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ragu-ragu dan tebakan' })).toBeVisible();
  await expect(page.getByText('Butuh minimal 3 jawaban bertanda ragu-ragu', { exact: false })).toBeVisible();

  // Every TWK topic has one question in this set, so the advice is about TWK as a whole.
  await expect(advice).toContainText('Latih TWK: 6 dari 10 jawaban salah');

  // The weak-topic advice opens practice mode on those topics.
  await advice.getByRole('link', { name: 'Latih sekarang' }).click();
  await expect(page.getByRole('radio', { name: /Latihan/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Topik yang dilatih (6 soal)')).toBeVisible();

  // TWK went 0 → 5 → 4 right of 10: 0 → 75 → 60 on the full 150-point scale, a fitted +30 per exam.
  await page.goto('#/progress');
  const trends = page.locator('section', { hasText: 'Tren' }).first();
  await expect(trends).toContainText('Naik rata-rata 30 poin per ujian.');
  await expect(trends).toContainText('Perkiraan kasar ujian berikutnya');
  await expect(trends.getByText('Paling membaik')).toBeVisible();
  await expect(trends.getByText('Paling menurun')).toBeVisible();

  // Number keys put a sub-test on the large chart; the score history downloads as CSV.
  await page.keyboard.press('3');
  await expect(page.getByRole('button', { name: 'Tampilkan TKP sebagai grafik utama' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tampilkan TWK sebagai grafik utama' })).toBeVisible();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Unduh CSV' }).click()]);
  expect(csv.suggestedFilename()).toBe('riwayat-skor.csv');
  const lines = (await readFile((await csv.path())!, 'utf8')).trimEnd().split('\r\n');
  expect(lines[0]).toBe('\uFEFFTanggal;Set;Mode;TWK;TWK maks;TIU;TIU maks;TKP;TKP maks;Total;Total maks;Status');
  expect(lines).toHaveLength(4);
  expect(lines[3]).toContain(';ujian;20;50;');
});
