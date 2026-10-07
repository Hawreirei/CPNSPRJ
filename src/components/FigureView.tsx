import { useMemo } from 'react';
import { cellSvg, figureSvg } from '../lib/figureSvg';
import type { Figure, FigureCell } from '../domain/types';

export function FigureView({ figure, size = 80 }: { figure: Figure; size?: number }) {
  const html = useMemo(() => figureSvg(figure, size), [figure, size]);
  return <div className="my-2 max-w-full overflow-x-auto text-slate-800 dark:text-slate-100" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CellView({ cell, size = 56 }: { cell: FigureCell; size?: number }) {
  const html = useMemo(() => cellSvg(cell, size), [cell, size]);
  return <span className="inline-block align-middle text-slate-800 dark:text-slate-100" dangerouslySetInnerHTML={{ __html: html }} />;
}
