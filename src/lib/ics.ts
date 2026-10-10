import { addDays, startOfDay } from '../engine/srs';
import { nextWeekday } from '../engine/studyPlan';

/**
 * A minimal iCalendar file (RFC 5545) for the study plan: the exam day and a weekly full
 * simulation. All-day events only, so no time zone is needed and every calendar app shows
 * them on the right day.
 */

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
/** Weekly simulations to add when there is no exam date to end them. */
export const SIMULATIONS_WITHOUT_DATE = 12;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local calendar date as YYYYMMDD. */
const icsDate = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
const icsStamp = (t: number) =>
  new Date(t)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/** Escape TEXT values: backslash, semicolon, comma and newlines. */
export const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets, as the format requires (continuation lines start with a space). */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (size + n > limit) {
      out.push(cur);
      cur = '';
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface IcsInput {
  now: number;
  /** Local midnight of the exam day, if set. */
  examDate?: number | null;
  simulationDay: number;
  simulationMinutes: number;
}

export function buildIcs({ now, examDate, simulationDay, simulationMinutes }: IcsInput): string {
  const stamp = icsStamp(now);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CASN Set Builder//Rencana Belajar//ID', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  const event = (uid: string, start: number, summary: string, description: string, extra: string[] = []) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(start, 1))}`,
      ...extra,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  };

  // A date already past is ignored, as if none was set.
  const exam = examDate && examDate >= startOfDay(now) ? examDate : null;
  const firstSim = nextWeekday(now, simulationDay);
  // Simulations stop the day before the exam; without a date, after a fixed number of weeks.
  if (!exam || exam > firstSim) {
    const until = exam ? `UNTIL=${icsDate(addDays(exam, -1))}` : `COUNT=${SIMULATIONS_WITHOUT_DATE}`;
    event(
      'simulasi-mingguan@cpns-skd-builder',
      firstSim,
      `Simulasi SKD penuh (${simulationMinutes} menit)`,
      'Kerjakan satu simulasi SKD penuh di menu Latihan Ujian, lalu cek Laporan Skor.',
      [`RRULE:FREQ=WEEKLY;BYDAY=${BYDAY[simulationDay]};${until}`],
    );
  }
  if (exam) event(`ujian-${icsDate(exam)}@cpns-skd-builder`, exam, 'Ujian SKD CPNS', 'Hari ujian SKD. Cek jadwal dan lokasi resmi di SSCASN.');
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
