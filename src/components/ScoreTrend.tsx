import { useState } from 'react';

export interface TrendPoint {
  label: string;
  value: number;
  max: number;
}

/**
 * Single-series score history for one sub-test (small multiple).
 * Y is the raw score on 0..max; the passing threshold is a labelled reference line.
 */
export function ScoreTrend({ title, points, passing, max }: { title: string; points: TrendPoint[]; passing: number; max: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 46, t: 12, b: 20 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (Math.max(0, Math.min(max, v)) / max) * ih;
  const ticks = [0, Math.round(max / 2), max];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  const hp = hover !== null ? points[hover] : null;

  return (
    <figure className="card">
      <figcaption className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold">{title}</span>
        <span className="muted text-xs">ambang {passing}</span>
      </figcaption>
      {points.length === 0 ? (
        <p className="muted py-8 text-center text-xs">Belum ada data.</p>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Riwayat skor ${title}`} onMouseLeave={() => setHover(null)}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-slate-500 dark:fill-slate-400" fontSize={10}>
                  {t}
                </text>
              </g>
            ))}
            <line x1={pad.l} x2={W - pad.r} y1={y(passing)} y2={y(passing)} className="stroke-slate-500 dark:stroke-slate-400" strokeWidth={1} />
            <text x={W - pad.r + 4} y={y(passing) + 3} className="fill-slate-500 dark:fill-slate-400" fontSize={9}>
              ambang
            </text>
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="stroke-slate-300 dark:stroke-slate-700" strokeWidth={1} />}
            <path d={path} fill="none" className="stroke-[#2a78d6] dark:stroke-[#3987e5]" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle
                  cx={x(i)}
                  cy={y(p.value)}
                  r={hover === i ? 5 : 4}
                  className="fill-[#2a78d6] stroke-white dark:fill-[#3987e5] dark:stroke-slate-900"
                  strokeWidth={2}
                />
                <rect
                  x={x(i) - Math.max(8, iw / Math.max(1, points.length) / 2)}
                  y={pad.t}
                  width={Math.max(16, iw / Math.max(1, points.length))}
                  height={ih}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                />
              </g>
            ))}
            {last && hover === null && (
              <text x={x(points.length - 1) + 7} y={y(last.value) - 6} className="fill-slate-700 dark:fill-slate-200" fontSize={10} fontWeight={600}>
                {last.value}
              </text>
            )}
          </svg>
          {hp && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow dark:border-slate-700 dark:bg-slate-900"
              style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <div className="muted">{hp.label}</div>
              <div className="font-semibold">
                {hp.value} / {hp.max} {hp.value >= passing ? '· lulus' : '· belum'}
              </div>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
