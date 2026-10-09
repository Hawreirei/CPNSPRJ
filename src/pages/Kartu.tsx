import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import uudJson from '../data/uud1945.json';
import { db } from '../db';
import { LEMBAGA_NEGARA } from '../data/lembagaNegara';
import { babLabel, buildDecks, buildLembagaDecks, cardQueue, findPasal, originOf, pasalLabel, type Card, type Deck, type UudData } from '../domain/cards';
import { GRADES, type Grade } from '../domain/types';
import { gradeCard, startCards, stopCards } from '../engine/cards';
import { Badge } from '../components/ui';

const uud = uudJson as UudData;
const UUD_DECKS = buildDecks(uud);
const LEMBAGA_DECKS = buildLembagaDecks(uud, LEMBAGA_NEGARA);
const DECKS = [...UUD_DECKS, ...LEMBAGA_DECKS];
const CARDS = new Map(DECKS.flatMap((d) => d.cards.map((c) => [c.id, c] as const)));
const ORDER = DECKS.flatMap((d) => d.cards.map((c) => c.id));
const GRADE_LABEL: Record<Grade, string> = { lupa: 'Lupa', sulit: 'Sulit', baik: 'Baik', mudah: 'Mudah' };

/** The article a question's reference cites, from the official text (?pasal=28I). */
function PasalView({ id }: { id: string }) {
  const found = findPasal(uud, id);
  return (
    <section className="card space-y-2 border-brand-500" aria-labelledby="pasal-title">
      {found ? (
        <>
          <div className="muted text-xs">{babLabel(found.bab)}</div>
          <h2 id="pasal-title">UUD 1945 {pasalLabel(found.bab, found.pasal)}</h2>
          {found.pasal.ayat.length ? (
            <ol className="space-y-2 text-sm">
              {found.pasal.ayat.map((a) => (
                <li key={a.no}>
                  ({a.no}) {a.text} <span className="muted text-xs">· {originOf(a.amendments)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm">
              {found.pasal.text} <span className="muted text-xs">· {originOf(found.pasal.amendments)}</span>
            </p>
          )}
          <p className="muted text-xs">
            Cocokkan rujukan soal dengan teks resmi ini. Bila berbeda, laporkan soalnya lewat tautan "Laporkan atau beri nilai" di bawah pembahasannya.
          </p>
        </>
      ) : (
        <p id="pasal-title" className="text-sm">
          Pasal {id} tidak ada di UUD 1945. Rujukan soal itu kemungkinan keliru; periksa ke sumber resmi.
        </p>
      )}
    </section>
  );
}

/** One review session over today's queue: show the front, reveal the back, grade. Keys: Space shows, 1–4 grade. */
function Session({ queue, onDone }: { queue: Card[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const card = queue[i];

  async function grade(g: Grade) {
    await gradeCard(card.id, g);
    setShown(false);
    if (i + 1 >= queue.length) onDone();
    else setI(i + 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLButtonElement) return;
      if (!shown && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        setShown(true);
      } else if (shown && /^[1-4]$/.test(e.key)) void grade(GRADES[Number(e.key) - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!card) return null;
  return (
    <section className="card space-y-3" aria-labelledby="card-front" aria-live="polite">
      <div className="muted flex justify-between text-xs">
        <span>{card.context}</span>
        <span>
          Kartu {i + 1} dari {queue.length}
        </span>
      </div>
      <h2 id="card-front">{card.front}</h2>
      {!shown ? (
        <button className="btn btn-primary" onClick={() => setShown(true)}>
          Tampilkan jawaban
        </button>
      ) : (
        <>
          <p className="rounded-md bg-slate-50 p-3 leading-relaxed dark:bg-slate-800">{card.back}</p>
          {(card.source || card.origin) && (
            <p className="muted text-xs">
              {card.source && <>Sumber: {card.source} </>}
              {card.origin && <Badge>{card.origin}</Badge>}
            </p>
          )}
          <div>
            <div className="label">Seberapa ingat Anda?</div>
            <div className="flex flex-wrap gap-2">
              {GRADES.map((g, k) => (
                <button key={g} className="btn" onClick={() => void grade(g)}>
                  {k + 1}. {GRADE_LABEL[g]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <p className="muted text-xs">Pintasan: Spasi menampilkan jawaban, 1–4 menilai.</p>
    </section>
  );
}

/** Kartu Hafalan TWK (#47): the 1945 Constitution and Pancasila from the official text, learned with spaced repetition. */
export default function Kartu() {
  const [params] = useSearchParams();
  const pasal = params.get('pasal');
  const states = useLiveQuery(() => db.cards.toArray(), []);
  const [session, setSession] = useState<Card[] | null>(null);
  const [done, setDone] = useState(false);
  const learning = useMemo(() => new Set((states ?? []).map((s) => s.cardId)), [states]);
  // Today's queue is decided when the page opens; a session started late at night still ends cleanly.
  const [now] = useState(() => Date.now());
  if (!states) return null;

  const queue = cardQueue(states, now, ORDER)
    .map((s) => CARDS.get(s.cardId))
    .filter((c): c is Card => !!c);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1>Kartu Hafalan TWK</h1>
        <p className="muted mt-1">
          Hafalkan Pancasila, Pembukaan, pasal-pasal UUD 1945, dan lembaga negara dari teks resminya, dengan jadwal ulangan seperti Buku Kesalahan: kartu yang mudah diingat makin
          jarang muncul, yang terlupa muncul lagi besok.
        </p>
      </div>

      {pasal && <PasalView id={pasal} />}

      {session ? (
        <Session
          queue={session}
          onDone={() => {
            setSession(null);
            setDone(true);
          }}
        />
      ) : (
        <section className="card space-y-2" aria-labelledby="today-title">
          <h2 id="today-title">Ulangan hari ini</h2>
          {queue.length ? (
            <>
              <p className="text-sm">{queue.length} kartu menunggu: yang jatuh tempo, lalu kartu baru (paling banyak 20 kartu baru per hari).</p>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setDone(false);
                  setSession(queue);
                }}
              >
                Mulai ulangan ({queue.length} kartu)
              </button>
            </>
          ) : (
            <p className="text-sm">
              {done ? 'Selesai untuk hari ini. ' : ''}
              {learning.size ? 'Tidak ada kartu yang jatuh tempo. Kembali besok.' : 'Pilih materi di bawah untuk mulai menghafal.'}
            </p>
          )}
        </section>
      )}

      <DeckList id="decks-title" title="Pancasila dan UUD 1945" decks={UUD_DECKS} learning={learning} />
      <DeckList
        id="lembaga-title"
        title="Lembaga negara"
        note="Kedudukan, tugas, dan wewenang lembaga negara, dikutip apa adanya dari pasal UUD 1945. Setiap kartu menyebut pasal dan ayatnya."
        decks={LEMBAGA_DECKS}
        learning={learning}
      />

      <p className="muted text-xs">
        Sumber: {uud.source.title}, {uud.source.publisher} (berkas {uud.source.fileDate}). Teks disalin apa adanya, termasuk ejaannya; setiap kartu pasal menyebut perubahan UUD
        yang merumuskannya. Rumusan Pancasila diambil dari alinea keempat Pembukaan. Bukan materi resmi BKN.
      </p>
    </div>
  );
}

/** Decks to start or stop learning, one row each. */
function DeckList({ id, title, note, decks, learning }: { id: string; title: string; note?: string; decks: Deck[]; learning: Set<string> }) {
  return (
    <section className="space-y-2" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {note && <p className="muted text-sm">{note}</p>}
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {decks.map((d) => {
          const on = d.cards.filter((c) => learning.has(c.id)).length;
          return (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span>
                {d.title}{' '}
                <span className="muted text-xs">
                  · {d.cards.length} kartu{on ? `, ${on} dipelajari` : ''}
                </span>
              </span>
              {on < d.cards.length ? (
                <button className="btn btn-sm" aria-label={`Pelajari ${d.title}`} onClick={() => void startCards(d.cards.map((c) => c.id))}>
                  Pelajari
                </button>
              ) : (
                <button
                  className="btn btn-sm btn-ghost"
                  aria-label={`Berhenti mempelajari ${d.title}`}
                  onClick={() => confirm(`Berhenti mempelajari ${d.title}? Jadwal ulangan kartunya dihapus.`) && void stopCards(d.cards.map((c) => c.id))}
                >
                  Berhenti
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
