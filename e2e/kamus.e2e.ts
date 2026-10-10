import { expect, keyAndSet, seriousViolations, test } from './fixtures';

test('Kamus Rumus TIU: searchable, formulas typeset, and linked from TIU explanations', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('link', { name: 'Kamus Rumus TIU' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kamus Rumus TIU', level: 1 })).toBeVisible();
  for (const topic of ['Deret Angka', 'Aritmetika', 'Soal Cerita', 'Perbandingan Kuantitatif', 'Silogisme'])
    await expect(page.getByRole('heading', { name: topic, level: 2 })).toBeVisible();
  // KaTeX loads with the first formula.
  await expect(page.locator('.katex').first()).toBeVisible();

  await page.getByRole('searchbox', { name: 'Cari rumus' }).fill('diskon');
  await expect(page.locator('article')).toHaveCount(1);
  const diskon = page.locator('article', { hasText: 'Diskon bertingkat' });
  await diskon.getByText('Contoh').click();
  await expect(diskon).toContainText('Jawab:');
  await page.getByRole('searchbox', { name: 'Cari rumus' }).fill('tidak ada rumus seperti ini');
  await expect(page.getByText('Tidak ada rumus yang cocok')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Cari rumus' }).fill('');

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page), scheme).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // From the explanation of a TIU question on a topic the dictionary covers, in a new tab.
  const setId = (await keyAndSet(page)).split('/').pop()!;
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
  await page.getByRole('button', { name: 'Semua', exact: true }).click();
  const link = page.getByRole('link', { name: /^Rumus .+ di Kamus Rumus TIU \(tab baru\)$/ }).first();
  await expect(link).toHaveAttribute('target', '_blank');
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await expect(tab).toHaveURL(/#\/kamus\?topik=/);
  await expect(tab.getByRole('heading', { name: 'Kamus Rumus TIU', level: 1 })).toBeVisible();
});
