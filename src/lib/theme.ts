export type Theme = 'system' | 'light' | 'dark';

export function getTheme(): Theme {
  try {
    return (localStorage.getItem('theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(theme: Theme = getTheme()) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
}

/** Root font size; every size in the app is in rem, so the whole interface scales with it. */
export type TextSize = 'normal' | 'besar' | 'sangat-besar';
const TEXT_SCALE: Record<TextSize, string> = { normal: '100%', besar: '112.5%', 'sangat-besar': '125%' };

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem('textSize') as TextSize | null;
    return v && v in TEXT_SCALE ? v : 'normal';
  } catch {
    return 'normal';
  }
}

export function applyTextSize(size: TextSize = getTextSize()) {
  document.documentElement.style.fontSize = TEXT_SCALE[size];
}

export function setTextSize(size: TextSize) {
  try {
    localStorage.setItem('textSize', size);
  } catch {
    /* ignore */
  }
  applyTextSize(size);
}
