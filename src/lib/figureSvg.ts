import type { Figure, FigureCell, ShapeKind } from '../domain/types';

const pts = (arr: [number, number][]) => arr.map(([x, y]) => `${x.toFixed(3)},${y.toFixed(3)}`).join(' ');

function regular(n: number, r = 1, offset = -Math.PI / 2): [number, number][] {
  return Array.from({ length: n }, (_, i) => [r * Math.cos(offset + (i * 2 * Math.PI) / n), r * Math.sin(offset + (i * 2 * Math.PI) / n)]);
}

function star(): [number, number][] {
  return Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 1 : 0.42;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return [r * Math.cos(a), r * Math.sin(a)];
  });
}

const SHAPES: Record<ShapeKind, string> = {
  circle: '<circle cx="0" cy="0" r="0.9"/>',
  square: '<rect x="-0.8" y="-0.8" width="1.6" height="1.6"/>',
  triangle: `<polygon points="${pts([[0, -1], [0.9, 0.65], [-0.9, 0.65]])}"/>`,
  diamond: `<polygon points="${pts([[0, -1], [0.7, 0], [0, 1], [-0.7, 0]])}"/>`,
  star: `<polygon points="${pts(star())}"/>`,
  pentagon: `<polygon points="${pts(regular(5, 0.95))}"/>`,
  arrow: `<polygon points="${pts([[0, -1], [0.65, -0.15], [0.22, -0.15], [0.22, 1], [-0.22, 1], [-0.22, -0.15], [-0.65, -0.15]])}"/>`,
};

const POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.5, 0], [0.5, 0]],
  3: [[0, -0.5], [-0.5, 0.45], [0.5, 0.45]],
  4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]],
};

let seq = 0;

/** SVG markup for one figural cell (used in-app and for exports). */
export function cellSvg(cell: FigureCell | null, size = 96, color = 'currentColor'): string {
  const id = `h${++seq}`;
  const frame = `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="8" fill="none" stroke="${color}" stroke-opacity="0.25"/>`;
  if (!cell) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${frame}<text x="${size / 2}" y="${size * 0.54}" dominant-baseline="middle" text-anchor="middle" font-size="${size * 0.45}" font-family="sans-serif" fill="${color}">?</text></svg>`;
  }
  const count = Math.min(4, Math.max(1, cell.count));
  const scale = count === 1 ? size * 0.32 : size * 0.17;
  const fill = cell.fill === 'solid' ? color : cell.fill === 'striped' ? `url(#${id})` : 'none';
  const shapes = POSITIONS[count]
    .map(([px, py]) => {
      const cx = size / 2 + px * size * 0.5 * 0.8;
      const cy = size / 2 + py * size * 0.5 * 0.8;
      return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${cell.rotation}) scale(${scale.toFixed(2)})" fill="${fill}" stroke="${color}" stroke-width="${(2 / scale).toFixed(3)}" stroke-linejoin="round">${SHAPES[cell.shape]}</g>`;
    })
    .join('');
  // The pattern lives in each shape's scaled coordinate space, so express a ~5px hatch in those units.
  const p = 5 / scale;
  const pattern = `<defs><pattern id="${id}" width="${p.toFixed(3)}" height="${p.toFixed(3)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${p.toFixed(3)}" stroke="${color}" stroke-width="${(1.6 / scale).toFixed(3)}"/></pattern></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${pattern}${frame}${shapes}</svg>`;
}

const inner = (svg: string) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');

/** Whole stem figure as one SVG: cells in a row ("::" between analogy pairs, "→" for a transform), or a 3×3 grid. */
export function figureSvg(fig: Figure, cellSize = 96, color = 'currentColor'): string {
  const gap = 16;
  const parts: string[] = [];
  if (fig.layout === 'matrix') {
    const g = 8;
    fig.cells.forEach((c, i) => {
      const x = (i % 3) * (cellSize + g);
      const y = Math.floor(i / 3) * (cellSize + g);
      parts.push(`<g transform="translate(${x} ${y})">${inner(cellSvg(c, cellSize, color))}</g>`);
    });
    const side = 3 * cellSize + 2 * g;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">${parts.join('')}</svg>`;
  }
  let x = 0;
  fig.cells.forEach((c, i) => {
    if (fig.layout === 'analogy' && i === 2) {
      parts.push(`<text x="${x + 6}" y="${cellSize / 2 + 8}" font-size="24" font-family="sans-serif" fill="${color}">::</text>`);
      x += 28;
    }
    if (fig.layout === 'transform' && i === 1) {
      parts.push(`<text x="${x + 4}" y="${cellSize / 2 + 9}" font-size="28" font-family="sans-serif" fill="${color}">→</text>`);
      x += 36;
    }
    parts.push(`<g transform="translate(${x} 0)">${inner(cellSvg(c, cellSize, color))}</g>`);
    x += cellSize + gap;
  });
  const width = x - gap;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cellSize}" viewBox="0 0 ${width} ${cellSize}">${parts.join('')}</svg>`;
}

/** Whether a question has a figure in its stem (odd-one-out puzzles show theirs in the options only). */
export const hasStemFigure = (fig: Figure | undefined): fig is Figure => !!fig && fig.cells.length > 0;

/** Rasterise an SVG string to PNG bytes (browser only). */
export async function svgToPng(svg: string, scale = 2): Promise<{ data: Uint8Array; width: number; height: number }> {
  const m = svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
  const width = m ? Number(m[1]) : 96;
  const height = m ? Number(m[2]) : 96;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('PNG gagal'))), 'image/png'));
  return { data: new Uint8Array(await blob.arrayBuffer()), width, height };
}
