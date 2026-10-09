import { readFile } from 'node:fs/promises';
import { expect, seriousViolations, test } from './fixtures';

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
  // Only the two built-in profiles.
  await expect(page.getByLabel('Profil yang dipakai').locator('option')).toHaveCount(2);
});

test('the built-in SKD Sekolah Kedinasan 2026 profile applies the decree’s numbers and topics, with its source', async ({ page }) => {
  await page.goto('#/settings');
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Profil kisi-kisi' }) });
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Profil yang dipakai').selectOption({ label: 'SKD Sekolah Kedinasan 2026' });
  await expect(page.getByText('Profil "SKD Sekolah Kedinasan 2026" dipakai untuk set baru.')).toBeVisible();
  await expect(section.getByText('Keputusan MenPAN-RB Nomor 406 Tahun 2026 · 27 Juli 2026')).toBeVisible();
  await expect(section.getByText(/nilai kumulatif SKD paling rendah 281 dan nilai TIU paling rendah 55/)).toBeVisible();
  await expect(section.getByText('Topik: TWK 5 · TIU 10 · TKP 6 · 110 soal, 100 menit')).toBeVisible();
  // Built in: it cannot be edited or removed, only duplicated.
  await expect(section.getByRole('button', { name: 'Ubah', exact: true })).toHaveCount(0);
  await expect(section.getByRole('button', { name: 'Hapus profil ini' })).toHaveCount(0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page, 'main')).toEqual([]);
  }

  // A copy is the learner's own: editable, and it keeps the source and the notes.
  await section.getByRole('button', { name: 'Duplikat & ubah' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
  await expect(page.getByText('Profil "SKD Sekolah Kedinasan 2026 (salinan)" disimpan.')).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await page.getByLabel('Profil yang dipakai').selectOption({ label: 'SKD Sekolah Kedinasan 2026 (salinan)' });
  await expect(section.getByText('Keputusan MenPAN-RB Nomor 406 Tahun 2026 · 27 Juli 2026')).toBeVisible();
  await expect(section.getByText(/nilai kumulatif SKD paling rendah 281/)).toBeVisible();
  await expect(section.getByRole('button', { name: 'Ubah', exact: true })).toBeVisible();

  // Its pass marks are now the ones in Settings: TKP 156 of 225.
  await page.getByText('Pengaturan lanjutan').click();
  await expect(page.getByLabel('Durasi SKD penuh (menit)')).toHaveValue('100');
  const tkp = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'TKP', exact: true }) });
  await expect(tkp.getByRole('spinbutton').first()).toHaveValue('45');
  await expect(tkp.getByRole('spinbutton').last()).toHaveValue('156');

  // And its topics are offered for new sets.
  await page.goto('#/new');
  await page.getByRole('button', { name: /SKD Lengkap/ }).click();
  await page.getByText('Sesuaikan lebih lanjut (opsional)').click();
  await expect(page.getByText('Topik dari profil kisi-kisi "SKD Sekolah Kedinasan 2026 (salinan)".')).toBeVisible();
  await expect(page.getByRole('button', { name: '✓ Anti Radikalisme' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(✓ )?Sejarah Indonesia$/ })).toHaveCount(0);
});
