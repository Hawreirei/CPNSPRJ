import { NUMERIC_TOPICS } from './blueprint';
import { isGraded, isSkd, packageOf, specOf } from './examPackage';
import type { BatchItem, Difficulty, Question, Subtest } from './types';

export const SYSTEM_PROMPT = `Anda adalah penyusun soal latihan SKD CPNS (Seleksi Kompetensi Dasar) yang teliti.
Tulis soal ORISINAL dalam Bahasa Indonesia baku. Jangan menyalin soal resmi BKN atau soal bimbel.
Setiap soal memiliki tepat 5 opsi (A–E). Pembahasan ditulis langkah demi langkah dan jelas untuk belajar mandiri.
Gunakan notasi LaTeX di antara tanda $...$ hanya bila perlu (pecahan, pangkat, akar).
Untuk TWK dan TIU: sebelum menulis, kerjakan sendiri soalnya dan pastikan "answer", kesimpulan pembahasan, dan nilai opsi itu saling cocok. Akhiri pembahasan dengan kalimat "Jawaban: <huruf opsi>." (contoh: "Jawaban: C.").
Balas HANYA dengan JSON valid sesuai format yang diminta, tanpa teks lain.`;

const DIFF_GUIDE: Record<Difficulty, string> = {
  mudah: 'mudah (konsep dasar, satu langkah)',
  sedang: 'sedang (setara rata-rata soal SKD)',
  sulit: 'sulit (multi-langkah, pengecoh kuat, setara soal HOTS)',
};

/**
 * Sub-tests of an imported exam package: what the package file says, nothing more. The package's
 * own name and source are given so the model writes for that exam, not for SKD.
 */
function packageGuide(subtest: Subtest, topics: string[]): string {
  const spec = specOf(subtest);
  const pkg = packageOf(subtest);
  const r = spec.scoring;
  const what = spec.fromJobTitle
    ? `Soal menguji kompetensi teknis yang dibutuhkan untuk jabatan ${topics.map((t) => `"${t}"`).join(', ')}: pengetahuan, aturan, dan keterampilan kerja jabatan itu. Isi kolom "topic" dengan nama jabatan tersebut.
Jika Anda tidak yakin suatu aturan atau angka benar, isi "confidence": "low". Jangan mengarang nomor peraturan.`
    : `Topik: ${topics.map((t) => `"${t}"`).join(', ')}.`;
  const scoring =
    r.kind === 'keyed'
      ? 'Hanya satu opsi benar; pengecoh harus masuk akal.'
      : `Kelima opsi adalah tindakan atau jawaban yang masuk akal. Setiap opsi WAJIB punya "score" ${r.min} sampai ${r.max}; tepat satu opsi mendapat skor ${r.max}. Pembahasan menjelaskan alasan skor tiap opsi. Tidak perlu "answer".`;
  return `Sub-tes: ${subtest} (${spec.name}) untuk ${pkg.name}. Ini BUKAN soal SKD CPNS.${spec.guide ? `\nTujuan sub-tes: ${spec.guide}` : ''}
${what}
${scoring}`;
}

function subtestGuide(subtest: Subtest, topics: string[]): string {
  if (!isSkd(packageOf(subtest))) return packageGuide(subtest, topics);
  const list = topics.map((t) => `"${t}"`).join(', ');
  if (subtest === 'TWK') {
    return `Sub-tes: TWK (Tes Wawasan Kebangsaan). Topik: ${list}.
Variasikan jenis: ingatan konsep, studi kasus "nilai apa yang tercermin", dan dasar hukum.
Hanya satu opsi benar; pengecoh harus masuk akal.
WAJIB isi "reference" dengan rujukan spesifik (contoh: "Sila ke-3 Pancasila", "UUD 1945 Pasal 27 ayat (3)", "Sumpah Pemuda 28 Oktober 1928").
Jika Anda tidak yakin fakta atau nomor pasal benar, isi "confidence": "low". Jangan mengarang nomor pasal.`;
  }
  if (subtest === 'TIU') {
    const numeric = topics.filter((t) => NUMERIC_TOPICS.has(t));
    return `Sub-tes: TIU (Tes Intelegensia Umum). Topik: ${list}.
Hanya satu opsi benar.${
      numeric.length
        ? `
Untuk soal bertopik numerik (${numeric.join(', ')}): WAJIB isi "mathExpression", yaitu ekspresi matematika murni (sintaks mathjs, gunakan * dan /, titik sebagai desimal, tanpa pemisah ribuan, tanpa satuan, tanpa teks) yang hasilnya PERSIS nilai jawaban benar. Contoh: "(1200000 * 0.15) + 50000".
Teks opsi berisi angka (boleh dengan satuan atau "Rp"); hanya satu opsi yang bernilai sama dengan hasil ekspresi.
Untuk deret angka, ekspresi menghitung suku berikutnya, contoh: "48 * 2".`
        : ''
    }`;
  }
  return `Sub-tes: TKP (Tes Karakteristik Pribadi). Aspek: ${list}.
Tulis situasi kerja ASN yang realistis. Kelima opsi adalah tindakan yang masuk akal (hindari opsi yang jelas konyol).
Setiap opsi WAJIB punya "score" 1 sampai 5, dan kelima skor HARUS berbeda (tepat satu skor 5, satu 4, satu 3, satu 2, satu 1).
Skor mencerminkan nilai pelayanan publik, integritas, dan profesionalisme ASN. Acak posisi opsi terbaik.
Pembahasan menjelaskan alasan skor tiap opsi. Tidak perlu "answer".
Untuk soal berkesulitan sulit: buat DILEMA, yaitu dua atau lebih opsi yang sama-sama tampak baik (misalnya cepat tetapi melanggar prosedur, atau taat prosedur tetapi mengabaikan warga), sehingga pembeda skor 5 dan 4 halus tetapi bisa dijelaskan. Pada soal sulit, setiap opsi WAJIB punya "rationale": satu kalimat mengapa opsi itu mendapat skornya.`;
}

function formatSpec(subtest: Subtest): string {
  const base = `{
  "questions": [
    {
      "topic": "topik sesuai daftar",
      "stem": "teks soal",
      "options": [
        {"label": "A", "text": "..."${subtest === 'TKP' ? ', "score": 3, "rationale": "alasan skor (wajib untuk soal sulit)"' : isGraded(subtest) ? ', "score": 3' : ''}},
        ... total 5 opsi A-E
      ],${!isGraded(subtest) ? '\n      "answer": "C",' : ''}
      "explanation": "pembahasan langkah demi langkah",${subtest === 'TWK' ? '\n      "reference": "rujukan",' : ''}${
        subtest === 'TIU' ? '\n      "mathExpression": "hanya untuk soal numerik",' : ''
      }
      "confidence": "high"
    }
  ]
}`;
  return base;
}

export function buildPrompt(opts: {
  subtest: Subtest;
  items: BatchItem[];
  avoid?: string[];
  basedOn?: Question[];
  instruction?: string;
}): string {
  const topics = [...new Set(opts.items.map((i) => i.topic))];
  const parts = [
    subtestGuide(opts.subtest, topics),
    `Buat ${opts.items.length} soal yang berbeda satu sama lain, berurutan sesuai daftar ini:\n` +
      opts.items.map((it, i) => `${i + 1}. topik "${it.topic}", kesulitan ${DIFF_GUIDE[it.difficulty]}`).join('\n'),
  ];
  if (opts.basedOn?.length) {
    parts.push(
      `Setiap soal baru meniru gaya, topik, dan tingkat kesulitan soal contoh bernomor sama, tetapi dengan isi, angka, dan konteks berbeda:\n` +
        opts.basedOn.map((q, i) => `${i + 1}. ${q.stem}`).join('\n'),
    );
  }
  if (opts.instruction) parts.push(`Instruksi tambahan dari pengguna: ${opts.instruction}`);
  if (opts.avoid?.length) {
    parts.push(`Jangan mengulang soal yang mirip dengan ini:\n- ${opts.avoid.slice(0, 15).map((s) => s.slice(0, 120)).join('\n- ')}`);
  }
  parts.push(`Format JSON:\n${formatSpec(opts.subtest)}`);
  return parts.join('\n\n');
}

/**
 * Reading passages, each with several questions about it. The lines "Wacana N: K soal" say how many
 * questions each passage needs; a reply with other counts is rejected as a whole.
 */
export function buildPassagePrompt(opts: { items: BatchItem[]; sizes: number[]; avoid?: string[] }): string {
  let k = 0;
  const plan = opts.sizes
    .map((n, i) => {
      const level = opts.items[k].difficulty;
      k += n;
      return `Wacana ${i + 1}: ${n} soal, kesulitan ${DIFF_GUIDE[level]}`;
    })
    .join('\n');
  const parts = [
    `Sub-tes: TIU (Tes Intelegensia Umum). Topik: "Pemahaman Bacaan".
Tulis wacana ORISINAL berbahasa Indonesia baku, 150 sampai 250 kata, bertema pelayanan publik, kebijakan, lingkungan, ekonomi, atau sosial budaya. Jangan menyalin teks yang sudah ada.
Setiap soal harus bisa dijawab HANYA dari isi wacananya: gagasan utama, informasi tersurat, simpulan, makna kata dalam konteks, atau sikap penulis. Hanya satu opsi benar.
Variasikan jenis pertanyaan di dalam satu wacana. Akhiri pembahasan dengan kalimat "Jawaban: <huruf opsi>.".`,
    `Buat ${opts.sizes.length} wacana berbeda, berurutan sesuai daftar ini, masing-masing dengan TEPAT jumlah soal yang diminta:\n${plan}`,
  ];
  if (opts.avoid?.length) parts.push(`Jangan mengulang wacana atau soal yang mirip dengan ini:\n- ${opts.avoid.slice(0, 10).map((s) => s.slice(0, 120)).join('\n- ')}`);
  parts.push(`Format JSON:
{
  "passages": [
    {
      "title": "judul singkat wacana",
      "text": "isi wacana",
      "questions": [
        {
          "stem": "pertanyaan tentang wacana",
          "options": [{"label": "A", "text": "..."}, ... total 5 opsi A-E],
          "answer": "C",
          "explanation": "pembahasan yang menunjuk kalimat pendukung di wacana",
          "confidence": "high"
        }
      ]
    }
  ]
}`);
  return parts.join('\n\n');
}

/** The reading passage a question belongs to, as prompt text; empty for standalone questions. */
const passageBlock = (q: Pick<Question, 'passage'>) =>
  q.passage ? `Soal ini menyertai wacana berikut (wacananya tidak diubah dan tidak perlu ditulis ulang):\n"${q.passage.text}"\n\n` : '';

export function buildRewritePrompt(q: Question, instruction: string): string {
  return `${subtestGuide(q.subtest, [q.topic])}

${passageBlock(q)}Tulis ulang soal berikut. Pertahankan topik dan tingkat kesulitan (${q.difficulty}).
Instruksi: ${instruction || 'perbaiki kejelasan dan kualitas pengecoh'}.

Soal asli:
${JSON.stringify({ stem: q.stem, options: q.options.map(({ label, text, score }) => ({ label, text, score })), answer: q.answer, explanation: q.explanation, reference: q.reference })}

Kembalikan tepat 1 soal dalam format JSON:
${formatSpec(q.subtest)}`;
}

/** Ask the model to fix questions whose key, explanation and calculation disagree. */
export function buildRepairPrompt(subtest: Subtest, questions: Question[]): string {
  const list = questions
    .map((q, i) => {
      const problems = q.flags.filter((f) => f.severity === 'warn').map((f) => f.message);
      const data = { stem: q.stem, options: q.options.map(({ label, text }) => ({ label, text })), answer: q.answer, explanation: q.explanation, reference: q.reference, mathExpression: q.mathExpression };
      return `${i + 1}. Masalah: ${problems.join(' ')}\n${passageBlock(q)}${JSON.stringify(data)}`;
    })
    .join('\n\n');
  return `${subtestGuide(subtest, [...new Set(questions.map((q) => q.topic))])}

Soal-soal berikut bermasalah: kunci jawaban, pembahasan, dan hitungannya tidak saling cocok.
Perbaiki setiap soal: kerjakan ulang dengan teliti, pastikan tepat satu opsi benar, "answer" menunjuk opsi itu, dan pembahasan menyimpulkan opsi dan nilai yang sama${
    subtest === 'TIU' ? '; untuk soal hitungan, "mathExpression" (sintaks mathjs, titik sebagai desimal) harus menghasilkan nilai opsi benar' : ''
  }.
Boleh mengubah angka pada soal atau opsi bila perlu. Pertahankan topik dan tingkat kesulitan. Kembalikan ${questions.length} soal dengan urutan yang sama.

${list}

Format JSON:
${formatSpec(subtest)}`;
}

export const CHECK_SYSTEM_PROMPT = `Anda penguji soal latihan SKD CPNS yang teliti dan independen.
Kerjakan setiap soal sendiri dari awal. Kunci jawaban tidak diberikan; jangan menebak berdasarkan pola.
Balas HANYA dengan JSON valid sesuai format yang diminta, tanpa teks lain.`;

/** Questions for a second model to answer blind: stems and options only, no key, no explanation, no TKP scores. */
export function buildCrossCheckPrompt(subtest: Subtest, questions: Pick<Question, 'stem' | 'options' | 'passage'>[]): string {
  const task =
    subtest === 'TKP'
      ? 'Untuk setiap soal TKP (situasi kerja ASN), pilih SATU tindakan yang paling tepat menurut nilai pelayanan publik, integritas, dan profesionalisme ASN.'
      : isGraded(subtest)
        ? `Untuk setiap soal ${subtest} (${specOf(subtest).name}), pilih SATU opsi yang paling tepat.`
        : `Untuk setiap soal ${subtest}, pilih SATU opsi yang benar.`;
  const list = questions
    // A reading question can only be answered with its passage, given inline on the question's line.
    .map((q, i) => `${i + 1}. ${q.passage ? `[Bacaan: ${q.passage.text.replace(/\s*\n\s*/g, ' ')}] ` : ''}${q.stem.replace(/\s*\n\s*/g, ' ')}\n${q.options.map((o) => `${o.label}. ${o.figure ? '[gambar]' : o.text}`).join('\n')}`)
    .join('\n\n');
  return `${task}
Beri alasan singkat (satu kalimat) untuk setiap jawaban.

${list}

Format JSON:
{"answers": [{"no": 1, "answer": "C", "reason": "alasan singkat"}, ...]} untuk semua ${questions.length} soal.`;
}
