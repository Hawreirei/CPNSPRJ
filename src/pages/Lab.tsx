import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnswerOptions, FeedbackBanner } from '../components/AnswerOptions';
import { StemMedia } from '../components/DataView';
import { Explanation } from '../components/QuestionCard';
import { RichText } from '../components/RichText';
import { Badge, PageHeader } from '../components/ui';
import { FIGURAL_RECIPES, FIGURAL_TOPICS } from '../domain/figuralNames';
import type { Archetype } from '../domain/figural';
import type { Difficulty, OptionLabel, Question } from '../domain/types';
import { createFiguralSet } from '../engine/sets';

type Figural = typeof import('../domain/figural');
const LEVELS: Difficulty[] = ['mudah', 'sedang', 'sulit'];

/**
 * Lab Pola (docs/rancangan-figural-v2.md §7.3): pick a recipe, a level and kinds of rule, see a
 * question made on the spot, answer it, trace its rules, and turn the recipe into a practice set.
 * No AI, so it is free and works offline.
 */
export default function Lab() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [mod, setMod] = useState<Figural | null>(null);
  const wanted = params.get('resep') ?? '';
  const [topic, setTopic] = useState<string>(FIGURAL_RECIPES[wanted]?.topic ?? FIGURAL_TOPICS[0]);
  const [recipe, setRecipe] = useState<string>(FIGURAL_RECIPES[wanted] ? wanted : '');
  const [level, setLevel] = useState<Difficulty>('sedang');
  const [families, setFamilies] = useState<string[]>([]);
  const [q, setQ] = useState<Question | null>(null);
  const [chosen, setChosen] = useState<OptionLabel | undefined>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // The generators load only on this page.
  useEffect(() => {
    void import('../domain/figural').then(setMod);
  }, []);

  const recipes: Archetype[] = useMemo(() => mod?.ARCHETYPES.filter((a) => a.topic === topic) ?? [], [mod, topic]);
  const arch = recipes.find((a) => a.id === recipe) ?? recipes[0];

  function make(a = arch, d = level, f = families) {
    if (!mod || !a) return;
    setError('');
    setChosen(undefined);
    const lv = a.levels.includes(d) ? d : a.levels[a.levels.length - 1];
    try {
      setQ(mod.makeWith(a, lv, Math.random, f.length ? f : undefined));
    } catch {
      setQ(null);
      setError('Kombinasi aturan ini belum bisa dibuat pada tingkat ini. Coba tingkat lain atau aturan lain.');
    }
  }

  // A first question as soon as the recipes are here, and again whenever the choice changes.
  useEffect(() => {
    if (mod && arch) make(arch, level, families);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, arch?.id, level, families.join()]);

  function pickRecipe(id: string) {
    setRecipe(id);
    setFamilies([]);
    setParams(id ? { resep: id } : {}, { replace: true });
  }

  async function practice() {
    if (!arch) return;
    setBusy(true);
    try {
      const set = await createFiguralSet(`Lab: ${arch.name} (${level})`, [
        {
          topic: arch.topic,
          difficulty: arch.levels.includes(level) ? level : arch.levels[arch.levels.length - 1],
          count: 10,
          archetypes: [arch.id],
          ...(families.length ? { families } : {}),
        },
      ]);
      nav(`/simulation?set=${set.id}&mode=practice`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Lab Pola Figural"
        description="Pilih jenis soal gambar dan aturannya, lalu coba soal contoh yang langsung dibuat aplikasi. Tanpa AI dan tanpa kuota; setiap soal diperiksa agar jawabannya tepat satu."
      />

      <section className="card space-y-3">
        <div>
          <div className="mb-1 text-sm font-semibold">Topik</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Topik">
            {FIGURAL_TOPICS.map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${t === topic ? 'btn-primary' : ''}`}
                aria-pressed={t === topic}
                onClick={() => {
                  setTopic(t);
                  pickRecipe('');
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-sm font-semibold">Jenis soal</div>
          {!mod ? (
            <p className="muted text-sm">Memuat…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {recipes.map((a) => (
                <button
                  key={a.id}
                  aria-pressed={a.id === arch?.id}
                  onClick={() => pickRecipe(a.id)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${a.id === arch?.id ? 'border-brand-500 bg-brand-50 dark:bg-slate-800' : 'border-slate-200 hover:border-slate-400 dark:border-slate-700'}`}
                >
                  <span className="font-semibold">{a.name}</span>
                  <span className="muted block text-xs">{a.about}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Tingkat</span>
          {LEVELS.map((d) => (
            <button
              key={d}
              className={`btn btn-sm ${d === level ? 'btn-primary' : ''}`}
              aria-pressed={d === level}
              disabled={!!arch && !arch.levels.includes(d)}
              onClick={() => setLevel(d)}
            >
              {d}
            </button>
          ))}
        </div>
        {!!arch?.families.length && (
          <div>
            <div className="mb-1 text-sm font-semibold">Aturan yang ingin dilatih (boleh lebih dari satu)</div>
            <div className="flex flex-wrap gap-2">
              {arch.families.map((f) => {
                const on = families.includes(f.id);
                return (
                  <button
                    key={f.id}
                    className={`btn btn-sm ${on ? 'btn-primary' : ''}`}
                    aria-pressed={on}
                    onClick={() => setFamilies(on ? families.filter((x) => x !== f.id) : [...families, f.id])}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {error && <p className="card text-sm text-amber-800 dark:text-amber-300">{error}</p>}

      {q && (
        <section className="card">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <Badge>{q.topic}</Badge>
            <Badge>{q.difficulty}</Badge>
            {arch && <Badge tone="blue">{arch.name}</Badge>}
            <div className="ml-auto flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => make()}>
                Soal lain
              </button>
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={practice}>
                Latihan 10 soal jenis ini
              </button>
            </div>
          </div>
          <div className="leading-relaxed">
            <RichText text={q.stem} />
          </div>
          <StemMedia q={q} />
          <AnswerOptions q={q} chosen={chosen} revealed={!!chosen} onAnswer={setChosen} />
          {chosen && (
            <>
              <div className="mt-3">
                <FeedbackBanner q={q} answer={chosen} />
              </div>
              <Explanation q={q} />
            </>
          )}
        </section>
      )}
    </div>
  );
}
