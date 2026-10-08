import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db, saveSettings } from '../db';
import type { CrossCheckSettings, Settings } from '../domain/types';
import { ModelSelect } from './ModelSelect';

/** Turn the second-opinion check on, and pick the key and model that do the checking. */
export function CrossCheckEditor({ settings }: { settings: Settings }) {
  const keys = useLiveQuery(() => db.keys.toArray(), []);
  const cc: CrossCheckSettings = settings.crossCheck ?? { enabled: false };
  const save = (patch: Partial<CrossCheckSettings>) => saveSettings({ crossCheck: { ...cc, ...patch } });
  if (!keys) return null;
  const key = keys.find((k) => k.id === cc.keyId);

  return (
    <div className="space-y-3">
      <p className="muted text-sm">
        Setelah soal dibuat, model AI lain diminta menjawab soal TWK, TIU non-hitungan, dan TKP <b>tanpa melihat kunci</b>. Bila jawabannya berbeda, soal ditandai
        "perlu dicek" beserta alasannya; kunci tidak diubah otomatis. TIU hitungan sudah diperiksa ulang otomatis, dan soal gambar selalu benar, jadi dilewati.
      </p>
      {!keys.length ? (
        <p className="text-sm">
          Butuh API key.{' '}
          <Link className="text-brand-600 dark:text-brand-300 underline" to="/keys">
            Tambah API key
          </Link>
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={cc.enabled} onChange={(e) => save({ enabled: e.target.checked })} />
            Periksa silang setiap soal baru (menambah permintaan AI dan biaya)
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="cc-key">
                API key pemeriksa
              </label>
              <select id="cc-key" className="input" value={cc.keyId ?? ''} onChange={(e) => save({ keyId: e.target.value || undefined, model: undefined })}>
                <option value="">Sama dengan key set soal</option>
                {keys.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
              {!key && <p className="muted mt-1 text-xs">Pilih key untuk memakai model pemeriksa yang berbeda.</p>}
            </div>
            {key && (
              <div>
                <label className="label" htmlFor="cc-model">
                  Model pemeriksa
                </label>
                <ModelSelect
                  id="cc-model"
                  models={key.models ?? []}
                  value={cc.model ?? null}
                  inheritOption={`Sama seperti di API Key (${key.model})`}
                  onChange={(c) => save({ model: c.kind === 'model' ? c.id : undefined })}
                />
              </div>
            )}
          </div>
          <p className="muted text-xs">
            Model yang berbeda dari pembuat soal menangkap lebih banyak kesalahan. Dua model yang sama-sama keliru tetap bisa lolos: ini menambah kepercayaan,
            bukan jaminan. Soal lama bisa diperiksa dari halaman set.
          </p>
        </>
      )}
    </div>
  );
}
