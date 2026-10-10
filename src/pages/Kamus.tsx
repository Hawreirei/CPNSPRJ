import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KAMUS_TIU } from '../data/kamusTiu';
import { KAMUS_TOPICS, kamusPath } from '../domain/kamus';
import { normalizeText } from '../lib/id';
import { RichText } from '../components/RichText';
import { PageHeader } from '../components/ui';

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

  const count = (topic: string) => shown.filter((e) => e.topic === topic).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kamus Rumus TIU"
        description="Rumus dan pola yang sering dipakai di soal TIU, masing-masing dengan satu contoh. Disusun manual, bukan oleh AI; setiap contoh hitungan diperiksa ulang oleh aplikasi. Bukan materi resmi BKN."
        actions={
          <input
            className="input w-80 max-w-full"
            type="search"
            aria-label="Cari rumus"
            placeholder="Cari rumus: persen, deret, kecepatan…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        }
      />
      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* Topics: chips on small screens, a list that stays in view on wide ones. */}
        <nav aria-label="Topik kamus" className="mb-4 flex flex-wrap gap-1.5 text-xs lg:sticky lg:top-5 lg:mb-0 lg:flex-col lg:gap-0.5 lg:text-sm">
          {KAMUS_TOPICS.map((t) => (
            <Link
              key={t}
              to={kamusPath(t)}
              aria-current={t === wanted ? 'true' : undefined}
              className={`flex items-center justify-between gap-2 rounded-full border px-3 py-1 lg:rounded-lg lg:border-0 lg:py-1.5 ${t === wanted ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'border-slate-300 text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900'}`}
            >
              {t}
              <span className="muted hidden text-xs tabular-nums lg:inline">{count(t)}</span>
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">
          {shown.length === 0 && <p className="muted">Tidak ada rumus yang cocok dengan "{q}".</p>}
          {KAMUS_TOPICS.map((topic) => {
            const entries = shown.filter((e) => e.topic === topic);
            if (!entries.length) return null;
            return (
              <section key={topic} id={anchor(topic)} className="scroll-mt-4 space-y-3" aria-labelledby={`${anchor(topic)}-h`}>
                <h2 id={`${anchor(topic)}-h`} className={topic === wanted ? 'text-brand-700 dark:text-brand-300' : ''}>
                  {topic}
                </h2>
                <div className="grid items-start gap-4 xl:grid-cols-2">
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
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
