import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Disclaimer } from './Disclaimer';

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/new', label: 'Set Baru' },
  { to: '/sets', label: 'Set Tersimpan' },
  { to: '/bank', label: 'Bank Soal' },
  { to: '/simulation', label: 'Simulasi CAT' },
  { to: '/progress', label: 'Progres' },
  { to: '/keys', label: 'API Keys' },
  { to: '/settings', label: 'Pengaturan' },
  { to: '/help', label: 'Bantuan' },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen md:flex">
      <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-900">
        <Brand />
        <button className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
          Menu
        </button>
      </header>
      <aside
        className={`no-print border-r border-slate-200 bg-white md:sticky md:top-0 md:block md:h-screen md:w-56 md:shrink-0 dark:border-slate-800 dark:bg-slate-900 ${open ? 'block' : 'hidden'}`}
      >
        <div className="hidden px-4 py-4 md:block">
          <Brand />
        </div>
        <nav className="flex flex-col gap-0.5 p-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700 dark:bg-slate-800 dark:text-brand-100' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1">
        <Disclaimer />
        <div className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" className="h-7 w-7" />
      <div className="leading-tight">
        <div className="text-sm font-bold">SKD Set Builder</div>
        <div className="text-[11px] text-slate-500">Latihan CPNS</div>
      </div>
    </div>
  );
}
