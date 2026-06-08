import { useEffect } from 'react';
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
import { bridge } from './services/electron-bridge';
import { useLauncherStore } from './store/useLauncherStore';
import { useAuthStore } from './store/useAuthStore';

export default function App() {
  const location = useLocation();
  const setAppVersion = useLauncherStore((s) => s.setAppVersion);
  const refreshUser = useAuthStore((s) => s.refresh);

  useEffect(() => {
    refreshUser();
    return bridge.app.onReady(({ version }) => setAppVersion(version));
  }, [setAppVersion, refreshUser]);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden rounded-2xl bg-bg ring-1 ring-white/[0.04]">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-30" />
      <div className="pointer-events-none absolute -top-32 left-1/4 h-96 w-[480px] rounded-full bg-primary/20 blur-[140px]" />

      <TitleBar />

      <div className="relative flex flex-1 overflow-hidden">
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
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <Footer />
      <SettingsModal />
      <UpdateToast />
    </div>
  );
}
