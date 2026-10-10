import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { areaAfterKey, describeArea, START_AREA, type Area } from '../domain/cropArea';
import { DEFAULT_ALT } from '../domain/questionImage';
import type { QuestionImage } from '../domain/types';
import { errorText } from '../engine/storage';
import { cropPicture } from '../lib/pageImage';

const FULL: Area = { x: 0, y: 0, w: 1, h: 1 };

/**
 * The original page, on which the learner drags a box around a question's picture and attaches it
 * to one of the questions copied from that page (#49). Without a pointer, the box is a button: Tab
 * to it and set it with the arrow keys (#59). "Seluruh halaman" selects the whole page.
 */
export function PictureCutter({
  src,
  label,
  targets,
  onAttach,
}: {
  src: string;
  label: string;
  /** Questions from this page: their number on screen and id. */
  targets: { no: number; id: string; needsImage?: boolean }[];
  onAttach: (questionId: string, image: QuestionImage) => void;
}) {
  const [rect, setRect] = useState<Area | null>(null);
  const [target, setTarget] = useState(() => (targets.find((t) => t.needsImage) ?? targets[0])?.id ?? '');
  const [alt, setAlt] = useState('');
  const [msg, setMsg] = useState('');
  // Said by screen readers after each arrow key; empty until the keyboard is used.
  const [spoken, setSpoken] = useState('');
  const start = useRef<{ x: number; y: number } | null>(null);
  const hint = useId();

  const at = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const chosen = targets.some((t) => t.id === target) ? target : targets[0]?.id;

  async function attach() {
    if (!rect || !chosen) return;
    setMsg('');
    try {
      const picture = await cropPicture(src, rect);
      onAttach(chosen, { ...picture, alt: alt.trim() || DEFAULT_ALT });
      setMsg(`Gambar ditempel ke soal ${targets.find((t) => t.id === chosen)?.no}.`);
      setRect(null);
      setAlt('');
    } catch (e) {
      setMsg(errorText(e));
    }
  }

  function keyboard(e: KeyboardEvent<HTMLButtonElement>) {
    const next = areaAfterKey(rect ?? START_AREA, e);
    if (!next) return;
    // Arrows would scroll the page, and Alt + arrow go back or forward in history.
    e.preventDefault();
    setRect(next);
    setSpoken(describeArea(next));
  }

  // Normalised for drawing: a drag up or to the left gives a negative width or height. Before anything
  // is chosen, the keyboard's starting box is drawn only while it has focus.
  const shown = rect ?? START_AREA;
  const box = { left: Math.min(shown.x, shown.x + shown.w), top: Math.min(shown.y, shown.y + shown.h), width: Math.abs(shown.w), height: Math.abs(shown.h) };
  return (
    <div className="space-y-2">
      <div
        className="relative mt-2 cursor-crosshair touch-none select-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = at(e);
          setRect({ ...start.current, w: 0, h: 0 });
          setSpoken('');
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = at(e);
          setRect({ x: start.current.x, y: start.current.y, w: p.x - start.current.x, h: p.y - start.current.y });
        }}
        onPointerUp={() => {
          start.current = null;
          // A click without a drag selects nothing.
          setRect((r) => (r && Math.abs(r.w) > 0.01 && Math.abs(r.h) > 0.01 ? r : null));
        }}
        data-testid="picture-cutter"
      >
        <img src={src} alt={`Halaman asli: ${label}`} draggable={false} className="w-full rounded border border-slate-200 dark:border-slate-700" />
        <button
          type="button"
          aria-label="Area potong"
          aria-describedby={hint}
          className={`pointer-events-none absolute border-2 border-brand-500 bg-brand-500/15 focus-visible:ring-4 focus-visible:ring-brand-500/50 focus-visible:outline-none ${rect ? '' : 'opacity-0 focus-visible:opacity-100'}`}
          style={{ left: `${box.left * 100}%`, top: `${box.top * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
          onFocus={() => {
            if (rect) return;
            setRect(START_AREA);
            setSpoken(describeArea(START_AREA));
          }}
          onKeyDown={keyboard}
        />
      </div>
      <p aria-live="polite" className="muted text-xs">
        {spoken}
      </p>
      {targets.length > 0 && (
        <fieldset className="space-y-2 rounded-lg border border-slate-200 p-2 text-sm dark:border-slate-700">
          <legend className="px-1 text-xs font-medium">Gambar soal</legend>
          <p id={hint} className="muted text-xs">
            Seret kotak di atas gambar halaman untuk memotong gambar soal, atau pakai seluruh halaman. Dengan keyboard: Tab ke area potong, geser dengan tombol panah, ubah
            ukurannya dengan Shift + panah, dan tambahkan Alt untuk langkah besar.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setRect(FULL)}>
              Seluruh halaman
            </button>
            <label className="text-xs">
              Tempel ke
              <select className="input mt-0.5 w-auto py-1 text-xs" value={chosen} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    Soal {t.no}
                    {t.needsImage ? ' (perlu gambar)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-40 flex-1 text-xs">
              Keterangan gambar (teks alternatif)
              <input className="input mt-0.5 py-1 text-xs" value={alt} placeholder="Misalnya: grafik batang penjualan 2020–2024" onChange={(e) => setAlt(e.target.value)} />
            </label>
            <button type="button" className="btn btn-sm btn-primary" disabled={!rect} onClick={() => void attach()}>
              Tempel gambar
            </button>
          </div>
          {msg && (
            <p role="status" className="text-xs">
              {msg}
            </p>
          )}
        </fieldset>
      )}
    </div>
  );
}
