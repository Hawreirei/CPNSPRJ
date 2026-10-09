import type { Page } from '@playwright/test';
import { addGeminiKey, expect, seriousViolations, test } from './fixtures';
import pkg from '../package.json' with { type: 'json' };

const TITLE = `Apa yang baru di versi ${pkg.version}`;

/** The stored settings with `lastSeenVersion` replaced (or removed with null), as an older version would have left them. */
const setLastSeen = (page: Page, version: string | null) =>
  page.evaluate(async (v) => {
    const open = indexedDB.open('cpns-skd-builder');
    const db: IDBDatabase = await new Promise((r) => (open.onsuccess = () => r(open.result)));
    const store = () => db.transaction('meta', 'readwrite').objectStore('meta');
    const row = await new Promise<{ value?: Record<string, unknown> } | undefined>((r) => {
      const req = store().get('settings');
      req.onsuccess = () => r(req.result);
    });
    const value = { ...row?.value };
    if (v === null) delete value.lastSeenVersion;
    else value.lastSeenVersion = v;
    await new Promise((r) => (store().put({ key: 'settings', value }).onsuccess = r));
    db.close();
  }, version);

test('a new profile does not see "Apa yang baru", even once it has data', async ({ page }) => {
  await page.goto('#/');
  await expect(page.getByRole('heading', { name: 'Beranda' })).toBeVisible();
  await addGeminiKey(page);
  await page.goto('#/');
  await expect(page.getByRole('link', { name: '+ Buat soal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: TITLE })).toHaveCount(0);
});

test('data from an older version shows "Apa yang baru" once; closing it keeps it closed', async ({ page }) => {
  await addGeminiKey(page);
  // Data from before version numbers: no version seen.
  await setLastSeen(page, null);
  await page.goto('#/');
  await page.reload();
  const card = page.getByRole('region', { name: TITLE });
  await expect(card).toBeVisible();
  await expect(card.getByRole('listitem').first()).toBeVisible();
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(await seriousViolations(page), colorScheme).toEqual([]);
  }

  // The full history is in Bantuan.
  await card.getByRole('link', { name: 'Riwayat perubahan' }).click();
  await expect(page).toHaveURL(/#\/help\?bagian=perubahan$/);
  const history = page.getByRole('region', { name: 'Riwayat perubahan' });
  await expect(history).toBeInViewport();
  await expect(history.getByRole('heading', { name: new RegExp(`^Versi ${pkg.version.replace(/\./g, '\\.')}`) })).toBeVisible();
  await page.goto('#/');

  await card.getByRole('button', { name: 'Tutup' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('link', { name: '+ Buat soal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: TITLE })).toHaveCount(0);

  // A version seen before this one brings it back; this one, or a later one, does not.
  await setLastSeen(page, '0.9.0');
  await page.reload();
  await expect(card).toBeVisible();
  await setLastSeen(page, '99.0.0');
  await page.reload();
  await expect(page.getByRole('link', { name: '+ Buat soal' })).toBeVisible();
  await expect(card).toHaveCount(0);
});

test('Pengaturan shows the version and its commit, and links to the history', async ({ page }) => {
  await page.goto('#/settings');
  const about = page.locator('section', { has: page.getByRole('heading', { name: 'Tentang aplikasi' }) });
  await expect(about).toContainText(new RegExp(`Versi ${pkg.version.replace(/\./g, '\\.')} \\(\\w+\\), dibuat `));
  await about.getByRole('link', { name: 'Riwayat perubahan' }).click();
  await expect(page.getByRole('region', { name: 'Riwayat perubahan' })).toBeInViewport();
});
