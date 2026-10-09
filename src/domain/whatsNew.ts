/*
 * Which releases are new to this learner (#71), and the changelog as Markdown. Pure: the release
 * list comes in as an argument, so the dashboard can load it only when there is something to show.
 */
import type { Release } from '../data/changelog';

/** Numeric parts of "1.10.2"; anything after a "-" or "+" (pre-release, build) is ignored. */
const parts = (v: string) =>
  v
    .split(/[-+]/)[0]
    .split('.')
    .map((p) => Number.parseInt(p, 10) || 0);

/** Negative when a is older than b, positive when newer, 0 when equal. 1.10.0 is newer than 1.9.0. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** The newer of two versions; either may be missing. */
export function newerVersion(a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b) return a ?? b;
  return compareVersions(a, b) >= 0 ? a : b;
}

/** Data from before version numbers counts as this version: everything since is new to it. */
const BEFORE_VERSIONS = '0.0.0';

/**
 * Whether this learner may have unseen releases, before loading the list. False for a new
 * learner (no data, nothing seen yet: the app is new to them as a whole) and once the current
 * version has been seen.
 */
export function mayHaveNews(current: string, lastSeen: string | undefined, hasData: boolean): boolean {
  if (lastSeen === undefined) return hasData;
  return compareVersions(current, lastSeen) > 0;
}

/** Releases after the last one seen, up to the running one, newest first. */
export function unseenReleases(releases: Release[], current: string, lastSeen: string | undefined, hasData: boolean): Release[] {
  if (!mayHaveNews(current, lastSeen, hasData)) return [];
  const since = lastSeen ?? BEFORE_VERSIONS;
  return releases.filter((r) => compareVersions(r.version, since) > 0 && compareVersions(r.version, current) <= 0).sort((a, b) => compareVersions(b.version, a.version));
}

/** CHANGELOG.md, written from the same list the app shows. */
export function changelogMarkdown(releases: Release[]): string {
  const body = releases.map((r) => [`## ${r.version} (${r.date})`, '', ...r.items.map((i) => `- ${i}`)].join('\n'));
  return [
    '# Catatan rilis',
    '',
    'Perubahan yang terasa bagi pengguna, per versi. Berkas ini dibuat dari `src/data/changelog.ts` dengan `npm run changelog`; jangan diedit langsung.',
    '',
    ...body.flatMap((b) => [b, '']),
  ].join('\n');
}
