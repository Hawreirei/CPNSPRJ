import { useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { isAnyGenerationRunning } from '../engine/running';

let updateWaiting = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** True when a new version is active but reloading now would interrupt the user. */
export function useUpdateWaiting(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => updateWaiting,
  );
}

const isBusy = () => isAnyGenerationRunning() || location.hash.startsWith('#/cat/') || location.hash.startsWith('#/practice/');

/**
 * Register the service worker so a new deploy replaces the cached app on the
 * next load, without the user needing a hard refresh. A reload is deferred while
 * questions are being generated or a CAT simulation or practice session is open.
 */
export function setupPwa() {
  if (!('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onNeedReload() {
      if (isBusy()) {
        updateWaiting = true;
        notify();
      } else {
        location.reload();
      }
    },
    onRegisteredSW(_url, registration) {
      // Long-lived tabs: look for a new deploy every 30 minutes.
      if (registration) setInterval(() => void registration.update(), 30 * 60_000);
    },
  });
}

/** The browser's install offer (Chrome, Edge, Samsung Internet), kept for an "install" button. */
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let installPrompt: InstallPrompt | null = null;
const installListeners = new Set<() => void>();

/** Opened from the home screen or as an installed app: browsers keep such an app's data longer, and Safari never clears it after a week. */
export function isInstalled(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Keep the install offer instead of the browser's own banner, so the storage tip can make it. */
export function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    installListeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installListeners.forEach((l) => l());
  });
}

/** Whether "Pasang aplikasi" can open the browser's install dialog right now. */
export function useCanInstall(): boolean {
  return useSyncExternalStore(
    (l) => {
      installListeners.add(l);
      return () => installListeners.delete(l);
    },
    () => installPrompt !== null,
  );
}

/** Show the browser's install dialog; true when the learner installed the app. */
export async function promptInstall(): Promise<boolean> {
  const p = installPrompt;
  if (!p) return false;
  await p.prompt();
  const { outcome } = await p.userChoice;
  installPrompt = null;
  installListeners.forEach((l) => l());
  return outcome === 'accepted';
}
