import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Make the browser report `usage` of a 1 GB quota. */
const fakeEstimate = (page: Page, usage: number) =>
  page.addInitScript((u) => {
    Object.defineProperty(navigator.storage, 'estimate', { value: async () => ({ usage: u, quota: 1024 ** 3 }), configurable: true });
  }, usage);

test('storage use shows in Settings, warns on the dashboard when nearly full, and old data can be cleared', async ({ page }) => {
  await fakeEstimate(page, 0.9 * 1024 ** 3);
  await page.goto('#/');
  const warning = page.locator('.card', { hasText: 'Penyimpanan hampir penuh (90%)' });
  await expect(warning).toBeVisible();
  await warning.getByRole('link', { name: 'Buka Penyimpanan' }).click();

  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Penyimpanan' }) });
  await expect(card).toContainText('dari 1,0 GB (90%)');

  // An abandoned unfinished exam from long ago, and nothing else old.
  await page.evaluate(async () => {
    const open = indexedDB.open('cpns-skd-builder');
    const db: IDBDatabase = await new Promise((r) => (open.onsuccess = () => r(open.result)));
    const tx = db.transaction('attempts', 'readwrite');
    tx.objectStore('attempts').put({
      id: 'stale',
      setId: 'gone',
      setName: 'Lama',
      mode: 'exam',
      questionIds: [],
      startedAt: Date.now() - 60 * 86_400_000,
      endsAt: Date.now() - 59 * 86_400_000,
      answers: {},
      flagged: [],
      timeSpent: {},
      currentIndex: 0,
      passing: { TWK: 0, TIU: 0, TKP: 0 },
    });
    await new Promise((r) => (tx.oncomplete = r));
    db.close();
  });
  await card.getByRole('button', { name: 'Periksa data lama' }).click();
  await expect(card).toContainText('1 percobaan yang belum selesai lebih dari 30 hari');
  await expect(card).toContainText('Sebaiknya unduh cadangan dulu.');
  await card.getByRole('button', { name: /^Bersihkan/ }).click();
  await expect(card.getByRole('status')).toContainText('Dibersihkan: 0 log permintaan dan 1 percobaan belum selesai');
  await card.getByRole('button', { name: 'Periksa data lama' }).click();
  await expect(card).toContainText('Tidak ada data lama yang bisa dibersihkan.');
});

test('no warning below the threshold', async ({ page }) => {
  await fakeEstimate(page, 0.5 * 1024 ** 3);
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Beranda' })).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.getByText('Penyimpanan hampir penuh')).toHaveCount(0);
});
