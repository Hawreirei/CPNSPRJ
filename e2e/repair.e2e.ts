import { addGeminiKey, createMiniSet, expect, test } from './fixtures';

test('one button fixes every question marked "perlu dicek", in one request per sub-test', async ({ page, gemini }) => {
  // A second model disagrees with the key of the first two TWK questions, so both need checking.
  gemini.checkAnswer = (subtest, no) => (subtest === 'TWK' && no <= 2 ? 'B' : 'A');
  await addGeminiKey(page, { unlimited: true });
  await page.goto('#/settings');
  const toggle = page.getByRole('checkbox', { name: /Periksa silang setiap soal baru/ });
  await toggle.click();
  await expect(toggle).toBeChecked();
  await createMiniSet(page);

  const flagged = page.locator('article', { hasText: 'perlu dicek' });
  await expect(flagged).toHaveCount(2);
  const fixAll = page.getByRole('button', { name: '🔧 Perbaiki semua (2)' });
  await expect(fixAll).toBeVisible();
  // Fixing from the "Perlu dicek" view: when none are left, the whole set shows again.
  await page.getByRole('button', { name: 'Perlu dicek (2)' }).click();

  // The confirmation says how much AI it may use before anything is sent.
  page.once('dialog', (d) => {
    expect(d.message()).toContain('paling banyak 1 permintaan AI');
    void d.accept();
  });
  await fixAll.click();

  await expect(page.getByText('2 soal ditulis ulang oleh AI. Semua soal sudah sesuai.')).toBeVisible();
  await expect(flagged).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Perbaiki semua/ })).toHaveCount(0);
  await expect(page.locator('article')).toHaveCount(30);
  // Both TWK questions went back in a single request.
  expect(gemini.repairCalls).toBe(1);
});
