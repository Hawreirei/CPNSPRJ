import { getSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import { fmtNum } from '../domain/describe';
import type { DataFigure, Question } from '../domain/types';
import { toPlain } from '../components/RichText';
import { dataChartSvg } from './dataSvg';
import { opensGroup, passageLabel } from '../domain/groups';
import { cellSvg, figureSvg, hasStemFigure, svgToPng } from './figureSvg';
import { isGraded } from '../domain/examPackage';

export type PackKind = 'soal' | 'soal-kunci' | 'lengkap' | 'kunci' | 'pembahasan';

export const PACK_TITLES: Record<PackKind, string> = {
  soal: 'Soal',
  'soal-kunci': 'Soal & Kunci Jawaban',
  lengkap: 'Soal, Kunci & Pembahasan',
  kunci: 'Kunci Jawaban & Skor',
  pembahasan: 'Pembahasan',
};

/** What the document is about: a saved set, or questions picked from the bank. */
export interface ExportMeta {
  name: string;
  durationMinutes?: number;
}

/** Packs that print the answer sheet header ("Nama: ____"). */
export const hasStudentHeader = (p: PackKind) => p === 'soal' || p === 'soal-kunci' || p === 'lengkap';

export function keyText(q: Question): string {
  return isGraded(q.subtest) ? q.options.map((o) => `${o.label}=${o.score}`).join('  ') : (q.answer ?? '-');
}

export async function exportDocx(meta: ExportMeta, questions: Question[], pack: PackKind): Promise<Blob> {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Footer, PageBreak, Table, TableRow, TableCell } = d;
  const settings = await getSettings();
  type Child = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;

  const text = (s: string, opts: { bold?: boolean; size?: number; italics?: boolean; color?: string } = {}) =>
    toPlain(s)
      .split('\n')
      .map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0, ...opts }));

  const pngCache = new Map<string, Awaited<ReturnType<typeof svgToPng>>>();
  async function image(svg: string) {
    let png = pngCache.get(svg);
    if (!png) {
      png = await svgToPng(svg);
      pngCache.set(svg, png);
    }
    return new ImageRun({ type: 'png', data: png.data, transformation: { width: png.width * 0.75, height: png.height * 0.75 } });
  }

  async function header(title: string): Promise<Child[]> {
    const out: Child[] = [];
    if (settings.brandLogo) {
      const type = settings.brandLogo.startsWith('data:image/jpeg') ? 'jpg' : 'png';
      const img = new Image();
      img.src = settings.brandLogo;
      await img.decode().catch(() => undefined);
      const h = 48;
      const w = img.naturalHeight ? (img.naturalWidth / img.naturalHeight) * h : 48;
      out.push(new Paragraph({ children: [new ImageRun({ type, data: settings.brandLogo, transformation: { width: w, height: h } })] }));
    }
    if (settings.brandName) out.push(new Paragraph({ children: [new TextRun({ text: settings.brandName, bold: true, size: 26 })] }));
    out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${title}: ${meta.name}` })] }));
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `Tanggal: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}    Jumlah soal: ${questions.length}`, size: 20 })],
      }),
    );
    if (hasStudentHeader(pack)) {
      const waktu = meta.durationMinutes ? `    Waktu: ${meta.durationMinutes} menit` : '';
      out.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: `Nama: ______________________${waktu}`, size: 20 })] }));
    }
    return out;
  }

  /** A data question's numbers: a real table, or the chart as an image under its title. */
  async function dataBlock(data: DataFigure): Promise<Child[]> {
    const title = new Paragraph({ keepNext: true, spacing: { before: 80 }, children: [new TextRun({ text: data.title, bold: true, size: 20 })] });
    if (data.kind !== 'table') return [title, new Paragraph({ keepNext: true, children: [await image(dataChartSvg(data, '#111', '#fff'))] })];
    const cell = (text: string, opts: { bold?: boolean; right?: boolean } = {}) =>
      new TableCell({ children: [new Paragraph({ alignment: opts.right ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text, bold: opts.bold, size: 20 })] })] });
    const rows = [
      new TableRow({ tableHeader: true, children: [cell(data.category, { bold: true }), ...data.series.map((s) => cell(s.name, { bold: true, right: true }))] }),
      ...data.labels.map((l, i) => new TableRow({ children: [cell(l), ...data.series.map((s) => cell(fmtNum(s.values[i]), { right: true }))] })),
    ];
    return [title, new Table({ rows })];
  }

  async function questionBlock(q: Question, n: number, withKey: boolean): Promise<Child[]> {
    const out: Child[] = [];
    // A reading passage is printed once, above the first question of its group.
    if (q.passage && opensGroup(questions, q)) {
      out.push(new Paragraph({ spacing: { before: 240 }, keepNext: true, children: [new TextRun({ text: `${passageLabel(questions, q)}${q.passage.title ? `: ${q.passage.title}` : ''}`, bold: true })] }));
      out.push(new Paragraph({ keepNext: true, alignment: AlignmentType.JUSTIFIED, children: text(q.passage.text) }));
    }
    out.push(new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: `${n}. `, bold: true }), ...text(q.stem)] }));
    if (hasStemFigure(q.figure)) out.push(new Paragraph({ keepNext: true, children: [await image(figureSvg(q.figure, 72, '#111'))] }));
    if (q.data) out.push(...(await dataBlock(q.data)));
    for (const o of q.options) {
      const runs = o.figure ? [await image(cellSvg(o.figure, 56, '#111'))] : text(o.text);
      const suffix = withKey && isGraded(q.subtest) ? [new TextRun({ text: `  (skor ${o.score})`, italics: true, color: '555555' })] : [];
      const isKey = withKey && !isGraded(q.subtest) && o.label === q.answer;
      out.push(new Paragraph({ indent: { left: 360 }, keepNext: true, children: [new TextRun({ text: `${o.label}. `, bold: isKey }), ...runs, ...suffix] }));
      if (withKey && o.rationale) out.push(new Paragraph({ indent: { left: 720 }, keepNext: true, children: text(o.rationale, { italics: true, size: 18, color: '444444' }) }));
    }
    return out;
  }

  function subtestHeading(s: string) {
    return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 300 }, children: [new TextRun({ text: `${s} — ${SUBTEST_NAMES[s as keyof typeof SUBTEST_NAMES]}` })] });
  }

  const numbered = questions.map((q, i) => ({ q, n: i + 1 }));
  const groups = SUBTESTS.map((s) => ({ s, items: numbered.filter((x) => x.q.subtest === s) })).filter((g) => g.items.length);

  async function soalSection(): Promise<Child[]> {
    const out: Child[] = [];
    for (const g of groups) {
      out.push(subtestHeading(g.s));
      for (const { q, n } of g.items) out.push(...(await questionBlock(q, n, false)));
    }
    return out;
  }

  function kunciSection(): Child[] {
    const out: Child[] = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Kunci Jawaban & Skor' })] })];
    out.push(new Paragraph({ children: text('TWK & TIU: jawaban benar bernilai 5, salah atau kosong 0. TKP: setiap opsi bernilai 1–5.', { size: 18, italics: true }) }));
    for (const g of groups) {
      out.push(subtestHeading(g.s));
      for (const { q, n } of g.items) out.push(new Paragraph({ children: [new TextRun({ text: `${n}. `, bold: true }), new TextRun({ text: keyText(q) })] }));
    }
    return out;
  }

  async function pembahasanSection(): Promise<Child[]> {
    const out: Child[] = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: 'Pembahasan' })] })];
    for (const g of groups) {
      out.push(subtestHeading(g.s));
      for (const { q, n } of g.items) {
        out.push(...(await questionBlock(q, n, true)));
        if (!isGraded(q.subtest)) out.push(new Paragraph({ children: [new TextRun({ text: `Jawaban: ${q.answer ?? '-'}`, bold: true })] }));
        out.push(new Paragraph({ children: [new TextRun({ text: 'Pembahasan: ', bold: true }), ...text(q.explanation || '-')] }));
        if (q.reference) out.push(new Paragraph({ children: [new TextRun({ text: 'Rujukan: ', italics: true }), ...text(q.reference, { italics: true })] }));
      }
    }
    return out;
  }

  let body: Child[] = [];
  if (pack === 'soal') body = await soalSection();
  if (pack === 'kunci') body = kunciSection();
  if (pack === 'pembahasan') body = await pembahasanSection();
  if (pack === 'soal-kunci') body = [...(await soalSection()), new Paragraph({ children: [new PageBreak()] }), ...kunciSection()];
  if (pack === 'lengkap') {
    body = [
      ...(await soalSection()),
      new Paragraph({ children: [new PageBreak()] }),
      ...kunciSection(),
      new Paragraph({ children: [new PageBreak()] }),
      ...(await pembahasanSection()),
    ];
  }

  const doc = new Document({
    creator: settings.brandName || 'CPNS SKD Set Builder',
    title: `${PACK_TITLES[pack]} - ${meta.name}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'Materi latihan buatan AI, bukan produk resmi BKN. Periksa materi TWK ke sumber resmi; skor TKP adalah rasional, bukan kunci resmi.', size: 14, color: '777777' })],
              }),
            ],
          }),
        },
        children: [...(await header(PACK_TITLES[pack])), ...body],
      },
    ],
  });
  return Packer.toBlob(doc);
}
