import katex from 'katex';
import 'katex/dist/katex.min.css';

// Loaded on demand by RichText, together with its stylesheet, the first time a text contains $…$.
export function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, { throwOnError: false, displayMode: display, output: 'html' });
}
