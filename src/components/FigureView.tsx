import { useMemo } from 'react';
import { describeCell, describeFigure } from '../domain/describe';
import { cellSvg, figureSvg, hasStemFigure } from '../lib/figureSvg';
import type { Figure, FigureCell } from '../domain/types';

// Each figure carries a description, so a screen reader gets the same puzzle as the eye.
export function FigureView({ figure, size = 80 }: { figure: Figure; size?: number }) {
  const html = useMemo(() => (hasStemFigure(figure) ? figureSvg(figure, size) : ''), [figure, size]);
  if (!html) return null;
  return (
    <div
      role="img"
      aria-label={describeFigure(figure)}
      className="my-2 max-w-full overflow-x-auto text-slate-800 dark:text-slate-100"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function CellView({ cell, size = 56 }: { cell: FigureCell; size?: number }) {
  const html = useMemo(() => cellSvg(cell, size), [cell, size]);
  return <span role="img" aria-label={describeCell(cell)} className="inline-block align-middle text-slate-800 dark:text-slate-100" dangerouslySetInnerHTML={{ __html: html }} />;
}
