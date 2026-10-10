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
