import { db } from '../db';
import type { Question } from '../domain/types';

/** Keep a text as a note on the question; returns the updated question. */
export async function addNote(id: string, text: string, at = Date.now()): Promise<Question | undefined> {
  await db.questions
    .where('id')
    .equals(id)
    .modify((q) => {
      q.notes = [...(q.notes ?? []), { text: text.trim(), at }];
    });
  return db.questions.get(id);
}

export async function deleteNote(id: string, at: number): Promise<Question | undefined> {
  await db.questions
    .where('id')
    .equals(id)
    .modify((q) => {
      q.notes = (q.notes ?? []).filter((n) => n.at !== at);
      if (!q.notes.length) delete q.notes;
    });
  return db.questions.get(id);
}
