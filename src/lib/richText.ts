/*
 * Math in question text: $inline$ and $$display$$ parts, and a plain-text version for exports.
 * Kept apart from the RichText component so non-UI code (exports, tests) can use it.
 */

export interface Part {
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
