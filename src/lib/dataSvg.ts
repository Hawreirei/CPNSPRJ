import { fmtNum } from '../domain/describe';
import type { DataFigure } from '../domain/types';

/*
 * Charts for data-analysis questions, as plain SVG so the screen, PDF and Word show the same thing.
 * One series per chart (one axis, no legend), ink only: they must read in print and in dark mode.
 * Every bar and point carries its value, unlike an ordinary dashboard chart, because an exam
 * question has to be answerable exactly from the figure.
 */

const W = 420;
const H = 240;
const FONT = 'font-family="sans-serif" font-size="12"';

/** The tightest round axis: the smallest step of 1, 2, 2.5 or 5 times a power of ten that needs at most five ticks. */
export function niceScale(max: number): { top: number; step: number } {
  const pow = 10 ** Math.floor(Math.log10(max / 5));
  const step = [1, 2, 2.5, 5, 10, 20].map((m) => m * pow).find((s) => Math.ceil(max / s) <= 5)!;
  return { top: Math.ceil(max / step) * step, step };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function axes(d: DataFigure, color: string) {
  const left = 52;
  const right = 12;
  const top = 22;
  const bottom = 30;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const values = d.series[0].values;
  const { top: yMax, step } = niceScale(Math.max(...values));
  const y = (v: number) => top + plotH - (v / yMax) * plotH;
  const band = plotW / values.length;
  const x = (i: number) => left + band * i + band / 2;
  const parts: string[] = [];
  for (let v = 0; v <= yMax + 1e-9; v += step) {
    // Recessive hairline grid; the baseline a step stronger.
    parts.push(`<line x1="${left}" x2="${W - right}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${color}" stroke-opacity="${v === 0 ? 0.6 : 0.15}" stroke-width="1"/>`);
    parts.push(`<text x="${left - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end" ${FONT} fill="${color}" fill-opacity="0.75">${fmtNum(v)}</text>`);
  }
  d.labels.forEach((l, i) => parts.push(`<text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" ${FONT} fill="${color}">${esc(l)}</text>`));
  return { parts, x, y, band, base: y(0), values };
}

function barSvg(d: DataFigure, color: string): string {
  const { parts, x, y, band, base, values } = axes(d, color);
  const bw = Math.min(24, band * 0.5);
  values.forEach((v, i) => {
    const x0 = x(i) - bw / 2;
    const yt = y(v);
    const r = Math.min(4, base - yt);
    // Rounded at the data end, square at the baseline.
    parts.push(
      `<path d="M${x0.toFixed(1)} ${base.toFixed(1)}V${(yt + r).toFixed(1)}Q${x0.toFixed(1)} ${yt.toFixed(1)} ${(x0 + r).toFixed(1)} ${yt.toFixed(1)}H${(x0 + bw - r).toFixed(1)}Q${(x0 + bw).toFixed(1)} ${yt.toFixed(1)} ${(x0 + bw).toFixed(1)} ${(yt + r).toFixed(1)}V${base.toFixed(1)}Z" fill="${color}" fill-opacity="0.85"/>`,
    );
    parts.push(`<text x="${x(i).toFixed(1)}" y="${(yt - 6).toFixed(1)}" text-anchor="middle" ${FONT} font-weight="600" fill="${color}">${fmtNum(v)}</text>`);
  });
  return wrap(parts);
}

function lineSvg(d: DataFigure, color: string, surface: string): string {
  const { parts, x, y, values } = axes(d, color);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  parts.push(`<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  values.forEach((v, i) => {
    // Markers carry a ring in the surface colour so they stay clear of the line they sit on.
    parts.push(`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" fill="${color}" stroke="${surface}" stroke-width="2"/>`);
    parts.push(`<text x="${x(i).toFixed(1)}" y="${(y(v) - 10).toFixed(1)}" text-anchor="middle" ${FONT} font-weight="600" fill="${color}">${fmtNum(v)}</text>`);
  });
  return wrap(parts);
}

function pieSvg(d: DataFigure, color: string, surface: string): string {
  const values = d.series[0].values;
  const total = values.reduce((a, b) => a + b, 0);
  const cx = W / 2;
  const cy = H / 2;
  const r = 82;
  // One ink at falling strengths; the labels, not the shades, say which slice is which.
  const shades = [0.9, 0.7, 0.52, 0.36, 0.22, 0.12];
  const parts: string[] = [];
  let a = -Math.PI / 2;
  values.forEach((v, i) => {
    const sweep = (v / total) * 2 * Math.PI;
    const a2 = a + sweep;
    const p = (ang: number, rad: number) => `${(cx + rad * Math.cos(ang)).toFixed(1)} ${(cy + rad * Math.sin(ang)).toFixed(1)}`;
    parts.push(
      `<path d="M${cx} ${cy}L${p(a, r)}A${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${p(a2, r)}Z" fill="${color}" fill-opacity="${shades[i % shades.length]}" stroke="${surface}" stroke-width="2" stroke-linejoin="round"/>`,
    );
    const mid = a + sweep / 2;
    const lx = cx + (r + 14) * Math.cos(mid);
    const ly = cy + (r + 14) * Math.sin(mid) + 4;
    parts.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${Math.cos(mid) >= 0 ? 'start' : 'end'}" ${FONT} fill="${color}"><tspan font-weight="600">${esc(d.labels[i])}</tspan> ${fmtNum(v)}%</text>`);
    a = a2;
  });
  return wrap(parts);
}

const wrap = (parts: string[]) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;

/** SVG for a bar, line or pie figure. `surface` is the background the marks sit on. */
export function dataChartSvg(d: DataFigure, color = 'currentColor', surface = 'var(--chart-surface, #fff)'): string {
  if (d.kind === 'bar') return barSvg(d, color);
  if (d.kind === 'line') return lineSvg(d, color, surface);
  if (d.kind === 'pie') return pieSvg(d, color, surface);
  return '';
}
