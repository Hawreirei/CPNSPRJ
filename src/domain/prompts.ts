import { NUMERIC_TOPICS } from './blueprint';
import type { BatchItem, Difficulty, Question, Subtest } from './types';

export const SYSTEM_PROMPT = `Anda adalah penyusun soal latihan SKD CPNS (Seleksi Kompetensi Dasar) yang teliti.
Tulis soal ORISINAL dalam Bahasa Indonesia baku. Jangan menyalin soal resmi BKN atau soal bimbel.
Setiap soal memiliki tepat 5 opsi (A–E). Pembahasan ditulis langkah demi langkah dan jelas untuk belajar mandiri.
Gunakan notasi LaTeX di antara tanda $...$ hanya bila perlu (pecahan, pangkat, akar).
Balas HANYA dengan JSON valid sesuai format yang diminta, tanpa teks lain.`;

const DIFF_GUIDE: Record<Difficulty, string> = {
  mudah: 'mudah (konsep dasar, satu langkah)',
  sedang: 'sedang (setara rata-rata soal SKD)',
  sulit: 'sulit (multi-langkah, pengecoh kuat, setara soal HOTS)',
};

function subtestGuide(subtest: Subtest, topics: string[]): string {
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
Untuk soal bertopik numerik (${numeric.join(', ')}): WAJIB isi "mathExpression", yaitu ekspresi matematika murni (sintaks mathjs, gunakan * dan /, tanpa satuan, tanpa teks) yang hasilnya PERSIS nilai jawaban benar. Contoh: "(1200000 * 0.15) + 50000".
Teks opsi berisi angka (boleh dengan satuan atau "Rp"); hanya satu opsi yang bernilai sama dengan hasil ekspresi.
Untuk deret angka, ekspresi menghitung suku berikutnya, contoh: "48 * 2".`
        : ''
    }`;
  }
  return `Sub-tes: TKP (Tes Karakteristik Pribadi). Aspek: ${list}.
Tulis situasi kerja ASN yang realistis. Kelima opsi adalah tindakan yang masuk akal (hindari opsi yang jelas konyol).
Setiap opsi WAJIB punya "score" 1 sampai 5, dan kelima skor HARUS berbeda (tepat satu skor 5, satu 4, satu 3, satu 2, satu 1).
Skor mencerminkan nilai pelayanan publik, integritas, dan profesionalisme ASN. Acak posisi opsi terbaik.
Pembahasan menjelaskan alasan skor tiap opsi. Tidak perlu "answer".`;
}

function formatSpec(subtest: Subtest): string {
  const base = `{
  "questions": [
    {
      "topic": "topik sesuai daftar",
      "stem": "teks soal",
      "options": [
        {"label": "A", "text": "..."${subtest === 'TKP' ? ', "score": 3' : ''}},
        ... total 5 opsi A-E
      ],${subtest !== 'TKP' ? '\n      "answer": "C",' : ''}
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

export function buildRewritePrompt(q: Question, instruction: string): string {
  return `${subtestGuide(q.subtest, [q.topic])}

Tulis ulang soal berikut. Pertahankan topik dan tingkat kesulitan (${q.difficulty}).
Instruksi: ${instruction || 'perbaiki kejelasan dan kualitas pengecoh'}.

Soal asli:
${JSON.stringify({ stem: q.stem, options: q.options.map(({ label, text, score }) => ({ label, text, score })), answer: q.answer, explanation: q.explanation, reference: q.reference })}

Kembalikan tepat 1 soal dalam format JSON:
${formatSpec(q.subtest)}`;
}
