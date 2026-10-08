import { isCorrect, MAX_PER_QUESTION, scoreQuestion } from './scoring';
import type { Attempt, AttemptMode, OptionLabel, Question, Subtest } from './types';

/** `endsAt` of an attempt without a time limit. JSON-safe, unlike Infinity. */
export const UNTIMED = Number.MAX_SAFE_INTEGER;

export const attemptMode = (a: Pick<Attempt, 'mode'>): AttemptMode => a.mode ?? 'exam';

export const isTimed = (a: Pick<Attempt, 'endsAt'>): boolean => a.endsAt < UNTIMED;

/** Where an attempt continues: its report once finished, otherwise the page for its mode. */
export function attemptPath(a: Pick<Attempt, 'id' | 'mode' | 'result'>): string {
  if (a.result) return `/results/${a.id}`;
  return attemptMode(a) === 'practice' ? `/practice/${a.id}` : `/cat/${a.id}`;
}

/** Only exams are comparable on score charts; practice shows the key as you go. */
export const examAttempts = <T extends Pick<Attempt, 'mode'>>(list: T[]): T[] => list.filter((a) => attemptMode(a) === 'exam');

export interface QuestionFilter {
  subtests?: Subtest[];
  topics?: string[];
}

/** Narrow a set's questions for practice. An empty or missing list means no restriction. */
export function filterQuestions(questions: Question[], f: QuestionFilter = {}): Question[] {
  return questions.filter((q) => (!f.subtests?.length || f.subtests.includes(q.subtest)) && (!f.topics?.length || f.topics.includes(q.topic)));
}

export interface Feedback {
  correct: boolean;
  score: number;
  /** TWK/TIU: the key. TKP: every option with the top score. */
  best: OptionLabel[];
}

export function feedback(q: Question, answer: OptionLabel): Feedback {
  const best =
    q.subtest === 'TKP' ? q.options.filter((o) => o.score === MAX_PER_QUESTION).map((o) => o.label) : q.answer ? [q.answer] : [];
  return { correct: isCorrect(q, answer), score: scoreQuestion(q, answer), best };
}
