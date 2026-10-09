import { expect, keyAndSet, seriousViolations, test } from './fixtures';

test('Kartu Hafalan TWK: learn Pancasila from the official text with the keyboard, on the notebook schedule', async ({ page }) => {
  await page.goto('#/');
  await page.getByRole('link', { name: 'Kartu Hafalan TWK' }).first().click();
  await expect(page.getByRole('heading', { name: 'Kartu Hafalan TWK', level: 1 })).toBeVisible();
  await expect(page.getByText('Pilih materi di bawah untuk mulai menghafal.')).toBeVisible();
  await expect(
    page.getByText(/Sumber: Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 Dalam Satu Naskah, Sekretariat Jenderal Majelis Permusyawaratan Rakyat/),
  ).toBeVisible();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await page.getByRole('button', { name: 'Pelajari Pancasila' }).click();
  await expect(page.getByText('Pancasila · 5 kartu, 5 dipelajari')).toBeVisible();
  await page.getByRole('button', { name: 'Mulai ulangan (5 kartu)' }).click();

  const sila = [
    'Ketuhanan Yang Maha Esa',
    'Kemanusiaan Yang Adil dan Beradab',
    'Persatuan Indonesia',
    'Kerakyatan yang dipimpin oleh hikmat kebijaksanaan',
    'Keadilan sosial bagi seluruh rakyat Indonesia',
  ];
  for (const [i, text] of sila.entries()) {
    await expect(page.getByRole('heading', { name: `Sila ke-${i + 1} Pancasila` })).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.getByText(text)).toBeVisible();
    if (i === 0) expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press(i === 1 ? '1' : '3');
  }
  await expect(page.getByText('Selesai untuk hari ini. Tidak ada kartu yang jatuh tempo. Kembali besok.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Berhenti mempelajari Pancasila' })).toBeVisible();

  // An article, from the official text, as a TWK reference opens it.
  await page.goto('#/kartu?pasal=28I');
  const article = page.locator('section', { has: page.getByRole('heading', { name: 'UUD 1945 Pasal 28I' }) });
  await expect(article.locator('li')).toHaveCount(5);
  await expect(article).toContainText('BAB XA · Hak Asasi Manusia');
  await expect(article).toContainText('Perubahan Kedua');
  await page.goto('#/kartu?pasal=99');
  await expect(page.getByText('Pasal 99 tidak ada di UUD 1945.')).toBeVisible();

  // Stopping removes the schedule.
  await page.goto('#/kartu');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Berhenti mempelajari Pancasila' }).click();
  await expect(page.getByRole('button', { name: 'Pelajari Pancasila' })).toBeVisible();
});

test('a TWK explanation whose reference cites the Constitution links to the official text', async ({ page }) => {
  const setId = (await keyAndSet(page)).split('/').pop()!;
  await page.goto(`#/simulation?set=${setId}`);
  await page.getByRole('button', { name: 'Mulai ujian' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByRole('button', { name: 'Kirim jawaban' }).click();
  await page.waitForURL(/#\/results\//);
  await page.getByRole('button', { name: 'Semua', exact: true }).click();
  // The fake model cites "UUD 1945 Pasal 1 ayat (1)" for every TWK question.
  const link = page.getByRole('link', { name: 'Lihat teks resmi Pasal 1 (tab baru)' }).first();
  await expect(link).toHaveAttribute('href', '#/kartu?pasal=1');
  const [tab] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await expect(tab.getByRole('heading', { name: 'UUD 1945 Pasal 1' })).toBeVisible();
  await expect(tab.getByText('Negara Indonesia ialah Negara Kesatuan, yang berbentuk Republik.')).toBeVisible();
});

test('Lembaga negara: a deck of quoted ayat with their source, learned with the keyboard and scheduled for later', async ({ page }) => {
  await page.clock.install();
  await page.goto('#/kartu');
  const lembaga = page.locator('section', { has: page.getByRole('heading', { name: 'Lembaga negara', level: 2 }) });
  await expect(lembaga.getByRole('listitem')).toHaveCount(7);
  await expect(lembaga).toContainText('Mahkamah Konstitusi (MK) · 5 kartu');
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await seriousViolations(page)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await lembaga.getByRole('button', { name: 'Pelajari Mahkamah Konstitusi (MK)' }).click();
  await expect(lembaga).toContainText('Mahkamah Konstitusi (MK) · 5 kartu, 5 dipelajari');
  await page.getByRole('button', { name: 'Mulai ulangan (5 kartu)' }).click();

  const fronts = [
    'Wewenang Mahkamah Konstitusi',
    'Kewajiban Mahkamah Konstitusi',
    'Jumlah hakim konstitusi, siapa yang menetapkan, dan siapa yang mengajukan',
    'Pemilihan Ketua dan Wakil Ketua Mahkamah Konstitusi',
    'Syarat hakim konstitusi',
  ];
  for (const [i, front] of fronts.entries()) {
    await expect(page.getByRole('heading', { name: front })).toBeVisible();
    await expect(page.getByText('Lembaga negara · Mahkamah Konstitusi (MK)')).toBeVisible();
    await expect(page.getByText(`Sumber: UUD 1945 Pasal 24C ayat (${i + 1})`)).toHaveCount(0);
    await page.keyboard.press('Space');
    await expect(page.getByText(`Sumber: UUD 1945 Pasal 24C ayat (${i + 1})`)).toBeVisible();
    if (i === 2) {
      await expect(page.getByText(/^Mahkamah Konstitusi mempunyai sembilan orang anggota hakim konstitusi yang ditetapkan oleh Presiden/)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
    }
    // The first is forgotten (back tomorrow), the rest easy (back in a few days).
    await page.keyboard.press(i === 0 ? '1' : '4');
  }
  await expect(page.getByText('Selesai untuk hari ini. Tidak ada kartu yang jatuh tempo. Kembali besok.')).toBeVisible();

  // Tomorrow only the forgotten card is due.
  await page.clock.setSystemTime(Date.now() + 26 * 3_600_000);
  await page.reload();
  await page.getByRole('button', { name: 'Mulai ulangan (1 kartu)' }).click();
  await expect(page.getByRole('heading', { name: 'Wewenang Mahkamah Konstitusi' })).toBeVisible();
});
