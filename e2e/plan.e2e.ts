import { readFile } from 'node:fs/promises';
import { expect, keyAndSet, KEY, test } from './fixtures';

// Friday 9 October 2026, 09:00 in Jakarta (the suite's time zone). Timers keep running.
const FRIDAY = new Date('2026-10-09T09:00:00+07:00');
const SATURDAY = new Date('2026-10-10T09:00:00+07:00');

test("a study plan shows the countdown, today's targets and readiness, and exports a calendar", async ({ page }) => {
  await page.clock.setFixedTime(FRIDAY);
  const setUrl = await keyAndSet(page);

  // One exam: all 10 TWK right, the other 20 empty, so 20 questions go to the notebook.
  await page.goto(setUrl);
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press(KEY.toLowerCase());
    await page.keyboard.press('ArrowRight');
  }
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  // Without a plan the dashboard only offers to make one.
  await page.goto('#/');
  await page.getByRole('link', { name: 'Buat rencana' }).click();
  await page.getByRole('button', { name: 'Buat rencana belajar' }).click();
  await page.getByLabel('Tanggal ujian (opsional)').fill('2026-11-21');
  await page.getByLabel('Waktu belajar per hari (menit)').fill('90');

  await page.goto('#/');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Rencana belajar' }) });
  await expect(card).toContainText('43 hari lagi');
  await expect(card).toContainText('Sabtu, 21 November 2026');
  await expect(card).toContainText('Target hari ini (± 90 menit)');
  await expect(card).toContainText('Ulangi 20 soal di Buku Kesalahan · ± 30 menit');
  await expect(card.getByRole('link', { name: 'Latih' })).toBeVisible();
  await expect(card).toContainText('± 60 menit');
  // Not a Saturday: no simulation today.
  await expect(card).not.toContainText('Simulasi SKD penuh');
  // TWK 10 of 10 is 150 on the full scale; TIU 0 against a target of 88. Readiness has its own card.
  const ready = page.locator('section', { has: page.getByRole('heading', { name: 'Kesiapan menurut ujian terakhir' }) });
  await expect(ready).toContainText('rata-rata 150 · target 72');
  await expect(ready).toContainText('Rata-rata 1 ujian terakhir');
  await expect(ready).toContainText('1 dari 1 mencapai target');
  await expect(ready).toContainText('kurang 88 poin');
  await expect(ready).toContainText('bukan peluang kelulusan');

  // The practice target opens practice mode on the suggested topics.
  await card.getByRole('link', { name: 'Latih' }).click();
  await expect(page.getByRole('radio', { name: /Latihan/ })).toHaveAttribute('aria-checked', 'true');

  // Calendar file: weekly Saturday simulations until the day before the exam, and the exam day.
  await page.goto('#/settings');
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Unduh jadwal ke kalender (.ics)' }).click()]);
  expect(file.suggestedFilename()).toBe('jadwal-belajar-skd.ics');
  const ics = await readFile((await file.path())!, 'utf8');
  expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261120');
  expect(ics).toContain('DTSTART;VALUE=DATE:20261121');

  // Saturday: the weekly simulation joins today's targets.
  await page.clock.setFixedTime(SATURDAY);
  await page.goto('#/');
  await page.reload();
  await expect(card).toContainText('42 hari lagi');
  await expect(card).toContainText('Simulasi SKD penuh (jadwal mingguan, hari Sabtu)');
});

test('a plan without an exam date still sets daily targets', async ({ page }) => {
  await page.clock.setFixedTime(FRIDAY);
  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Buat rencana belajar' }).click();
  await page.goto('#/');
  const card = page.locator('section', { has: page.getByRole('heading', { name: 'Rencana belajar' }) });
  await expect(card).toContainText('Tanggal ujian belum diisi');
  await expect(card).toContainText('Kerjakan satu set Latihan Singkat untuk mengukur kemampuan awal');

  // A date that has passed is called out instead of counted.
  await page.goto('#/settings');
  await page.getByLabel('Tanggal ujian (opsional)').fill('2026-10-01');
  await page.goto('#/');
  await expect(card).toContainText('sudah lewat');
});
