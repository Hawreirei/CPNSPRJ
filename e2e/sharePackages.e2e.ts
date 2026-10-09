import type { Browser } from '@playwright/test';
import { addGeminiKey, expect, seriousViolations, test } from './fixtures';

/** A brand-new browser profile: nothing stored, nothing shared but what we hand over. */
async function freshPage(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await ctx.route(
    (url) => url.hostname !== 'localhost',
    (route) => route.abort('blockedbyclient'),
  );
  return { ctx, page: await ctx.newPage() };
}

test('a PPPK set shared as a link imports into another browser and is scored by PPPK rules there', async ({ page, browser }) => {
  test.setTimeout(90_000);
  await addGeminiKey(page);
  await page.goto('#/new');
  await page.getByRole('radio', { name: 'PPPK 2024' }).click();
  await page.getByLabel('Nama jabatan yang dilamar').fill('Arsiparis Ahli Pertama');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('Semua soal selesai dibuat')).toBeVisible({ timeout: 60_000 });

  // A small set from the bank, so the link stays short: two technical and two socio-cultural questions.
  await page.goto('#/bank');
  for (const sub of ['PPPK-TEKNIS', 'PPPK-SOSKUL']) {
    await page.getByRole('button', { name: sub, exact: true }).click();
    const picks = page.getByRole('checkbox', { name: 'Pilih soal' });
    await picks.nth(0).check();
    await picks.nth(1).check();
  }
  page.once('dialog', (d) => void d.accept('PPPK kecil'));
  await page.getByRole('button', { name: 'Jadikan set baru' }).click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await page.getByRole('button', { name: 'Bagikan' }).click();
  const link = await page.getByRole('dialog').getByRole('textbox', { name: 'Tautan set' }).inputValue();
  expect(link).toContain('#/import?d=');

  const b = await freshPage(browser);
  await b.page.goto(link.replace(/^.*?#/, '/#'));
  await expect(b.page.getByText(/^4 soal: PPPK-TEKNIS 2, PPPK-SOSKUL 2\./)).toBeVisible();
  expect(await seriousViolations(b.page)).toEqual([]);
  await b.page.getByRole('button', { name: 'Impor set' }).click();
  await b.page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(b.page.locator('article')).toHaveCount(4);
  await expect(b.page.getByText('perlu dicek')).toHaveCount(0);

  // The receiver takes it as an exam: key A scores 5 in the technical part, option A scores 4 in the graded one.
  await b.page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await expect(b.page.getByText('PPPK-TEKNIS: tanpa ambang batas')).toBeVisible();
  await b.page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(b.page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await b.page.keyboard.press('a');
    await b.page.keyboard.press('ArrowRight');
  }
  await b.page.getByRole('button', { name: 'Selesai' }).click();
  await b.page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await b.page.waitForURL(/#\/results\//);
  await expect(b.page.getByText('kelulusan ditentukan peringkat')).toBeVisible();
  await expect(b.page.locator('.card', { hasText: 'Kompetensi Teknis' }).first()).toContainText('10/ 10');
  await expect(b.page.locator('.card', { hasText: 'Kompetensi Sosial Kultural' }).first()).toContainText('8/ 8');
  await b.ctx.close();
});
