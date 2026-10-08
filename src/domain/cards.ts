import { startOfDay } from '../engine/srs';
import type { CardState } from './types';

/*
 * Kartu Hafalan TWK (#47): flashcards built from the official text of the 1945 Constitution
 * (src/data/uud1945.json, extracted by scripts/extract-uud.mjs), never written by AI. One card per
 * ayat (or per article without ayat), per paragraph of the preamble, and per principle of Pancasila
 * as the preamble words it. Cards are learned with the notebook's spaced repetition.
 */

export interface UudAyat {
  no: number;
  text: string;
  /** Amendments (1–4) that wrote or changed it; absent for the original 1945 wording. */
  amendments?: number[];
}
export interface UudPasal {
  id: string;
  /** An article without ayat. */
  text?: string;
  amendments?: number[];
  ayat: UudAyat[];
}
export interface UudBab {
  /** Roman numeral ("XA"), or "peralihan" / "tambahan" for the transitional and additional provisions. */
  id: string;
  title: string;
  amendments?: number[];
  titleAmendments?: number[];
  /** BAB IV, removed by the fourth amendment. */
  removed?: boolean;
  pasal: UudPasal[];
}
export interface UudData {
  source: { title: string; publisher: string; fileDate: string; note: string };
  pembukaan: string[];
  pancasila: string[];
  babs: UudBab[];
}

export interface Card {
  id: string;
  deck: string;
  front: string;
  /** Where the card sits, shown above the front (e.g. the chapter). */
  context: string;
  back: string;
  /** Which amendment wrote it, or "Rumusan asli". Absent for the preamble and Pancasila. */
  origin?: string;
}

export interface Deck {
  id: string;
  title: string;
  cards: Card[];
}

const ORDINAL = ['', 'Pertama', 'Kedua', 'Ketiga', 'Keempat'];
/** "Perubahan Kedua", "Perubahan Ketiga dan Keempat", or "Rumusan asli 1945". */
export function originOf(amendments?: number[]): string {
  if (!amendments?.length) return 'Rumusan asli 1945';
  const names = amendments.map((n) => ORDINAL[n]);
  return `Perubahan ${names.length > 1 ? `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]}` : names[0]}`;
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[\s(/-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Dan|Serta)\b/g, (w) => w.toLowerCase());

/** "BAB XA · Hak Asasi Manusia", or "Aturan Peralihan". */
export const babLabel = (b: Pick<UudBab, 'id' | 'title'>) => (b.id === 'peralihan' || b.id === 'tambahan' ? b.title : `BAB ${b.id} · ${titleCase(b.title)}`);

/** "Pasal 28I", or "Aturan Peralihan Pasal I". */
export const pasalLabel = (b: Pick<UudBab, 'id' | 'title'>, p: Pick<UudPasal, 'id'>) =>
  b.id === 'peralihan' || b.id === 'tambahan' ? `${b.title} Pasal ${p.id}` : `Pasal ${p.id}`;

const pasalKey = (b: UudBab, p: UudPasal) => (b.id === 'peralihan' || b.id === 'tambahan' ? `${b.id}-${p.id}` : p.id);

/** Every deck, in the order of the Constitution: Pancasila, the preamble, then each chapter that has articles. */
export function buildDecks(uud: UudData): Deck[] {
  const decks: Deck[] = [
    {
      id: 'pancasila',
      title: 'Pancasila',
      cards: uud.pancasila.map((text, i) => ({
        id: `pancasila-${i + 1}`,
        deck: 'pancasila',
        front: `Sila ke-${i + 1} Pancasila`,
        context: 'Pancasila, sebagaimana dirumuskan dalam Pembukaan UUD 1945 alinea keempat',
        back: text,
      })),
    },
    {
      id: 'pembukaan',
      title: 'Pembukaan UUD 1945',
      cards: uud.pembukaan.map((text, i) => ({
        id: `pembukaan-${i + 1}`,
        deck: 'pembukaan',
        front: `Pembukaan UUD 1945, alinea ke-${i + 1}`,
        context: 'Pembukaan (Preambule)',
        back: text,
      })),
    },
  ];
  for (const b of uud.babs) {
    if (b.removed || !b.pasal.length) continue;
    const deck = `bab-${b.id}`;
    const cards = b.pasal.flatMap((p): Card[] =>
      p.ayat.length
        ? p.ayat.map((a) => ({
            id: `uud-${pasalKey(b, p)}-${a.no}`,
            deck,
            front: `UUD 1945 ${pasalLabel(b, p)} ayat (${a.no})`,
            context: babLabel(b),
            back: a.text,
            origin: originOf(a.amendments),
          }))
        : [{ id: `uud-${pasalKey(b, p)}`, deck, front: `UUD 1945 ${pasalLabel(b, p)}`, context: babLabel(b), back: p.text ?? '', origin: originOf(p.amendments) }],
    );
    decks.push({ id: deck, title: babLabel(b), cards });
  }
  return decks;
}

/** The article a reference names, with its chapter; aturan articles are looked up as "peralihan-I". */
export function findPasal(uud: UudData, id: string): { bab: UudBab; pasal: UudPasal } | undefined {
  for (const bab of uud.babs) for (const pasal of bab.pasal) if (pasalKey(bab, pasal).toUpperCase() === id.toUpperCase()) return { bab, pasal };
  return undefined;
}

/**
 * Articles of the Constitution a question's reference cites, e.g. "UUD 1945 Pasal 28I ayat (1)" →
 * ["28I"]. Only when the reference names the Constitution, so another law's "Pasal 5" never links.
 */
export function uudRefs(reference = ''): string[] {
  if (!/\bUUD\b|Undang-Undang Dasar/i.test(reference)) return [];
  return [...new Set([...reference.matchAll(/\bPasal\s+(\d{1,2}[A-J]?)\b/gi)].map((m) => m[1].toUpperCase()))].slice(0, 3);
}

/** At most this many cards seen for the first time per day, so starting a large chapter is not a wall of cards. */
export const NEW_PER_DAY = 20;

/**
 * Today's cards: those due for review first (oldest first), then cards never seen, in the
 * Constitution's order, up to what is left of today's allowance for new cards.
 */
export function cardQueue(states: readonly CardState[], now: number, order: readonly string[], newPerDay = NEW_PER_DAY): CardState[] {
  const today = startOfDay(now);
  const rank = new Map(order.map((id, i) => [id, i]));
  const due = states.filter((s) => s.lastReviewedAt !== undefined && s.due <= now).sort((a, b) => a.due - b.due);
  const seenToday = states.filter((s) => (s.firstReviewedAt ?? -1) >= today).length;
  const fresh = states
    .filter((s) => s.lastReviewedAt === undefined)
    .sort((a, b) => (rank.get(a.cardId) ?? Infinity) - (rank.get(b.cardId) ?? Infinity))
    .slice(0, Math.max(0, newPerDay - seenToday));
  return [...due, ...fresh];
}
