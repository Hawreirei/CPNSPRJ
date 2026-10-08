import { readFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { addGeminiKey, expect, test } from './fixtures';

/** A page with a dark block where its "chart" is, so a cut picture has something in it. */
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
  const rows = Array.from({ length: height }, (_, y) =>
    Buffer.concat([
      Buffer.from([0]),
      Buffer.from(Array.from({ length: width }, (_, x) => (x > width * 0.2 && x < width * 0.6 && y > height * 0.2 && y < height * 0.4 ? [40, 80, 160] : [250, 250, 250])).flat()),
    ]),
  );
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
}

async function seriousViolations(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  return r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id);
}

test('a picture cut from the page goes with its question: review, bank, exam and the PDF', async ({ page }) => {
  test.setTimeout(90_000);
  await addGeminiKey(page);
  await page.goto('#/bank/import');
  await page.getByLabel('Materi yang saya impor milik saya sendiri').check();
  await page.getByLabel('Atau pilih gambar/PDF').setInputFiles({ name: 'grafik.png', mimeType: 'image/png', buffer: png(600, 850) });
  await page.getByRole('button', { name: 'Kirim halaman ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'grafik.png: 3 soal disalin, 1 dilewati.' })).toBeVisible();

  const chart = page.locator('article', { hasText: 'penjualan tertinggi' });
  await expect(chart).toContainText('perlu dicek');
  await expect(page.getByText('Soal ini memakai gambar di halaman.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simpan 3 soal ke Bank Soal' })).toBeDisabled();

  // Drag a box around the chart on the original page and attach it to the question that needs it.
  const cutter = page.getByTestId('picture-cutter');
  await cutter.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  const b = (await cutter.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.15, b.y + b.height * 0.15);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.45, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Tempel ke')).toHaveValue(/.+/);
  await expect(page.getByLabel('Tempel ke').locator('option:checked')).toHaveText('Soal 3 (perlu gambar)');
  await page.getByLabel('Keterangan gambar (teks alternatif)').fill('Grafik batang penjualan 2020–2024');
  await page.getByRole('button', { name: 'Tempel gambar' }).click();
  await expect(page.getByText('Gambar ditempel ke soal 3.')).toBeVisible();
  const picture = chart.getByRole('img', { name: 'Grafik batang penjualan 2020–2024' });
  await expect(picture).toBeVisible();
  const src = await picture.getAttribute('src');
  expect(src).toMatch(/^data:image\/jpeg;base64,/);
  expect(src!.length).toBeLessThan(400_000);
  await expect(page.getByText('Soal ini memakai gambar di halaman.')).toHaveCount(0);
  expect(await seriousViolations(page)).toEqual([]);

  await page.getByRole('button', { name: 'Simpan 3 soal ke Bank Soal' }).click();
  await expect(page).toHaveURL(/#\/bank$/);
  await expect(page.locator('article', { hasText: 'penjualan tertinggi' }).getByRole('img', { name: 'Grafik batang penjualan 2020–2024' })).toBeVisible();
  await page.goto('#/settings');
  await expect(page.getByText(/Gambar soal hasil impor: 1 soal, ± \d+ KB/)).toBeVisible();

  // A set of them: the picture in the exam and in the PDF.
  await page.goto('#/bank');
  for (const box of await page.getByRole('checkbox', { name: 'Pilih soal' }).all()) await box.check();
  page.once('dialog', (d) => void d.accept('Set bergambar'));
  await page.getByRole('button', { name: 'Jadikan set baru' }).click();
  await page.waitForURL(/#\/sets\/[\w-]+$/);
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /^PDF/ }).click();
  await dialog.getByText('Lengkap', { exact: true }).click();
  const [file] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Unduh PDF' }).click()]);
  const pdf = (await readFile((await file.path())!)).toString('latin1');
  expect(pdf.startsWith('%PDF-')).toBe(true);
  expect(pdf).toMatch(/\/Subtype \/Image[\s\S]*\/Filter \/DCTDecode|\/Filter \/DCTDecode[\s\S]*\/Subtype \/Image/);
  await page.keyboard.press('Escape');
  // And in Word: the picture is a file inside the .docx.
  await page.getByRole('button', { name: /Unduh PDF \/ Word/ }).click();
  await dialog.getByRole('button', { name: /^Word/ }).click();
  await dialog.getByText('Lengkap', { exact: true }).click();
  const [doc] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Unduh Word' }).click()]);
  expect((await readFile((await doc.path())!)).toString('latin1')).toMatch(/word\/media\/[^"]+\.(jpe?g|jpg)/);
  await page.keyboard.press('Escape');

  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (let i = 0; i < 3; i++) {
    if (await page.getByRole('img', { name: 'Grafik batang penjualan 2020–2024' }).isVisible()) break;
    await page.keyboard.press('ArrowRight');
  }
  await expect(page.getByRole('img', { name: 'Grafik batang penjualan 2020–2024' })).toBeVisible();
});
