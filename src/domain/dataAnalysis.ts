import { hashText, shuffle, uid } from '../lib/id';
import { OPTION_LABELS } from './types';
import { fmtNum } from './describe';
import type { DataFigure, Difficulty, OptionLabel, Question } from './types';

export { describeData, fmtNum } from './describe';

/**
 * TIU data analysis, drawn by the app: the numbers are random, every key is computed from them,
 * and numeric keys carry a `mathExpression` so the regular answer check verifies them too.
 * The contexts are invented; nothing here claims to be real statistics.
 */

export const DATA_TOPIC = 'Analisis Data';

type Rand = () => number;
const pick = <T>(arr: readonly T[], r: Rand) => arr[Math.floor(r() * arr.length)];
const int = (lo: number, hi: number, r: Rand) => lo + Math.floor(r() * (hi - lo + 1));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const fmtPct = (fraction: number) => `${fmtNum(Math.round(fraction * 10000) / 100)}%`;

const PLACES = ['Sukamaju', 'Sukasari', 'Mekarjaya', 'Cibening', 'Karanganyar', 'Tanjungsari', 'Sindangsari'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni'];
const EDUCATION = ['SMA', 'D3', 'S1', 'S2', 'S3'];

interface Built {
  data: DataFigure;
  stem: string;
  /** The key as option text, and the wrong ones; numeric ones are compared by value. */
  answer: string;
  wrong: string[];
  /** For numeric keys: an expression over the shown numbers that mathjs evaluates to the key. */
  mathExpression?: string;
  explain: string;
}

/** Wrong numeric options from the usual slips, topped up with near values, never equal to the key. */
function numericOptions(answer: number, slips: number[], step: number, show: (n: number) => string): string[] {
  const out: string[] = [];
  const seen = new Set([show(answer)]);
  const add = (n: number) => {
    const s = show(n);
    if (n > 0 && Number.isFinite(n) && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  slips.forEach(add);
  for (let k = 1; out.length < 4; k++) [answer + k * step, answer - k * step].forEach(add);
  return out.slice(0, 4);
}

/* ------------------------------------------------------------------ table */

function table(difficulty: Difficulty, r: Rand): Built {
  const theme = pick(
    [
      { what: 'Produksi padi', unit: 'ton', step: 20 },
      { what: 'Jumlah penduduk usia kerja', unit: 'orang', step: 40 },
    ] as const,
    r,
  );
  const places = shuffle(PLACES, r).slice(0, 5);
  const y1 = int(2019, 2023, r);
  const y2 = y1 + 1;
  // Year-two values are year-one values grown by whole percentages, so every change is exact.
  const PCTS = [10, 15, 20, 25, 30, 40, 50];
  let a: number[];
  let pct: number[];
  for (;;) {
    a = places.map(() => int(10, 40, r) * theme.step);
    pct = shuffle(PCTS, r).slice(0, 5);
    const b = a.map((x, i) => (x * (100 + pct[i])) / 100);
    if (!b.every(Number.isInteger)) continue;
    // Hard questions need the biggest rise in percent to differ from the biggest rise in amount.
    const byPct = pct.indexOf(Math.max(...pct));
    const rises = b.map((x, i) => x - a[i]);
    if (difficulty === 'sulit' && rises.indexOf(Math.max(...rises)) === byPct) continue;
    break;
  }
  const b = a.map((x, i) => (x * (100 + pct[i])) / 100);
  const data: DataFigure = {
    kind: 'table',
    title: `${theme.what} di lima kecamatan (${theme.unit})`,
    unit: theme.unit,
    category: 'Kecamatan',
    labels: places,
    series: [
      { name: String(y1), values: a },
      { name: String(y2), values: b },
    ],
  };
  const withUnit = (n: number) => `${fmtNum(n)} ${theme.unit}`;

  if (difficulty === 'mudah') {
    const total = sum(b);
    return {
      data,
      stem: `Berdasarkan tabel, berapa total ${theme.what.toLowerCase()} di kelima kecamatan pada tahun ${y2}?`,
      answer: withUnit(total),
      // Slips: the other year, one row left out, one row counted twice.
      wrong: numericOptions(total, [sum(a), total - b[4], total + b[0]], theme.step * 5, withUnit),
      mathExpression: b.join(' + '),
      explain: `Jumlahkan kolom ${y2}: ${b.map(fmtNum).join(' + ')} = ${fmtNum(total)} ${theme.unit}.`,
    };
  }
  if (difficulty === 'sedang') {
    const i = int(0, 4, r);
    const f = (b[i] - a[i]) / a[i];
    return {
      data,
      stem: `Berapa persen kenaikan ${theme.what.toLowerCase()} di Kecamatan ${places[i]} dari tahun ${y1} ke tahun ${y2}?`,
      answer: fmtPct(f),
      // Slips: dividing by the new year, another row's change, the change in units read as percent.
      wrong: numericOptions(f, [(b[i] - a[i]) / b[i], (b[(i + 1) % 5] - a[(i + 1) % 5]) / a[(i + 1) % 5], f + 0.05, f - 0.05], 0.05, fmtPct),
      mathExpression: `(${b[i]} - ${a[i]}) / ${a[i]}`,
      explain: `Kenaikan = ${fmtNum(b[i])} − ${fmtNum(a[i])} = ${fmtNum(b[i] - a[i])} ${theme.unit}. Persentase = ${fmtNum(b[i] - a[i])} ÷ ${fmtNum(a[i])} × 100% = ${fmtPct(f)}.`,
    };
  }
  const best = pct.indexOf(Math.max(...pct));
  const rises = b.map((x, i) => x - a[i]);
  const mostUnits = rises.indexOf(Math.max(...rises));
  return {
    data,
    stem: `Kecamatan manakah yang mengalami persentase kenaikan ${theme.what.toLowerCase()} terbesar dari tahun ${y1} ke tahun ${y2}?`,
    answer: places[best],
    wrong: [places[mostUnits], ...places.filter((_, i) => i !== best && i !== mostUnits)],
    explain: `Hitung kenaikan tiap kecamatan dibagi nilai tahun ${y1}: ${places.map((p, i) => `${p} ${pct[i]}%`).join(', ')}. Terbesar ${places[best]} (${pct[best]}%). ${places[mostUnits]} naik paling banyak dalam ${theme.unit} (${fmtNum(rises[mostUnits])}), tetapi persentasenya lebih kecil.`,
  };
}

/* -------------------------------------------------------------------- bar */

function bar(difficulty: Difficulty, r: Rand): Built {
  const theme = pick(
    [
      { what: 'Jumlah pengunjung perpustakaan daerah', unit: 'orang' },
      { what: 'Jumlah permohonan izin usaha', unit: 'berkas' },
    ] as const,
    r,
  );
  const start = int(0, MONTHS.length - 5, r);
  const months = MONTHS.slice(start, start + 5);
  // Multiples of 10, so the five-month average is a whole number.
  let v: number[];
  for (;;) {
    v = months.map(() => int(12, 60, r) * 10);
    const ups = v.slice(1).map((x, i) => x - v[i]);
    const top = Math.max(...ups);
    if (top > 0 && ups.filter((u) => u === top).length === 1 && new Set(v).size === 5) break;
  }
  const data: DataFigure = {
    kind: 'bar',
    title: `${theme.what} per bulan (${theme.unit})`,
    unit: theme.unit,
    category: 'Bulan',
    labels: months,
    series: [{ name: theme.what, values: v }],
  };
  const withUnit = (n: number) => `${fmtNum(n)} ${theme.unit}`;

  if (difficulty === 'mudah') {
    const [i, j] = shuffle([0, 1, 2, 3, 4], r)
      .slice(0, 2)
      .sort((x, y) => x - y);
    const d = Math.abs(v[j] - v[i]);
    return {
      data,
      stem: `Berapa selisih ${theme.what.toLowerCase()} antara bulan ${months[i]} dan ${months[j]}?`,
      answer: withUnit(d),
      wrong: numericOptions(d, [v[i] + v[j], Math.abs(v[(j + 1) % 5] - v[i]), Math.abs(v[j] - v[(i + 1) % 5])], 10, withUnit),
      mathExpression: `abs(${v[j]} - ${v[i]})`,
      explain: `Selisih = |${fmtNum(v[j])} − ${fmtNum(v[i])}| = ${fmtNum(d)} ${theme.unit}.`,
    };
  }
  if (difficulty === 'sedang') {
    const avg = sum(v) / 5;
    return {
      data,
      stem: `Berapa rata-rata ${theme.what.toLowerCase()} per bulan selama lima bulan tersebut?`,
      answer: withUnit(avg),
      // Slips: dividing by four, the middle bar taken for the mean, the total.
      wrong: numericOptions(avg, [sum(v) / 4, [...v].sort((x, y) => x - y)[2], (sum(v) - v[4]) / 4], 10, withUnit),
      mathExpression: `(${v.join(' + ')}) / 5`,
      explain: `Rata-rata = (${v.map(fmtNum).join(' + ')}) ÷ 5 = ${fmtNum(sum(v))} ÷ 5 = ${fmtNum(avg)} ${theme.unit}.`,
    };
  }
  const ups = v.slice(1).map((x, i) => x - v[i]);
  const k = ups.indexOf(Math.max(...ups));
  const pair = (i: number, j: number) => `${months[i]} ke ${months[j]}`;
  return {
    data,
    stem: `Kenaikan ${theme.what.toLowerCase()} terbesar dari satu bulan ke bulan berikutnya terjadi pada ...`,
    answer: pair(k, k + 1),
    // The other consecutive pairs, plus the first-to-last span that a skimmer might pick.
    wrong: [...[0, 1, 2, 3].filter((i) => i !== k).map((i) => pair(i, i + 1)), pair(0, 4)],
    explain: `Perubahan tiap bulan: ${ups.map((u, i) => `${pair(i, i + 1)} ${u >= 0 ? '+' : '−'}${fmtNum(Math.abs(u))}`).join(', ')}. Kenaikan terbesar ${pair(k, k + 1)} (${fmtNum(ups[k])} ${theme.unit}).`,
  };
}

/* ------------------------------------------------------------------- line */

function line(difficulty: Difficulty, r: Rand): Built {
  const theme = pick(
    [
      { what: 'Penjualan koperasi pegawai', unit: 'juta rupiah' },
      { what: 'Pendapatan retribusi pasar', unit: 'juta rupiah' },
    ] as const,
    r,
  );
  const y0 = int(2018, 2021, r);
  const years = [0, 1, 2, 3, 4].map((i) => String(y0 + i));
  const data = (values: number[]): DataFigure => ({
    kind: 'line',
    title: `${theme.what} per tahun (${theme.unit})`,
    unit: theme.unit,
    category: 'Tahun',
    labels: years,
    series: [{ name: theme.what, values }],
  });
  const withUnit = (n: number) => `${fmtNum(n)} ${theme.unit}`;

  if (difficulty === 'mudah') {
    let v: number[];
    do v = years.map(() => int(20, 90, r) * 5);
    while (v.filter((x) => x === Math.min(...v)).length !== 1);
    const lo = v.indexOf(Math.min(...v));
    const hi = v.indexOf(Math.max(...v));
    return {
      data: data(v),
      stem: `Pada tahun berapa ${theme.what.toLowerCase()} paling rendah?`,
      answer: years[lo],
      wrong: [years[hi], ...years.filter((_, i) => i !== lo && i !== hi)].slice(0, 4),
      explain: `Titik terendah pada grafik adalah tahun ${years[lo]} (${withUnit(v[lo])}).`,
    };
  }
  if (difficulty === 'sedang') {
    // A fall by a whole percentage between two neighbouring years.
    const i = int(0, 3, r);
    const p = pick([10, 20, 25, 30, 40], r);
    const from = int(4, 12, r) * 20;
    const v = years.map(() => int(20, 60, r) * 5);
    v[i] = from;
    v[i + 1] = (from * (100 - p)) / 100;
    const f = (v[i] - v[i + 1]) / v[i];
    return {
      data: data(v),
      stem: `Berapa persen penurunan ${theme.what.toLowerCase()} dari tahun ${years[i]} ke tahun ${years[i + 1]}?`,
      answer: fmtPct(f),
      // Slips: dividing by the later year, the fall in units read as percent.
      wrong: numericOptions(f, [(v[i] - v[i + 1]) / v[i + 1], (v[i] - v[i + 1]) / 100, f + 0.05, f - 0.05], 0.05, fmtPct),
      mathExpression: `(${v[i]} - ${v[i + 1]}) / ${v[i]}`,
      explain: `Penurunan = ${fmtNum(v[i])} − ${fmtNum(v[i + 1])} = ${fmtNum(v[i] - v[i + 1])}. Persentase = ${fmtNum(v[i] - v[i + 1])} ÷ ${fmtNum(v[i])} × 100% = ${fmtPct(f)}.`,
    };
  }
  // The last rise continues at the same rate for one more year.
  const p = pick([25, 50], r);
  const base = int(2, 6, r) * 160;
  const v = years.map(() => int(20, 60, r) * 10);
  v[3] = base;
  v[4] = (base * (100 + p)) / 100;
  const next = (v[4] * (100 + p)) / 100;
  return {
    data: data(v),
    stem: `Jika ${theme.what.toLowerCase()} dari tahun ${years[4]} ke tahun ${y0 + 5} naik dengan persentase yang sama seperti dari tahun ${years[3]} ke tahun ${years[4]}, berapa nilainya pada tahun ${y0 + 5}?`,
    answer: withUnit(next),
    // Slips: adding the same amount instead of the same percentage, applying the rise to the wrong year.
    wrong: numericOptions(next, [v[4] + (v[4] - v[3]), (v[3] * (100 + p)) / 100, v[4] + p], 10, withUnit),
    mathExpression: `${v[4]} * (${v[4]} / ${v[3]})`,
    explain: `Kenaikan ${years[3]} ke ${years[4]} = (${fmtNum(v[4])} − ${fmtNum(v[3])}) ÷ ${fmtNum(v[3])} = ${p}%. Tahun ${y0 + 5}: ${fmtNum(v[4])} × ${fmtNum(1 + p / 100)} = ${fmtNum(next)} ${theme.unit}. Bukan ditambah ${fmtNum(v[4] - v[3])} lagi, karena yang sama adalah persentasenya.`,
  };
}

/* -------------------------------------------------------------------- pie */

function pie(difficulty: Difficulty, r: Rand): Built {
  const total = int(10, 40, r) * 20;
  // Shares in whole multiples of 5%, all different, adding up to 100%.
  let pct: number[];
  do {
    const cuts = shuffle(
      [...Array(19).keys()].map((k) => (k + 1) * 5),
      r,
    )
      .slice(0, 4)
      .sort((x, y) => x - y);
    pct = [cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1], cuts[3] - cuts[2], 100 - cuts[3]];
  } while (new Set(pct).size !== 5 || pct.some((p) => p < 5) || pct[2] % 20 !== 0);
  const data: DataFigure = {
    kind: 'pie',
    title: `Pegawai kantor kecamatan menurut pendidikan terakhir (total ${fmtNum(total)} orang)`,
    unit: '%',
    category: 'Pendidikan',
    labels: EDUCATION,
    series: [{ name: 'Persentase pegawai', values: pct }],
  };
  const people = (n: number) => `${fmtNum(n)} orang`;

  if (difficulty === 'mudah') {
    const i = int(0, 4, r);
    const n = (total * pct[i]) / 100;
    return {
      data,
      stem: `Berapa jumlah pegawai yang berpendidikan terakhir ${EDUCATION[i]}?`,
      answer: people(n),
      // Slips: another slice, the percentage read as a count.
      wrong: numericOptions(n, [(total * pct[(i + 1) % 5]) / 100, pct[i], (total * pct[(i + 4) % 5]) / 100], 10, people),
      mathExpression: `${total} * ${pct[i]} / 100`,
      explain: `${EDUCATION[i]} = ${pct[i]}% × ${fmtNum(total)} = ${fmtNum(n)} orang.`,
    };
  }
  if (difficulty === 'sedang') {
    const [i, j] = shuffle([0, 1, 2, 3, 4], r).slice(0, 2);
    const n = (total * Math.abs(pct[i] - pct[j])) / 100;
    return {
      data,
      stem: `Berapa selisih jumlah pegawai berpendidikan ${EDUCATION[i]} dan ${EDUCATION[j]}?`,
      answer: people(n),
      wrong: numericOptions(n, [Math.abs(pct[i] - pct[j]), (total * (pct[i] + pct[j])) / 100, (total * pct[i]) / 100], 10, people),
      mathExpression: `${total} * abs(${pct[i]} - ${pct[j]}) / 100`,
      explain: `Selisih persentase = |${pct[i]}% − ${pct[j]}%| = ${Math.abs(pct[i] - pct[j])}%. Jumlahnya = ${Math.abs(pct[i] - pct[j])}% × ${fmtNum(total)} = ${fmtNum(n)} orang.`,
    };
  }
  // A quarter of the S1 graduates finish S2; S1 is a multiple of 20%, so the new share is whole.
  const moved = pct[2] / 4;
  const f = (pct[3] + moved) / 100;
  return {
    data,
    stem: 'Jika seperempat pegawai berpendidikan S1 menyelesaikan S2 dan tidak ada pegawai lain yang berubah, berapa persen pegawai yang kini berpendidikan terakhir S2?',
    answer: fmtPct(f),
    // Slips: adding a quarter of the S2 share, forgetting to add the old S2, adding all of S1.
    wrong: numericOptions(f, [(pct[3] * 1.25) / 100, moved / 100, (pct[3] + pct[2]) / 100, (pct[3] + 25) / 100], 0.05, fmtPct),
    mathExpression: `(${pct[3]} + ${pct[2]} / 4) / 100`,
    explain: `Seperempat dari S1 = ${pct[2]}% ÷ 4 = ${fmtNum(moved)}% dari seluruh pegawai. S2 sekarang = ${pct[3]}% + ${fmtNum(moved)}% = ${fmtPct(f)}.`,
  };
}

const BUILDERS = { table, bar, line, pie };

export function generateDataAnalysis(difficulty: Difficulty, r: Rand = Math.random, kind?: DataFigure['kind']): Question {
  const b = BUILDERS[kind ?? pick(['table', 'bar', 'line', 'pie'] as const, r)](difficulty, r);
  const opts = shuffle([b.answer, ...b.wrong.slice(0, 4)], r);
  const answerIdx = opts.indexOf(b.answer);
  const answer: OptionLabel = OPTION_LABELS[answerIdx];
  const now = Date.now();
  return {
    id: uid(),
    subtest: 'TIU',
    topic: DATA_TOPIC,
    difficulty,
    stem: b.stem,
    options: opts.map((text, i) => ({ label: OPTION_LABELS[i], text, score: i === answerIdx ? 5 : 0 })),
    answer,
    explanation: `${b.explain}\n\nJawaban: ${answer}.`,
    ...(b.mathExpression ? { mathExpression: b.mathExpression } : {}),
    data: b.data,
    flags: [],
    locked: false,
    starred: false,
    hash: hashText(b.stem + JSON.stringify(b.data)),
    source: 'procedural',
    createdAt: now,
    updatedAt: now,
  };
}
