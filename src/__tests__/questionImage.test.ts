import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { SKD_CPNS } from '../domain/examPackage';
import { cropBox, NEEDS_IMAGE_NOTE, parseImportedPage } from '../domain/photoImport';
import { imageUsage, isImageSrc, MAX_IMAGE_CHARS, printSize } from '../domain/questionImage';
import { parseShared, toShared } from '../domain/share';
import { tutorContext } from '../domain/tutor';
import type { Question } from '../domain/types';
import { loadMath } from '../domain/validators';
import { saveImported } from '../engine/photoImport';
import { getStorageInfo } from '../engine/storage';

const JPEG = `data:image/jpeg;base64,${'A'.repeat(400)}`;
const SKD = { pkg: SKD_CPNS, topics: { TIU: ['Analisis Data'] } };
const figureQuestion = {
  no: 7,
  subtest: 'TIU',
  topic: 'Analisis Data',
  stem: 'Berdasarkan grafik di atas, penjualan tertinggi terjadi pada tahun …',
  options: ['2020', '2021', '2022', '2023', '2024'].map((text) => ({ text })),
  answer: 'C',
  answerFromPage: true,
  figure: true,
};

beforeEach(async () => {
  await loadMath();
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('a question that shows a picture on the page (#49)', () => {
  it('is kept as a draft that needs its picture, when its options are text', () => {
    const r = parseImportedPage(JSON.stringify({ questions: [figureQuestion, { ...figureQuestion, no: 8, options: [] }] }), SKD);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ needsImage: true, notes: [NEEDS_IMAGE_NOTE] });
    expect(r.skipped).toEqual([{ no: 8, reason: 'pilihan jawabannya berupa gambar; soal seperti ini belum bisa diimpor' }]);
  });

  it('is cut from the page where the learner dragged, at most 1000 px, whichever way they dragged', () => {
    expect(cropBox({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, { width: 1000, height: 1400 })).toEqual({ sx: 100, sy: 280, sw: 500, sh: 350, width: 500, height: 350 });
    expect(cropBox({ x: 0.6, y: 0.45, w: -0.5, h: -0.25 }, { width: 1000, height: 1400 })).toMatchObject({ sx: 100, sy: 280, sw: 500, sh: 350 });
    expect(cropBox({ x: -0.2, y: 0, w: 2, h: 1 }, { width: 1200, height: 1600 })).toEqual({ sx: 0, sy: 0, sw: 1200, sh: 1600, width: 750, height: 1000 });
  });

  it('is only ever a JPEG or PNG data URL within the size cap', () => {
    expect(isImageSrc(JPEG)).toBe(true);
    expect(isImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(isImageSrc('https://contoh.test/gambar.jpg')).toBe(false);
    expect(isImageSrc('javascript:alert(1)')).toBe(false);
    expect(isImageSrc(`data:image/jpeg;base64,${'A'.repeat(MAX_IMAGE_CHARS)}`)).toBe(false);
    expect(printSize({ width: 1000, height: 500 })).toEqual({ width: 360, height: 180 });
  });
});

function withPicture(): Question {
  const q = parseImportedPage(JSON.stringify({ questions: [figureQuestion] }), SKD).drafts[0].question;
  return { ...q, image: { src: JPEG, alt: 'Grafik batang penjualan 2020–2024', width: 400, height: 250 } };
}

describe('a question with its picture', () => {
  it('is saved to the bank with it, counted in storage', async () => {
    await saveImported([withPicture()]);
    const saved = (await db.questions.toArray())[0];
    expect(saved.image).toMatchObject({ alt: 'Grafik batang penjualan 2020–2024', width: 400 });
    expect((await getStorageInfo()).images).toEqual({ count: 1, bytes: Math.round(JPEG.length * 0.75) });
    expect(imageUsage([saved, { image: undefined }])).toMatchObject({ count: 1 });
  });

  it('travels in a shared set only when the learner includes imported questions, and a forged picture is refused', () => {
    const bp = {
      sections: [{ subtest: 'TIU', count: 1, topics: ['Analisis Data'], difficulty: 'campuran' as const }],
      durationMinutes: 5,
      passing: { TWK: 65, TIU: 80, TKP: 166 },
    };
    expect(toShared('S', bp, [withPicture(), { ...withPicture(), id: 'x', source: 'ai', image: undefined }]).questions.some((q) => q.image)).toBe(false);
    const shared = JSON.parse(JSON.stringify(toShared('S', bp, [withPicture()], { includeImported: true })));
    expect(parseShared(shared).questions[0].image?.alt).toBe('Grafik batang penjualan 2020–2024');
    shared.questions[0].image.src = 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+';
    expect(() => parseShared(shared)).toThrow('gambar soal tidak valid');
  });

  it('is not shown to the tutor, who is told so instead of guessing', () => {
    expect(tutorContext(withPicture())).toContain('Soal ini memuat gambar yang tidak bisa Anda lihat (keterangan dari pengguna: "Grafik batang penjualan 2020–2024")');
    expect(tutorContext(withPicture())).not.toContain('base64');
  });
});
