import { expect, seriousViolations, test } from './fixtures';

test('Lab Pola makes a question of the chosen kind, traces its rules, and turns it into practice', async ({ page }) => {
  await page.goto('#/lab');
  await expect(page.getByRole('heading', { name: 'Lab Pola Figural' })).toBeVisible();
  // A series recipe at sulit: a question appears at once, no API key needed.
  await page.getByRole('button', { name: /^Deret orbit/ }).click();
  await page.getByRole('button', { name: 'sulit', exact: true }).click();
  await expect(page.getByRole('button', { name: /^A / })).toBeVisible();
  await page.getByRole('button', { name: /^A / }).click();
  await expect(page.getByText(/^Pembahasan/)).toBeVisible();

  // Telusuri pola: step to the "?", which then shows the answer's picture.
  await page.getByText('Telusuri pola').click();
  const step = page.getByText(/^Langkah \d+ dari \d+/);
  await expect(step).toHaveText(/^Langkah 1 dari/);
  for (let i = 0; i < 8 && !(await step.textContent())?.includes('tanda tanya'); i++) await page.getByRole('button', { name: 'Berikutnya →' }).click();
  await expect(step).toContainText('tanda tanya');

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page), scheme).toEqual([]);
  }

  // Cubes: another topic, another recipe.
  await page.getByRole('button', { name: 'Ruang dan Kubus', exact: true }).click();
  await page.getByRole('button', { name: /^Sisi berhadapan/ }).click();
  await expect(page.getByRole('img', { name: /^Gambar 1: Kubus/ })).toBeVisible();

  // Ten questions of that kind as a practice set, made on the device.
  await page.getByRole('button', { name: 'Latihan 10 soal jenis ini' }).click();
  await page.waitForURL(/#\/simulation\?set=/);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
});
