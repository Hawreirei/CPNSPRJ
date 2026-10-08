import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { getSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { fmtNum } from '../domain/dataAnalysis';
import type { DataFigure, Question } from '../domain/types';
import { toPlain } from '../components/RichText';
import { dataChartSvg } from './dataSvg';
import { opensGroup, passageLabel } from '../domain/groups';
import { cellSvg, figureSvg, hasStemFigure, svgToPng } from './figureSvg';
import { hasStudentHeader, keyText, PACK_TITLES, type ExportMeta, type PackKind } from './exportDocx';

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Build a real PDF file (selectable text, figures as images) for download. */
export async function exportPdf(meta: ExportMeta, questions: Question[], pack: PackKind): Promise<Blob> {
  // Loaded on demand so the PDF engine and its fonts don't slow the app start.
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;
  const vfs = (await import('pdfmake/build/vfs_fonts')).default;
  pdfMake.addVirtualFileSystem(vfs);
  const settings = await getSettings();

  const pngCache = new Map<string, { image: string; width: number }>();
  async function image(svg: string, scale = 0.75): Promise<Content> {
    let img = pngCache.get(svg);
    if (!img) {
      const png = await svgToPng(svg);
      img = { image: `data:image/png;base64,${toBase64(png.data)}`, width: png.width * scale };
      pngCache.set(svg, img);
    }
    return { image: img.image, width: img.width, margin: [0, 2, 0, 2] };
  }

  const numbered = questions.map((q, i) => ({ q, n: i + 1 }));
  const groups = SUBTESTS.map((s) => ({ s, items: numbered.filter((x) => x.q.subtest === s) })).filter((g) => g.items.length);
  const heading = (s: string): Content => ({ text: `${s} — ${SUBTEST_NAMES[s as keyof typeof SUBTEST_NAMES]}`, style: 'h2', margin: [0, 12, 0, 6] });

  /** A data question's numbers: a real table, or the chart as an image under its title. */
  async function dataBlock(data: DataFigure): Promise<Content> {
    const title: Content = { text: data.title, bold: true, fontSize: 9, margin: [0, 2, 0, 2] };
    if (data.kind !== 'table') return { stack: [title, await image(dataChartSvg(data, '#111', '#fff'), 0.7)] };
    const head = [{ text: data.category, bold: true }, ...data.series.map((s) => ({ text: s.name, bold: true, alignment: 'right' as const }))];
    const rows = data.labels.map((l, i) => [{ text: l }, ...data.series.map((s) => ({ text: fmtNum(s.values[i]), alignment: 'right' as const }))]);
    return { stack: [title, { table: { headerRows: 1, body: [head, ...rows] }, layout: 'lightHorizontalLines', fontSize: 9, margin: [0, 0, 0, 4] }] };
  }

  async function questionBlock(q: Question, n: number, withKey: boolean): Promise<Content> {
    const parts: Content[] = [];
    // A reading passage is printed once, above the first question of its group.
    if (q.passage && opensGroup(questions, q)) {
      parts.push({ text: `${passageLabel(questions, q)}${q.passage.title ? `: ${q.passage.title}` : ''}`, bold: true, margin: [0, 10, 0, 2] });
      parts.push({ text: toPlain(q.passage.text), margin: [0, 0, 0, 4], alignment: 'justify' });
    }
    parts.push({ text: [{ text: `${n}. `, bold: true }, toPlain(q.stem)], margin: [0, 8, 0, 4] });
    if (hasStemFigure(q.figure)) parts.push(await image(figureSvg(q.figure, 72, '#111')));
    if (q.data) parts.push(await dataBlock(q.data));
    for (const o of q.options) {
      const isKey = withKey && (q.subtest === 'TKP' ? o.score === 5 : o.label === q.answer);
      const option: Content = o.figure ? await image(cellSvg(o.figure, 56, '#111')) : { text: toPlain(o.text), bold: isKey };
      const body: Content = withKey && o.rationale ? { stack: [option, { text: o.rationale, italics: true, fontSize: 9, color: '#444444' }] } : option;
      const score = withKey && q.subtest === 'TKP' ? { text: `(skor ${o.score})`, italics: true, color: '#555555', width: 'auto' as const } : null;
      parts.push({ columns: [{ text: `${o.label}.`, width: 18, bold: isKey }, { stack: [body], width: '*' }, ...(score ? [score] : [])], columnGap: 4, margin: [14, 1, 0, 1] });
    }
    if (withKey) {
      if (q.subtest !== 'TKP') parts.push({ text: `Jawaban: ${q.answer ?? '-'}`, bold: true, margin: [0, 4, 0, 0] });
      parts.push({ text: [{ text: 'Pembahasan: ', bold: true }, toPlain(q.explanation || '-')], margin: [0, 2, 0, 0] });
      if (q.reference) parts.push({ text: `Rujukan: ${toPlain(q.reference)}`, italics: true, color: '#444444' });
    }
    return { stack: parts, unbreakable: !withKey };
  }

  async function soalSection(withKey: boolean): Promise<Content[]> {
    const out: Content[] = [];
    for (const g of groups) {
      out.push(heading(g.s));
      for (const { q, n } of g.items) out.push(await questionBlock(q, n, withKey));
    }
    return out;
  }

  function kunciSection(): Content[] {
    const out: Content[] = [
      { text: 'Kunci Jawaban & Skor', style: 'h1' },
      { text: 'TWK & TIU: jawaban benar bernilai 5, salah atau kosong 0. TKP: setiap opsi bernilai 1–5.', italics: true, fontSize: 9, margin: [0, 0, 0, 6] },
    ];
    for (const g of groups) {
      out.push(heading(g.s));
      out.push({
        columns: [0, 1, 2].map((c) => ({
          stack: g.items.filter((_, i) => i % 3 === c).map(({ q, n }) => ({ text: [{ text: `${n}. `, bold: true }, keyText(q)], margin: [0, 1, 0, 1] })),
        })),
        columnGap: 12,
      });
    }
    return out;
  }

  const head: Content[] = [];
  if (settings.brandLogo) head.push({ image: settings.brandLogo, fit: [160, 48], margin: [0, 0, 0, 4] });
  if (settings.brandName) head.push({ text: settings.brandName, bold: true, fontSize: 13 });
  head.push({ text: `${PACK_TITLES[pack]}: ${meta.name}`, style: 'title' });
  head.push({ text: `Tanggal: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}    Jumlah soal: ${questions.length}`, fontSize: 10 });
  if (hasStudentHeader(pack)) {
    head.push({ text: `Nama: ______________________${meta.durationMinutes ? `    Waktu: ${meta.durationMinutes} menit` : ''}`, fontSize: 10, margin: [0, 6, 0, 0] });
  }
  head.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: '#999999' }], margin: [0, 4, 0, 4] });

  let body: Content[] = [];
  const pageBreak: Content = { text: '', pageBreak: 'after' };
  if (pack === 'soal') body = await soalSection(false);
  if (pack === 'kunci') body = kunciSection();
  if (pack === 'pembahasan') body = [{ text: 'Pembahasan', style: 'h1' }, ...(await soalSection(true))];
  if (pack === 'soal-kunci') body = [...(await soalSection(false)), pageBreak, ...kunciSection()];
  if (pack === 'lengkap') {
    body = [...(await soalSection(false)), pageBreak, ...kunciSection(), pageBreak, { text: 'Pembahasan', style: 'h1' }, ...(await soalSection(true))];
  }

  const doc: TDocumentDefinitions = {
    info: { title: `${PACK_TITLES[pack]} - ${meta.name}`, creator: settings.brandName || 'CPNS SKD Set Builder' },
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    defaultStyle: { fontSize: 10.5, lineHeight: 1.2 },
    styles: {
      title: { fontSize: 16, bold: true, margin: [0, 2, 0, 2] },
      h1: { fontSize: 14, bold: true, margin: [0, 0, 0, 4] },
      h2: { fontSize: 12, bold: true },
    },
    footer: (page, pages) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: 'Latihan buatan AI, bukan produk resmi BKN. Periksa materi TWK ke sumber resmi.', fontSize: 7, color: '#777777' },
        { text: `${page} / ${pages}`, alignment: 'right', fontSize: 8, color: '#777777', width: 40 },
      ],
    }),
    content: [...head, ...body],
  };
  return pdfMake.createPdf(doc).getBlob();
}
