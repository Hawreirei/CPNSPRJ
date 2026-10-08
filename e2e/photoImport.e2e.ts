import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addGeminiKey, expect, test } from './fixtures';

/** A plain grey RGB picture, as a photographed page would arrive (the fake model does not look at it). */
function png(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 200)]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A two-page PDF with a line of text on each page. */
function pdf(): Buffer {
  const page = (content: number) => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${content} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
  const text = (s: string) => {
    const stream = `BT /F1 18 Tf 72 760 Td (${s}) Tj ET`;
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  };
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [4 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    page(6),
    page(7),
    text('1. Sila keempat Pancasila berbunyi ...'),
    text('2. Hasil dari 12 x 3 adalah ...'),
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => {
    const at = body.length;
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

async function sendPhoto(page: Page) {
  await page.getByLabel('Atau pilih gambar/PDF').setInputFiles({ name: 'halaman.png', mimeType: 'image/png', buffer: png(1200, 1700) });
  await expect(page.getByTestId('import-estimate')).toContainText('Dikirim ke Google Gemini');
  await page.getByRole('button', { name: 'Kirim halaman ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'halaman.png: 3 soal disalin, 1 dilewati.' })).toBeVisible();
}

test('a photographed page is copied by the model, reviewed, corrected and saved to the bank as "perlu dicek"; cancelling saves nothing', async ({ page, gemini }) => {
  await addGeminiKey(page);
  await page.goto('#/bank');
  await page.getByRole('link', { name: /Impor dari foto\/PDF/ }).click();
  await expect(page).toHaveURL(/#\/bank\/import$/);

  // The copyright reminder and the cost come before anything is sent, and sending waits for the learner's word.
  await expect(page.getByRole('heading', { name: 'Hak cipta' })).toBeVisible();
  await expect(page.getByText('Jangan mengimpor soal dari buku, bimbel, atau tryout berbayar')).toBeVisible();
  await page.getByLabel('Atau pilih gambar/PDF').setInputFiles({ name: 'halaman.png', mimeType: 'image/png', buffer: png(1200, 1700) });
  await expect(page.getByTestId('import-estimate')).toContainText(/Dikirim ke Google Gemini \(key ".*", model gemini-3\.5-flash\): 1 request, perkiraan biaya paling banyak/);
  await expect(page.getByTestId('import-estimate')).toContainText('Sisa kuota key hari ini: 20 request.');
  await expect(page.getByRole('button', { name: 'Kirim halaman ini' })).toBeDisabled();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByLabel('Materi yang saya impor milik saya sendiri').check();
  await page.getByRole('button', { name: 'Kirim halaman ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'halaman.png: 3 soal disalin, 1 dilewati.' })).toBeVisible();
  // Scaled down to at most 1568 px and sent as JPEG, once.
  expect(gemini.pageImages).toHaveLength(1);
  expect(gemini.pageImages[0].mimeType).toBe('image/jpeg');

  // Review: the page next to its questions, what was skipped, and what to check.
  await expect(page.getByRole('heading', { name: 'Tinjau sebelum disimpan (3 soal)' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Halaman asli: halaman.png' })).toBeVisible();
  await expect(page.getByText('Soal nomor 3: pilihan jawabannya berupa gambar')).toBeVisible();
  await expect(page.getByText('Kunci jawaban diusulkan AI, bukan dari halaman. Periksa.')).toBeVisible();
  const cards = page.locator('article');
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toContainText('perlu dicek');
  expect(await seriousViolations(page)).toEqual([]);

  // The question that shows a picture blocks saving until it has one, or is removed (see questionImage.e2e.ts).
  await expect(page.getByText('1 soal masih perlu gambar')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan 3 soal ke Bank Soal' })).toBeDisabled();
  await cards.nth(2).getByRole('button', { name: 'Hapus', exact: true }).click();
  await expect(cards).toHaveCount(2);

  // Correct the second question's stem, as if the model had misread it.
  await cards.nth(1).getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog').getByText('Saya sudah memeriksa soal ini')).toHaveCount(0);
  await page.getByLabel('Soal (gunakan $...$ untuk rumus)').fill('Hasil dari 12 × 3 adalah … (sudah diperbaiki)');
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan' }).click();
  await expect(cards.nth(1)).toContainText('(sudah diperbaiki)');
  await expect(page.getByText('Kunci jawaban diusulkan AI, bukan dari halaman. Periksa.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Simpan 2 soal ke Bank Soal' }).click();
  await expect(page).toHaveURL(/#\/bank$/);
  await expect(page.getByRole('status').filter({ hasText: '2 soal hasil impor disimpan ke Bank Soal, bertanda "perlu dicek".' })).toBeVisible();
  await expect(page.getByText('(2 soal)')).toBeVisible();
  const saved = page.locator('article', { hasText: '(sudah diperbaiki)' });
  await expect(saved).toContainText('dari foto/PDF');
  await expect(saved).toContainText('perlu dicek');

  // Cancel: another page is copied, then thrown away. The bank still has 2 questions.
  await page.getByRole('link', { name: /Impor dari foto\/PDF/ }).click();
  await page.getByLabel('Materi yang saya impor milik saya sendiri').check();
  await sendPhoto(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Batal', exact: true }).click();
  await expect(page.getByText('Hasil impor dibuang. Tidak ada yang disimpan.')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await page.goto('#/bank');
  await expect(page.getByText('(2 soal)')).toBeVisible();
  expect(gemini.pageImages).toHaveLength(2);

  // Shared sets leave imported questions out unless the learner includes them.
  for (const box of await page.getByRole('checkbox', { name: 'Pilih soal' }).all()) await box.check();
  page.once('dialog', (d) => void d.accept('Set impor'));
  await page.getByRole('button', { name: 'Jadikan set baru' }).click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await page.getByRole('button', { name: 'Bagikan' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Semua soal di set ini hasil impor dari foto/PDF.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Unduh berkas (.cpnsset.json)' })).toHaveCount(0);
  await dialog.getByLabel('Sertakan 2 soal hasil impor dari foto/PDF').check();
  await expect(dialog.getByText('Bagikan hanya bila soal itu milik Anda sendiri')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Unduh berkas (.cpnsset.json)' })).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'Tautan set' })).toBeVisible();
});

test('a PDF is drawn one page at a time in the browser and only the chosen page is sent', async ({ page, gemini }) => {
  await addGeminiKey(page);
  await page.goto('#/bank/import');
  await page.getByLabel('Materi yang saya impor milik saya sendiri').check();
  const pdfjs = page.waitForResponse((r) => /\/assets\/pdfjs-[\w-]+\.js$/.test(r.url()));
  await page.getByLabel('Atau pilih gambar/PDF').setInputFiles({ name: 'latihan.pdf', mimeType: 'application/pdf', buffer: pdf() });
  // pdf.js loads only now.
  await pdfjs;
  await expect(page.getByText('Halaman 1 dari 2')).toBeVisible();
  await page.getByRole('button', { name: 'Berikutnya →' }).click();
  await expect(page.getByText('Halaman 2 dari 2')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Halaman yang akan dikirim: latihan.pdf' })).toBeVisible();
  await page.getByRole('button', { name: 'Kirim halaman ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'latihan.pdf, halaman 2: 3 soal disalin, 1 dilewati.' })).toBeVisible();
  expect(gemini.pageImages).toHaveLength(1);
  expect(gemini.pageImages[0].mimeType).toBe('image/jpeg');
  await expect(page.getByRole('img', { name: 'Halaman asli: latihan.pdf, halaman 2' })).toBeVisible();
});
