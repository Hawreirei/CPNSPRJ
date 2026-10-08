import { evaluate } from 'mathjs';

/**
 * Parse a number written in an option, accepting Indonesian formatting
 * ("Rp 1.500.000", "12,5", "3/4", "25%", "2 1/2").
 */
export function parseNumeric(raw: string): number | null {
  let s = raw
    .replace(/\$/g, '')
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\\times|×/g, '*')
    .replace(/\\div|÷/g, '/')
    .replace(/rp\.?/gi, '')
    .trim();

  const pct = /%\s*$/.test(s);
  s = s.replace(/%/g, '');
  // Drop trailing unit words ("km", "orang", "hari") but keep the leading expression.
  s = s.replace(/[a-zA-ZÀ-ɏ\s]+$/u, '').trim();
  if (!s) return null;

  const mixed = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const frac = Number(mixed[2]) / Number(mixed[3]);
    return whole < 0 ? whole - frac : whole + frac;
  }

  s = normalizeSeparators(s);
  if (!/^[-+*/().\d\s^]+$/.test(s)) return null;
  try {
    const v = evaluate(s);
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    return pct ? v / 100 : v;
  } catch {
    return null;
  }
}

function normalizeSeparators(s: string): string {
  return s.replace(/\d[\d.,]*/g, (num) => {
    const hasDot = num.includes('.');
    const hasComma = num.includes(',');
    if (hasDot && hasComma) return num.replace(/\./g, '').replace(',', '.');
    if (hasComma) return num.replace(',', '.');
    // "1.500" is a thousands separator, but "0.300" is a decimal.
    if (hasDot && /^[1-9]\d{0,2}(\.\d{3})+$/.test(num)) return num.replace(/\./g, '');
    return num;
  });
}

/**
 * Evaluate the model's `mathExpression`. It is asked for plain mathjs syntax
 * ("0.3 + 0.4", "1200000 * 0.85"), so that is tried first; Indonesian number
 * formatting ("1.200.000", "0,15") is only a fallback.
 */
export function evaluateExpression(expr: string): number | null {
  const base = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/:/g, '/');
  return evalNumber(base) ?? evalNumber(normalizeSeparators(base));
}

function evalNumber(expr: string): number | null {
  try {
    const v = evaluate(expr);
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (v && typeof v === 'object' && 'valueOf' in v) {
      const n = Number(v.valueOf());
      return Number.isFinite(n) ? n : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function approxEqual(a: number, b: number): boolean {
  const tol = Math.max(1e-6, Math.abs(b) * 1e-4);
  return Math.abs(a - b) <= tol;
}
