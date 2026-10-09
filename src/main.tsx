import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { recoverInterrupted } from './engine/running';
import { revalidateStored } from './engine/revalidate';
import { getSettings, requestPersistence } from './db';
import { pruneRequestLog } from './engine/quota';
import { setupAutoBackup } from './lib/autoBackup';
import { setupPwa } from './lib/pwa';
import { applyTextSize, applyTheme, watchSystemTheme } from './lib/theme';
import { setupErrorLog } from './lib/errorLog';

applyTheme();
applyTextSize();
watchSystemTheme();

void recoverInterrupted();
// Re-checking stored answers may need mathjs, so it waits until the first screen is up.
whenIdle(() => void revalidateStored());
void requestPersistence();
void pruneRequestLog();
setupErrorLog();
setupPwa();
setupAutoBackup();

function whenIdle(fn: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 5000 });
  else setTimeout(fn, 2000);
}

// Imported exam packages are registered when Settings are read; do that before anything is scored.
void getSettings()
  .catch(() => undefined)
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
