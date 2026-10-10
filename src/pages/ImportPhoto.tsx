import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSettings } from '../db';
import { topicsFor } from '../domain/blueprint';
import { packages } from '../domain/examPackage';
import { COPYRIGHT_NOTICE, MAX_IMAGE_SIDE, moveToSubtest, NEEDS_IMAGE_NOTE, type ImportDraft, type PageResult } from '../domain/photoImport';
import type { Question, Subtest } from '../domain/types';
import { extractPage, importTarget, pageEstimate, saveImported, type PageEstimate } from '../engine/photoImport';
import { errorText } from '../engine/storage';
import { fromCanvas, fromImageFile, type PreparedPage } from '../lib/pageImage';
import type { PdfPages } from '../lib/pdfPages';
import { QuestionCard } from '../components/QuestionCard';
import { QuestionEditor } from '../components/QuestionEditor';
import { PictureCutter } from '../components/PictureCutter';
import { fmtUsd } from '../lib/format';

interface Source {
  name: string;
  pdf?: PdfPages;
  /** 1-based page of a PDF. */
  pageNo: number;
}

interface Group extends PageResult {
  id: number;
  label: string;
  url: string;
}

let groupSerial = 0;

/** Copy questions from a photo or PDF page with a multimodal model; nothing is saved until the learner has reviewed them (#38). */
export default function ImportPhoto() {
  const nav = useNavigate();
  const settings = useSettings();
  const all = packages();
  const [pkgId, setPkgId] = useState(all[0].id);
  const pkg = all.find((p) => p.id === pkgId) ?? all[0];
  const [subtest, setSubtest] = useState<Subtest | ''>('');
  const [own, setOwn] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [page, setPage] = useState<PreparedPage | null>(null);
  const [estimate, setEstimate] = useState<PageEstimate | null | undefined>(undefined);
  const [busy, setBusy] = useState<AbortController | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [editing, setEditing] = useState<{ group: number; index: number } | null>(null);
  // Every page image lives only as long as this screen; none is stored.
  const urls = useRef(new Set<string>());
  const pdfRef = useRef<PdfPages | undefined>(undefined);
  const busyRef = useRef<AbortController | null>(null);

  // Leaving the page stops a request in flight and lets go of every page image and the PDF.
  useEffect(() => {
    const created = urls.current;
    return () => {
      busyRef.current?.abort();
      created.forEach((u) => URL.revokeObjectURL(u));
      void pdfRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (!page) return;
    let live = true;
    void (async () => {
      const est = await pageEstimate(await importTarget(pkg, subtest || undefined), page);
      if (live) setEstimate(est);
    })();
    return () => {
      live = false;
    };
  }, [page, pkg, subtest]);

  const keep = (p: PreparedPage) => {
    urls.current.add(p.url);
    return p;
  };

  async function pick(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    setPage(null);
    setLoading(true);
    void pdfRef.current?.close();
    pdfRef.current = undefined;
    try {
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const { openPdf } = await import('../lib/pdfPages');
        const pdf = await openPdf(file, MAX_IMAGE_SIDE, fromCanvas);
        pdfRef.current = pdf;
        setSource({ name: file.name, pdf, pageNo: 1 });
        setPage(keep(await pdf.render(1)));
      } else {
        setSource({ name: file.name, pageNo: 1 });
        setPage(keep(await fromImageFile(file)));
      }
    } catch (e) {
      setSource(null);
      setMsg({ text: errorText(e), error: true });
    } finally {
      setLoading(false);
    }
  }

  async function goToPage(n: number) {
    if (!source?.pdf || n < 1 || n > source.pdf.count) return;
    setLoading(true);
    setMsg(null);
    try {
      setPage(keep(await source.pdf.render(n)));
      setSource({ ...source, pageNo: n });
    } catch (e) {
      setMsg({ text: errorText(e), error: true });
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    if (!page || !source) return;
    const ctrl = new AbortController();
    busyRef.current = ctrl;
    setBusy(ctrl);
    setMsg(null);
    const label = source.pdf ? `${source.name}, halaman ${source.pageNo}` : source.name;
    try {
      const r = await extractPage(await importTarget(pkg, subtest || undefined), page, ctrl.signal);
      if (r.drafts.length || r.skipped.length) setGroups((g) => [...g, { ...r, id: ++groupSerial, label, url: page.url }]);
      setMsg({
        text:
          !r.drafts.length && !r.skipped.length
            ? `Tidak ada soal ditemukan di ${label}.`
            : `${label}: ${r.drafts.length} soal disalin${r.skipped.length ? `, ${r.skipped.length} dilewati` : ''}. Tinjau di bawah.`,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setMsg({ text: errorText(e), error: true });
      else setMsg({ text: 'Dibatalkan. Tidak ada yang disimpan.' });
    } finally {
      busyRef.current = null;
      setBusy(null);
    }
  }

  const drafts = groups.flatMap((g) => g.drafts);
  // A question that shows a picture on the page is not saved without one (#49).
  const missingImages = drafts.filter((d) => d.needsImage && !d.question.image).length;

  function updateDraft(group: number, index: number, fn: (d: ImportDraft) => ImportDraft | null) {
    setGroups((gs) =>
      gs.map((g) => {
        if (g.id !== group) return g;
        const next = g.drafts.flatMap((d, i) => (i === index ? (fn(d) ?? []) : [d]));
        return { ...g, drafts: next };
      }),
    );
  }

  async function save() {
    try {
      const n = await saveImported(drafts.map((d) => d.question));
      setGroups([]);
      nav('/bank', { state: { notice: `${n} soal hasil impor disimpan ke Bank Soal, bertanda "perlu dicek".` } });
    } catch (e) {
      setMsg({ text: `Gagal menyimpan: ${errorText(e)}`, error: true });
    }
  }

  function discard() {
    if (drafts.length && !confirm(`Buang ${drafts.length} soal hasil impor yang belum disimpan?`)) return;
    setGroups([]);
    setMsg({ text: 'Hasil impor dibuang. Tidak ada yang disimpan.' });
  }

  const editingDraft = editing && groups.find((g) => g.id === editing.group)?.drafts[editing.index];
  const blocked = estimate?.remainingToday === 0;

  return (
    <div className="space-y-4">
      <div>
        <h1>Impor dari foto/PDF</h1>
        <p className="muted mt-1">
          Potret halaman soal atau pilih gambar/PDF. AI menyalin soal dan opsinya, lalu mengusulkan kunci dan pembahasan bila halaman tidak memuatnya. Anda meninjau setiap soal
          sebelum disimpan ke Bank Soal.
        </p>
      </div>

      <section className="card space-y-2 border-amber-300 dark:border-amber-800" aria-labelledby="copyright-heading">
        <h2 id="copyright-heading">Hak cipta</h2>
        <p className="text-sm">{COPYRIGHT_NOTICE}</p>
        <p className="text-sm">Soal hasil impor tidak ikut saat set dibagikan, kecuali Anda memilihnya sendiri di jendela Bagikan.</p>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={own} onChange={(e) => setOwn(e.target.checked)} />
          Materi yang saya impor milik saya sendiri atau lisensinya membolehkan disalin
        </label>
      </section>

      <section className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="imp-pkg">
              Ujian
            </label>
            <select
              id="imp-pkg"
              className="input"
              value={pkgId}
              onChange={(e) => {
                setPkgId(e.target.value);
                setSubtest('');
              }}
            >
              {all.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="imp-subtest">
              Sub-tes
            </label>
            <select id="imp-subtest" className="input" value={subtest} onChange={(e) => setSubtest(e.target.value)}>
              <option value="">Ditentukan AI per soal</option>
              {pkg.subtests.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id}: {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="btn">
            📷 Ambil foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          <div className="min-w-0">
            <label className="label" htmlFor="imp-file">
              Atau pilih gambar/PDF
            </label>
            <input
              id="imp-file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p className="muted text-xs">
          Gambar diperkecil dan dikompresi di browser, dikirim hanya ke penyedia AI pada API key Anda, dan tidak disimpan. Yang disimpan hanya teks soal.
        </p>
        {loading && <p className="muted text-sm">Membaca berkas…</p>}

        {page && source && (
          <div className="space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            {source.pdf && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <button className="btn btn-sm" disabled={source.pageNo <= 1 || loading || !!busy} onClick={() => void goToPage(source.pageNo - 1)}>
                  ← Sebelumnya
                </button>
                <span>
                  Halaman {source.pageNo} dari {source.pdf.count}
                </span>
                <button className="btn btn-sm" disabled={source.pageNo >= source.pdf.count || loading || !!busy} onClick={() => void goToPage(source.pageNo + 1)}>
                  Berikutnya →
                </button>
              </div>
            )}
            <img src={page.url} alt={`Halaman yang akan dikirim: ${source.name}`} className="max-h-96 w-auto rounded border border-slate-200 dark:border-slate-700" />
            {estimate === null ? (
              <p className="text-sm">
                Belum ada API key. <Link to="/keys">Tambahkan API key</Link> dulu.
              </p>
            ) : estimate ? (
              <p className="text-sm" data-testid="import-estimate">
                Dikirim ke {estimate.provider} (key "{estimate.label}", model {estimate.model}): 1 request, perkiraan biaya paling banyak {fmtUsd(estimate.usd)}.
                {estimate.remainingToday !== null && ` Sisa kuota key hari ini: ${estimate.remainingToday} request.`}
              </p>
            ) : null}
            {blocked && <p className="text-sm text-red-600 dark:text-red-400">Kuota harian key ini sudah habis. Coba lagi setelah kuota direset, atau pakai key lain.</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" disabled={!own || !estimate || blocked || !!busy || loading} onClick={() => void send()}>
                {busy ? 'Mengirim…' : groups.some((g) => g.url === page.url) ? 'Kirim ulang halaman ini' : 'Kirim halaman ini'}
              </button>
              {busy && (
                <button className="btn" onClick={() => busy.abort()}>
                  Batalkan pengiriman
                </button>
              )}
            </div>
            {!own && <p className="muted text-xs">Centang pernyataan hak cipta di atas untuk mengirim.</p>}
          </div>
        )}
        {msg && (
          <p role={msg.error ? 'alert' : 'status'} className={`text-sm ${msg.error ? 'text-red-600 dark:text-red-400' : ''}`}>
            {msg.text}
          </p>
        )}
      </section>

      {groups.length > 0 && (
        <section className="space-y-4" aria-labelledby="review-heading">
          <div>
            <h2 id="review-heading">Tinjau sebelum disimpan ({drafts.length} soal)</h2>
            <p className="muted mt-1 text-sm">
              Bandingkan setiap soal dengan halaman aslinya, perbaiki lewat Edit, atau hapus yang keliru. Semua soal disimpan bertanda "perlu dicek" sampai Anda menandainya sudah
              diperiksa di Bank Soal.
            </p>
          </div>
          {groups.map((g) => (
            <div key={g.id} className="grid gap-3 lg:grid-cols-2">
              <details open className="card self-start lg:sticky lg:top-4">
                <summary className="cursor-pointer text-sm font-medium">Halaman asli: {g.label}</summary>
                <PictureCutter
                  src={g.url}
                  label={g.label}
                  targets={g.drafts.map((d, i) => ({ no: i + 1, id: d.question.id, needsImage: d.needsImage && !d.question.image }))}
                  onAttach={(id, image) =>
                    updateDraft(
                      g.id,
                      g.drafts.findIndex((d) => d.question.id === id),
                      (x) => ({ ...x, question: { ...x.question, image }, notes: x.notes.filter((n) => n !== NEEDS_IMAGE_NOTE) }),
                    )
                  }
                />
              </details>
              <div className="space-y-3">
                {g.skipped.length > 0 && (
                  <div className="card text-sm">
                    <div className="font-medium">Dilewati</div>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {g.skipped.map((s) => (
                        <li key={s.no}>
                          Soal nomor {s.no}: {s.reason}.
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {g.drafts.map((d, i) => (
                  <div key={d.question.id} className="space-y-1">
                    <QuestionCard
                      q={d.question}
                      index={i}
                      mode="pembahasan"
                      actions={
                        <>
                          <select
                            className="input w-auto py-1 text-xs"
                            aria-label={`Sub-tes soal ${i + 1}`}
                            value={d.question.subtest}
                            onChange={(e) =>
                              updateDraft(g.id, i, (x) => ({
                                question: moveToSubtest(x.question, e.target.value, topicsFor(settings, e.target.value)),
                                notes: x.notes.filter((n) => !n.startsWith('Sub-tes')),
                              }))
                            }
                          >
                            {pkg.subtests.some((s) => s.id === d.question.subtest) ? null : <option value={d.question.subtest}>{d.question.subtest}</option>}
                            {pkg.subtests.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.id}
                              </option>
                            ))}
                          </select>
                          <button className="btn btn-sm" onClick={() => setEditing({ group: g.id, index: i })}>
                            Edit
                          </button>
                          {d.question.image && (
                            <button className="btn btn-sm btn-ghost" onClick={() => updateDraft(g.id, i, (x) => ({ ...x, question: { ...x.question, image: undefined } }))}>
                              Hapus gambar
                            </button>
                          )}
                          <button className="btn btn-sm btn-ghost" onClick={() => updateDraft(g.id, i, () => null)}>
                            Hapus
                          </button>
                        </>
                      }
                    />
                    {d.notes.length > 0 && (
                      <ul className="list-disc pl-5 text-xs text-amber-700 dark:text-amber-300">
                        {d.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {missingImages > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {missingImages} soal masih perlu gambar: potong gambarnya dari halaman asli dan tempelkan, atau hapus soalnya.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" disabled={!drafts.length || missingImages > 0} onClick={() => void save()}>
              Simpan {drafts.length} soal ke Bank Soal
            </button>
            <button className="btn" onClick={discard}>
              Batal
            </button>
          </div>
        </section>
      )}

      {editing && editingDraft && (
        <QuestionEditor
          q={editingDraft.question}
          onClose={() => setEditing(null)}
          onSave={(q: Question) => updateDraft(editing.group, editing.index, () => ({ question: q, notes: [] }))}
        />
      )}
    </div>
  );
}
