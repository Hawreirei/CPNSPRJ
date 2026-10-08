import { addGeminiKey, createMiniSet, expect, FAKE_MODEL, test } from './fixtures';

test('a second model checks new questions blind and flags the one it disagrees with', async ({ page, gemini }) => {
  // The checker disagrees on the first TWK question only.
  gemini.checkAnswer = (subtest, no) => (subtest === 'TWK' && no === 1 ? 'B' : 'A');
  // Generation (3 requests) plus checking (3) exceeds the free tier's 5 a minute; avoid the wait.
  await addGeminiKey(page, { unlimited: true });

  await page.goto('#/settings');
  // Saved settings re-render the box a moment later, so click and wait rather than check().
  const toggle = page.getByRole('checkbox', { name: /Periksa silang setiap soal baru/ });
  await toggle.click();
  await expect(toggle).toBeChecked();

  // The plan panel says what checking adds before anything is sent.
  await page.goto('#/new');
  await page.getByRole('button', { name: /Latihan Singkat/ }).click();
  await expect(page.getByText(/Pemeriksa silang aktif: tambahan sekitar \d+ permintaan AI/)).toBeVisible();

  await createMiniSet(page);
  // TWK, TKP and the non-numeric TIU questions: one request per sub-test for a mini set.
  expect(gemini.checkCalls).toBe(3);

  // Exactly one question is flagged, with the checker's answer and reason; its key is unchanged.
  const flagged = page.locator('article', { hasText: 'perlu dicek' });
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText(`Pemeriksa silang (${FAKE_MODEL}) memilih jawaban B, bukan A`);
  await expect(flagged).toContainText('alasan uji 1');
  await expect(flagged).toContainText('kunci tidak diubah otomatis');
  // The others agreed.
  expect(await page.getByText('✓ diperiksa silang').count()).toBeGreaterThan(20);
  // Numeric and figural TIU are not sent to the checker.
  await page.getByRole('button', { name: 'TIU', exact: true }).click();
  const tiu = await page.locator('article').count();
  expect(await page.locator('article', { hasText: '✓ diperiksa silang' }).count()).toBeLessThan(tiu);
  await page.getByRole('button', { name: 'Semua', exact: true }).click();

  // Nothing left unchecked, so no bulk button.
  await expect(page.getByRole('button', { name: /Periksa silang \(/ })).toHaveCount(0);

  // Checking that one question again on demand: this time the checker agrees.
  gemini.checkAnswer = () => 'A';
  await flagged.locator('summary', { hasText: '⋯' }).click();
  await flagged.getByRole('button', { name: 'Periksa silang dengan model lain' }).click();
  await expect(page.locator('article', { hasText: 'perlu dicek' })).toHaveCount(0);
  expect(gemini.checkCalls).toBe(4);
});
