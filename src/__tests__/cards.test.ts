import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import uudJson from '../data/uud1945.json';
import { db } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { buildDecks, cardQueue, findPasal, NEW_PER_DAY, originOf, uudRefs, type UudData } from '../domain/cards';
import type { CardState } from '../domain/types';
import { gradeCard, startCards, stopCards } from '../engine/cards';
import { getReviewDays } from '../engine/review';
import { addDays, startOfDay } from '../engine/srs';

const uud = uudJson as UudData;
const decks = buildDecks(uud);
const cards = decks.flatMap((d) => d.cards);

describe('the official text (src/data/uud1945.json)', () => {
  it('has the preamble, Pancasila as the preamble words it, and every chapter with its articles', () => {
    expect(uud.source.publisher).toBe('Sekretariat Jenderal Majelis Permusyawaratan Rakyat');
    expect(uud.pembukaan).toHaveLength(4);
    expect(uud.pembukaan[0]).toMatch(/^Bahwa sesungguhnya kemerdekaan itu ialah hak segala bangsa/);
    expect(uud.pancasila).toEqual([
      'Ketuhanan Yang Maha Esa',
      'Kemanusiaan Yang Adil dan Beradab',
      'Persatuan Indonesia',
      'Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam Permusyawaratan/Perwakilan',
      'Keadilan sosial bagi seluruh rakyat Indonesia',
    ]);
    const babs = uud.babs.map((b) => b.id);
    expect(babs).toEqual([
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIIA',
      'VIIB',
      'VIII',
      'VIIIA',
      'IX',
      'IXA',
      'X',
      'XA',
      'XI',
      'XII',
      'XIII',
      'XIV',
      'XV',
      'XVI',
      'peralihan',
      'tambahan',
    ]);
    expect(uud.babs.find((b) => b.id === 'IV')).toMatchObject({ title: 'DEWAN PERTIMBANGAN AGUNG', removed: true, amendments: [4], pasal: [] });
    // Articles 1–37, with every inserted one (6A, 7A–7C, …) in place.
    const nums = new Set(uud.babs.filter((b) => !['peralihan', 'tambahan'].includes(b.id)).flatMap((b) => b.pasal.map((p) => Number.parseInt(p.id))));
    expect([...nums].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, i) => i + 1));
  });

  it('keeps the text and the amendment marks of known articles', () => {
    const p1 = findPasal(uud, '1')!.pasal;
    expect(p1.ayat.map((a) => [a.text, a.amendments])).toEqual([
      ['Negara Indonesia ialah Negara Kesatuan, yang berbentuk Republik.', undefined],
      ['Kedaulatan berada di tangan rakyat dan dilaksanakan menurut Undang-Undang Dasar.', [3]],
      ['Negara Indonesia adalah negara hukum.', [3]],
    ]);
    expect(findPasal(uud, '7C')!.pasal).toMatchObject({ text: 'Presiden tidak dapat membekukan dan/atau membubarkan Dewan Perwakilan Rakyat.', amendments: [3] });
    expect(findPasal(uud, '28I')!.pasal.ayat).toHaveLength(5);
    expect(findPasal(uud, '37')!.pasal.ayat[4].text).toBe('Khusus mengenai bentuk negara Kesatuan Republik Indonesia tidak dapat dilakukan perubahan.');
    // Changed by the third amendment and again by the fourth.
    expect(findPasal(uud, '3')!.pasal.ayat[2].amendments).toEqual([3, 4]);
    expect(findPasal(uud, 'peralihan-III')!.pasal.text).toMatch(/^Mahkamah Konstitusi dibentuk selambat-lambatnya pada 17 Agustus 2003/);
  });

  it('carries no page furniture, marks or soft hyphens inside the text', () => {
    const texts = [...uud.pembukaan, ...uud.babs.flatMap((b) => [b.title, ...b.pasal.flatMap((p) => [p.text ?? '', ...p.ayat.map((a) => a.text)])])];
    for (const t of texts) {
      expect(t).not.toMatch(/\*\)|Perubahan (Pertama|Kedua|Ketiga|Keempat)|SEKRETARIAT|­|\s{2}/);
    }
  });
});

describe('cards', () => {
  it('one per principle, preamble paragraph, and ayat or article, each with its origin', () => {
    expect(decks.map((d) => d.id).slice(0, 4)).toEqual(['pancasila', 'pembukaan', 'bab-I', 'bab-II']);
    expect(decks.some((d) => d.id === 'bab-IV')).toBe(false);
    expect(new Set(cards.map((c) => c.id)).size).toBe(cards.length);
    expect(cards.length).toBe(5 + 4 + 199);
    expect(cards.find((c) => c.id === 'pancasila-4')).toMatchObject({
      front: 'Sila ke-4 Pancasila',
      back: 'Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam Permusyawaratan/Perwakilan',
    });
    expect(cards.find((c) => c.id === 'uud-1-2')).toMatchObject({ front: 'UUD 1945 Pasal 1 ayat (2)', context: 'BAB I · Bentuk dan Kedaulatan', origin: 'Perubahan Ketiga' });
    expect(cards.find((c) => c.id === 'uud-7C')).toMatchObject({ front: 'UUD 1945 Pasal 7C', origin: 'Perubahan Ketiga' });
    expect(cards.find((c) => c.id === 'uud-peralihan-I')).toMatchObject({ front: 'UUD 1945 Aturan Peralihan Pasal I', context: 'Aturan Peralihan' });
    expect(decks.find((d) => d.id === 'bab-XA')!.title).toBe('BAB XA · Hak Asasi Manusia');
    expect(decks.find((d) => d.id === 'bab-XV')!.title).toBe('BAB XV · Bendera, Bahasa, dan Lambang Negara, serta Lagu Kebangsaan');
  });

  it('name amendments in words', () => {
    expect([originOf(undefined), originOf([2]), originOf([3, 4])]).toEqual(['Rumusan asli 1945', 'Perubahan Kedua', 'Perubahan Ketiga dan Keempat']);
  });

  it('link a TWK reference only when it cites the Constitution', () => {
    expect(uudRefs('UUD 1945 Pasal 28I ayat (1) dan Pasal 1 ayat (3)')).toEqual(['28I', '1']);
    expect(uudRefs('Undang-Undang Dasar 1945 pasal 33')).toEqual(['33']);
    expect(uudRefs('UU No. 23 Tahun 2014 Pasal 5')).toEqual([]);
    expect(uudRefs('Sila kedua Pancasila')).toEqual([]);
  });
});

describe("today's cards", () => {
  const now = new Date(2026, 9, 8, 10).getTime();
  const state = (cardId: string, extra: Partial<CardState> = {}): CardState => ({ cardId, due: startOfDay(now), interval: 0, ease: 2.5, reps: 0, lapses: 0, addedAt: 0, ...extra });
  const order = Array.from({ length: 30 }, (_, i) => `n${i}`);

  it('due reviews first, oldest first, then new cards in order, at most 20 new a day', () => {
    const states = [
      ...order.map((id) => state(id)).reverse(),
      state('r-late', { lastReviewedAt: 1, due: addDays(now, -1) }),
      state('r-old', { lastReviewedAt: 1, due: addDays(now, -5) }),
      state('r-tomorrow', { lastReviewedAt: 1, due: addDays(now, 1) }),
    ];
    const q = cardQueue(states, now, order);
    expect(q.slice(0, 2).map((s) => s.cardId)).toEqual(['r-old', 'r-late']);
    expect(q.slice(2).map((s) => s.cardId)).toEqual(order.slice(0, NEW_PER_DAY));
  });

  it('counts new cards already seen today against the allowance', () => {
    const seen = Array.from({ length: 15 }, (_, i) => state(`s${i}`, { firstReviewedAt: now - 1000, lastReviewedAt: now - 1000, due: addDays(now, 1) }));
    expect(cardQueue([...seen, ...order.map((id) => state(id))], now, order)).toHaveLength(5);
  });
});

describe('learning cards', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
  const now = new Date(2026, 9, 8, 10).getTime();

  it('starts, grades on the notebook schedule, counts for the streak, and stops', async () => {
    expect(await startCards(['pancasila-1', 'pancasila-2'], now)).toBe(2);
    expect(await startCards(['pancasila-1', 'pancasila-3'], now)).toBe(1);
    const graded = await gradeCard('pancasila-1', 'baik', now);
    expect(graded).toMatchObject({ reps: 1, interval: 1, firstReviewedAt: now, lastGrade: 'baik', due: addDays(now, 1) });
    const again = await gradeCard('pancasila-1', 'mudah', addDays(now, 1) + 3600_000);
    expect(again!.firstReviewedAt).toBe(now);
    expect(again!.interval).toBe(6);
    expect(await getReviewDays()).toHaveLength(2);
    await stopCards(['pancasila-1', 'pancasila-2', 'pancasila-3']);
    expect(await db.cards.count()).toBe(0);
  });

  it('go into backups and come back', async () => {
    await startCards(['uud-1-1'], now);
    await gradeCard('uud-1-1', 'sulit', now);
    const blob = await exportBackup();
    await db.cards.clear();
    await importBackup(new File([await blob.text()], 'cadangan.json'));
    expect(await db.cards.get('uud-1-1')).toMatchObject({ lastGrade: 'sulit', reps: 1 });
  });
});
