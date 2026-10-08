import type { DataFigure, Figure, FigureCell, Fill, ShapeKind } from './types';

/*
 * Words and numbers for drawn questions: what screen readers, the tutor and exports say about a
 * figure or a data chart. Kept apart from the generators, which load only when questions are made.
 */

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  circle: 'lingkaran', square: 'persegi', triangle: 'segitiga', diamond: 'belah ketupat',
  star: 'bintang', arrow: 'panah', pentagon: 'segi lima',
};
export const FILL_NAMES: Record<Fill, string> = { solid: 'hitam penuh', empty: 'kosong', striped: 'arsir' };

export function describeCell(c: FigureCell): string {
  const rot = c.rotation ? `, diputar ${c.rotation}°` : '';
  return `${c.count} ${SHAPE_NAMES[c.shape]} ${FILL_NAMES[c.fill]}${rot}`;
}

/** Screen-reader text for a stem figure. */
export function describeFigure(f: Figure): string {
  const d = (c: FigureCell | null) => (c ? describeCell(c) : 'tanda tanya');
  if (f.layout === 'matrix') return [0, 1, 2].map((i) => `Baris ${i + 1}: ${f.cells.slice(i * 3, i * 3 + 3).map(d).join('; ')}`).join('. ');
  if (f.layout === 'analogy') return `${d(f.cells[0])} berbanding ${d(f.cells[1])}, seperti ${d(f.cells[2])} berbanding ${d(f.cells[3])}`;
  if (f.layout === 'transform') return `Gambar awal: ${d(f.cells[0])}. Hasil: tanda tanya`;
  return f.cells.map((c, i) => `${i + 1}: ${d(c)}`).join('; ');
}

export const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Screen-reader and export text for a data figure: the numbers, row by row. */
export function describeData(d: DataFigure): string {
  const unit = d.kind === 'pie' ? '%' : ` ${d.unit}`;
  const rows = d.labels.map((l, i) => `${l}: ${d.series.map((s) => `${d.series.length > 1 ? `${s.name} ` : ''}${fmtNum(s.values[i])}${unit}`).join(', ')}`);
  return `${d.title}. ${rows.join('; ')}.`;
}
