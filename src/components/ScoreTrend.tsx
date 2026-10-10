import { useState } from 'react';
import type { Subtest } from '../domain/types';

export interface TrendPoint {
  label: string;
  /** Short x-axis label, e.g. "9 Okt". */
  short: string;
  value: number;
  max: number;
}

/** Line colour per sub-test (light, dark) and a marker shape, so the series never relies on colour alone. */
const SERIES: Record<Subtest, { line: string; fill: string; shape: 'circle' | 'square' | 'diamond' }> = {
  TWK: { line: 'stroke-rose-600 dark:stroke-rose-400', fill: 'fill-rose-600 dark:fill-rose-400', shape: 'circle' },
  TIU: { line: 'stroke-sky-600 dark:stroke-sky-400', fill: 'fill-sky-600 dark:fill-sky-400', shape: 'square' },
  TKP: { line: 'stroke-emerald-600 dark:stroke-emerald-400', fill: 'fill-emerald-600 dark:fill-emerald-400', shape: 'diamond' },
};
const seriesOf = (s: Subtest) => SERIES[s] ?? { line: 'stroke-brand-500', fill: 'fill-brand-500', shape: 'circle' as const };

/**
 * Y range that shows the movement: the scores and the threshold with some room, on round steps.
 * `full` gives the whole 0..max scale instead.
 */
function yRange(values: number[], passing: number, max: number, full: boolean): { lo: number; hi: number; ticks: number[] } {
  if (full || !values.length) return { lo: 0, hi: max, ticks: [0, Math.round(max / 2), max] };
  const all = [...values, passing];
  const min = Math.min(...all);
  const top = Math.max(...all);
  const pad = Math.max((top - min) * 0.25, max * 0.05);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => s * 4 >= top - min + 2 * pad) ?? 100;
  const lo = Math.max(0, Math.floor((min - pad) / step) * step);
  const hi = Math.min(max, Math.ceil((top + pad) / step) * step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += step) ticks.push(t);
  return { lo, hi, ticks };
}

function Marker({ shape, x, y, r, className }: { shape: 'circle' | 'square' | 'diamond'; x: number; y: number; r: number; className: string }) {
  if (shape === 'square') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1} className={className} strokeWidth={2} />;
  if (shape === 'diamond') return <path d={`M${x} ${y - r * 1.25}L${x + r * 1.25} ${y}L${x} ${y + r * 1.25}L${x - r * 1.25} ${y}Z`} className={className} strokeWidth={2} />;
  return <circle cx={x} cy={y} r={r} className={className} strokeWidth={2} />;
}

/**
 * Score history of one sub-test, large: axes, threshold line with the zone below it shaded,
 * a label on every point and a tooltip on hover or keyboard focus.
 */
export function ScoreChart({ subtest, points, passing, max, full }: { subtest: Subtest; points: TrendPoint[]; passing: number; max: number; full: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const st = seriesOf(subtest);
  const W = 760;
  const H = 230;
  const pad = { l: 46, r: 86, t: 20, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const { lo, hi, ticks } = yRange(
    points.map((p) => p.value),
    passing,
    max,
    full,
  );
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  // At most about eight date labels; always the last one.
  const every = Math.max(1, Math.ceil(points.length / 8));
  const hp = hover !== null ? points[hover] : null;

  if (!points.length) return <p className="muted py-16 text-center text-sm">Belum ada data.</p>;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Riwayat skor ${subtest}, ${points.length} ujian`} onMouseLeave={() => setHover(null)}>
        <rect x={pad.l} y={y(passing)} width={iw} height={Math.max(0, y(lo) - y(passing))} className="fill-red-500/[0.06] dark:fill-red-400/[0.07]" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize={12}>
              {t}
            </text>
          </g>
        ))}
        <line x1={pad.l} x2={W - pad.r} y1={y(passing)} y2={y(passing)} className="stroke-slate-600 dark:stroke-slate-300" strokeWidth={1.25} strokeDasharray="5 4" />
        <text x={W - pad.r + 6} y={y(passing) + 4} className="fill-slate-600 dark:fill-slate-300" fontSize={12} fontWeight={600}>
          ambang {passing}
        </text>
        {points.map((p, i) =>
          // Several exams on one day share its label.
          (i % every === 0 || i === points.length - 1) && (i === 0 || p.short !== points[i - 1].short) ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="fill-slate-500 dark:fill-slate-400" fontSize={12}>
              {p.short}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="stroke-slate-300 dark:stroke-slate-600" strokeWidth={1} strokeDasharray="2 3" />}
        <path d={path} fill="none" className={st.line} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const last = i === points.length - 1;
          return (
            <g key={i}>
              <Marker shape={st.shape} x={x(i)} y={y(p.value)} r={hover === i || last ? 6 : 4.5} className={`${st.fill} stroke-white dark:stroke-slate-900`} />
              {(points.length <= 12 || last) && (
                <text
                  x={x(i)}
                  y={y(p.value) - 12}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={last ? 700 : 500}
                  className={last ? 'fill-slate-900 dark:fill-slate-100' : 'fill-slate-500 dark:fill-slate-400'}
                >
                  {p.value}
                </text>
              )}
              <rect
                x={x(i) - Math.max(10, iw / Math.max(1, points.length) / 2)}
                y={pad.t}
                width={Math.max(20, iw / Math.max(1, points.length))}
                height={ih}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                tabIndex={0}
              />
            </g>
          );
        })}
      </svg>
      {hp && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-slate-700"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${hover === points.length - 1 ? '-90%' : hover === 0 ? '-10%' : '-50%'})` }}
        >
          <div className="text-slate-300">{hp.label}</div>
          <div className="font-semibold">
            {hp.value} / {hp.max} {hp.value >= passing ? '· lulus' : '· belum'}
          </div>
        </div>
      )}
    </div>
  );
}

/** Small line without axes for the side cards; same scale rules as the large chart. */
export function ScoreSpark({ subtest, points, passing, max, full }: { subtest: Subtest; points: TrendPoint[]; passing: number; max: number; full: boolean }) {
  const st = seriesOf(subtest);
  if (!points.length) return <p className="muted py-4 text-center text-xs">Belum ada data.</p>;
  const W = 300;
  const H = 56;
  const p = 6;
  const { lo, hi } = yRange(
    points.map((q) => q.value),
    passing,
    max,
    full,
  );
  const x = (i: number) => p + (points.length <= 1 ? (W - 2 * p) / 2 : (i / (points.length - 1)) * (W - 2 * p));
  const y = (v: number) => p + (H - 2 * p) - ((Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo || 1)) * (H - 2 * p);
  const last = points.length - 1;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-hidden>
      <rect x={p} y={y(passing)} width={W - 2 * p} height={Math.max(0, y(lo) - y(passing))} className="fill-red-500/[0.06] dark:fill-red-400/[0.07]" />
      <line x1={p} x2={W - p} y1={y(passing)} y2={y(passing)} className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={1} strokeDasharray="4 3" />
      <path
        d={points.map((q, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(q.value).toFixed(1)}`).join(' ')}
        fill="none"
        className={st.line}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Marker shape={st.shape} x={x(last)} y={y(points[last].value)} r={4.5} className={`${st.fill} stroke-white dark:stroke-slate-900`} />
    </svg>
  );
}
