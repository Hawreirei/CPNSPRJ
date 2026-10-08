import { SUBTESTS } from './types';
import type { AttemptResult, OptionLabel, Question, Subtest, SubtestResult, TopicResult } from './types';
import { isGraded, maxPerQuestion } from './examPackage';

export const MAX_PER_QUESTION = 5;

export function scoreQuestion(q: Question, answer: OptionLabel | undefined): number {
  if (!answer) return 0;
  return q.options.find((o) => o.label === answer)?.score ?? 0;
}

export function isCorrect(q: Question, answer: OptionLabel | undefined): boolean {
  if (!answer) return false;
  if (isGraded(q.subtest)) return scoreQuestion(q, answer) === maxPerQuestion(q.subtest);
  return q.answer === answer;
}

export function computeResult(
  questions: Question[],
  answers: Record<string, OptionLabel>,
  passing: Record<Subtest, number>,
): AttemptResult {
  const perSubtest: SubtestResult[] = [];
  const topicMap = new Map<string, TopicResult>();

  for (const s of SUBTESTS) {
    const qs = questions.filter((q) => q.subtest === s);
    if (!qs.length) continue;
    let score = 0;
    let correct = 0;
    let answered = 0;
    for (const q of qs) {
      const a = answers[q.id];
      const sc = scoreQuestion(q, a);
      score += sc;
      if (a) answered++;
      if (isCorrect(q, a)) correct++;
      const key = `${s}::${q.topic}`;
      const t = topicMap.get(key) ?? { subtest: s, topic: q.topic, score: 0, max: 0, total: 0 };
      t.score += sc;
      t.max += maxPerQuestion(s);
      t.total += 1;
      topicMap.set(key, t);
    }
    perSubtest.push({
      subtest: s,
      score,
      max: qs.length * maxPerQuestion(s),
      passing: passing[s],
      passed: score >= passing[s],
      correct,
      answered,
      total: qs.length,
    });
  }

  const total = perSubtest.reduce((n, r) => n + r.score, 0);
  const maxTotal = perSubtest.reduce((n, r) => n + r.max, 0);
  return {
    perSubtest,
    topics: [...topicMap.values()],
    total,
    maxTotal,
    passedAll: perSubtest.length > 0 && perSubtest.every((r) => r.passed),
  };
}

/** Topics scoring under `threshold` (fraction of max), weakest first. */
export function weakTopics(topics: TopicResult[], threshold = 0.6): TopicResult[] {
  return topics
    .filter((t) => t.max > 0 && t.score / t.max < threshold)
    .sort((a, b) => a.score / a.max - b.score / b.max);
}
