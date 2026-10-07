import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { recoverInterrupted } from './engine/generator';
import { requestPersistence } from './db';
import { applyTheme, watchSystemTheme } from './lib/theme';

applyTheme();
watchSystemTheme();

void recoverInterrupted();
void requestPersistence();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
