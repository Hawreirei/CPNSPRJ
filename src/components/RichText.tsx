import { Fragment, useEffect, useMemo, useState } from 'react';
import { splitMath } from '../lib/richText';

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
