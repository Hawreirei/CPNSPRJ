import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { recoverInterrupted, revalidateStored } from './engine/generator';
import { requestPersistence } from './db';
import { pruneRequestLog } from './engine/quota';
import { setupPwa } from './lib/pwa';
import { applyTheme, watchSystemTheme } from './lib/theme';

applyTheme();
watchSystemTheme();

void recoverInterrupted();
void revalidateStored();
void requestPersistence();
void pruneRequestLog();
setupPwa();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
