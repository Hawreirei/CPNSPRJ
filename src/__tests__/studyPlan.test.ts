import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../domain/blueprint';
import { computeResult } from '../domain/scoring';
import type { Attempt, OptionLabel, Question, StudyPlan } from '../domain/types';
import { addDays } from '../engine/srs';
import { dailyPlan, daysUntil, nextWeekday, parseLocalDate, readiness, targetFor, type DayInput } from '../engine/studyPlan';
import { buildIcs, escapeText, fold } from '../lib/ics';

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();
// Friday 9 October 2026, 09:00 local.
const FRI = at(2026, 10, 9);
const SAT = at(2026, 10, 10);

const LABELS: OptionLabel[] = ['A', 'B', 'C', 'D', 'E'];
let n = 0;
const q = (subtest: Question['subtest'] = 'TWK'): Question => ({
  id: `q${++n}`,
  subtest,
  topic: 'Pancasila',
  difficulty: 'sedang',
  stem: 'Soal',
  options: LABELS.map((label) => ({ label, text: label, score: label === 'A' ? 5 : 0 })),
  answer: 'A',
  explanation: '',
  flags: [],
  locked: false,
  starred: false,
  hash: 'x',
  source: 'ai',
  createdAt: 0,
  updatedAt: 0,
});

function exam(right: number, of: number, startedAt: number, partial: Partial<Attempt> = {}): Attempt {
  const qs = Array.from({ length: of }, () => q());
  const answers = Object.fromEntries(qs.map((x, i) => [x.id, (i < right ? 'A' : 'B') as OptionLabel]));
  const passing = { TWK: 0, TIU: 0, TKP: 0 };
  return {
    id: `a${++n}`,
    setId: 's1',
    setName: 'Set',
    mode: 'exam',
    questionIds: qs.map((x) => x.id),
    startedAt,
    endsAt: startedAt + 6e6,
    finishedAt: startedAt + 6e5,
    answers,
    flagged: [],
    timeSpent: {},
    currentIndex: 0,
    passing,
    result: computeResult(qs, answers, passing),
    ...partial,
  };
}

describe('dates', () => {
  it('parses local calendar dates and rejects bad ones', () => {
    expect(parseLocalDate('2026-11-21')).toBe(new Date(2026, 10, 21).getTime());
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('21/11/2026')).toBeNull();
    expect(parseLocalDate(undefined)).toBeNull();
  });

  it('counts calendar days across months and years, zero on the day, negative after', () => {
    expect(daysUntil(parseLocalDate('2026-11-21')!, FRI)).toBe(43);
    expect(daysUntil(parseLocalDate('2027-01-02')!, at(2026, 12, 31, 23))).toBe(2);
    expect(daysUntil(parseLocalDate('2026-10-09')!, at(2026, 10, 9, 23))).toBe(0);
    expect(daysUntil(parseLocalDate('2026-10-08')!, FRI)).toBe(-1);
  });

  it('finds the next given weekday, today included', () => {
    expect(nextWeekday(FRI, 6)).toBe(addDays(FRI, 1));
    expect(nextWeekday(SAT, 6)).toBe(addDays(SAT, 0));
    expect(nextWeekday(SAT, 5)).toBe(addDays(SAT, 6));
  });
});

describe('targets and readiness', () => {
  const { passing, counts } = DEFAULT_SETTINGS;

  it('defaults to the pass mark plus 10%, capped at the maximum', () => {
    expect(targetFor('TWK', {}, passing, counts)).toBe(72);
    expect(targetFor('TKP', {}, passing, counts)).toBe(183);
    expect(targetFor('TWK', { targets: { TWK: 100 } }, passing, counts)).toBe(100);
    expect(targetFor('TWK', { targets: { TWK: 999 } }, passing, counts)).toBe(150);
  });

  it('is empty without exams and ignores practice', () => {
    expect(readiness([], {}, passing, counts)).toEqual([]);
    expect(readiness([exam(10, 10, FRI, { mode: 'practice' })], {}, passing, counts)).toEqual([]);
  });

  it('averages the last three exams against the target', () => {
    // 10-question TWK sets, scaled to 150: 2→30, 6→90, 8→120, 10→150.
    const exams = [exam(2, 10, 1), exam(6, 10, 2), exam(8, 10, 3), exam(10, 10, 4)];
    expect(readiness(exams, {}, passing, counts)).toEqual([{ subtest: 'TWK', n: 3, average: 120, target: 72, reached: 3 }]);
    expect(readiness(exams, { targets: { TWK: 125 } }, passing, counts)[0]).toMatchObject({ average: 120, reached: 1 });
  });
});

describe('daily plan', () => {
  const base: DayInput = { plan: {}, now: FRI, attempts: [exam(5, 10, FRI - 86_400_000)], reviewQueue: 0, reviewedToday: 0, simulationMinutes: 100 };
  const kinds = (d: Partial<DayInput>) => dailyPlan({ ...base, ...d }).map((i) => `${i.kind}${i.done ? ':done' : ''}`);

  it('starts a new learner with a first set', () => {
    expect(kinds({ attempts: [] })).toEqual(['start']);
  });

  it('puts reviews first, then practice with the time left', () => {
    const items = dailyPlan({ ...base, plan: { minutesPerDay: 60 }, reviewQueue: 20, weak: { topics: ['Pancasila'], setId: 's1' } });
    expect(items).toEqual([
      { kind: 'review', count: 20, minutes: 30, done: false },
      { kind: 'practice', topics: ['Pancasila'], setId: 's1', minutes: 30, done: false },
    ]);
  });

  it('skips practice when too little time is left', () => {
    expect(kinds({ plan: { minutesPerDay: 35 }, reviewQueue: 20, weak: { topics: ['X'], setId: 's1' } })).toEqual(['review']);
  });

  it('adds the weekly simulation on its day and marks it done after an exam today', () => {
    expect(kinds({ now: SAT })).toEqual(['simulation']);
    expect(kinds({ now: SAT, plan: { simulationDay: 0 } })).toEqual([]);
    expect(kinds({ now: SAT, attempts: [exam(5, 10, SAT - 3_600_000)] })).toEqual(['simulation:done']);
  });

  it('shows the review as done once today\'s queue is empty', () => {
    expect(kinds({ reviewQueue: 0, reviewedToday: 12 })).toEqual(['review:done']);
  });

  it('marks practice done after a practice attempt today', () => {
    const practice = exam(5, 10, FRI - 3_600_000, { mode: 'practice' });
    expect(kinds({ attempts: [...base.attempts, practice], weak: { topics: ['X'], setId: 's1' } })).toEqual(['practice:done']);
  });
});

describe('calendar file', () => {
  const plan: StudyPlan = { examDate: '2026-11-21', simulationDay: 6 };
  const ics = buildIcs({ now: FRI, examDate: parseLocalDate(plan.examDate), simulationDay: 6, simulationMinutes: 100 });

  it('is a valid VCALENDAR with CRLF lines', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  });

  it('runs weekly simulations from the next Saturday until the day before the exam', () => {
    expect(ics).toContain('DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261011\r\nRRULE:FREQ=WEEKLY;BYDAY=SA;UNTIL=20261120\r\n');
    expect(ics).toContain('SUMMARY:Simulasi SKD penuh (100 menit)');
  });

  it('adds the exam as an all-day event with a stable id', () => {
    expect(ics).toContain('UID:ujian-20261121@cpns-skd-builder\r\nDTSTAMP:');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261121\r\nDTEND;VALUE=DATE:20261122\r\n');
  });

  it('without a date, or with one already past, adds twelve weekly simulations and no exam', () => {
    for (const examDate of [null, parseLocalDate('2026-10-01')]) {
      const out = buildIcs({ now: FRI, examDate, simulationDay: 6, simulationMinutes: 100 });
      expect(out).toContain('RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=12');
      expect(out).not.toContain('Ujian SKD CPNS');
    }
  });

  it('adds no simulations when the exam comes first', () => {
    const out = buildIcs({ now: FRI, examDate: addDays(FRI, 0), simulationDay: 6, simulationMinutes: 100 });
    expect(out).not.toContain('RRULE');
    expect(out).toContain('SUMMARY:Ujian SKD CPNS');
  });

  it('escapes text and folds long lines', () => {
    expect(escapeText('a, b; c\\d\ne')).toBe('a\\, b\\; c\\\\d\\ne');
    const long = `DESCRIPTION:${'x'.repeat(200)}`;
    const folded = fold(long);
    expect(folded.split('\r\n ').join('')).toBe(long);
    expect(folded.split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });
});
