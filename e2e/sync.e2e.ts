import type { Page } from '@playwright/test';
import { expect, keyAndSet, seriousViolations, test } from './fixtures';

/**
 * Sign-in with an email code (#98) against a fake Supabase Auth. The e2e build points sync at
 * https://sync.e2e.test (.env.e2e); nothing here reaches a real server.
 */
const HOST = 'https://sync.e2e.test';
const CODE = '123456';

interface Row {
  tbl: string;
  id: string;
  data: unknown;
  deleted: boolean;
  mtime: number;
  updated_at: string;
}

/**
 * A fake Supabase for one account: Auth (code sign-in) and the sync_rows API with the rules of
 * supabase/migrations. Shared by every page it is installed on, like the real server.
 */
class FakeCloud {
  calls: string[] = [];
  rows = new Map<string, Row>();
  /** Every push payload, for checking what left the browser. */
  pushed: string[] = [];
  private clock = 0;

  async install(page: Page) {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    await page.route(`${HOST}/**`, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      this.calls.push(`${req.method()} ${url.pathname}${url.pathname.startsWith('/auth') ? url.search : ''}`);
      if (url.pathname === '/auth/v1/otp') return route.fulfill({ headers: cors, json: {} });
      if (url.pathname === '/auth/v1/verify') {
        const body = req.postDataJSON() as { email: string; token: string };
        if (body.token !== CODE) {
          return route.fulfill({ status: 403, headers: cors, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } });
        }
        const now = Math.floor(Date.now() / 1000);
        return route.fulfill({
          headers: cors,
          json: {
            access_token: 'e2e-access',
            token_type: 'bearer',
            expires_in: 3600,
            expires_at: now + 3600,
            refresh_token: 'e2e-refresh',
            user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: body.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
          },
        });
      }
      if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
      if (url.pathname === '/rest/v1/rpc/sync_push') {
        const raw = req.postData() ?? '';
        this.pushed.push(raw);
        return route.fulfill({ headers: cors, json: this.push((JSON.parse(raw) as { rows: Row[] }).rows) });
      }
      if (url.pathname === '/rest/v1/rpc/sync_pull') return route.fulfill({ headers: cors, json: this.pull(req.postDataJSON()) });
      if (url.pathname === '/rest/v1/sync_rows') {
        const tbl = url.searchParams.get('tbl')?.replace('eq.', '');
        const n = [...this.rows.values()].filter((r) => r.tbl === tbl && !r.deleted).length;
        return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `*/${n}` }, body: '' });
      }
      return route.fulfill({ status: 404, headers: cors, json: { message: `Not mocked: ${req.method()} ${url.pathname}` } });
    });
  }

  private push(rows: Row[]) {
    const applied = [];
    for (const r of rows) {
      const key = `${r.tbl}/${r.id}`;
      const cur = this.rows.get(key);
      if (cur && r.mtime < cur.mtime) continue;
      const updated_at = new Date(Date.UTC(2026, 9, 12) + ++this.clock * 1000).toISOString();
      this.rows.set(key, { tbl: r.tbl, id: r.id, data: r.deleted ? null : r.data, deleted: !!r.deleted, mtime: r.mtime, updated_at });
      applied.push({ applied_tbl: r.tbl, applied_id: r.id, applied_mtime: r.mtime });
    }
    return applied;
  }

  private pull(p: { after_at: string; after_tbl: string; after_id: string; max_rows: number }) {
    const k = (at: string, tbl: string, id: string) => `${at}|${tbl}|${id}`;
    const from = k(p.after_at, p.after_tbl, p.after_id);
    return [...this.rows.values()]
      .filter((r) => k(r.updated_at, r.tbl, r.id) > from)
      .sort((a, b) => (k(a.updated_at, a.tbl, a.id) > k(b.updated_at, b.tbl, b.id) ? 1 : -1))
      .slice(0, p.max_rows);
  }
}

const USER_ID = '00000000-0000-4000-8000-000000000001';

async function mockAuth(page: Page): Promise<FakeCloud> {
  const cloud = new FakeCloud();
  await cloud.install(page);
  return cloud;
}

async function signIn(page: Page, email = 'saya@contoh.id') {
  await page.goto('#/settings');
  const card = page.locator('#atur-akun');
  await card.getByLabel('Email').fill(email);
  await card.getByRole('button', { name: 'Kirim kode' }).click();
  await card.getByLabel('Kode dari email').fill(CODE);
  await card.getByRole('button', { name: 'Masuk' }).click();
  await expect(card).toContainText(`Masuk sebagai ${email}`);
  return card;
}

test('a learner who never signs in sends nothing to the sync server', async ({ page }) => {
  const auth = await mockAuth(page);
  await page.goto('#/settings');
  await expect(page.getByRole('heading', { name: 'Akun & sinkronisasi (beta)' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await page.goto('#/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(auth.calls).toEqual([]);
});

test('signs in with the code from the email, stays signed in after a reload, and signs out', async ({ page }) => {
  const auth = await mockAuth(page);
  await page.goto('#/settings');
  const card = page.locator('#atur-akun');
  await card.getByLabel('Email').fill('Saya@Contoh.id');
  await card.getByRole('button', { name: 'Kirim kode' }).click();
  await expect(card.getByRole('status')).toContainText('saya@contoh.id');
  await expect(card.getByRole('button', { name: /Kirim ulang \(\d+ dtk\)/ })).toBeDisabled();
  expect(await seriousViolations(page)).toEqual([]);

  // A wrong code says so and keeps the form.
  await card.getByLabel('Kode dari email').fill('000000');
  await card.getByRole('button', { name: 'Masuk' }).click();
  await expect(card.getByRole('alert')).toContainText('Kode salah atau sudah kedaluwarsa');

  await card.getByLabel('Kode dari email').fill(CODE);
  await card.getByRole('button', { name: 'Masuk' }).click();
  await expect(card).toContainText('Masuk sebagai saya@contoh.id');
  // An empty device needs no question: it syncs at once.
  await expect(card.getByRole('status')).toContainText('Tersinkron');
  expect(await seriousViolations(page)).toEqual([]);

  await page.reload();
  await expect(page.locator('#atur-akun')).toContainText('Masuk sebagai saya@contoh.id');

  await page.locator('#atur-akun').getByText('Keluar dari akun').click();
  await page.locator('#atur-akun').getByRole('button', { name: 'Keluar, data tetap di perangkat ini' }).click();
  await expect(page.locator('#atur-akun').getByLabel('Email')).toBeVisible();
  expect(auth.calls.filter((c) => c.includes('/auth/'))).toEqual(['POST /auth/v1/otp', 'POST /auth/v1/verify', 'POST /auth/v1/verify', 'POST /auth/v1/logout?scope=local']);
});

test('a set made on one device comes back on another after signing in there, without the API key', async ({ page, browser }) => {
  const cloud = await mockAuth(page);
  const setUrl = await keyAndSet(page);

  // Device A has data: signing in asks first, says what is where, and keeps a backup before combining.
  const card = await signIn(page);
  await expect(card).toContainText('Perangkat ini sudah berisi 1 set, 30 soal, 0 latihan');
  await expect(card).toContainText('Akun Anda di cloud berisi 0 set, 0 soal, 0 latihan');
  expect(cloud.calls.filter((c) => c.includes('sync_push'))).toEqual([]);
  expect(await seriousViolations(page)).toEqual([]);
  await card.getByRole('button', { name: 'Gabungkan dan sinkronkan' }).click();
  await expect(card.getByRole('status')).toContainText('Tersinkron');
  await expect(card.getByRole('button', { name: /Unduh cadangan sebelum sinkronisasi pertama/ })).toBeVisible();
  expect(cloud.pushed.join('\n')).not.toMatch(/AIza|cipher/);
  expect([...cloud.rows.keys()].filter((k) => k.startsWith('questions/'))).toHaveLength(30);

  // Device B: a browser with nothing stored (as after the browser cleared its data).
  const ctx = await browser.newContext({ baseURL: test.info().project.use.baseURL, serviceWorkers: 'block' });
  await ctx.route(
    (url) => url.hostname !== 'localhost' && url.hostname !== new URL(HOST).hostname,
    (route) => route.abort('blockedbyclient'),
  );
  const b = await ctx.newPage();
  await cloud.install(b);
  const cardB = await signIn(b);
  await expect(cardB.getByRole('status')).toContainText('Tersinkron');
  await b.goto(new URL(setUrl).hash);
  await expect(b.getByText(/Siap dipakai · 30 soal/)).toBeVisible();
  await expect(b.getByText(/Soal uji TWK \d+ tentang Pancasila/).first()).toBeVisible();
  // The key stayed on device A.
  await b.goto('#/keys');
  await expect(b.getByPlaceholder('AIza…')).toHaveValue('');
  await ctx.close();
});
