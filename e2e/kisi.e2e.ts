import { readFile } from 'node:fs/promises';
import { expect, test } from './fixtures';

const profile = {
  version: 1,
  name: 'Kisi-kisi uji',
  source: 'Dokumen uji e2e',
  date: '2026-09-01',
  topics: {
    TWK: [{ name: 'Topik Uji Baru', weight: 2 }, { name: 'Pancasila' }],
    TIU: [{ name: 'Aritmetika' }],
    TKP: [{ name: 'Pelayanan Publik' }],
  },
  exam: { counts: { TWK: 20, TIU: 20, TKP: 20 }, passing: { TWK: 50, TIU: 50, TKP: 80 }, durationMinutes: 60 },
};
const file = (name: string, content: string) => ({ name, mimeType: 'application/json', buffer: Buffer.from(content) });

test('an imported syllabus profile sets the topics for new sets, and its export imports elsewhere', async ({ page, browser }) => {
  await page.goto('#/settings');
  await page.getByLabel('Impor profil (.json)').setInputFiles(file('kisi.json', JSON.stringify(profile)));
  await expect(page.getByText('Profil "Kisi-kisi uji" diimpor.')).toBeVisible();
  // Imported, not yet in use.
  await expect(page.getByLabel('Profil yang dipakai')).toHaveValue('bawaan');

  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Profil yang dipakai').selectOption({ label: 'Kisi-kisi uji' });
  await expect(page.getByText('Profil "Kisi-kisi uji" dipakai untuk set baru.')).toBeVisible();
  await expect(page.getByText('Dokumen uji e2e · 1 September 2026')).toBeVisible();
  // Its exam numbers now apply.
  await page.getByText('Pengaturan lanjutan').click();
  await expect(page.getByLabel('Durasi SKD penuh (menit)')).toHaveValue('60');

  await page.goto('#/new');
  await page.getByRole('button', { name: /TWK saja/ }).click();
  await page.getByText('Sesuaikan lebih lanjut (opsional)').click();
  await expect(page.getByText('Topik dari profil kisi-kisi "Kisi-kisi uji".')).toBeVisible();
  await expect(page.getByRole('button', { name: '✓ Topik Uji Baru' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(✓ )?UUD 1945$/ })).toHaveCount(0);

  // Export, then import into a fresh browser.
  await page.goto('#/settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Ekspor profil ini' }).click();
  const exported = await readFile((await (await download).path())!, 'utf8');
  expect(exported).toContain('Topik Uji Baru');

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.goto(page.url().replace(/#.*/, '#/settings'));
  await page2.getByLabel('Impor profil (.json)').setInputFiles(file('kisi-kisi-uji.json', exported));
  await expect(page2.getByText('Profil "Kisi-kisi uji" diimpor.')).toBeVisible();
  page2.once('dialog', (d) => void d.accept());
  await page2.getByLabel('Profil yang dipakai').selectOption({ label: 'Kisi-kisi uji' });
  await expect(page2.getByText('Topik: TWK 2 · TIU 1 · TKP 1 · 60 soal, 60 menit')).toBeVisible();
  await other.close();
});

test('a broken profile file is rejected without changing the profile in use', async ({ page }) => {
  await page.goto('#/settings');
  await page.getByLabel('Impor profil (.json)').setInputFiles(file('rusak.json', JSON.stringify({ ...profile, topics: { ...profile.topics, TIU: [] } })));
  await expect(page.getByRole('alert')).toHaveText('Profil tidak valid (topics.TIU): butuh minimal satu topik.');
  await expect(page.getByLabel('Profil yang dipakai')).toHaveValue('bawaan');
  await expect(page.getByLabel('Profil yang dipakai').locator('option')).toHaveCount(1);
});
