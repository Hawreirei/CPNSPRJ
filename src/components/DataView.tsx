import { useMemo } from 'react';
import { fmtNum } from '../domain/describe';
import { isImageSrc } from '../domain/questionImage';
import type { DataFigure, Question } from '../domain/types';
import { dataChartSvg } from '../lib/dataSvg';
import { FigureView } from './FigureView';

/** Whatever a question shows above its options: a figural figure, a table, or a chart. */
export function StemMedia({ q }: { q: Pick<Question, 'figure' | 'data' | 'image'> }) {
  return (
    <>
      {q.figure && <FigureView figure={q.figure} />}
      {q.data && <DataView data={q.data} />}
      {q.image && isImageSrc(q.image.src) && (
        <img
          src={q.image.src}
          alt={q.image.alt}
          width={q.image.width}
          height={q.image.height}
          className="my-3 h-auto max-h-96 w-auto max-w-full rounded border border-slate-200 bg-white dark:border-slate-700"
        />
      )}
    </>
  );
}

function DataTable({ data, hidden }: { data: DataFigure; hidden?: boolean }) {
  const unit = data.kind === 'pie' ? '%' : '';
  return (
    <table className={hidden ? 'sr-only' : 'my-3 w-full max-w-md border-collapse text-sm'}>
      <caption className={hidden ? '' : 'mb-1 text-left font-medium'}>{data.title}</caption>
      <thead>
        <tr className="border-b border-slate-300 dark:border-slate-600">
          <th scope="col" className="py-1 pr-3 text-left">
            {data.category}
          </th>
          {data.series.map((s) => (
            <th key={s.name} scope="col" className="py-1 pl-3 text-right">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.labels.map((l, i) => (
          <tr key={l} className="border-b border-slate-200 dark:border-slate-800">
            <th scope="row" className="py-1 pr-3 text-left font-normal">
              {l}
            </th>
            {data.series.map((s) => (
              <td key={s.name} className="py-1 pl-3 text-right tabular-nums">
                {fmtNum(s.values[i])}
                {unit}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A table as a table; a chart as a drawing, with the same numbers in a table for screen readers. */
export function DataView({ data }: { data: DataFigure }) {
  const svg = useMemo(() => (data.kind === 'table' ? '' : dataChartSvg(data)), [data]);
  if (data.kind === 'table') return <DataTable data={data} />;
  return (
    <figure className="my-3 max-w-md">
      <figcaption className="mb-1 text-sm font-medium" aria-hidden="true">
        {data.title}
      </figcaption>
      <div aria-hidden="true" className="text-slate-800 dark:text-slate-100 [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <DataTable data={data} hidden />
    </figure>
  );
}
