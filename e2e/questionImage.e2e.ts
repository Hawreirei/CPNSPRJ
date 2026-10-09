import { readFile } from 'node:fs/promises';
import { importChartPage } from './chartPage';
import { expect, seriousViolations, test } from './fixtures';

test('a picture cut from the page goes with its question: review, bank, exam and the PDF', async ({ page }) => {
  test.setTimeout(90_000);
  await importChartPage(page);

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
  // The bank lists its questions after reading them; .all() would take whatever is there yet.
  await expect(page.getByRole('checkbox', { name: 'Pilih soal' })).toHaveCount(3);
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

test('the picture can be cut with the keyboard alone, to the size of the area chosen (#59)', async ({ page }) => {
  await importChartPage(page);
  const chart = page.locator('article', { hasText: 'penjualan tertinggi' });

  // Tab from the page's heading to the cut-out area; it starts as a box in the middle.
  await page.locator('summary', { hasText: 'Halaman asli: grafik.png' }).focus();
  await page.keyboard.press('Tab');
  const area = page.getByRole('button', { name: 'Area potong' });
  await expect(area).toBeFocused();
  await expect(area).toHaveAccessibleDescription(/Tab ke area potong, geser dengan tombol panah, ubah ukurannya dengan Shift \+ panah/);
  const said = page.getByText(/^Area \d+% × \d+% mulai dari \d+%, \d+%$/);
  await expect(said).toHaveText('Area 50% × 30% mulai dari 25%, 35%');
  expect(await seriousViolations(page)).toEqual([]);

  // Around the chart (20–60% across, 20–40% down): move, with one large step, then shrink.
  for (const k of ['ArrowLeft', 'ArrowLeft', 'ArrowLeft', 'Alt+ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp']) await page.keyboard.press(k);
  await expect(said).toHaveText('Area 50% × 30% mulai dari 19%, 19%');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowUp');
  await expect(said).toHaveText('Area 42% × 22% mulai dari 19%, 19%');
  // Alt + arrow did not leave the page.
  await expect(page).toHaveURL(/#\/bank\/import$/);

  // On to the question, the description and "Tempel gambar", still by keyboard.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Seluruh halaman' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Tempel ke')).toBeFocused();
  await expect(page.getByLabel('Tempel ke').locator('option:checked')).toHaveText('Soal 3 (perlu gambar)');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Grafik batang penjualan');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Tempel gambar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Gambar ditempel ke soal 3.')).toBeVisible();

  // 42% × 22% of a 600 × 850 page, not the whole page.
  const picture = chart.getByRole('img', { name: 'Grafik batang penjualan' });
  await expect(picture).toBeVisible();
  expect(await picture.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([252, 187]);
  await expect(page.getByText('Soal ini memakai gambar di halaman.')).toHaveCount(0);
  expect(await seriousViolations(page)).toEqual([]);
});
