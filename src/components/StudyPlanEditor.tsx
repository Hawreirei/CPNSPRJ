import { saveSettings } from '../db';
import { SUBTESTS } from '../domain/types';
import type { Settings, StudyPlan } from '../domain/types';
import { DEFAULT_MINUTES_PER_DAY, DEFAULT_SIMULATION_DAY, parseLocalDate, targetFor, WEEKDAYS } from '../engine/studyPlan';
import { buildIcs } from '../lib/ics';
import { downloadBlob } from './ui';

/** Plan settings: every field optional; changes save immediately like the rest of Settings. */
export function StudyPlanEditor({ settings }: { settings: Settings }) {
  const plan = settings.studyPlan;
  const save = (patch: Partial<StudyPlan>) => saveSettings({ studyPlan: { ...plan, ...patch } });

  if (!plan) {
    return (
      <div className="space-y-2">
        <p className="muted text-sm">Atur waktu belajar harian dan tanggal ujian. Beranda akan menampilkan hitung mundur, target hari ini, dan kesiapan Anda.</p>
        <button className="btn btn-primary" onClick={() => saveSettings({ studyPlan: { minutesPerDay: DEFAULT_MINUTES_PER_DAY, simulationDay: DEFAULT_SIMULATION_DAY } })}>
          Buat rencana belajar
        </button>
      </div>
    );
  }

  const simDay = plan.simulationDay ?? DEFAULT_SIMULATION_DAY;
  const downloadIcs = () => {
    const ics = buildIcs({ now: Date.now(), examDate: parseLocalDate(plan.examDate), simulationDay: simDay, simulationMinutes: settings.durationMinutes });
    downloadBlob(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), 'jadwal-belajar-skd.ics');
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="plan-date">
            Tanggal ujian (opsional)
          </label>
          <input id="plan-date" type="date" className="input" value={plan.examDate ?? ''} onChange={(e) => save({ examDate: e.target.value || undefined })} />
        </div>
        <div>
          <label className="label" htmlFor="plan-minutes">
            Waktu belajar per hari (menit)
          </label>
          <input
            id="plan-minutes"
            type="number"
            min={10}
            max={600}
            className="input"
            value={plan.minutesPerDay ?? DEFAULT_MINUTES_PER_DAY}
            onChange={(e) => save({ minutesPerDay: Math.min(600, Math.max(10, Number(e.target.value) || DEFAULT_MINUTES_PER_DAY)) })}
          />
        </div>
        <div>
          <label className="label" htmlFor="plan-simday">
            Hari simulasi penuh mingguan
          </label>
          <select id="plan-simday" className="input" value={simDay} onChange={(e) => save({ simulationDay: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="muted text-xs">Jadwal resmi seleksi bisa berubah. Cek SSCASN/BKN dan perbarui tanggal di sini bila perlu.</p>

      <div>
        <div className="label">Skor target per sub-tes (kosong = ambang batas + 10%)</div>
        <div className="flex flex-wrap gap-3">
          {SUBTESTS.map((s) => (
            <label key={s} className="text-sm">
              <span className="mb-1 block text-xs font-medium">{s}</span>
              <input
                type="number"
                min={0}
                max={settings.counts[s] * 5}
                className="input w-28"
                placeholder={String(targetFor(s, { ...plan, targets: {} }, settings.passing, settings.counts))}
                value={plan.targets?.[s] ?? ''}
                onChange={(e) => {
                  const targets = { ...plan.targets };
                  if (e.target.value === '') delete targets[s];
                  else targets[s] = Math.max(0, Number(e.target.value) || 0);
                  void save({ targets });
                }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn" onClick={downloadIcs}>
          Unduh jadwal ke kalender (.ics)
        </button>
        <button className="btn btn-ghost" onClick={() => confirm('Hapus rencana belajar?') && void saveSettings({ studyPlan: undefined })}>
          Hapus rencana
        </button>
      </div>
      <p className="muted text-xs">Berkas .ics berisi simulasi mingguan dan tanggal ujian; bisa diimpor ke Google Calendar atau kalender ponsel.</p>
    </div>
  );
}
