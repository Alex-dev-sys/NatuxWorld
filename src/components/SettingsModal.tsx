import { AnimatePresence, motion } from 'framer-motion';
import { X, Cpu, MemoryStick, MonitorPlay, Coffee, FolderOpen, Check, Languages, RefreshCw, Rocket, Trash2, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bridge } from '../services/electron-bridge';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLauncherStore } from '../store/useLauncherStore';
import { useLang, pick } from '../i18n';

// `ru` is the source of truth for the dict shape; `en: typeof ru` forces key parity
// and widens every value to its base type (string / fn) so pick<T> can unify both
// branches. Do NOT add `as const` — it narrows to mismatched string literals and
// pick() stops type-checking ("SETTINGS" not assignable to "НАСТРОЙКИ").
const ru = {
  title: 'НАСТРОЙКИ', saving: 'Сохранение…', saved: 'Сохранено',
  tabGame: 'Игра', tabLauncher: 'Лаунчер',
  memory: 'Память для игры', memoryHint: (g: string, t: string) => `${g} GB из ${t} GB`,
  java: 'Java', javaBundled: 'Встроенный JRE 21', javaCustom: 'Свой путь',
  javaPathPh: 'Путь к java(w).exe', verify: 'Проверить',
  javaOk: (v: string) => `Java OK: ${v}`, javaErr: (e: string) => `Ошибка: ${e}`,
  resolution: 'Разрешение окна', custom: 'Своё',
  fullscreen: 'Полноэкранный режим', fullscreenOn: 'Разрешение игнорируется', fullscreenOff: 'Оконный режим',
  jvm: 'JVM аргументы', reset: 'Сбросить',
  closeOnLaunch: 'Закрывать лаунчер при запуске', closeOnLaunchHint: 'Освобождает ОЗУ',
  language: 'Язык интерфейса',
  autoUpdate: 'Авто-обновление', autoUpdateHint: 'Применится при следующем запуске',
  autoLaunch: 'Автозапуск игры', autoLaunchHint: 'Сразу нажимать ИГРАТЬ при старте',
  logs: 'Логи', logsHint: 'Открыть страницу логов', open: 'Открыть',
  resetSettings: 'Сбросить настройки', version: (v: string) => `Версия лаунчера ${v}`,
  confirm: 'Точно', cancel: 'Отмена',
};

const en: typeof ru = {
  title: 'SETTINGS', saving: 'Saving…', saved: 'Saved',
  tabGame: 'Game', tabLauncher: 'Launcher',
  memory: 'Game memory', memoryHint: (g: string, t: string) => `${g} GB of ${t} GB`,
  java: 'Java', javaBundled: 'Bundled JRE 21', javaCustom: 'Custom path',
  javaPathPh: 'Path to java(w).exe', verify: 'Verify',
  javaOk: (v: string) => `Java OK: ${v}`, javaErr: (e: string) => `Error: ${e}`,
  resolution: 'Window resolution', custom: 'Custom',
  fullscreen: 'Fullscreen', fullscreenOn: 'Resolution ignored', fullscreenOff: 'Windowed',
  jvm: 'JVM arguments', reset: 'Reset',
  closeOnLaunch: 'Close launcher on launch', closeOnLaunchHint: 'Frees up RAM',
  language: 'Interface language',
  autoUpdate: 'Auto-update', autoUpdateHint: 'Applied on next start',
  autoLaunch: 'Auto-launch game', autoLaunchHint: 'Press PLAY automatically on start',
  logs: 'Logs', logsHint: 'Open the logs page', open: 'Open',
  resetSettings: 'Reset settings', version: (v: string) => `Launcher version ${v}`,
  confirm: 'Confirm', cancel: 'Cancel',
};

const TR = { ru, en };

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  const settings = useSettingsStore((s) => s.settings);
  const saving = useSettingsStore((s) => s.saving);
  const load = useSettingsStore((s) => s.load);
  const loadSystem = useSettingsStore((s) => s.loadSystem);

  const [tab, setTab] = useState<'game' | 'launcher'>('game');
  const t = pick(useLang(), TR);

  useEffect(() => {
    if (isOpen && !settings) load();
    if (isOpen) loadSystem();
  }, [isOpen, settings, load, loadSystem]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[60] grid place-items-center bg-black/70 backdrop-blur-md"
          onClick={close}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-[640px] max-w-[90vw] overflow-hidden rounded-2xl glass-strong shadow-premium"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="font-display text-2xl tracking-wide">{t.title}</div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {saving ? (
                    <>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                      {t.saving}
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      {t.saved}
                    </>
                  )}
                </span>
              </div>
              <button
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex gap-1 border-b border-white/[0.06] px-5 pt-3">
              {(['game', 'launcher'] as const).map((tk) => (
                <button key={tk} onClick={() => setTab(tk)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                    tab === tk ? 'bg-white/[0.05] text-white' : 'text-muted hover:text-white'
                  }`}>
                  {tk === 'game' ? t.tabGame : t.tabLauncher}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 p-5">
              {tab === 'game' ? <GameTab /> : <LauncherTab />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const PRESETS = [
  { w: 1280, h: 720 }, { w: 1600, h: 900 }, { w: 1920, h: 1080 },
];

function GameTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const systemMemoryMb = useSettingsStore((s) => s.systemMemoryMb);
  const t = pick(useLang(), TR);
  const memory = settings?.memory ?? 4096;
  const maxMem = Math.floor(systemMemoryMb / 512) * 512;
  const res = settings?.resolution ?? { width: 1280, height: 720 };
  const isPreset = PRESETS.some((p) => p.w === res.width && p.h === res.height);
  const [javaResult, setJavaResult] = useState<{ ok: boolean; text: string } | null>(null);

  const verifyJava = async () => {
    if (!settings?.javaPath) return;
    try {
      const r = await bridge.settings.verifyJava({ path: settings.javaPath });
      setJavaResult(
        r.ok
          ? { ok: true, text: t.javaOk(String(r.version ?? '')) }
          : { ok: false, text: t.javaErr(String(r.error ?? '')) },
      );
    } catch (e) {
      setJavaResult({ ok: false, text: t.javaErr(String((e as Error)?.message ?? '')) });
    }
  };
  const pickJava = async () => {
    const p = await bridge.settings.pickJava();
    if (p) update({ javaPath: p, javaMode: 'custom' });
  };

  return (
    <>
      <Row icon={<MemoryStick className="h-4 w-4" />} label={t.memory} hint={t.memoryHint((memory / 1024).toFixed(1), (systemMemoryMb / 1024).toFixed(0))}>
        <input type="range" min={1024} max={maxMem} step={512} value={Math.min(memory, maxMem)}
          onChange={(e) => update({ memory: Number(e.target.value) })} className="w-56 accent-primary" />
      </Row>

      <Row icon={<Coffee className="h-4 w-4" />} label={t.java} stacked>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(['bundled', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => update({ javaMode: m })}
                className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${settings?.javaMode === m ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {m === 'bundled' ? t.javaBundled : t.javaCustom}
              </button>
            ))}
          </div>
          {settings?.javaMode === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <input readOnly value={settings?.javaPath ?? ''} placeholder={t.javaPathPh}
                  className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10" />
                <button onClick={pickJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">
                  <FolderOpen className="h-4 w-4" />
                </button>
                <button onClick={verifyJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">{t.verify}</button>
              </div>
              {javaResult && (
                <div className={`text-xs ${javaResult.ok ? 'text-success' : 'text-red-400'}`}>
                  {javaResult.text}
                </div>
              )}
            </>
          )}
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label={t.resolution} stacked>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={`${p.w}x${p.h}`} onClick={() => update({ resolution: { width: p.w, height: p.h } })}
              className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${res.width === p.w && res.height === p.h ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
              {p.w}×{p.h}
            </button>
          ))}
          <button onClick={() => update({ resolution: { width: 1366, height: 768 } })}
            className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${!isPreset ? 'bg-primary/15 text-primary' : 'text-muted'}`}>{t.custom}</button>
          {!isPreset && (
            <div className="flex items-center gap-1">
              <input type="number" min={640} value={res.width} onChange={(e) => update({ resolution: { ...res, width: Math.max(640, Number(e.target.value)) } })}
                className="w-20 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs ring-1 ring-white/10" />
              <span className="text-muted">×</span>
              <input type="number" min={480} value={res.height} onChange={(e) => update({ resolution: { ...res, height: Math.max(480, Number(e.target.value)) } })}
                className="w-20 rounded-lg bg-white/[0.04] px-2 py-1.5 text-xs ring-1 ring-white/10" />
            </div>
          )}
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label={t.fullscreen} hint={settings?.fullscreen ? t.fullscreenOn : t.fullscreenOff}>
        <Toggle value={!!settings?.fullscreen} onChange={(v) => update({ fullscreen: v })} />
      </Row>

      <Row icon={<Cpu className="h-4 w-4" />} label={t.jvm} stacked>
        <div className="flex items-center gap-2">
          <input type="text" value={settings?.jvmArgs ?? ''} onChange={(e) => update({ jvmArgs: e.target.value })}
            className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
          <button onClick={() => update({ jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC' })}
            className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">{t.reset}</button>
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label={t.closeOnLaunch} hint={t.closeOnLaunchHint}>
        <Toggle value={!!settings?.closeOnLaunch} onChange={(v) => update({ closeOnLaunch: v })} />
      </Row>
    </>
  );
}

function LauncherTab() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const reset = useSettingsStore((s) => s.reset);
  const close = useSettingsStore((s) => s.close);
  const appVersion = useLauncherStore((s) => s.appVersion);
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const t = pick(useLang(), TR);

  return (
    <>
      <Row icon={<Languages className="h-4 w-4" />} label={t.language}>
        <select value={settings?.language ?? 'ru'} onChange={(e) => update({ language: e.target.value as 'ru' | 'en' })}
          className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary">
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </Row>

      <Row icon={<RefreshCw className="h-4 w-4" />} label={t.autoUpdate} hint={t.autoUpdateHint}>
        <Toggle value={settings?.autoUpdate ?? true} onChange={(v) => update({ autoUpdate: v })} />
      </Row>

      <Row icon={<Rocket className="h-4 w-4" />} label={t.autoLaunch} hint={t.autoLaunchHint}>
        <Toggle value={!!settings?.autoLaunch} onChange={(v) => update({ autoLaunch: v })} />
      </Row>

      <Row icon={<FileText className="h-4 w-4" />} label={t.logs} hint={t.logsHint}>
        <button onClick={() => { close(); navigate('/logs'); }}
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">{t.open}</button>
      </Row>

      <Row icon={<Trash2 className="h-4 w-4" />} label={t.resetSettings} hint={t.version(appVersion)}>
        {confirm ? (
          <div className="flex gap-2">
            <button onClick={() => { reset(); setConfirm(false); }} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white">{t.confirm}</button>
            <button onClick={() => setConfirm(false)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10">{t.cancel}</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-red-400 ring-1 ring-white/10 hover:bg-white/[0.1]">{t.reset}</button>
        )}
      </Row>
    </>
  );
}

function Row({
  icon,
  label,
  hint,
  stacked,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04] ${
        stacked ? 'flex flex-col gap-3' : 'flex items-center justify-between gap-4'
      }`}
    >
      <div className="flex items-center gap-3 text-sm text-white/85">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="leading-tight">
          <div>{label}</div>
          {hint && <div className="text-[11px] text-muted">{hint}</div>}
        </div>
      </div>
      <div className={stacked ? 'w-full' : 'shrink-0'}>{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 rounded-full transition ${
        value ? 'bg-primary shadow-glow' : 'bg-white/[0.08]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
          value ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
