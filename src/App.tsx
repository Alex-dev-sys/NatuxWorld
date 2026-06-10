import { useEffect, useRef } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { SettingsModal } from './components/SettingsModal';
import { UpdateToast } from './components/UpdateToast';
import { HomePage } from './pages/HomePage';
import { NewsPage } from './pages/NewsPage';
import { StorePage } from './pages/StorePage';
import { RulesPage } from './pages/RulesPage';
import { SupportPage } from './pages/SupportPage';
import { LogsPage } from './pages/LogsPage';
import { bridge } from './services/electron-bridge';
import { useLauncherStore } from './store/useLauncherStore';
import { useLogStore } from './store/useLogStore';
import { useAuthStore } from './store/useAuthStore';
import { useSettingsStore } from './store/useSettingsStore';
import { AppBackdrop } from './components/AppBackdrop';

export default function App() {
  const location = useLocation();
  const setAppVersion = useLauncherStore((s) => s.setAppVersion);
  const play = useLauncherStore((s) => s.play);
  const refreshUser = useAuthStore((s) => s.refresh);
  const loadSettings = useSettingsStore((s) => s.load);
  const settings = useSettingsStore((s) => s.settings);
  const startLogCapture = useLogStore((s) => s.startCapture);
  const autoLaunchFired = useRef(false);

  useEffect(() => {
    refreshUser();
    loadSettings();
    startLogCapture();
    bridge.getVersion().then((v) => v && setAppVersion(v));
    return bridge.app.onReady(({ version }) => setAppVersion(version));
  }, [setAppVersion, refreshUser, loadSettings, startLogCapture]);

  useEffect(() => {
    if (!autoLaunchFired.current && settings?.autoLaunch) {
      autoLaunchFired.current = true;
      play();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.autoLaunch]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden rounded-2xl bg-bg ring-1 ring-white/[0.04]">
      <AppBackdrop />

      <div className="relative z-10">
        <TitleBar />
      </div>

      <div className="relative z-10 flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto px-5 pb-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: [0.22, 0.8, 0.36, 1] }}
            >
              <Routes location={location}>
                <Route path="/" element={<HomePage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/store" element={<StorePage />} />
                <Route path="/rules" element={<RulesPage />} />
                <Route path="/support" element={<SupportPage />} />
                <Route path="/logs" element={<LogsPage />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <div className="relative z-10">
        <Footer />
      </div>
      <SettingsModal />
      <UpdateToast />
    </div>
  );
}
