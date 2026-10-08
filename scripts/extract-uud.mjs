// Turns the official text of the 1945 Constitution into src/data/uud1945.json (#47).
//
// Source: "Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 Dalam Satu Naskah",
// Sekretariat Jenderal MPR RI (PDF, file date 12 January 2007), as provided by the product owner.
// Run on the PDF's text layer, then review the diff of the JSON:
//   pdftotext -layout UUD45_SatuNaskah.pdf uud.txt && node scripts/extract-uud.mjs uud.txt
// Nothing is reworded: text is only joined across line and page breaks, and the amendment marks
// (*) to ****)) are moved into fields.
import { readFileSync, writeFileSync } from 'node:fs';

const [, , input, output = 'src/data/uud1945.json'] = process.argv;
if (!input) throw new Error('Usage: node scripts/extract-uud.mjs <pdftotext -layout output> [output.json]');

const NOISE = [
  /^\s*\*{1,4}\)\s*:\s*Perubahan (Pertama|Kedua|Ketiga|Keempat)\s*$/,
  /^\s*SEKRETARIAT JENDERAL\s*$/,
  /^\s*[-_]+\s*$/,
  /^\s*UNDANG-UNDANG DASAR\s*$/,
  /^\s*NEGARA REPUBLIK INDONESIA TAHUN 1945\s*$/,
  /^\s*UNDANG-UNDANG DASAR NEGARA REPUBLIK INDONESIA\s*$/,
  /^\s*TAHUN 1945\s*$/,
  /^\s*DALAM SATU NASKAH\s*$/,
  /^\s*\(Preambule\)\s*$/,
];

const lines = readFileSync(input, 'utf8')
  // The PDF writes hyphens as soft hyphens and breaks pages with form feeds.
  .replace(/­/g, '-')
  .replace(/\f/g, '\n')
  .split('\n')
  // The page header names the MPR above "SEKRETARIAT JENDERAL"; elsewhere it is the title of BAB II.
  .filter((l, i, all) => !(/^\s*MAJELIS PERMUSYAWARATAN RAKYAT\s*$/.test(l) && /^\s*SEKRETARIAT JENDERAL\s*$/.test(all[i + 1] ?? '')))
  .filter((l) => !NOISE.some((re) => re.test(l)));

// "***)" = third amendment; "***/****)" = changed by the third and again by the fourth.
const MARK = /\s*(\*{1,4}(?:\/\*{1,4})*)\)\s*$/;
const amendments = (mark) => mark.split('/').map((s) => s.length);
/** Text without its trailing amendment mark, and which amendments (1–4) it names. */
function unmark(text) {
  const m = MARK.exec(text);
  return m ? { text: text.slice(0, m.index).trim(), amendments: amendments(m[1]) } : { text: text.trim() };
}
/** Join wrapped lines: a line ending in a hyphen continues the word on the next. */
const join = (parts) =>
  parts
    .reduce((acc, p) => (acc.endsWith('-') ? acc + p : acc ? `${acc} ${p}` : p), '')
    .replace(/\s+/g, ' ')
    // Spacing only: the PDF sometimes sets a space before a comma ("NEGARA , SERTA").
    .replace(/ ([,;])/g, '$1');

const centered = (l, min = 15) => l.length - l.trimStart().length >= min;
const BAB = /^\s+BAB ([IVX]+[A-Z]?)\s*(?:(\*{1,4}(?:\/\*{1,4})*)\))?\s*$/;
const PASAL = /^\s+Pasal (\d+[A-Z]?|[IVX]+)\s*(?:(\*{1,4}(?:\/\*{1,4})*)\))?\s*$/;
const ATURAN = /^\s+(ATURAN PERALIHAN|ATURAN TAMBAHAN)\s*$/;
const AYAT = /^\((\d+)\)\s+(.*)$/;

const pembukaan = [];
const babs = [];
let bab = null;
let pasal = null;
/** The paragraph being read: lines so far, and where it goes. */
let para = null;

function flush() {
  if (!para) return;
  const { text, amendments: by } = unmark(join(para.lines));
  const marked = by ? { amendments: by } : {};
  if (para.kind === 'pembukaan') pembukaan.push(text);
  else if (para.kind === 'removed') Object.assign(bab, { removed: true, ...marked });
  else if (para.kind === 'ayat') pasal.ayat.push({ no: para.no, text, ...marked });
  else {
    if (pasal.text) throw new Error(`Pasal ${pasal.id} has two paragraphs outside its ayat.`);
    Object.assign(pasal, { text, ...marked });
  }
  para = null;
}

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) continue;
  let m;
  if ((m = BAB.exec(line))) {
    flush();
    // The chapter title: the centred upper-case lines that follow.
    const title = [];
    while (
      i + 1 < lines.length &&
      (!lines[i + 1].trim() || (centered(lines[i + 1]) && /^[A-Z ,.-]+(\*{1,4}(\/\*{1,4})*\))?$/.test(lines[i + 1].trim()) && !PASAL.test(lines[i + 1])))
    ) {
      i++;
      if (lines[i].trim()) title.push(lines[i].trim());
      else if (title.length) break;
    }
    // A mark after the title means the chapter's name was changed by that amendment.
    const t = unmark(join(title));
    bab = { id: m[1], title: t.text, ...(m[2] ? { amendments: amendments(m[2]) } : {}), ...(t.amendments ? { titleAmendments: t.amendments } : {}), pasal: [] };
    babs.push(bab);
    pasal = null;
    continue;
  }
  if ((m = ATURAN.exec(line))) {
    flush();
    bab = {
      id: m[1] === 'ATURAN PERALIHAN' ? 'peralihan' : 'tambahan',
      title: m[1].replace('ATURAN', 'Aturan').replace('PERALIHAN', 'Peralihan').replace('TAMBAHAN', 'Tambahan'),
      pasal: [],
    };
    babs.push(bab);
    continue;
  }
  if ((m = PASAL.exec(line))) {
    flush();
    pasal = { id: m[1], ...(m[2] ? { amendments: amendments(m[2]) } : {}), ayat: [] };
    bab.pasal.push(pasal);
    continue;
  }
  if (!bab) {
    // The preamble: a paragraph starts with an indent.
    if (/^\s{5,}\S/.test(line) && !centered(line, 30)) {
      flush();
      para = { kind: 'pembukaan', lines: [line.trim()] };
    } else if (centered(line, 30) && /PEMBUKAAN/.test(line)) continue;
    else para?.lines.push(line.trim());
    continue;
  }
  if (!pasal) {
    if (/^\s+Dihapus\./.test(line)) {
      flush();
      para = { kind: 'removed', lines: [line.trim()] };
      flush();
      continue;
    }
    throw new Error(`Text outside any article at line ${i + 1}: ${line}`);
  }
  // In an article, a line opens an ayat, or the article's own text when nothing is open yet; every
  // other line continues what is open (the PDF's indents are not consistent enough to say more).
  if ((m = AYAT.exec(line))) {
    flush();
    para = { kind: 'ayat', no: Number(m[1]), lines: [m[2].trim()] };
  } else if (!para) para = { kind: 'pasal', lines: [line.trim()] };
  else para.lines.push(line.trim());
}
flush();

// Pancasila as worded in the fourth paragraph of the preamble ("... dengan berdasarkan kepada ...").
const fourth = pembukaan[3] ?? '';
const m =
  /berdasarkan kepada (Ketuhanan Yang Maha Esa), (Kemanusiaan Yang Adil dan Beradab), (Persatuan Indonesia) dan (Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam Permusyawaratan\/Perwakilan), serta dengan mewujudkan suatu (Keadilan sosial bagi seluruh rakyat Indonesia)\.$/.exec(
    fourth,
  );
if (!m) throw new Error(`The fourth paragraph of the preamble does not read as expected: ${fourth}`);

const data = {
  source: {
    title: 'Undang-Undang Dasar Negara Republik Indonesia Tahun 1945 Dalam Satu Naskah',
    publisher: 'Sekretariat Jenderal Majelis Permusyawaratan Rakyat',
    fileDate: '2007-01-12',
    note: 'amendments: 1 = Perubahan Pertama, 2 = Kedua, 3 = Ketiga, 4 = Keempat. Tanpa tanda: rumusan asli.',
  },
  pembukaan,
  pancasila: m.slice(1, 6),
  babs,
};
writeFileSync(output, `${JSON.stringify(data, null, 1)}\n`);
const pasalCount = babs.reduce((n, b) => n + b.pasal.length, 0);
const ayatCount = babs.reduce((n, b) => n + b.pasal.reduce((k, p) => k + Math.max(1, p.ayat.length), 0), 0);
console.log(`${pembukaan.length} alinea, ${babs.length} bab/aturan, ${pasalCount} pasal, ${ayatCount} ayat atau pasal tanpa ayat → ${output}`);
