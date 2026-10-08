import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { db, getSetQuestions, useSettings } from '../db';
import { SUBTEST_NAMES } from '../domain/blueprint';
import { SUBTESTS } from '../domain/types';
import type { Question } from '../domain/types';
import { KeyLine, QuestionCard } from '../components/QuestionCard';
import { PACK_TITLES, type PackKind } from '../lib/exportDocx';

export default function PrintView() {
  const { setId = '' } = useParams();
  const [params] = useSearchParams();
  const pack = (params.get('pack') as PackKind) || 'soal';
  const settings = useSettings();
  const data = useLiveQuery(async () => {
    const set = await db.sets.get(setId);
    return set ? { set, questions: await getSetQuestions(set) } : null;
  }, [setId]);

  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (wasDark) document.documentElement.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    if (data) {
      document.title = `${PACK_TITLES[pack]} - ${data.set.name}`;
      const t = setTimeout(() => window.print(), 600);
      return () => clearTimeout(t);
    }
  }, [data, pack]);

  if (!data) return null;
  const { set, questions } = data;
  const numbered = questions.map((q, i) => ({ q, i }));
  const groups = SUBTESTS.map((s) => ({ s, items: numbered.filter((x) => x.q.subtest === s) })).filter((g) => g.items.length);

  const soal = (withKey: boolean) =>
    groups.map((g) => (
      <section key={g.s}>
        <h2 className="mt-6 mb-2 border-b pb-1">
          {g.s} — {SUBTEST_NAMES[g.s]}
        </h2>
        <div className="space-y-3">
          {g.items.map(({ q, i }) => (
            <QuestionCard key={q.id} q={q} index={i} mode={withKey ? 'pembahasan' : 'soal'} showFlags={false} />
          ))}
        </div>
      </section>
    ));

  const kunci = (
    <section>
      <h2 className="mt-6 mb-2">Kunci Jawaban & Skor</h2>
      <p className="mb-2 text-xs">TWK & TIU: benar 5, salah/kosong 0. TKP: tiap opsi 1–5.</p>
      {groups.map((g) => (
        <div key={g.s} className="mb-4">
          <h3 className="mb-1">{g.s}</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {g.items.map(({ q, i }: { q: Question; i: number }) => (
              <div key={q.id} className="flex gap-2">
                <b>{i + 1}.</b> <KeyLine q={q} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl bg-white p-6 text-black">
      <div className="no-print mb-4 flex gap-2 rounded-lg bg-slate-100 p-3 text-sm">
        <span className="flex-1">Gunakan "Simpan sebagai PDF" di dialog cetak.</span>
        <button className="btn btn-sm" onClick={() => window.print()}>
          Cetak / PDF
        </button>
      </div>
      <header className="mb-4 border-b pb-3">
        {settings.brandLogo && <img src={settings.brandLogo} alt="" className="mb-2 h-12" />}
        {settings.brandName && <div className="font-bold">{settings.brandName}</div>}
        <h1>
          {PACK_TITLES[pack]}: {set.name}
        </h1>
        <div className="text-sm">
          Tanggal: {new Date().toLocaleDateString('id-ID', { dateStyle: 'long' })} · {questions.length} soal · {set.blueprint.durationMinutes} menit
        </div>
        {(pack === 'soal' || pack === 'lengkap') && <div className="mt-2 text-sm">Nama: ______________________________</div>}
      </header>
      {pack === 'soal' && soal(false)}
      {pack === 'kunci' && kunci}
      {pack === 'pembahasan' && soal(true)}
      {pack === 'lengkap' && (
        <>
          {soal(false)}
          <div className="print-break" />
          {kunci}
          <div className="print-break" />
          <h2 className="mt-6">Pembahasan</h2>
          {soal(true)}
        </>
      )}
      <footer className="mt-8 border-t pt-2 text-center text-[10px] text-slate-500">
        Materi latihan buatan AI, bukan produk resmi BKN. Periksa materi TWK ke sumber resmi; skor TKP adalah rasional, bukan kunci resmi.
      </footer>
    </div>
  );
}
