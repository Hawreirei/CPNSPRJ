import type { Page } from '@playwright/test';
import { createMiniSet, expect, FAKE_MODEL, mockGemini, test } from './fixtures';

const SECRET = 'AIza-e2e-fake-key';

/** Every record in the app's IndexedDB, as text. */
const storedText = (page: Page) =>
  page.evaluate(async () => {
    const open = indexedDB.open('cpns-skd-builder');
    const db: IDBDatabase = await new Promise((r) => (open.onsuccess = () => r(open.result)));
    const out: unknown[] = [];
    for (const name of Array.from(db.objectStoreNames)) {
      const req = db.transaction(name).objectStore(name).getAll();
      out.push(await new Promise((r) => (req.onsuccess = () => r(req.result))));
    }
    db.close();
    return JSON.stringify(out, (_k, v) => (v instanceof ArrayBuffer || ArrayBuffer.isView(v) ? new TextDecoder().decode(v as ArrayBuffer) : v));
  });

test('a session-only key generates questions, is never stored, and is gone in a new tab or browser', async ({ page, context, browser, network }) => {
  test.setTimeout(90_000);
  await page.goto('#/keys');
  await page.getByPlaceholder('AIza…').fill(SECRET);
  await page.getByRole('checkbox', { name: /Jangan simpan, hanya untuk sesi ini/ }).check();
  await expect(page.getByText('Ekstensi browser yang bisa membaca halaman tetap bisa melihatnya.')).toBeVisible();
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await expect(page.locator('option', { hasText: FAKE_MODEL }).first()).toBeAttached();
  await expect(page.getByText('hanya sesi')).toBeVisible();

  // It works for generation.
  await createMiniSet(page);
  expect(await storedText(page)).not.toContain(SECRET);
  expect(await page.evaluate(() => Object.values(sessionStorage))).toContain(SECRET);

  // A new tab: the key is gone. Generation says what to do; the key can be typed in again.
  const tab = await context.newPage();
  await mockGemini(tab);
  await tab.goto('#/new');
  await tab.getByRole('button', { name: /Latihan Singkat/ }).click();
  await tab.getByRole('button', { name: 'Buat Soal', exact: true }).first().click();
  await tab.waitForURL(/#\/sets\/[\w-]+$/);
  await expect(tab.getByText(/hanya untuk sesi dan sudah hilang karena tab atau browser ditutup/).first()).toBeVisible();

  await tab.goto('#/keys');
  await expect(tab.getByText('Masukkan lagi untuk memakainya di tab ini.')).toBeVisible();
  await tab.getByLabel(/Masukkan lagi key/).fill(SECRET);
  await tab.getByRole('button', { name: 'Pakai key' }).click();
  await expect(tab.getByText('Masukkan lagi untuk memakainya di tab ini.')).toHaveCount(0);
  await tab.getByRole('button', { name: 'Uji koneksi' }).click();
  await expect(tab.getByText(/^Koneksi berhasil/)).toBeVisible();
  expect(await storedText(tab)).not.toContain(SECRET);

  // A new browser profile has no trace of it.
  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await fresh.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      network.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  const other = await fresh.newPage();
  await other.goto('#/keys');
  await expect(other.getByRole('heading', { name: 'Tambah API key' })).toBeVisible();
  await expect(other.getByText('hanya sesi')).toHaveCount(0);
  await fresh.close();
});
