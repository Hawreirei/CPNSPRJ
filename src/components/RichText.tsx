import katex from 'katex';
import { Fragment, useMemo } from 'react';

/** Render plain text with line breaks, **bold** and $inline$ / $$display$$ KaTeX math. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text ?? ''), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.math ? (
          <span
            key={i}
            className={p.display ? 'my-2 block text-center' : ''}
            dangerouslySetInnerHTML={{ __html: katex.renderToString(p.text, { throwOnError: false, displayMode: p.display, output: 'html' }) }}
          />
        ) : (
          <Fragment key={i}>{renderPlain(p.text)}</Fragment>
        ),
      )}
    </span>
  );
}

function renderPlain(t: string) {
  return t.split('\n').map((line, i, arr) => (
    <Fragment key={i}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => (seg.startsWith('**') && seg.endsWith('**') ? <b key={j}>{seg.slice(2, -2)}</b> : seg))}
      {i < arr.length - 1 && <br />}
    </Fragment>
  ));
}

interface Part {
  text: string;
  math: boolean;
  display: boolean;
}

export function splitMath(s: string): Part[] {
  const out: Part[] = [];
  const re = /\$\$([^$]+)\$\$|\$([^$\n]+)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    // Skip currency-like "$5" with no closing math intent is handled by requiring a closing $.
    if (m.index > last) out.push({ text: s.slice(last, m.index), math: false, display: false });
    out.push({ text: m[1] ?? m[2], math: true, display: !!m[1] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last), math: false, display: false });
  return out;
}

/** Plain-text version for exports: strips $ delimiters and simplifies common LaTeX. */
export function toPlain(s: string): string {
  return (s ?? '')
    .replace(/\$\$?([^$]+)\$\$?/g, (_, m: string) =>
      m
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
        .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
        .replace(/\\times/g, '×')
        .replace(/\\div/g, '÷')
        .replace(/\\cdot/g, '·')
        .replace(/\\le(q)?/g, '≤')
        .replace(/\\ge(q)?/g, '≥')
        .replace(/\^\{([^}]*)\}/g, '^$1')
        .replace(/\\[a-zA-Z]+/g, '')
        .replace(/[{}]/g, ''),
    )
    .replace(/\*\*([^*]+)\*\*/g, '$1');
}
