import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Flag, Subtest } from '../domain/types';

const SUBTEST_STYLE: Record<Subtest, string> = {
  TWK: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  TIU: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  TKP: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
};

export function SubtestBadge({ subtest }: { subtest: Subtest }) {
  return <span className={`badge ${SUBTEST_STYLE[subtest] ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'}`}>{subtest}</span>;
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'red' | 'blue' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
    green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
    blue: 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100',
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function FlagList({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {flags.map((f, i) => (
        <li
          key={i}
          className={`rounded-md px-2 py-1 text-xs ${f.severity === 'warn' ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
        >
          {f.severity === 'warn' ? '⚠ ' : 'ℹ '}
          {f.message}
        </li>
      ))}
    </ul>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card py-10 text-center">
      <h3>{title}</h3>
      {children && <div className="muted mt-2">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'green' | 'amber' | 'red' }) {
  const hintTone = { green: 'text-green-700 dark:text-green-400', amber: 'text-amber-700 dark:text-amber-300', red: 'text-red-600 dark:text-red-400' };
  return (
    <div className="card px-4 py-3">
      <div className="muted text-xs">{label}</div>
      <div className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      {hint && <div className={`mt-0.5 text-xs font-medium ${tone ? hintTone[tone] : 'muted'}`}>{hint}</div>}
    </div>
  );
}

/** Title and one-line description on the left, the page's actions on the right. */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1>{title}</h1>
        {description && <p className="muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Underlined tabs. The caller renders the panel for `value`; arrow keys move between tabs. */
export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: readonly (readonly [T, string])[]; value: T; onChange: (v: T) => void; label: string }) {
  const move = (i: number) => {
    const next = tabs[(i + tabs.length) % tabs.length][0];
    onChange(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
      {tabs.map(([id, text], i) => (
        <button
          key={id}
          id={`tab-${id}`}
          role="tab"
          aria-selected={value === id}
          tabIndex={value === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') move(i + 1);
            if (e.key === 'ArrowLeft') move(i - 1);
          }}
          className={`tab ${value === id ? 'tab-active' : ''}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  // The title names the dialog, so a screen reader says "Nomor soal, dialog" and not just "dialog" (#69).
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className={`m-auto w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      {open && (
        <div className="max-h-[85vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id={titleId}>{title}</h2>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Tutup">
              ✕
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ProgressBar({ value, max, tone = 'brand' }: { value: number; max: number; tone?: 'brand' | 'green' | 'red' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === 'green' ? 'bg-green-500' : tone === 'red' ? 'bg-red-500' : 'bg-brand-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
      <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}
