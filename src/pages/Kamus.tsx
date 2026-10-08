import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KAMUS_TIU } from '../data/kamusTiu';
import { KAMUS_TOPICS, kamusPath } from '../domain/kamus';
import { normalizeText } from '../lib/id';
import { RichText } from '../components/RichText';

const anchor = (topic: string) => `kamus-${normalizeText(topic).replace(/\s+/g, '-')}`;

/** Kamus Rumus TIU (#47): formulas and reasoning patterns, curated by hand, searchable, offline like every page. */
export default function Kamus() {
  const [params] = useSearchParams();
  const wanted = params.get('topik') ?? '';
  const [q, setQ] = useState('');

  // Opened from an explanation: start at that topic.
  useEffect(() => {
    if (wanted) document.getElementById(anchor(wanted))?.scrollIntoView({ block: 'start' });
  }, [wanted]);

  const needle = normalizeText(q);
  const shown = useMemo(
    () => KAMUS_TIU.filter((e) => !needle || normalizeText(`${e.topic} ${e.title} ${e.formula} ${e.note ?? ''} ${e.example.question}`).includes(needle)),
    [needle],
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1>Kamus Rumus TIU</h1>
        <p className="muted mt-1">
          Rumus dan pola yang sering dipakai di soal TIU, masing-masing dengan satu contoh. Disusun manual, bukan oleh AI; setiap contoh hitungan diperiksa ulang oleh aplikasi.
          Bukan materi resmi BKN.
        </p>
      </div>
      <input
        className="input"
        type="search"
        aria-label="Cari rumus"
        placeholder="Cari rumus, misalnya persen, deret, atau kecepatan…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <nav aria-label="Topik kamus" className="flex flex-wrap gap-1.5 text-xs">
        {KAMUS_TOPICS.map((t) => (
          <Link key={t} to={kamusPath(t)} className="rounded-full border border-slate-300 px-3 py-1 dark:border-slate-700">
            {t}
          </Link>
        ))}
      </nav>
      {shown.length === 0 && <p className="muted">Tidak ada rumus yang cocok dengan "{q}".</p>}
      {KAMUS_TOPICS.map((topic) => {
        const entries = shown.filter((e) => e.topic === topic);
        if (!entries.length) return null;
        return (
          <section key={topic} id={anchor(topic)} className="scroll-mt-4 space-y-3" aria-labelledby={`${anchor(topic)}-h`}>
            <h2 id={`${anchor(topic)}-h`} className={topic === wanted ? 'text-brand-700 dark:text-brand-300' : ''}>
              {topic}
            </h2>
            {entries.map((e) => (
              <article key={e.id} className="card space-y-2 text-sm">
                <h3 className="font-semibold">{e.title}</h3>
                <p className="leading-relaxed">
                  <RichText text={e.formula} />
                </p>
                {e.note && (
                  <p className="muted text-xs">
                    <RichText text={e.note} />
                  </p>
                )}
                <details>
                  <summary className="cursor-pointer text-brand-600 dark:text-brand-300">Contoh</summary>
                  <div className="mt-2 space-y-1 rounded-md bg-slate-50 p-2 dark:bg-slate-800">
                    <p>
                      <RichText text={e.example.question} />
                    </p>
                    <p>
                      <b>Jawab:</b> <RichText text={e.example.solution} />
                    </p>
                  </div>
                </details>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}
