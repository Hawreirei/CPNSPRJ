import { getSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { QSet, Question } from '../domain/types';
import { toPlain } from '../components/RichText';
import { cellSvg, figureSvg, svgToPng } from './figureSvg';

export type PackKind = 'soal' | 'kunci' | 'pembahasan' | 'lengkap';

export const PACK_TITLES: Record<PackKind, string> = {
  soal: 'Set Soal',
  kunci: 'Kunci Jawaban & Skor',
  pembahasan: 'Pembahasan',
  lengkap: 'Set Soal, Kunci & Pembahasan',
};

export function keyText(q: Question): string {
  return q.subtest === 'TKP' ? q.options.map((o) => `${o.label}=${o.score}`).join('  ') : (q.answer ?? '-');
}

export async function exportDocx(set: QSet, questions: Question[], pack: PackKind): Promise<Blob> {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType, Footer, PageBreak } = d;
  const settings = await getSettings();
  type Child = InstanceType<typeof Paragraph>;

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
    out.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: `${title}: ${set.name}` })] }));
    out.push(
      new Paragraph({
        children: [new TextRun({ text: `Tanggal: ${new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })}    Jumlah soal: ${questions.length}`, size: 20 })],
      }),
    );
    if (pack === 'soal' || pack === 'lengkap') {
      out.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: 'Nama: ______________________    Waktu: ' + set.blueprint.durationMinutes + ' menit', size: 20 })] }));
    }
    return out;
  }

  async function questionBlock(q: Question, n: number, withKey: boolean): Promise<Child[]> {
    const out: Child[] = [];
    out.push(new Paragraph({ spacing: { before: 200 }, keepNext: true, children: [new TextRun({ text: `${n}. `, bold: true }), ...text(q.stem)] }));
    if (q.figure) out.push(new Paragraph({ keepNext: true, children: [await image(figureSvg(q.figure, 72, '#111'))] }));
    for (const o of q.options) {
      const runs = o.figure ? [await image(cellSvg(o.figure, 56, '#111'))] : text(o.text);
      const suffix = withKey && q.subtest === 'TKP' ? [new TextRun({ text: `  (skor ${o.score})`, italics: true, color: '555555' })] : [];
      const isKey = withKey && q.subtest !== 'TKP' && o.label === q.answer;
      out.push(new Paragraph({ indent: { left: 360 }, keepNext: true, children: [new TextRun({ text: `${o.label}. `, bold: isKey }), ...runs, ...suffix] }));
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
        if (q.subtest !== 'TKP') out.push(new Paragraph({ children: [new TextRun({ text: `Jawaban: ${q.answer ?? '-'}`, bold: true })] }));
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
    title: `${PACK_TITLES[pack]} - ${set.name}`,
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
