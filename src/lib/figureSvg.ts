import { isLegacy } from '../domain/pic';
import type { Figure, FigureCell, Pic, ShapeKind } from '../domain/types';
import { cubeSvg, faceSvg, foldSvg, holesSvg, linesSvg, netSvg, sceneSvg, strokesSvg } from './picSvg';

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
  triangle: `<polygon points="${pts([
    [0, -1],
    [0.9, 0.65],
    [-0.9, 0.65],
  ])}"/>`,
  diamond: `<polygon points="${pts([
    [0, -1],
    [0.7, 0],
    [0, 1],
    [-0.7, 0],
  ])}"/>`,
  star: `<polygon points="${pts(star())}"/>`,
  pentagon: `<polygon points="${pts(regular(5, 0.95))}"/>`,
  hexagon: `<polygon points="${pts(regular(6, 0.95))}"/>`,
  arrow: `<polygon points="${pts([
    [0, -1],
    [0.65, -0.15],
    [0.22, -0.15],
    [0.22, 1],
    [-0.22, 1],
    [-0.22, -0.15],
    [-0.65, -0.15],
  ])}"/>`,
};

const POSITIONS: Record<number, [number, number][]> = {
  1: [[0, 0]],
  2: [
    [-0.5, 0],
    [0.5, 0],
  ],
  3: [
    [0, -0.5],
    [-0.5, 0.45],
    [0.5, 0.45],
  ],
  4: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  5: [
    [-0.55, -0.55],
    [0.55, -0.55],
    [0, 0],
    [-0.55, 0.55],
    [0.55, 0.55],
  ],
  6: [
    [-0.55, -0.6],
    [0.55, -0.6],
    [-0.55, 0],
    [0.55, 0],
    [-0.55, 0.6],
    [0.55, 0.6],
  ],
};

let seq = 0;

/** SVG markup for one figural picture (used in-app and for exports); `null` draws the "?". */
export function cellSvg(cell: Pic | null, size = 96, color = 'currentColor'): string {
  if (cell && !isLegacy(cell)) {
    switch (cell.kind) {
      case 'scene':
        return sceneSvg(cell, size, color);
      case 'strokes':
        return strokesSvg(cell, size, color);
      case 'lines':
        return linesSvg(cell, size, color);
      case 'cube':
        return cubeSvg(cell, size, color);
      case 'face':
        return faceSvg(cell, size, color);
      case 'net':
        return netSvg(cell, size, color);
      case 'holes':
        return holesSvg(cell, size, color);
      case 'fold':
        return foldSvg(cell, size, color);
    }
  }
  return legacySvg(cell, size, color);
}

function legacySvg(cell: FigureCell | null, size: number, color: string): string {
  const id = `h${++seq}`;
  const frame = `<rect x="2" y="2" width="${size - 4}" height="${size - 4}" rx="8" fill="none" stroke="${color}" stroke-opacity="0.25"/>`;
  if (!cell) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${frame}<text x="${size / 2}" y="${size * 0.54}" dominant-baseline="middle" text-anchor="middle" font-size="${size * 0.45}" font-family="sans-serif" fill="${color}">?</text></svg>`;
  }
  const count = Math.min(6, Math.max(1, cell.count));
  const scale = count === 1 ? size * 0.32 : count <= 4 ? size * 0.17 : size * 0.13;
  const fill = cell.fill === 'solid' ? color : cell.fill === 'striped' ? `url(#${id})` : cell.fill === 'dotted' ? `url(#${id}d)` : 'none';
  const shapes = POSITIONS[count]
    .map(([px, py]) => {
      const cx = size / 2 + px * size * 0.5 * 0.8;
      const cy = size / 2 + py * size * 0.5 * 0.8;
      return `<g transform="translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${cell.rotation}) scale(${scale.toFixed(2)})" fill="${fill}" stroke="${color}" stroke-width="${(2 / scale).toFixed(3)}" stroke-linejoin="round">${SHAPES[cell.shape]}</g>`;
    })
    .join('');
  // The pattern lives in each shape's scaled coordinate space, so express a ~5px hatch in those units.
  const p = 5 / scale;
  const pattern = `<defs><pattern id="${id}" width="${p.toFixed(3)}" height="${p.toFixed(3)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${p.toFixed(3)}" stroke="${color}" stroke-width="${(1.6 / scale).toFixed(3)}"/></pattern><pattern id="${id}d" width="${(p * 0.9).toFixed(3)}" height="${(p * 0.9).toFixed(3)}" patternUnits="userSpaceOnUse"><circle cx="${(p * 0.45).toFixed(3)}" cy="${(p * 0.45).toFixed(3)}" r="${(1.4 / scale).toFixed(3)}" fill="${color}"/></pattern></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${pattern}${frame}${shapes}</svg>`;
}

/** A cell's SVG placed at (x, y) inside a larger drawing. */
const place = (svg: string, x: number, y: number) => svg.replace(/^<svg /, `<svg x="${x}" y="${y}" `);
const sign = (t: string, x: number, y: number, color: string, size = 26) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle" fill="${color}">${t}</text>`;

/**
 * Whole stem figure as one SVG: cells in a row ("::" between analogy pairs, "→" after a transform's
 * figure and between folding steps), a 3×3 grid, or rows of "a + b = c".
 */
export function figureSvg(fig: Figure, cellSize = 96, color = 'currentColor'): string {
  const gap = 16;
  const parts: string[] = [];
  const svg = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;
  if (fig.layout === 'matrix') {
    const g = 8;
    fig.cells.forEach((c, i) => parts.push(place(cellSvg(c, cellSize, color), (i % 3) * (cellSize + g), Math.floor(i / 3) * (cellSize + g))));
    const side = 3 * cellSize + 2 * g;
    return svg(side, side);
  }
  if (fig.layout === 'sum') {
    // Rows of three: a, b and their combination; the signs sit in 32px gutters.
    const rows = Math.ceil(fig.cells.length / 3);
    const w = 3 * cellSize + 64;
    fig.cells.forEach((c, i) => {
      const col = i % 3;
      const y = Math.floor(i / 3) * (cellSize + 12);
      parts.push(place(cellSvg(c, cellSize, color), col * (cellSize + 32), y));
      if (col < 2) parts.push(sign(col === 0 ? '+' : '=', col * (cellSize + 32) + cellSize + 16, y + cellSize / 2, color));
    });
    return svg(w, rows * (cellSize + 12) - 12);
  }
  const size = fig.layout === 'single' ? Math.round(cellSize * 1.8) : cellSize;
  let x = 0;
  fig.cells.forEach((c, i) => {
    if (fig.layout === 'analogy' && i === 2) {
      parts.push(sign('::', x + 12, size / 2, color, 24));
      x += 28;
    }
    if ((fig.layout === 'transform' && i === 1) || (fig.layout === 'fold' && i > 0)) {
      parts.push(sign('→', x + 14, size / 2, color, 28));
      x += 36;
    }
    parts.push(place(cellSvg(c, size, color), x, 0));
    x += size + gap;
  });
  return svg(x - gap, size);
}

/** Options with more detail (scenes, cubes, nets, paper) are drawn larger than a single shape; `scale` for print. */
export const optionSize = (cell: Pic, scale = 1) => Math.round(scale * (isLegacy(cell) || cell.kind === 'face' ? 56 : cell.kind === 'net' || cell.kind === 'cube' ? 84 : 72));

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
