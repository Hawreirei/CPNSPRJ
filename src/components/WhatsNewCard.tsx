import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { getSettings } from '../db';
import { mayHaveNews, unseenReleases } from '../domain/whatsNew';
import { hasLearnerData, markVersionSeen } from '../lib/whatsNew';

/**
 * "Apa yang baru" after an update (#71): the releases since the one last closed, until closed. Not
 * for a new learner, and only on the dashboard, so never during an exam or a practice. The
 * release notes load only when there is something to show.
 */
export function WhatsNewCard() {
  const releases = useLiveQuery(async () => {
    const lastSeen = (await getSettings()).lastSeenVersion;
    const hasData = lastSeen === undefined && (await hasLearnerData());
    if (!mayHaveNews(__APP_RELEASE__, lastSeen, hasData)) return [];
    const { CHANGELOG } = await import('../data/changelog');
    return unseenReleases(CHANGELOG, __APP_RELEASE__, lastSeen, hasData);
  }, []);
  if (!releases?.length) return null;

  return (
    <section className="card space-y-3 border-brand-500" aria-labelledby="whats-new-title">
      <h2 id="whats-new-title">Apa yang baru di versi {releases[0].version}</h2>
      {releases.map((r) => (
        <div key={r.version} className="space-y-1">
          {releases.length > 1 && <h3>Versi {r.version}</h3>}
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {r.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => void markVersionSeen(__APP_RELEASE__)}>
          Tutup
        </button>
        <Link className="btn" to="/help?bagian=perubahan">
          Riwayat perubahan
        </Link>
      </div>
    </section>
  );
}
