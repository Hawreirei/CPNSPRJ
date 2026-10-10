import { useEffect, useState, Suspense } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink, Outlet } from 'react-router-dom';
import { Disclaimer } from './Disclaimer';
import { Icon, type IconName } from './icons';
import { useUpdateWaiting } from '../lib/pwa';
import { useStudyReminder } from '../lib/reminder';
import { db, useSettings } from '../db';
import { isQuotaError, QUOTA_MESSAGE } from '../engine/storage';
import { dueQueue } from '../engine/srs';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  /** Shows today's review count next to the label. */
  due?: boolean;
}

// Grouped by what the learner is doing: daily study first, rarely used settings last.
const NAV: { group?: string; items: NavItem[] }[] = [
  { items: [{ to: '/', label: 'Beranda', icon: 'home', end: true }] },
  {
    group: 'Belajar',
    items: [
      { to: '/simulation', label: 'Latihan Ujian', icon: 'exam' },
      { to: '/review', label: 'Buku Kesalahan', icon: 'notebook', due: true },
      { to: '/progress', label: 'Progres Belajar', icon: 'chart' },
    ],
  },
  {
    group: 'Soal',
    items: [
      { to: '/new', label: 'Buat Soal', icon: 'plus' },
      { to: '/sets', label: 'Set Saya', icon: 'folder' },
      { to: '/bank', label: 'Bank Soal', icon: 'bank' },
    ],
  },
  {
    group: 'Materi',
    items: [
      { to: '/kartu', label: 'Kartu Hafalan TWK', icon: 'cards' },
      { to: '/kamus', label: 'Kamus Rumus TIU', icon: 'formula' },
    ],
  },
  {
    group: 'Sistem',
    items: [
      { to: '/keys', label: 'API Key', icon: 'key' },
      { to: '/settings', label: 'Pengaturan', icon: 'settings' },
      { to: '/help', label: 'Bantuan', icon: 'help' },
    ],
  },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const updateWaiting = useUpdateWaiting();
  const settings = useSettings();
  useStudyReminder(!!settings.studyPlan?.reminder?.enabled);
  const due = useLiveQuery(async () => dueQueue(await db.reviews.toArray(), Date.now(), settings.reviewDailyLimit).length, [settings.reviewDailyLimit]) ?? 0;
  // A write that failed because storage is full, anywhere in the app: say so instead of failing silently.
  const [storageFull, setStorageFull] = useState(false);
  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => isQuotaError(e.reason) && setStorageFull(true);
    window.addEventListener('unhandledrejection', onRejection);
    return () => window.removeEventListener('unhandledrejection', onRejection);
  }, []);
  return (
    <div className="min-h-screen md:flex">
      <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          Menu
        </button>
      </header>
      {/* Phones: a drop-down menu. Tablets and small laptops: icons only. From 1280 px: icons and labels. */}
      <aside
        className={`no-print border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-16 md:shrink-0 md:flex-col xl:w-60 dark:border-slate-800 dark:bg-slate-900 ${open ? 'flex flex-col' : 'hidden'}`}
      >
        <div className="hidden px-4 pt-5 pb-3 md:block md:max-xl:px-3">
          <Brand compact />
        </div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto p-2 md:px-3 md:max-xl:px-2" aria-label="Menu utama">
          {NAV.map(({ group, items }, gi) => (
            <div key={gi} className="flex flex-col gap-0.5">
              {group && (
                <>
                  <div className="mt-3 mb-1 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase md:max-xl:hidden dark:text-slate-400">{group}</div>
                  <div aria-hidden className="mx-2 my-2 hidden h-px bg-slate-200 md:max-xl:block dark:bg-slate-800" />
                </>
              )}
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  title={n.label}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm font-medium md:max-xl:justify-center md:max-xl:px-0 ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
                  }
                >
                  <Icon name={n.icon} />
                  <span className="md:max-xl:sr-only">{n.label}</span>
                  {n.due && due > 0 && (
                    <span className="ml-auto rounded-full bg-brand-600 px-1.5 text-[11px] leading-[18px] font-bold text-white tabular-nums md:max-xl:absolute md:max-xl:top-0.5 md:max-xl:right-0.5">
                      {due}
                      <span className="sr-only"> soal untuk diulang hari ini</span>
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="mt-auto px-5 py-3 text-[11px] text-slate-500 md:max-xl:hidden dark:text-slate-400" title={__BUILD_TIME__}>
          Versi {__APP_VERSION__} · {new Date(__BUILD_TIME__).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        {storageFull && (
          <div role="alert" className="no-print flex items-center gap-3 border-b border-red-400 bg-red-50 px-4 py-2 text-xs text-red-800 dark:bg-red-950 dark:text-red-200">
            <span className="flex-1">{QUOTA_MESSAGE}</span>
            <button className="btn btn-sm" onClick={() => setStorageFull(false)}>
              Tutup
            </button>
          </div>
        )}
        {updateWaiting && (
          <div className="no-print flex items-center gap-3 border-b border-brand-500 bg-brand-50 px-4 py-2 text-xs text-brand-700 dark:bg-slate-800 dark:text-brand-100">
            <span className="flex-1">Versi baru aplikasi sudah tersedia. Muat ulang setelah proses yang sedang berjalan selesai.</span>
            <button className="btn btn-sm" onClick={() => location.reload()}>
              Muat ulang
            </button>
          </div>
        )}
        <Disclaimer />
        <div className="mx-auto max-w-[1400px] p-4 md:px-6 md:py-5 xl:px-8">
          {/* Pages load on first visit; the menu stays put meanwhile. */}
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 md:max-xl:justify-center">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-8 w-8" />
      <div className={`leading-tight ${compact ? 'md:max-xl:sr-only' : ''}`}>
        <div className="text-sm font-bold">CASN Set Builder</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">Latihan CPNS dan PPPK</div>
      </div>
    </div>
  );
}
