import { saveSettings } from '../db';
import { SUBTESTS } from '../domain/types';
import type { Settings, StudyPlan } from '../domain/types';
import { DEFAULT_MINUTES_PER_DAY, DEFAULT_SIMULATION_DAY, parseLocalDate, targetFor, WEEKDAYS } from '../engine/studyPlan';
import { buildIcs } from '../lib/ics';
import { useState } from 'react';
import { DEFAULT_REMINDER_TIME, parseTime } from '../domain/reminder';
import { askPermission, markHandledToday, notificationsSupported } from '../lib/reminder';
import { downloadBlob } from '../lib/download';

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
  const studyDays = plan.studyDays?.length ? plan.studyDays : WEEKDAYS.map((_, i) => i);
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
      <fieldset>
        <legend className="label">Hari belajar</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {WEEKDAYS.map((d, i) => {
            const on = studyDays.includes(i);
            return (
              <label key={d} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={on && studyDays.length === 1}
                  onChange={() => {
                    const next = on ? studyDays.filter((x) => x !== i) : [...studyDays, i].sort((a, b) => a - b);
                    void save({ studyDays: next.length === WEEKDAYS.length ? undefined : next });
                  }}
                />
                {d}
              </label>
            );
          })}
        </div>
        <p className="muted mt-1 text-xs">Hari di luar hari belajar tidak memutus streak.</p>
      </fieldset>
      <ReminderEditor plan={plan} save={save} />
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

const PERMISSION_MESSAGES = {
  denied: 'Izin notifikasi ditolak di browser ini, jadi pengingat tetap mati. Untuk menyalakannya, izinkan notifikasi untuk situs ini di pengaturan browser, lalu coba lagi.',
  dismissed: 'Izin notifikasi belum diberikan, jadi pengingat tetap mati.',
  unsupported: 'Browser ini tidak mendukung notifikasi. Pakai berkas kalender (.ics) di bawah sebagai pengingat.',
};

/** Daily reminder switch. Permission is asked only here, when the learner switches it on. */
function ReminderEditor({ plan, save }: { plan: StudyPlan; save: (patch: Partial<StudyPlan>) => Promise<void> }) {
  const reminder = plan.reminder ?? { enabled: false, time: DEFAULT_REMINDER_TIME };
  const [msg, setMsg] = useState('');

  async function toggle(on: boolean) {
    setMsg('');
    if (!on) return save({ reminder: { ...reminder, enabled: false } });
    const p = await askPermission();
    if (p !== 'granted') {
      setMsg(PERMISSION_MESSAGES[p]);
      return save({ reminder: { ...reminder, enabled: false } });
    }
    // Switched on after today's time: start tomorrow rather than at once.
    const at = parseTime(reminder.time) ?? 0;
    const d = new Date();
    if (d.getHours() * 60 + d.getMinutes() >= at) await markHandledToday();
    return save({ reminder: { ...reminder, enabled: true } });
  }

  return (
    <fieldset className="space-y-2">
      <legend className="label">Pengingat harian</legend>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={reminder.enabled} disabled={!notificationsSupported()} onChange={(e) => void toggle(e.target.checked)} />
          Ingatkan saya setiap hari pukul
        </label>
        <input
          type="time"
          aria-label="Jam pengingat"
          className="input w-32"
          value={reminder.time}
          onChange={(e) => parseTime(e.target.value) !== null && void save({ reminder: { ...reminder, time: e.target.value } })}
        />
      </div>
      {msg && (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
          {msg}
        </p>
      )}
      <p className="muted text-xs">
        {notificationsSupported() ? '' : 'Browser ini tidak mendukung notifikasi. '}
        Isinya dari rencana hari itu, misalnya jumlah ulangan jatuh tempo dan topik yang perlu dilatih, paling banyak sekali sehari. Keterbatasannya: browser hanya bisa menampilkan
        pengingat saat aplikasi ini terbuka, jadi bila aplikasi tertutup pada jam itu, pengingat muncul saat aplikasi dibuka berikutnya. Untuk pengingat yang pasti tepat waktu,
        unduh jadwal ke kalender (.ics).
      </p>
    </fieldset>
  );
}
