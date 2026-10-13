import { describe, expect, it } from 'vitest';
import { decide, toServer, type RemoteRow } from '../sync/merge';
import type { SyncStamp, SyncTable } from '../sync/track';

const stamp = (tbl: SyncTable, id: string, mtime: number, o: Partial<SyncStamp> = {}): SyncStamp => ({ tbl, id, mtime, dirty: 0, deleted: 0, ...o });
const remote = (tbl: SyncTable, id: string, mtime: number, data: Record<string, unknown> | null): RemoteRow => ({ tbl, id, mtime, data, deleted: data === null });

describe('merge rules for pulled rows (#100)', () => {
  it('takes a newer server version, keeps an equal or newer local one', () => {
    const q = { id: 'q', stem: 'baru' };
    expect(decide({ stamp: stamp('questions', 'q', 10), row: { id: 'q', stem: 'lama' } }, remote('questions', 'q', 20, q))).toEqual({ kind: 'take' });
    expect(decide({ stamp: stamp('questions', 'q', 20), row: q }, remote('questions', 'q', 20, q))).toEqual({ kind: 'keep' });
    expect(decide({ stamp: stamp('questions', 'q', 30, { dirty: 1 }), row: q }, remote('questions', 'q', 20, { id: 'q', stem: 'x' }))).toEqual({ kind: 'keep' });
  });

  it('takes a row this device never had', () => {
    expect(decide({}, remote('sets', 's', 1, { id: 's' }))).toEqual({ kind: 'take' });
  });

  it('applies a newer deletion, and ignores an older one', () => {
    expect(decide({ stamp: stamp('sets', 's', 10), row: { id: 's' } }, remote('sets', 's', 20, null))).toEqual({ kind: 'take' });
    expect(decide({ stamp: stamp('sets', 's', 30, { dirty: 1 }), row: { id: 's' } }, remote('sets', 's', 20, null))).toEqual({ kind: 'keep' });
  });

  it('keeps a local deletion that is newer than the server row', () => {
    expect(decide({ stamp: stamp('sets', 's', 30, { deleted: 1, dirty: 1 }) }, remote('sets', 's', 20, { id: 's' }))).toEqual({ kind: 'keep' });
  });

  it('never lets an unfinished copy replace a finished attempt', () => {
    const finished = { id: 'a', finishedAt: 5, answers: { q1: 'A' } };
    const unfinished = { id: 'a', answers: { q1: 'B' } };
    expect(decide({ stamp: stamp('attempts', 'a', 10), row: finished }, remote('attempts', 'a', 20, unfinished))).toEqual({ kind: 'merge', data: finished, push: true });
    // A finished copy from the server wins, even over a newer unfinished one here (a stale exam tab).
    expect(decide({ stamp: stamp('attempts', 'a', 10), row: unfinished }, remote('attempts', 'a', 20, finished))).toEqual({ kind: 'take' });
    expect(decide({ stamp: stamp('attempts', 'a', 30, { dirty: 1 }), row: unfinished }, remote('attempts', 'a', 20, finished))).toEqual({ kind: 'take' });
    // A finished copy here that is newer is simply kept, and sent.
    expect(decide({ stamp: stamp('attempts', 'a', 30, { dirty: 1 }), row: finished }, remote('attempts', 'a', 20, unfinished))).toEqual({ kind: 'keep' });
  });

  it('joins the study days of both sides, whichever is newer', () => {
    const mine = { key: 'reviewDays', value: ['2026-10-01', '2026-10-03'] };
    const theirs = { key: 'reviewDays', value: ['2026-10-02', '2026-10-03'] };
    const all = { key: 'reviewDays', value: ['2026-10-01', '2026-10-02', '2026-10-03'] };
    expect(decide({ stamp: stamp('meta', 'reviewDays', 10), row: mine }, remote('meta', 'reviewDays', 20, theirs))).toEqual({ kind: 'merge', data: all, push: true });
    expect(decide({ stamp: stamp('meta', 'reviewDays', 30), row: mine }, remote('meta', 'reviewDays', 20, theirs))).toEqual({ kind: 'merge', data: all, push: true });
    expect(decide({ stamp: stamp('meta', 'reviewDays', 10), row: theirs }, remote('meta', 'reviewDays', 20, all))).toEqual({ kind: 'take' });
  });

  it('joins the notes kept on a question', () => {
    const n1 = { text: 'catatan HP', at: 1 };
    const n2 = { text: 'catatan laptop', at: 2 };
    const mine = { id: 'q', stem: 'lama', notes: [n1] };
    const theirs = { id: 'q', stem: 'baru', notes: [n2] };
    expect(decide({ stamp: stamp('questions', 'q', 10), row: mine }, remote('questions', 'q', 20, theirs))).toEqual({
      kind: 'merge',
      data: { id: 'q', stem: 'baru', notes: [n1, n2] },
      push: true,
    });
    expect(decide({ stamp: stamp('questions', 'q', 30), row: mine }, remote('questions', 'q', 20, theirs))).toEqual({
      kind: 'merge',
      data: { id: 'q', stem: 'lama', notes: [n1, n2] },
      push: true,
    });
    expect(decide({ stamp: stamp('questions', 'q', 10), row: { id: 'q' } }, remote('questions', 'q', 20, { id: 'q', stem: 'x' }))).toEqual({ kind: 'take' });
  });

  it("keeps this device's own lastSeenVersion when taking newer settings, without sending them back", () => {
    const mine = { key: 'settings', value: { brandName: 'lama', lastSeenVersion: '1.9.0' } };
    const theirs = { key: 'settings', value: { brandName: 'baru' } };
    expect(decide({ stamp: stamp('meta', 'settings', 10), row: mine }, remote('meta', 'settings', 20, theirs))).toEqual({
      kind: 'merge',
      data: { key: 'settings', value: { brandName: 'baru', lastSeenVersion: '1.9.0' } },
      push: false,
    });
    expect(decide({ stamp: stamp('meta', 'settings', 30), row: mine }, remote('meta', 'settings', 20, theirs))).toEqual({ kind: 'keep' });
    expect(decide({ stamp: stamp('meta', 'settings', 10), row: { key: 'settings', value: {} } }, remote('meta', 'settings', 20, theirs))).toEqual({ kind: 'take' });
  });

  it('compares content, not the order fields were written in', () => {
    const mine = { key: 'settings', value: { lastSeenVersion: '1.9.0', brandName: 'x', counts: { TIU: 35, TWK: 30 } } };
    expect(
      decide({ stamp: stamp('meta', 'settings', 30), row: mine }, remote('meta', 'settings', 20, { key: 'settings', value: { counts: { TWK: 30, TIU: 35 }, brandName: 'x' } })),
    ).toEqual({
      kind: 'keep',
    });
  });

  it("leaves this device's lastSeenVersion out of what is sent", () => {
    expect(toServer('meta', 'settings', { key: 'settings', value: { brandName: 'x', lastSeenVersion: '1.9.0' } })).toEqual({ key: 'settings', value: { brandName: 'x' } });
    expect(toServer('questions', 'q', { id: 'q', stem: 'x' })).toEqual({ id: 'q', stem: 'x' });
  });
});
