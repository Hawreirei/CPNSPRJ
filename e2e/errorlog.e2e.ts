import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

const KEY = 'AIzaSyD3f4KeyKeyKeyKeyKeyKeyKeyKeyKey12';

test('uncaught errors are logged locally, cleaned, and downloaded as text without any request', async ({ page }) => {
  await page.goto('#/settings');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Log galat' }) });
  await expect(section).toContainText('Belum ada galat yang tercatat.');
  await expect(section.getByRole('button', { name: 'Unduh log galat' })).toBeDisabled();

  // From here on, nothing may be requested at all, not even from this server.
  const requests: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('blob:')) requests.push(r.url());
  });

  // An uncaught error and an unhandled rejection, carrying a key and question text.
  await page.evaluate((key) => {
    setTimeout(() => {
      throw new Error(`gagal dengan ${key} untuk "Pancasila sebagai dasar negara dirumuskan dalam sidang BPUPKI"`);
    });
    void Promise.reject(new TypeError('janji ditolak'));
  }, KEY);
  await expect(section).toContainText('2 galat tercatat.');

  const [file] = await Promise.all([page.waitForEvent('download'), section.getByRole('button', { name: 'Unduh log galat' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^log-galat-skd-\d{4}-\d{2}-\d{2}\.txt$/);
  const text = await readFile((await file.path())!, 'utf8');
  expect(text).toContain('Versi aplikasi:');
  expect(text).toContain('Browser: Mozilla/');
  expect(text).toContain('galat halaman · #/settings');
  expect(text).toContain('galat tak tertangani · #/settings');
  expect(text).toContain('TypeError: janji ditolak');
  expect(text).not.toContain('AIza');
  expect(text).not.toContain('Pancasila');
  expect(requests).toEqual([]);

  await section.getByRole('button', { name: 'Hapus log' }).click();
  await expect(section).toContainText('Belum ada galat yang tercatat.');
});
