import { useState } from 'react';

export function Disclaimer() {
  const [hidden, setHidden] = useState(() => {
    try {
      return sessionStorage.getItem('hide-disclaimer') === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  return (
    <div className="no-print flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      <p className="flex-1">
        Aplikasi latihan, <b>bukan produk resmi BKN</b>. Soal dibuat AI: periksa materi TWK ke sumber resmi. Skor TKP adalah rasional berbasis nilai pelayanan publik, bukan kunci
        resmi.
      </p>
      <button
        className="shrink-0 underline"
        onClick={() => {
          setHidden(true);
          try {
            sessionStorage.setItem('hide-disclaimer', '1');
          } catch {
            /* ignore */
          }
        }}
      >
        Tutup
      </button>
    </div>
  );
}
