import type { Page } from '@playwright/test';
import { expect, seriousViolations, test } from './fixtures';

/**
 * Sign-in with an email code (#98) against a fake Supabase Auth. The e2e build points sync at
 * https://sync.e2e.test (.env.e2e); nothing here reaches a real server.
 */
const HOST = 'https://sync.e2e.test';
const CODE = '123456';

interface AuthMock {
  calls: string[];
}

async function mockAuth(page: Page): Promise<AuthMock> {
  const mock: AuthMock = { calls: [] };
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  await page.route(`${HOST}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    mock.calls.push(`${req.method()} ${url.pathname}${url.search}`);
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
          user: {
            id: '00000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            role: 'authenticated',
            email: body.email,
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        },
      });
    }
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 404, headers: cors, json: { msg: `Not mocked: ${req.method()} ${url.pathname}` } });
  });
  return mock;
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
  expect(await seriousViolations(page)).toEqual([]);

  await page.reload();
  await expect(page.locator('#atur-akun')).toContainText('Masuk sebagai saya@contoh.id');

  await page.locator('#atur-akun').getByRole('button', { name: 'Keluar' }).click();
  await expect(page.locator('#atur-akun').getByLabel('Email')).toBeVisible();
  expect(auth.calls).toEqual(['POST /auth/v1/otp', 'POST /auth/v1/verify', 'POST /auth/v1/verify', 'POST /auth/v1/logout?scope=local']);
});
