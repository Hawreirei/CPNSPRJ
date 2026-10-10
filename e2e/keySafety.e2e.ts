import { expect, seriousViolations, test } from './fixtures';

test('the API Key page warns that extensions can read keys and says how to limit a key at each provider', async ({ page }) => {
  await page.goto('#/keys');
  const warning = page.locator('section', { has: page.getByRole('heading', { name: 'Ekstensi browser bisa membaca key Anda' }) });
  await expect(warning).toContainText('Aplikasi tidak bisa mendeteksi ekstensi seperti itu.');
  const guides = {
    'panduan Gemini': 'https://ai.google.dev/gemini-api/docs/api-key',
    'panduan OpenAI': 'https://developers.openai.com/api/docs/guides/spend-limits',
    'panduan Claude': 'https://platform.claude.com/docs/en/manage-claude/spend-limits-api',
    'panduan OpenRouter': 'https://openrouter.ai/docs/api-reference/limits',
  };
  for (const [name, href] of Object.entries(guides)) {
    const link = warning.getByRole('link', { name });
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveAttribute('target', '_blank');
  }

  // The form says the same for the provider picked.
  await expect(page.getByText('Setelah membuat key, batasi key hanya untuk Gemini API')).toBeVisible();
  await page.getByRole('button', { name: 'Claude', exact: true }).click();
  await expect(page.getByText('Setelah membuat key, pasang batas pengeluaran bulanan')).toBeVisible();

  expect(await seriousViolations(page)).toEqual([]);

  await page.goto('#/help');
  await expect(page.getByText('Ekstensi browser yang diizinkan membaca halaman bisa melihat API key Anda')).toBeVisible();
});
