import { describe, expect, it } from 'vitest';
import { LEMBAGA_NEGARA } from '../data/lembagaNegara';
import uudJson from '../data/uud1945.json';
import { buildDecks, buildLembagaDecks, type UudData } from '../domain/cards';

const uud = uudJson as UudData;
const decks = buildLembagaDecks(uud, LEMBAGA_NEGARA);
const cards = decks.flatMap((d) => d.cards);

/** The ayat (or article) straight from the data, without the code under test. */
function quote(pasal: string, ayat?: number) {
  const p = uud.babs.flatMap((b) => b.pasal).find((x) => x.id === pasal);
  return ayat === undefined ? p?.text : p?.ayat.find((a) => a.no === ayat)?.text;
}

describe('Kartu Hafalan TWK: lembaga negara (#61)', () => {
  it('has a deck per institution, in the order of the Constitution', () => {
    expect(decks.map((d) => d.title)).toEqual([
      'Majelis Permusyawaratan Rakyat (MPR)',
      'Dewan Perwakilan Rakyat (DPR)',
      'Dewan Perwakilan Daerah (DPD)',
      'Badan Pemeriksa Keuangan (BPK)',
      'Mahkamah Agung (MA)',
      'Komisi Yudisial (KY)',
      'Mahkamah Konstitusi (MK)',
    ]);
    expect(decks.map((d) => d.cards.length)).toEqual([6, 14, 7, 6, 4, 3, 5]);
  });

  it('quotes every answer exactly from the official text, and names its article and ayat', () => {
    for (const l of LEMBAGA_NEGARA) {
      for (const r of l.refs) {
        const card = cards.find((c) => c.id === `lembaga-${l.id}-${r.pasal}${r.ayat ? `-${r.ayat}` : ''}`)!;
        const text = quote(r.pasal, r.ayat);
        expect(text, `${l.id} Pasal ${r.pasal} ayat ${r.ayat}`).toBeTruthy();
        expect(card.back).toBe(text);
        expect(card.source).toBe(`UUD 1945 Pasal ${r.pasal}${r.ayat ? ` ayat (${r.ayat})` : ''}`);
        expect(card.origin).toMatch(/^(Perubahan|Rumusan asli 1945)/);
      }
    }
  });

  it("takes each institution's cards only from its own articles, as #61 lists them", () => {
    const own: Record<string, string[]> = {
      mpr: ['2', '3'],
      dpr: ['19', '20', '20A', '21', '22', '22A', '22B'],
      dpd: ['22C', '22D'],
      bpk: ['23E', '23F', '23G'],
      ma: ['24A'],
      ky: ['24B'],
      mk: ['24C'],
    };
    for (const l of LEMBAGA_NEGARA) {
      expect(l.pasal).toEqual(own[l.id]);
      for (const r of l.refs) expect(own[l.id]).toContain(r.pasal);
    }
  });

  it('has no duplicate or clashing cards, and no prompt that gives the answer away', () => {
    const ids = cards.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const uudIds = new Set(buildDecks(uud).flatMap((d) => d.cards.map((c) => c.id)));
    expect(ids.filter((id) => uudIds.has(id))).toEqual([]);
    for (const c of cards) {
      expect(c.front.length).toBeLessThan(110);
      expect(c.back.includes(c.front)).toBe(false);
    }
  });

  it('refuses a reference to an ayat that does not exist', () => {
    expect(() => buildLembagaDecks(uud, [{ id: 'x', name: 'X', pasal: ['24C'], refs: [{ pasal: '24C', ayat: 9, front: 'X' }] }])).toThrow(/Pasal 24C ayat \(9\)/);
    expect(() => buildLembagaDecks(uud, [{ id: 'x', name: 'X', pasal: ['99'], refs: [{ pasal: '99', front: 'X' }] }])).toThrow(/Pasal 99/);
  });
});
