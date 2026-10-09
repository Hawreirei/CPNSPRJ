import type { CDPSession, Page } from '@playwright/test';
import { keyAndSet, test } from './fixtures';

/*
 * How fast the main pages become usable on a slow phone (#70). Measured in CI only, never on a
 * user's device (#39). The throttling is Lighthouse's mobile profile: "slow 4G" (150 ms round trip,
 * 1.6 Mbps down, 750 kbps up) and a CPU four times slower.
 */
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 };
const CPU_SLOWDOWN = 4;
/** Each page is loaded this many times; the median counts. */
const RUNS = 3;

interface Metrics {
  /** Largest contentful paint, ms after navigation start. */
  lcp: number;
  /** The heading is on screen and the main control can be used. */
  usable: number;
  /** Long tasks' time over 50 ms each, until usable: a rough total blocking time. */
  tbt: number;
}

/*
 * Budgets in ms. Three CI runs (9 October 2026) gave these medians for LCP / usable:
 *   dashboard 1216–1228 / 1249–1262, exam 1752–1784 / 1736–1770, practice 1768–1824 / 1755–1813,
 *   exam from the service worker 516–568 / 499–545; total blocking time 0 in every median.
 * Each budget is about 1.4× that median, rounded up to 100 ms, so the runner's noise (the
 * slowest single load seen was 2028 ms, a practice) does not fail a run, while a page that got
 * 40% slower does. All of them stay under the 3 s LCP the proposal aims for (§8). TBT: 200 ms,
 * where Lighthouse starts calling it slow.
 */
const BUDGET: Record<string, Metrics> = {
  'dashboard, first visit': { lcp: 1800, usable: 1800, tbt: 200 },
  'exam, first visit': { lcp: 2500, usable: 2500, tbt: 200 },
  'practice, first visit': { lcp: 2600, usable: 2600, tbt: 200 },
  'exam, repeat visit': { lcp: 800, usable: 800, tbt: 200 },
};

const report: string[] = [];

test.beforeEach(async ({ page }) => {
  // Collect paints and long tasks from the very start of every document.
  await page.addInitScript(() => {
    const w = window as unknown as { __lcp: number; __long: { start: number; duration: number }[] };
    w.__lcp = 0;
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
  });
});

test.afterAll(() => {
  // Printed once: Playwright may run afterAll more than once in a worker, so the rows go with it.
  if (report.length) console.log(['', 'page | LCP ms | usable ms | TBT ms', ...report.splice(0)].join('\n'));
});

async function throttle(cdp: CDPSession, on: boolean) {
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', on ? SLOW_4G : { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? CPU_SLOWDOWN : 1 });
}

/** Load `url` RUNS times, throttled, and wait until `ready` says the page can be used. */
async function measure(page: Page, name: string, url: string, ready: Ready, { cold }: { cold: boolean }): Promise<Metrics> {
  const cdp = await page.context().newCDPSession(page);
  const runs: Metrics[] = [];
  for (let i = 0; i < RUNS; i++) {
    if (cold) await cdp.send('Network.clearBrowserCache');
    await page.goto('about:blank');
    await throttle(cdp, true);
    await page.goto(url, { waitUntil: 'commit' });
    const usable = (await (await page.waitForFunction(isReady, ready, { polling: 'raf', timeout: 60_000 })).jsonValue()) as number;
    // LCP settles once nothing larger paints; give it a moment, then stop throttling before reading.
    await page.waitForTimeout(500);
    await throttle(cdp, false);
    const m = await page.evaluate((until) => {
      const w = window as unknown as { __lcp: number; __long: { start: number; duration: number }[] };
      return { lcp: w.__lcp, tbt: w.__long.filter((t) => t.start < until).reduce((n, t) => n + Math.max(0, t.duration - 50), 0) };
    }, usable);
    runs.push({ lcp: Math.round(m.lcp), usable: Math.round(usable), tbt: Math.round(m.tbt) });
  }
  const median = (k: keyof Metrics) => runs.map((r) => r[k]).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
  const result = { lcp: median('lcp'), usable: median('usable'), tbt: median('tbt') };
  report.push(`${name} | ${result.lcp} | ${result.usable} | ${result.tbt}   (runs: ${runs.map((r) => `${r.lcp}/${r.usable}/${r.tbt}`).join(', ')})`);
  return result;
}

function check(name: string, m: Metrics) {
  const b = BUDGET[name];
  if (!b) return;
  for (const k of ['lcp', 'usable', 'tbt'] as const) test.expect(m[k], `${name}: ${k} ${m[k]} ms, budget ${b[k]} ms`).toBeLessThanOrEqual(b[k]);
}

type Ready = 'dashboard' | 'question';

/**
 * Runs in the page (no eval: the build's CSP forbids it). The time the page became usable, or
 * false: the dashboard with its "+ Buat soal" link, or question 1 with an option that can be chosen.
 */
function isReady(ready: Ready): number | false {
  const ok =
    ready === 'dashboard'
      ? !!document.querySelector('h1') && [...document.querySelectorAll('a')].some((a) => a.textContent?.includes('Buat soal'))
      : [...document.querySelectorAll('main h2')].some((h) => h.textContent?.trim() === 'Soal 1') &&
        [...document.querySelectorAll('main button')].some((b) => /^[A-E]/.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled);
  return ok && performance.now();
}

const hashPath = (page: Page) => '#/' + page.url().split('#/')[1];

test('the dashboard, an exam and a practice become usable quickly on a slow phone, first visit', async ({ page }) => {
  test.setTimeout(240_000);
  check('dashboard, first visit', await measure(page, 'dashboard, first visit', './', 'dashboard', { cold: true }));

  // An exam and a practice to open, made without throttling.
  const setId = (await keyAndSet(page)).split('/').pop();
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).tap();
  await page.waitForURL(/#\/cat\//);
  const exam = hashPath(page);
  await page.goto(`#/simulation?set=${setId}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).tap();
  await page.waitForURL(/#\/practice\//);
  const practice = hashPath(page);

  check('exam, first visit', await measure(page, 'exam, first visit', exam, 'question', { cold: true }));
  check('practice, first visit', await measure(page, 'practice, first visit', practice, 'question', { cold: true }));
});

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('an exam opened again comes from the service worker and is usable quickly', async ({ page }) => {
    test.setTimeout(240_000);
    const setId = (await keyAndSet(page)).split('/').pop();
    await page.goto(`#/simulation?set=${setId}`);
    await page.getByRole('button', { name: 'Mulai ujian' }).tap();
    await page.waitForURL(/#\/cat\//);
    const exam = hashPath(page);
    // Everything precached (unthrottled), and the page controlled by the worker from here on.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    test.expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

    check('exam, repeat visit', await measure(page, 'exam, repeat visit', exam, 'question', { cold: false }));
  });
});
