import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, keyAndSet, KEY, test } from './fixtures';

/** Questions in the open attempt, read straight from IndexedDB. */
function attemptQuestionIds(page: Page) {
  const id = page.url().split('/').pop()!;
  return page.evaluate(
    (attemptId) =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('cpns-skd-builder');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('attempts').objectStore('attempts').get(attemptId);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            open.result.close();
            resolve(get.result?.questionIds ?? []);
          };
        };
      }),
    id,
  );
}

/** An exam on the set, answering the first questions as given and leaving the rest empty. */
async function exam(page: Page, setId: string, keys: string[]) {
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (const k of keys) {
    await page.keyboard.press(k);
    await page.keyboard.press('ArrowRight');
  }
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
}

test('a second exam on a set shows what improved and what got worse, and practises those in one click', async ({ page }) => {
  test.setTimeout(90_000);
  const setId = (await keyAndSet(page)).split('/').pop()!;
  const key = KEY.toLowerCase();
  const wrong = key === 'a' ? 'b' : 'a';

  // The first report has nothing to compare with.
  await exam(page, setId, [key, key, wrong]);
  await expect(page.getByRole('heading', { name: 'Dibanding percobaan sebelumnya' })).toHaveCount(0);

  // Question 1 right → wrong, 2 stays right, 3 wrong → right; the other 27 stay empty.
  await exam(page, setId, [wrong, key, key]);
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Dibanding percobaan sebelumnya' }) });
  await expect(card).toContainText('1 membaik · 1 memburuk · 27 tetap salah · 1 tetap benar.');
  await expect(card).toContainText('Skor total');
  await card.getByText('Memburuk (1)').click();
  await expect(card).toContainText(`Soal 1: jawaban ${KEY} → ${wrong.toUpperCase()}.`);
  await card.getByText('Membaik (1)').click();
  await expect(card).toContainText(`Soal 3: jawaban ${wrong.toUpperCase()} → ${KEY}.`);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const r = await new AxeBuilder({ page }).include('#compare-title').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const all = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect([...r.violations, ...all.violations].filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // One click: a practice of the question that got worse first, then the ones still wrong.
  await card.getByRole('button', { name: 'Latih ulang 28 soal yang memburuk atau tetap salah' }).click();
  await page.waitForURL(/#\/practice\//);
  expect(await attemptQuestionIds(page)).toHaveLength(28);
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press(wrong);
  await expect(page.getByText(`Kurang tepat. Jawaban yang benar: ${KEY}.`)).toBeVisible();

  // A third exam can be compared with either earlier one.
  // Against the second (wrong, right, right): 1 improved, 3 worse. Against the first (right, right, wrong): no change.
  await exam(page, setId, [key, key, wrong]);
  await expect(card).toContainText('1 membaik · 1 memburuk · 27 tetap salah · 1 tetap benar.');
  const choose = page.getByLabel('Bandingkan dengan');
  await expect(choose.locator('option')).toHaveCount(2);
  await choose.selectOption({ index: 1 });
  await expect(card).toContainText('0 membaik · 0 memburuk · 28 tetap salah · 2 tetap benar.');
});
