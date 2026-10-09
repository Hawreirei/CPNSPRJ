import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addGeminiKey, expect, test } from './fixtures';

async function download(page: Page, format: 'PDF' | 'Word') {
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: new RegExp(`^${format}`) }).click();
  await dialog.getByText('Lengkap', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: `Unduh ${format}` }).click()]);
  await page.keyboard.press('Escape');
  return readFile((await file.path())!);
}

/** The passage heading shown above question `n` of an exam or practice session. */
async function passageAt(page: Page, n: number) {
  await expect(page.getByText(`Soal ${n}`, { exact: true })).toBeVisible();
  const region = page.getByRole('region', { name: /^Bacaan untuk soal/ });
  return (await region.count()) ? (await region.getAttribute('aria-label'))! : null;
}

test('reading passages keep their questions together everywhere, and hard TKP explains every score', async ({ page }) => {
  await addGeminiKey(page);
  // TIU with five reading questions (passages of 3 and 2), plus three hard TKP questions.
  await page.goto('#/new');
  await page.getByRole('button', { name: /TIU saja/ }).click();
  await page.getByRole('button', { name: /^Sulit/ }).click();
  await page.getByText('Sesuaikan lebih lanjut (opsional)').click();
  const pressed = page.locator('button[aria-pressed="true"]', { hasText: /^✓ / });
  for (const name of (await pressed.allTextContents()).map((t) => t.replace(/^✓ /, '').replace(/ \(gratis\)$/, ''))) {
    if (name !== 'Pemahaman Bacaan') await page.getByRole('button', { name: new RegExp(`^✓ ${name}( \\(gratis\\))?$`) }).click();
  }
  await page.getByLabel('Jumlah').fill('5');
  await page.getByRole('checkbox', { name: /TKP/ }).check();
  await page.getByLabel('Jumlah').nth(1).fill('3');
  await page.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(page.getByText('Semua soal selesai dibuat')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('(8 dari 8 soal)')).toBeVisible();
  const setId = page.url().split('/').pop();

  // Set page: each passage in full above its first question, folded on the others.
  await expect(page.getByRole('region', { name: /^Bacaan untuk soal 1–3: Wacana uji/ })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Bacaan untuk soal 4–5: Wacana uji/ })).toBeVisible();
  await expect(page.locator('summary', { hasText: /^Bacaan untuk soal/ })).toHaveCount(3);
  // Hard TKP: a reason under every option in the explanation view.
  await page.getByRole('button', { name: 'Pembahasan', exact: true }).click();
  await expect(page.getByText(/^Alasan skor [1-5] untuk tindakan [A-E] situasi \d+$/)).toHaveCount(15);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id),
      scheme,
    ).toEqual([]);
  }

  const pdf = await download(page, 'PDF');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const docx = await download(page, 'Word');
  expect(docx.subarray(0, 2).toString()).toBe('PK');

  // Practice: the passage stays in view while moving through its questions.
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  const first = await passageAt(page, 1);
  expect(first).toMatch(/^Bacaan untuk soal 1–3: Wacana uji \d+$/);
  await page.keyboard.press('a');
  await page.keyboard.press('Enter');
  expect(await passageAt(page, 2)).toBe(first);

  // A shuffled exam moves whole passages: each passage's questions stay next to each other.
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByLabel('Acak urutan soal di dalam tiap sub-tes').check();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  const seen: (string | null)[] = [];
  for (let n = 1; n <= 5; n++) {
    seen.push(await passageAt(page, n));
    await page.keyboard.press('ArrowRight');
  }
  const titles = seen.map((s) => s!.replace(/^Bacaan untuk soal [\d–]+: /, ''));
  expect(new Set(titles).size).toBe(2);
  // Contiguous: the title changes exactly once, and each heading names the right numbers.
  expect(titles.filter((t, i) => i > 0 && t !== titles[i - 1])).toHaveLength(1);
  const split = titles.findIndex((t) => t !== titles[0]);
  expect(seen[0]).toMatch(new RegExp(`^Bacaan untuk soal 1–${split}:`));
  expect(seen[4]).toMatch(new RegExp(`^Bacaan untuk soal ${split + 1}–5:`));
});
