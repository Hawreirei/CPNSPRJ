import { expect, keyAndSet, test } from './fixtures';

test('answers land in no pattern, and the explanation follows the moved letters', async ({ page, gemini }) => {
  // The fake model puts every key at A, as models tend to favour one place; the app moves them.
  gemini.pinKeys = false;
  await keyAndSet(page);
  await page
    .getByRole('tab', { name: 'Pembahasan' })
    .or(page.getByRole('button', { name: 'Pembahasan', exact: true }))
    .first()
    .click();

  const cards = await page.locator('article').allInnerTexts();
  const keyed = cards
    .map((text) => ({ shown: /Jawaban: ([A-E])\n/.exec(text)?.[1], said: /Jawaban: ([A-E])\.\s*$/m.exec(text)?.[1], text }))
    .filter((c) => c.shown && /Pernyataan|Soal hitung/.test(c.text));
  expect(keyed.length).toBeGreaterThanOrEqual(15);

  const keys = keyed.map((c) => c.shown!);
  // Spread over the positions, not all at A.
  expect(new Set(keys).size).toBeGreaterThanOrEqual(4);
  expect(keys.filter((k) => k === 'A').length).toBeLessThan(keys.length / 2);
  // Never three in a row.
  for (let i = 2; i < keys.length; i++) expect(keys[i] === keys[i - 1] && keys[i] === keys[i - 2]).toBe(false);
  // The explanation's verdict follows its key, so nothing new needs checking.
  for (const c of keyed) expect(c.said).toBe(c.shown);
  await expect(page.getByText('perlu dicek')).toHaveCount(0);
});
