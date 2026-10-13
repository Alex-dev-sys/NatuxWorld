import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { isTauri } from '@tauri-apps/api/core';
import App from './App';
import { initializeTauriBridge } from './services/tauri-bridge';
import './index.css';

async function startRenderer(): Promise<void> {
  const root = document.getElementById('root');
  if (!root) throw new Error('Launcher root element is missing');

  try {
    const tauriRuntime = isTauri();
    if (tauriRuntime) await initializeTauriBridge();

    const localMode = typeof __NATUX_LOCAL_MODE__ !== 'undefined' && __NATUX_LOCAL_MODE__;
    if (!tauriRuntime && !window.natux && !localMode) {
      root.className = 'grid h-screen place-items-center bg-bg p-6 text-center text-muted';
      root.textContent = 'Запустите desktop-версию NATUX WORLD. Браузерный preview доступен только в локальном режиме.';
      return;
    }

    createRoot(root).render(
      <StrictMode>
        <HashRouter>
          <App />
        </HashRouter>
      </StrictMode>,
    );
  } catch (error) {
    console.error('Failed to initialize the launcher host', error);
    root.className = 'grid h-screen place-items-center bg-bg p-6 text-center text-muted';
    root.textContent = 'Не удалось инициализировать desktop-версию NATUX WORLD. Перезапустите приложение.';
  }
}

void startRenderer();
