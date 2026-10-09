import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { CHANGELOG, type Release } from '../data/changelog';
import { db, getSettings, saveSettings } from '../db';
import { exportBackup, importBackup } from '../db/backup';
import { changelogMarkdown, compareVersions, mayHaveNews, newerVersion, unseenReleases } from '../domain/whatsNew';
import { markVersionSeen, noteFirstVersion } from '../lib/whatsNew';

const rel = (version: string): Release => ({ version, date: '2026-10-09', items: [`isi ${version}`] });
const RELEASES = [rel('1.10.0'), rel('1.9.1'), rel('1.2.0'), rel('1.0.0')];
const versions = (rs: Release[]) => rs.map((r) => r.version);

describe('version order (#71)', () => {
  it('compares numerically, part by part', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.1', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0);
  });

  it('keeps the newer of two versions, either missing', () => {
    expect(newerVersion('1.2.0', '1.10.0')).toBe('1.10.0');
    expect(newerVersion('1.10.0', '1.2.0')).toBe('1.10.0');
    expect(newerVersion(undefined, '1.0.0')).toBe('1.0.0');
    expect(newerVersion('1.0.0', undefined)).toBe('1.0.0');
    expect(newerVersion(undefined, undefined)).toBeUndefined();
  });
});

describe('which releases are new to the learner (#71)', () => {
  it('shows the releases after the last one seen, up to the running one, newest first', () => {
    expect(versions(unseenReleases(RELEASES, '1.10.0', '1.2.0', true))).toEqual(['1.10.0', '1.9.1']);
    // Out of order in the list still comes out newest first.
    expect(versions(unseenReleases([...RELEASES].reverse(), '1.10.0', '1.2.0', true))).toEqual(['1.10.0', '1.9.1']);
    // A release newer than the running app (notes ahead of a deploy) is not shown yet.
    expect(versions(unseenReleases(RELEASES, '1.9.1', '1.0.0', true))).toEqual(['1.9.1', '1.2.0']);
  });

  it('shows nothing once the running version has been seen, or after going back to an older one', () => {
    expect(unseenReleases(RELEASES, '1.10.0', '1.10.0', true)).toEqual([]);
    expect(unseenReleases(RELEASES, '1.2.0', '1.10.0', true)).toEqual([]);
    expect(mayHaveNews('1.10.0', '1.10.0', true)).toBe(false);
  });

  it('shows nothing to a new learner without data', () => {
    expect(mayHaveNews('1.10.0', undefined, false)).toBe(false);
    expect(unseenReleases(RELEASES, '1.10.0', undefined, false)).toEqual([]);
  });

  it('shows everything so far to data from before version numbers', () => {
    expect(mayHaveNews('1.0.0', undefined, true)).toBe(true);
    expect(versions(unseenReleases(RELEASES, '1.10.0', undefined, true))).toEqual(['1.10.0', '1.9.1', '1.2.0', '1.0.0']);
  });
});

describe('the release notes themselves', () => {
  it('end at the version in package.json, newest first, with dated entries', () => {
    expect(CHANGELOG[0].version).toBe(pkg.version);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    for (const r of CHANGELOG) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.items.length).toBeGreaterThan(0);
    }
  });

  it('match CHANGELOG.md (run `npm run changelog` after editing src/data/changelog.ts)', () => {
    expect(readFileSync('CHANGELOG.md', 'utf8')).toBe(changelogMarkdown(CHANGELOG));
  });

  it('show the running version, with its commit, as the app version', () => {
    expect(__APP_RELEASE__).toBe(pkg.version);
    expect(__APP_VERSION__).toMatch(new RegExp(`^${pkg.version.replace(/\./g, '\\.')} \\(\\w+\\)$`));
  });
});

describe('the last version seen, stored (#71)', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });

  it('starts a new learner at the running version, without storing the defaults', async () => {
    await noteFirstVersion();
    expect((await db.meta.get('settings'))?.value).toEqual({ lastSeenVersion: __APP_RELEASE__ });
  });

  it('leaves data from before version numbers alone, so its news shows', async () => {
    await db.sets.put({ id: 's1' } as never);
    await noteFirstVersion();
    expect((await getSettings()).lastSeenVersion).toBeUndefined();
  });

  it('never goes back to an older version', async () => {
    await markVersionSeen('1.10.0');
    await markVersionSeen('1.2.0');
    expect((await getSettings()).lastSeenVersion).toBe('1.10.0');
  });

  it('keeps other settings when marking', async () => {
    await saveSettings({ reviewDailyLimit: 7 });
    await markVersionSeen('1.0.0');
    expect(await getSettings()).toMatchObject({ reviewDailyLimit: 7, lastSeenVersion: '1.0.0' });
  });

  it('imports an old backup without the field, keeping what this device has seen', async () => {
    const old = { app: 'cpns-skd-builder', version: 1, exportedAt: '2026-01-01T00:00:00Z', settings: { reviewDailyLimit: 9 }, sets: [], questions: [], attempts: [] };
    const file = (data: unknown) => new File([JSON.stringify(data)], 'cadangan.json');

    // On a fresh device nothing has been seen: the backup's settings go in as they are.
    await importBackup(file(old));
    expect((await db.meta.get('settings'))?.value).toEqual({ reviewDailyLimit: 9 });

    await markVersionSeen('1.0.0');
    await importBackup(file(old));
    expect(await getSettings()).toMatchObject({ reviewDailyLimit: 9, lastSeenVersion: '1.0.0' });

    // A newer one in the backup wins; an older one does not bring the news back.
    await importBackup(file({ ...old, settings: { lastSeenVersion: '1.10.0' } }));
    expect((await getSettings()).lastSeenVersion).toBe('1.10.0');
    await importBackup(file({ ...old, settings: { lastSeenVersion: '1.2.0' } }));
    expect((await getSettings()).lastSeenVersion).toBe('1.10.0');

    // And the field travels with a new backup.
    const exported = JSON.parse(await (await exportBackup()).text());
    expect(exported.settings.lastSeenVersion).toBe('1.10.0');
  });
});
