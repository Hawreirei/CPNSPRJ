import type { Passage } from '../domain/types';
import { RichText } from './RichText';

/**
 * A reading passage above its questions. `closed` folds it away (lists where the first question of
 * the group already shows it); the heading says which questions it is for.
 */
export function PassageView({ passage, label = 'Bacaan', mode = 'open' }: { passage: Passage; label?: string; mode?: 'open' | 'closed' }) {
  const heading = `${label}${passage.title ? `: ${passage.title}` : ''}`;
  const body = (
    <div className="leading-relaxed">
      <RichText text={passage.text} />
    </div>
  );
  if (mode === 'closed') {
    return (
      <details className="mb-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
        <summary className="cursor-pointer text-sm font-medium">{heading}</summary>
        <div className="mt-2">{body}</div>
      </details>
    );
  }
  return (
    <section aria-label={heading} className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
      <h3 className="mb-1 text-sm font-semibold">{heading}</h3>
      {body}
    </section>
  );
}
