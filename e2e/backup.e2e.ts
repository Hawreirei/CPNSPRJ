import { readFile, writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { createSetFromBank, expect, KEY, keyAndSet, seriousViolations, test } from './fixtures';

test('a backup exported here restores everything in a fresh browser', async ({ page, browser, network }) => {
  await keyAndSet(page);
  await page.goto('#/settings');
  await expect(page.getByText('Belum pernah dicadangkan.')).toBeVisible();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Unduh cadangan' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^skd-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText(/Terakhir dicadangkan: baru saja/)).toBeVisible();
  const path = (await file.path())!;
  const backup = JSON.parse(await readFile(path, 'utf8'));
  expect(backup.questions).toHaveLength(30);
  expect(JSON.stringify(backup)).not.toContain('AIza-e2e-fake-key');

  // A brand-new browser profile: empty storage, same app.
  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await fresh.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      network.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  const other = await fresh.newPage();
  await other.goto('#/settings');
  const chooser = other.waitForEvent('filechooser');
  await other.getByRole('button', { name: 'Pulihkan dari file' }).click();
  await (await chooser).setFiles(path);
  await expect(other.getByText('Dipulihkan: 1 set, 30 soal, 0 simulasi, 0 catatan Buku Kesalahan.')).toBeVisible();
  await other.goto('#/sets');
  await expect(other.getByText('Latihan Singkat').first()).toBeVisible();
  await other.goto('#/bank');
  await expect(other.getByText('30 soal', { exact: false }).first()).toBeVisible();
  // The API key never travels with a backup.
  await other.goto('#/keys');
  await expect(other.getByText('AIza-e2e-fake-key')).toHaveCount(0);
  await fresh.close();
});

test('the dashboard reminds after three new sets, and a download clears it', async ({ page }) => {
  await keyAndSet(page);
  await createSetFromBank(page);
  await page.goto('#/');
  await expect(page.getByText('set belum dicadangkan')).toHaveCount(0);
  await createSetFromBank(page);
  await page.goto('#/');
  const card = page.locator('.strip', { hasText: '3 set belum dicadangkan' });
  await expect(card).toBeVisible();
  await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Unduh cadangan' }).click()]);
  await expect(card).toHaveCount(0);
});

test('the score report offers a backup until one is made after the exam, and the dashboard reminds too', async ({ page }) => {
  await keyAndSet(page);
  // Backed up before the exam: nothing to remind about yet.
  await page.goto('#/settings');
  await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Unduh cadangan' }).click()]);
  await page.goto('#/');
  await expect(page.getByText('belum dicadangkan')).toHaveCount(0);

  await page.goto('#/simulation');
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await page.waitForURL(/#\/cat\//);
  await page.keyboard.press(KEY.toLowerCase());
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  const nudge = page.getByRole('region', { name: 'Cadangan' });
  await expect(nudge).toContainText('Hasil ini baru tersimpan di browser ini');
  expect(await seriousViolations(page)).toEqual([]);
  await page.goto('#/');
  await expect(page.locator('.strip', { hasText: 'Hasil latihan terbaru belum dicadangkan' })).toBeVisible();
  await page.goBack();
  await Promise.all([page.waitForEvent('download'), nudge.getByRole('button', { name: 'Unduh cadangan' }).click()]);
  await expect(nudge).toHaveCount(0);
  await page.goto('#/');
  await expect(page.getByText('belum dicadangkan')).toHaveCount(0);
});

test('on a phone, "Kirim cadangan ke…" hands the backup to the share sheet; a .txt copy restores', async ({ page, browser, network }) => {
  // The share sheet of Chrome on Android: files only, and JSON is not among the types it shares.
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; text: string }[] };
    w.__shared = [];
    const nav = navigator as unknown as Record<string, unknown>;
    nav.canShare = (data: { files?: File[] }) => !!data.files?.length && data.files.every((f) => f.type === 'text/plain');
    nav.share = async (data: { files: File[] }) => {
      for (const f of data.files) w.__shared.push({ name: f.name, type: f.type, text: await f.text() });
    };
  });
  await keyAndSet(page);
  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Kirim cadangan ke…' }).click();
  await expect(page.getByText(/Terakhir dicadangkan: baru saja/)).toBeVisible();
  const [shared] = await page.evaluate(() => (window as unknown as { __shared: { name: string; type: string; text: string }[] }).__shared);
  expect(shared.name).toMatch(/^skd-backup-\d{4}-\d{2}-\d{2}\.txt$/);
  expect(shared.type).toBe('text/plain');
  expect(shared.text).not.toContain('AIza-e2e-fake-key');

  // The .txt file restores like the .json one.
  const path = test.info().outputPath(shared.name);
  await writeFile(path, shared.text);
  const fresh = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await fresh.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      network.push(route.request().url());
      return route.abort('blockedbyclient');
    },
  );
  const other = await fresh.newPage();
  await other.goto('#/settings');
  const chooser = other.waitForEvent('filechooser');
  await other.getByRole('button', { name: 'Pulihkan dari file' }).click();
  await (await chooser).setFiles(path);
  await expect(other.getByText('Dipulihkan: 1 set, 30 soal')).toBeVisible();
  await fresh.close();
});

test('a browser that may clear the data by itself gets a tip to install the app, until "Mengerti"', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.storage, 'persisted', { value: async () => false });
  });
  await page.goto('#/');
  await expect(page.getByText('Browser ini bisa menghapus data aplikasi sendiri')).toHaveCount(0); // nothing to lose yet
  await keyAndSet(page);
  await page.goto('#/');
  const tip = page.locator('.strip', { hasText: 'Browser ini bisa menghapus data aplikasi sendiri' });
  await expect(tip).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await tip.getByRole('link', { name: 'Cara memasang' }).click();
  await expect(page.getByRole('heading', { name: 'Agar data tidak hilang' })).toBeInViewport();
  await page.goto('#/');
  await page.locator('.strip', { hasText: 'Browser ini bisa menghapus' }).getByRole('button', { name: 'Mengerti' }).click();
  await expect(page.getByText('Browser ini bisa menghapus data aplikasi sendiri')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Browser ini bisa menghapus data aplikasi sendiri')).toHaveCount(0);
});

test.describe('saving to a file automatically', () => {
  // Headless Chromium cannot show the save dialog, so the picker hands out a real file handle
  // from the origin-private file system instead. Writing, storing the handle in IndexedDB,
  // change detection and the debounce all run for real. Flags in localStorage switch on the
  // failure cases the browser would cause: a lost permission or a moved file.
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      w.showSaveFilePicker = async () => {
        w.__moved = false;
        return (await navigator.storage.getDirectory()).getFileHandle('cadangan.json', { create: true });
      };
      const proto = FileSystemHandle.prototype as unknown as Record<string, unknown>;
      if (localStorage.getItem('e2e-permission') === 'prompt') {
        let granted = false;
        proto.queryPermission = async () => (granted ? 'granted' : 'prompt');
        proto.requestPermission = async () => ((granted = true), 'granted');
      }
      if (localStorage.getItem('e2e-moved')) {
        const create = FileSystemFileHandle.prototype.createWritable;
        FileSystemFileHandle.prototype.createWritable = function (...args) {
          if (w.__moved !== false) return Promise.reject(new DOMException('moved', 'NotFoundError'));
          return create.apply(this, args);
        };
      }
    });
  });

  /** The backup file's contents. Retries while the app is in the middle of writing it. */
  async function savedFile(page: Page) {
    for (let i = 0; ; i++) {
      try {
        const text = await page.evaluate(async () => (await (await (await navigator.storage.getDirectory()).getFileHandle('cadangan.json')).getFile()).text());
        return JSON.parse(text);
      } catch (e) {
        if (i >= 20) throw e;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  }

  test('writes every change, recovers a lost permission and a moved file', async ({ page }) => {
    const brand = page.getByLabel('Nama lembaga/bimbel (tampil di file unduhan)');

    await keyAndSet(page);
    await page.goto('#/settings');
    await page.getByRole('button', { name: 'Pilih berkas…' }).click();
    await expect(page.getByText('Aktif: menulis ke cadangan.json')).toBeVisible();
    expect((await savedFile(page)).questions).toHaveLength(30);

    // A change is written after the debounce, without any click.
    // Fake clock, started a minute further on at each reload so time never runs backwards between visits.
    await page.clock.install({ time: Date.now() + 1 * 60_000 });
    await brand.fill('Bimbel Otomatis');
    await page.clock.runFor(5_000);
    await expect.poll(async () => (await savedFile(page)).settings?.brandName).toBe('Bimbel Otomatis');

    // Next visit: the browser wants permission again. Nothing is written until the user allows it.
    await page.evaluate(() => localStorage.setItem('e2e-permission', 'prompt'));
    await page.reload();
    // Fill only once the stored name is shown: filling first lets it load into the field after the text was selected.
    await expect(brand).toHaveValue('Bimbel Otomatis');
    await page.clock.install({ time: Date.now() + 2 * 60_000 });
    await brand.fill('Bimbel Izin');
    await page.clock.runFor(5_000);
    await page.goto('#/');
    const pending = page.locator('.strip', { hasText: 'Cadangan otomatis tertunda' });
    await expect(pending).toBeVisible();
    expect((await savedFile(page)).settings?.brandName).toBe('Bimbel Otomatis');
    await pending.getByRole('button', { name: 'Izinkan lagi' }).click();
    await expect(pending).toHaveCount(0);
    // The card goes as soon as the write starts; wait for the file itself.
    await expect.poll(async () => (await savedFile(page)).settings?.brandName).toBe('Bimbel Izin');

    // The file was moved: say so, and let the user pick it again.
    await page.evaluate(() => {
      localStorage.removeItem('e2e-permission');
      localStorage.setItem('e2e-moved', '1');
    });
    await page.goto('#/settings');
    await page.reload();
    await expect(brand).toHaveValue('Bimbel Izin');
    await page.clock.install({ time: Date.now() + 3 * 60_000 });
    await brand.fill('Bimbel Pindah');
    await page.clock.runFor(5_000);
    await expect(page.getByText('Berkas cadangan tidak ditemukan')).toBeVisible();
    await page.getByRole('button', { name: 'Pilih berkas lagi' }).click();
    await expect(page.getByText('Berkas cadangan tidak ditemukan')).toHaveCount(0);
    await expect.poll(async () => (await savedFile(page)).settings?.brandName).toBe('Bimbel Pindah');
  });

  test('browsers without the API only offer the manual backup', async ({ page }) => {
    await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).showSaveFilePicker);
    await page.goto('#/settings');
    await expect(page.getByText('Hanya tersedia di Chrome atau Edge versi desktop.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pilih berkas…' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Unduh cadangan' })).toBeEnabled();
  });
});
