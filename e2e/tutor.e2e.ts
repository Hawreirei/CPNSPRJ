import AxeBuilder from '@axe-core/playwright';
import { expect, keyAndSet, test } from './fixtures';

test('the tutor explains a question, its answer can be kept as a note, and a doubtful key leads to a report', async ({ page, gemini }) => {
  const setUrl = await keyAndSet(page);
  await page.goto(`#/simulation?set=${setUrl.split('/').pop()}&mode=practice`);
  await page.getByRole('button', { name: 'Mulai latihan' }).click();
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();
  const stem = (await page
    .locator('main')
    .getByText(/^Soal uji TWK \d+ tentang/)
    .first()
    .textContent())!;
  await page.keyboard.press('b');

  await page.getByRole('button', { name: 'Tanya AI' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/^1 permintaan AI dengan .*, sekitar/)).toBeVisible();
  const r = await new AxeBuilder({ page }).include('dialog').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);

  // The wrong answer unlocks "why was mine wrong?"; the tutor sees the question and that answer, nothing else.
  await dialog.getByRole('button', { name: 'Mengapa jawaban saya (B) salah?' }).click();
  await expect(dialog.getByText('Penjelasan uji 1: kunci A sesuai pembahasan.')).toBeVisible();
  expect(gemini.tutorPrompts[0]).toContain(`Soal: ${stem}`);
  expect(gemini.tutorPrompts[0]).toContain('Kunci jawaban: A');
  expect(gemini.tutorPrompts[0]).toContain('Jawaban pengguna: B');
  expect(gemini.tutorPrompts[0]).not.toMatch(/AIza|originSetId|"id"/);

  // Typing in the dialog does not drive the practice session behind it.
  await dialog.getByLabel('Pertanyaan Anda').fill('Lalu bagaimana');
  await dialog.getByLabel('Pertanyaan Anda').press('ArrowRight');
  await dialog.getByLabel('Pertanyaan Anda').press('Enter');
  await expect(page.getByText('Soal 1', { exact: true })).toBeVisible();

  await dialog.getByRole('button', { name: 'Simpan sebagai catatan' }).click();
  await expect(dialog.getByRole('button', { name: 'Tersimpan sebagai catatan' })).toBeVisible();

  // Doubt about the key: the tutor says so, and reporting is one click away.
  await dialog.getByLabel('Pertanyaan Anda').fill('Apakah kuncinya salah?');
  await dialog.getByRole('button', { name: 'Kirim' }).click();
  await expect(dialog.getByText(/mungkin keliru/)).toBeVisible();
  // The earlier turn travels with the follow-up.
  expect(gemini.tutorPrompts[1]).toContain('Tutor: Penjelasan uji 1');
  await dialog.getByRole('button', { name: 'Laporkan soal' }).click();
  await expect(page.getByRole('dialog').getByText('Ada masalah dengan soal ini?')).toBeVisible();
  await page.keyboard.press('Escape');

  // The note stays with the question.
  await expect(page.getByText('Catatan Anda')).toBeVisible();
  await expect(page.getByText('Penjelasan uji 1: kunci A sesuai pembahasan.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Penjelasan uji 1: kunci A sesuai pembahasan.')).toBeVisible();
  await page.getByRole('button', { name: 'Hapus catatan' }).click();
  await expect(page.getByText('Catatan Anda')).toHaveCount(0);
});
