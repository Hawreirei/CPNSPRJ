import type { Page } from '@playwright/test';
import { expect, keyAndSet, KEY, test } from './fixtures';

// Friday 9 October 2026 in Jakarta (the suite's time zone).
const at = (iso: string) => new Date(`${iso}+07:00`);

/**
 * A stand-in for the browser's Notification API: the permission answer and every notification
 * shown are kept in localStorage, so they survive reloads and the test can read them.
 */
async function fakeNotifications(page: Page) {
  await page.addInitScript(() => {
    const get = (k: string, d: string) => localStorage.getItem(k) ?? d;
    class FakeNotification {
      static get permission() {
        return get('fake.permission', 'default');
      }
      static async requestPermission() {
        localStorage.setItem('fake.asked', String(Number(get('fake.asked', '0')) + 1));
        const answer = get('fake.answer', 'default');
        localStorage.setItem('fake.permission', answer);
        return answer;
      }
      onclick: (() => void) | null = null;
      constructor(title: string, options: NotificationOptions) {
        const shown = JSON.parse(get('fake.shown', '[]'));
        shown.push({ title, body: options.body, tag: options.tag });
        localStorage.setItem('fake.shown', JSON.stringify(shown));
        (window as unknown as { lastNotification: FakeNotification }).lastNotification = this;
      }
      close() {}
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true });
  });
}

const fake = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), `fake.${key}`);
const shown = async (page: Page) => JSON.parse((await fake(page, 'shown')) ?? '[]') as { title: string; body: string; tag: string }[];

test('a daily reminder asks permission once, shows today’s plan at most once a day, and opens the notebook', async ({ page }) => {
  await fakeNotifications(page);
  await page.clock.setFixedTime(at('2026-10-09T18:00:00'));
  const setUrl = await keyAndSet(page);

  // One exam with one answer: 29 questions go to the notebook (20 a day).
  await page.goto(setUrl);
  await page.getByRole('link', { name: 'Mulai latihan ujian' }).click();
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.keyboard.press(KEY.toLowerCase());
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);

  await page.goto('#/settings');
  await page.getByRole('button', { name: 'Buat rencana belajar' }).click();
  const toggle = page.getByRole('checkbox', { name: 'Ingatkan saya setiap hari pukul' });
  await expect(page.getByText('hanya bisa menampilkan pengingat saat aplikasi ini terbuka')).toBeVisible();
  // Opening the app never asks.
  expect(await fake(page, 'asked')).toBeNull();

  // Refused: the switch stays off, with the reason, and a refusal is not asked again.
  await page.evaluate(() => localStorage.setItem('fake.answer', 'denied'));
  await toggle.click();
  await expect(page.getByRole('status')).toContainText('Izin notifikasi ditolak');
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await fake(page, 'asked')).toBe('1');

  // Allowed (say, after changing the browser setting): on at 19:00, before that time.
  await page.evaluate(() => {
    localStorage.setItem('fake.permission', 'default');
    localStorage.setItem('fake.answer', 'granted');
  });
  await page.getByLabel('Jam pengingat').fill('19:00');
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.reload();
  expect(await shown(page)).toEqual([]);

  // 19:05: the app shows today's reminder, once.
  await page.clock.setFixedTime(at('2026-10-09T19:05:00'));
  await page.goto('#/');
  await page.reload();
  await expect.poll(() => shown(page)).toHaveLength(1);
  const [first] = await shown(page);
  expect(first.title).toBe('Waktunya belajar SKD');
  expect(first.body).toMatch(/^20 ulangan jatuh tempo, latih .+\.$/);
  expect(first.tag).toBe('study-reminder');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Beranda' })).toBeVisible();
  // A hidden-then-visible tab checks again; still once.
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(300);
  expect(await shown(page)).toHaveLength(1);

  // Next day, before the time: nothing new.
  const wake = () => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.clock.setFixedTime(at('2026-10-10T08:00:00'));
  await wake();
  await page.waitForTimeout(300);
  expect(await shown(page)).toHaveLength(1);

  // After the time, coming back to the open tab shows the next one; a click opens the notebook.
  await page.clock.setFixedTime(at('2026-10-10T19:30:00'));
  await wake();
  await expect.poll(() => shown(page)).toHaveLength(2);
  await page.evaluate(() => (window as unknown as { lastNotification: { onclick: () => void } }).lastNotification.onclick());
  await expect(page).toHaveURL(/#\/review$/);
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('the reminder goes through the service worker and carries the page to open', async ({ page }) => {
    // Headless Chromium never grants notifications, so the permission and the call are stood in for.
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { get: () => 'granted', configurable: true });
      ServiceWorkerRegistration.prototype.showNotification = async function (title: string, options?: NotificationOptions) {
        localStorage.setItem('fake.sw', JSON.stringify({ title, body: options?.body, data: options?.data, active: !!this.active }));
      };
    });
    await page.clock.setFixedTime(at('2026-10-09T18:00:00'));
    await page.goto('#/settings');
    await page.getByRole('button', { name: 'Buat rencana belajar' }).click();
    await page.getByLabel('Jam pengingat').fill('19:00');
    const toggle = page.getByRole('checkbox', { name: 'Ingatkan saya setiap hari pukul' });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await page.evaluate(() => navigator.serviceWorker.ready);

    await page.clock.setFixedTime(at('2026-10-09T19:05:00'));
    await page.reload();
    // Nothing studied yet: the first step is suggested, opening the dashboard.
    await expect
      .poll(() => fake(page, 'sw'))
      .toBe(JSON.stringify({ title: 'Waktunya belajar SKD', body: 'Kerjakan satu set Latihan Singkat.', data: { hash: '#/' }, active: true }));
  });
});
