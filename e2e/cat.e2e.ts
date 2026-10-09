import type { Locator, Page } from '@playwright/test';
import { expect, KEY, keyAndSet, seriousViolations, test } from './fixtures';

async function tabTo(page: Page, target: Locator, max = 80) {
  for (let i = 0; i < max; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Could not reach the element with the Tab key.');
}

/** What the page sees when the learner switches to another tab and back. */
const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

test('Mode CAT: full screen, a locked sub-test order and tab switches recorded, started, answered and sent by keyboard', async ({ page }) => {
  const setUrl = await keyAndSet(page);
  await page.clock.install();
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}`);

  // The order lock is only offered inside Mode CAT, and says it is not an official rule.
  await expect(page.getByLabel(/Kunci urutan sub-tes/)).toHaveCount(0);
  await tabTo(page, page.getByRole('checkbox', { name: /Mode CAT/ }));
  await page.keyboard.press('Space');
  const lock = page.getByRole('checkbox', { name: /Kunci urutan sub-tes/ });
  await expect(lock).toBeVisible();
  await expect(page.getByText('belum menemukan sumber resmi BKN')).toBeVisible();
  await tabTo(page, lock);
  await page.keyboard.press('Space');
  await expect(lock).toBeChecked();
  await tabTo(page, page.getByRole('button', { name: 'Mulai ujian' }));
  await page.keyboard.press('Enter');
  await page.waitForURL(/#\/cat\//);

  await expect(page.getByRole('heading', { name: 'Soal 1', exact: true })).toBeFocused();
  await expect(page.getByText('Mode CAT', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.getByRole('button', { name: 'Keluar layar penuh' })).toBeVisible();

  // TWK: answer all ten by keyboard.
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press(KEY.toLowerCase());
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press(KEY.toLowerCase());
  await expect(page.getByRole('heading', { name: 'Soal 10', exact: true })).toBeFocused();
  // The next sub-test cannot be reached early from the grid.
  await expect(page.getByRole('button', { name: 'Soal 15, belum dijawab, terkunci' })).toBeDisabled();

  // Past the last TWK question: asked first, and staying is possible.
  await page.keyboard.press('ArrowRight');
  const ask = page.getByRole('dialog');
  await expect(ask).toContainText('Terjawab 10 dari 10 soal TWK');
  expect(await seriousViolations(page)).toEqual([]);
  await ask.getByRole('button', { name: 'Tetap di TWK' }).click();
  await expect(page.getByRole('heading', { name: 'Soal 10', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Lanjut ke TIU →' }).click();
  await ask.getByRole('button', { name: 'Lanjut ke TIU' }).click();
  await expect(page.getByRole('heading', { name: 'Soal 11', exact: true })).toBeFocused();

  // No way back to TWK: not by arrow key, button, or grid.
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('heading', { name: 'Soal 11', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: '← Sebelumnya' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Soal 10, terjawab, terkunci' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Soal 12, belum dijawab', exact: true })).toBeEnabled();

  // Away from the tab for 7 seconds: a notice on return, nothing else.
  await setHidden(page, true);
  await page.clock.fastForward(7_000);
  await setHidden(page, false);
  const away = page.getByRole('dialog');
  await expect(away).toContainText('tidak terlihat selama 7d');
  expect(await seriousViolations(page)).toEqual([]);
  await away.getByRole('button', { name: 'Lanjutkan ujian' }).click();

  // Leaving full screen is not leaving the tab.
  await page.getByRole('button', { name: 'Keluar layar penuh' }).click();
  await expect(page.getByRole('button', { name: 'Layar penuh', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Finish by keyboard.
  await tabTo(page, page.getByRole('button', { name: 'Selesai' }));
  await page.keyboard.press('Enter');
  const submit = page.getByRole('button', { name: 'Kirim jawaban' });
  await tabTo(page, submit);
  await page.keyboard.press('Enter');
  await page.waitForURL(/#\/results\//);

  const report = page.locator('section', { has: page.getByRole('heading', { name: 'Mode CAT' }) });
  await expect(report).toContainText('Meninggalkan halaman ujian 1 kali, total 7d.');
  await expect(report).toContainText('Urutan sub-tes dikunci.');
  await expect(report).toContainText('nilai tidak dikurangi');
  await expect(page.locator('.card', { hasText: 'Tes Wawasan Kebangsaan' })).toContainText('10 benar');
});

test('an ordinary exam keeps free navigation and records nothing', async ({ page }) => {
  const setUrl = await keyAndSet(page);
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByRole('heading', { name: 'Soal 1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.getByRole('button', { name: 'Soal 25, belum dijawab' }).click();
  await expect(page.getByRole('heading', { name: 'Soal 25', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Soal 2, belum dijawab' }).click();
  await expect(page.getByRole('heading', { name: 'Soal 2', exact: true })).toBeVisible();

  await setHidden(page, true);
  await setHidden(page, false);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
  await expect(page.getByRole('heading', { name: 'Mode CAT' })).toHaveCount(0);
});
