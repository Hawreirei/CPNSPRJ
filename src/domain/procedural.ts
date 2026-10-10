import { DATA_TOPIC, generateDataAnalysis } from './dataAnalysis';
import { generateFigural } from './figural';
import type { Difficulty, Question } from './types';

/** Questions the app draws itself (figural and data analysis): no AI, and keys that are always right. */
export function generateProcedural(topic: string, difficulty: Difficulty, count: number): Question[] {
  if (topic !== DATA_TOPIC) return generateFigural(topic, difficulty, count);
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 10; tries++) {
    const q = generateDataAnalysis(difficulty);
    if (seen.has(q.hash)) continue;
    seen.add(q.hash);
    out.push(q);
  }
  return out;
}
