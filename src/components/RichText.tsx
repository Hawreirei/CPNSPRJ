import { Fragment, useEffect, useMemo, useState } from 'react';

type RenderMath = (tex: string, display: boolean) => string;

// KaTeX (~80 KB gzipped plus its stylesheet) loads the first time a text actually contains math.
let renderMath: RenderMath | null = null;
let loading: Promise<RenderMath> | null = null;

function loadKatex(): Promise<RenderMath> {
  loading ??= import('../lib/katex').then(
    (m) => (renderMath = m.renderMath),
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

function useRenderMath(needed: boolean): RenderMath | null {
  const [render, setRender] = useState(() => renderMath);
  useEffect(() => {
    if (!needed || render) return;
    let live = true;
    // On failure the formula simply stays as its TeX source.
    loadKatex().then((fn) => live && setRender(() => fn), () => {});
    return () => {
      live = false;
    };
  }, [needed, render]);
  return render;
}

/** Render plain text with line breaks, **bold** and $inline$ / $$display$$ KaTeX math. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text ?? ''), [text]);
  const render = useRenderMath(parts.some((p) => p.math));
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.math ? (
          render ? (
            <span key={i} className={p.display ? 'my-2 block text-center' : ''} dangerouslySetInnerHTML={{ __html: render(p.text, p.display) }} />
          ) : (
            // Until KaTeX is ready, the TeX source stands in for the formula.
            <span key={i} className={p.display ? 'my-2 block text-center' : ''} data-math-pending="">
              {p.text}
            </span>
          )
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
        // Simple fractions read naturally as 3/4; only compound parts need brackets.
        .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, (_f, a: string, b: string) => `${/^[\w.,]+$/.test(a) ? a : `(${a})`}/${/^[\w.,]+$/.test(b) ? b : `(${b})`}`)
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
