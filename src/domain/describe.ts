import { canonPose, dirName, faceWords, FOLD_NAMES, GLYPH_NAMES, isLegacy, LATTICE_SEGMENTS, ORIENTED, slotName } from './pic';
import type { DataFigure, Figure, FigureCell, Fill, Pic, SceneCell, SceneObject, ShapeKind } from './types';

/*
 * Words and numbers for drawn questions: what screen readers, the tutor and exports say about a
 * figure or a data chart. Kept apart from the generators, which load only when questions are made.
 */

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  circle: 'lingkaran',
  square: 'persegi',
  triangle: 'segitiga',
  diamond: 'belah ketupat',
  star: 'bintang',
  arrow: 'panah',
  pentagon: 'segi lima',
  hexagon: 'segi enam',
};
export const FILL_NAMES: Record<Fill, string> = { solid: 'hitam penuh', empty: 'kosong', striped: 'arsir', dotted: 'bertitik' };

export function describeCell(c: FigureCell): string {
  // An arrow is described by where it points; other shapes by how far they are turned.
  if (c.shape === 'arrow') return `${c.count} panah ${FILL_NAMES[c.fill]} menghadap ${dirName(c.rotation)}`;
  const rot = c.rotation ? `, diputar ${c.rotation}°` : '';
  return `${c.count} ${SHAPE_NAMES[c.shape]} ${FILL_NAMES[c.fill]}${rot}`;
}

function describeObject(scene: SceneCell, o: SceneObject): string {
  const where = slotName(scene.frame, o.slot);
  if (o.glyph === 'tab') return `segitiga hitam di ${o.anchor === 'out' ? 'luar' : 'dalam'} ${where}, menempel pada persegi`;
  if (o.glyph === 'wedge' || o.glyph === 'swedge') return `${GLYPH_NAMES[o.glyph]} ${o.span ?? 1} bagian mulai ${where}`;
  const name = GLYPH_NAMES[o.glyph] + (o.fill && o.glyph !== 'dot' ? ` ${FILL_NAMES[o.fill]}` : '');
  const canon = canonPose(o.glyph, o.dir, o.mirrored);
  const pose = ORIENTED.includes(o.glyph)
    ? ` menghadap ${dirName(o.dir ?? 0)}${canon.mirrored ? ', terbalik cermin' : ''}`
    : canon.dir
      ? o.glyph === 'rect' || o.glyph === 'eq'
        ? ' tegak'
        : ` diputar ${canon.dir}°`
      : o.glyph === 'rect' || o.glyph === 'eq'
        ? ' mendatar'
        : '';
  const anchor = o.anchor && (o.glyph === 'arrow' || o.glyph === 'dot') && scene.frame === 'plain' ? (o.anchor === 'in' ? ' (di dalam persegi)' : ' (di luar persegi)') : '';
  return `${name}${pose} di ${where}${anchor}`;
}

const SEG_POINTS = ['kiri atas', 'tengah atas', 'kanan atas', 'kiri tengah', 'tengah', 'kanan tengah', 'kiri bawah', 'tengah bawah', 'kanan bawah'];

/** Words for any figural picture: a stem cell or an option. */
export function describePic(p: Pic): string {
  if (isLegacy(p)) return describeCell(p);
  switch (p.kind) {
    case 'scene': {
      const frame = { plain: 'Persegi di tengah', diag4: 'Persegi bergaris diagonal', quad4: 'Persegi dibagi empat', ring8: 'Lingkaran', pie8: 'Lingkaran delapan juring' }[
        p.frame
      ];
      return p.objects.length ? `${frame}; ${p.objects.map((o) => describeObject(p, o)).join('; ')}` : `${frame}, kosong`;
    }
    case 'strokes': {
      const fan = `${p.strands} garis bertemu di satu titik yang mengarah ke ${dirName(p.apex)}`;
      return p.attached ? `${fan}, setiap ujung garis bertitik` : `${fan}, terlepas dari ${p.dots} titik yang berjajar di sisi ${dirName(p.dotSide)}`;
    }
    case 'lines':
      return p.segs.length
        ? `Garis: ${[...p.segs]
            .sort((a, b) => a - b)
            .map((id) => `${SEG_POINTS[LATTICE_SEGMENTS[id][0]]}–${SEG_POINTS[LATTICE_SEGMENTS[id][1]]}`)
            .join(', ')}`
        : 'Tanpa garis';
    case 'cube':
      return `Kubus: depan ${faceWords(p.front)}; atas ${faceWords(p.top)}; kanan ${faceWords(p.right)}`;
    case 'net': {
      const xs = p.squares.map((s) => s.x);
      const ys = p.squares.map((s) => s.y);
      const x0 = Math.min(...xs);
      const y0 = Math.min(...ys);
      return `Jaring-jaring kubus: ${[...p.squares]
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map((s) => `baris ${s.y - y0 + 1} kolom ${s.x - x0 + 1} ${faceWords(s.face)}`)
        .join('; ')}`;
    }
    case 'holes':
      return p.holes.length
        ? `Kertas berlubang di ${[...p.holes]
            .sort((a, b) => a - b)
            .map((h) => `baris ${Math.floor(h / 4) + 1} kolom ${(h % 4) + 1}`)
            .join(', ')}`
        : 'Kertas tanpa lubang';
    case 'fold':
      return `${p.folds.map((f) => FOLD_NAMES[f]).join(', lalu ')}${p.holes?.length ? `; dilubangi di ${p.holes.map((h) => `baris ${Math.floor(h / 4) + 1} kolom ${(h % 4) + 1}`).join(', ')}` : ''}`;
  }
}

/** Screen-reader text for a stem figure. */
export function describeFigure(f: Figure): string {
  const d = (c: Pic | null) => (c ? describePic(c) : 'tanda tanya');
  if (f.layout === 'matrix')
    return [0, 1, 2]
      .map(
        (i) =>
          `Baris ${i + 1}: ${f.cells
            .slice(i * 3, i * 3 + 3)
            .map(d)
            .join('; ')}`,
      )
      .join('. ');
  if (f.layout === 'analogy') return `${d(f.cells[0])} berbanding ${d(f.cells[1])}, seperti ${d(f.cells[2])} berbanding ${d(f.cells[3])}`;
  if (f.layout === 'transform') return `Gambar awal: ${d(f.cells[0])}. Hasil: tanda tanya`;
  if (f.layout === 'single') return d(f.cells[0]);
  if (f.layout === 'views') return f.cells.map((c, i) => `Gambar ${i + 1}: ${d(c)}`).join('. ');
  if (f.layout === 'sum')
    return [0, 1]
      .filter((i) => f.cells.length > i * 3)
      .map((i) => `Baris ${i + 1}: ${d(f.cells[i * 3])}, digabung dengan ${d(f.cells[i * 3 + 1])}, menjadi ${d(f.cells[i * 3 + 2])}`)
      .join('. ');
  if (f.layout === 'fold') return f.cells.map((c, i) => `Langkah ${i + 1}: ${d(c)}`).join('. ');
  return f.cells.map((c, i) => `${i + 1}: ${d(c)}`).join('; ');
}

export const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 });

/** Screen-reader and export text for a data figure: the numbers, row by row. */
export function describeData(d: DataFigure): string {
  const unit = d.kind === 'pie' ? '%' : ` ${d.unit}`;
  const rows = d.labels.map((l, i) => `${l}: ${d.series.map((s) => `${d.series.length > 1 ? `${s.name} ` : ''}${fmtNum(s.values[i])}${unit}`).join(', ')}`);
  return `${d.title}. ${rows.join('; ')}.`;
}
