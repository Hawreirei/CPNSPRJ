import { crc32, deflateSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import { addGeminiKey, expect } from './fixtures';

/** A page with a dark block where its "chart" is, so a cut picture has something in it. */
export function chartPagePng(width: number, height: number): Buffer {
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

/** Import a 600 × 850 page whose third question shows the chart; the review screen is left open. */
export async function importChartPage(page: Page) {
  await addGeminiKey(page);
  await page.goto('#/bank/import');
  await page.getByLabel('Materi yang saya impor milik saya sendiri').check();
  await page.getByLabel('Atau pilih gambar/PDF').setInputFiles({ name: 'grafik.png', mimeType: 'image/png', buffer: chartPagePng(600, 850) });
  await page.getByRole('button', { name: 'Kirim halaman ini' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'grafik.png: 3 soal disalin, 1 dilewati.' })).toBeVisible();
}
