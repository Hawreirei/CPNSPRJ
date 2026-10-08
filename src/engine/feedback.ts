import { db } from '../db';
import { withReportFlag } from '../domain/quality';
import type { Question, QuestionReport } from '../domain/types';

/** Store the learner's rating and report for a question; `undefined` clears either one. */
export async function saveFeedback(id: string, fb: { rating?: number; report?: QuestionReport }): Promise<Question | undefined> {
  await db.questions
    .where('id')
    .equals(id)
    .modify((q) => {
      if (fb.rating === undefined) delete q.rating;
      else q.rating = Math.max(1, Math.min(5, Math.round(fb.rating)));
      if (fb.report) q.report = { ...fb.report, note: fb.report.note?.trim() || undefined };
      else delete q.report;
      q.flags = withReportFlag(q.flags, q.report);
    });
  return db.questions.get(id);
}
