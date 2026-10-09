/** Dates and prices as the app shows them. */
export const fmtDate = (t: number) => new Date(t).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
export const fmtUsd = (n: number) => (n < 0.01 ? `< $0.01` : `$${n.toFixed(n < 1 ? 3 : 2)}`);
