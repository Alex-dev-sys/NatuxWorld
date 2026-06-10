import { AnimatePresence, motion } from 'framer-motion';
import { X, Cpu, MemoryStick, MonitorPlay, Coffee, FolderOpen, Check, Languages, RefreshCw, Rocket, Trash2, FileText } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { bridge } from '../services/electron-bridge';
import { useSettingsStore } from '../store/useSettingsStore';
import { useLauncherStore } from '../store/useLauncherStore';

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  const settings = useSettingsStore((s) => s.settings);
  const saving = useSettingsStore((s) => s.saving);
  const load = useSettingsStore((s) => s.load);
  const loadSystem = useSettingsStore((s) => s.loadSystem);

  const [tab, setTab] = useState<'game' | 'launcher'>('game');

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
                <div className="font-display text-2xl tracking-wide">НАСТРОЙКИ</div>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {saving ? (
                    <>
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                      Сохранение…
                    </>
                  ) : (
                    <>
                      <Check className="h-3 w-3 text-success" />
                      Сохранено
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
              {(['game', 'launcher'] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                    tab === t ? 'bg-white/[0.05] text-white' : 'text-muted hover:text-white'
                  }`}>
                  {t === 'game' ? 'Игра' : 'Лаунчер'}
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
  const memory = settings?.memory ?? 4096;
  const maxMem = Math.floor(systemMemoryMb / 512) * 512;
  const res = settings?.resolution ?? { width: 1280, height: 720 };
  const isPreset = PRESETS.some((p) => p.w === res.width && p.h === res.height);

  const verifyJava = async () => {
    if (!settings?.javaPath) return;
    const r = await bridge.settings.verifyJava({ path: settings.javaPath });
    alert(r.ok ? `Java OK: ${r.version}` : `Ошибка: ${r.error}`);
  };
  const pickJava = async () => {
    const p = await bridge.settings.pickJava();
    if (p) update({ javaPath: p, javaMode: 'custom' });
  };

  return (
    <>
      <Row icon={<MemoryStick className="h-4 w-4" />} label="Память для игры" hint={`${(memory / 1024).toFixed(1)} GB из ${(systemMemoryMb / 1024).toFixed(0)} GB`}>
        <input type="range" min={1024} max={maxMem} step={512} value={Math.min(memory, maxMem)}
          onChange={(e) => update({ memory: Number(e.target.value) })} className="w-56 accent-primary" />
      </Row>

      <Row icon={<Coffee className="h-4 w-4" />} label="Java" stacked>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(['bundled', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => update({ javaMode: m })}
                className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${settings?.javaMode === m ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
                {m === 'bundled' ? 'Встроенный JRE 21' : 'Свой путь'}
              </button>
            ))}
          </div>
          {settings?.javaMode === 'custom' && (
            <div className="flex items-center gap-2">
              <input readOnly value={settings?.javaPath ?? ''} placeholder="Путь к java(w).exe"
                className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10" />
              <button onClick={pickJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">
                <FolderOpen className="h-4 w-4" />
              </button>
              <button onClick={verifyJava} className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Проверить</button>
            </div>
          )}
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Разрешение окна" stacked>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button key={`${p.w}x${p.h}`} onClick={() => update({ resolution: { width: p.w, height: p.h } })}
              className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${res.width === p.w && res.height === p.h ? 'bg-primary/15 text-primary' : 'text-muted'}`}>
              {p.w}×{p.h}
            </button>
          ))}
          <button onClick={() => update({ resolution: { width: 1366, height: 768 } })}
            className={`rounded-lg px-3 py-1.5 text-xs ring-1 ring-white/10 ${!isPreset ? 'bg-primary/15 text-primary' : 'text-muted'}`}>Своё</button>
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

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Полноэкранный режим" hint={settings?.fullscreen ? 'Разрешение игнорируется' : 'Оконный режим'}>
        <Toggle value={!!settings?.fullscreen} onChange={(v) => update({ fullscreen: v })} />
      </Row>

      <Row icon={<Cpu className="h-4 w-4" />} label="JVM аргументы" stacked>
        <div className="flex items-center gap-2">
          <input type="text" value={settings?.jvmArgs ?? ''} onChange={(e) => update({ jvmArgs: e.target.value })}
            className="flex-1 rounded-lg bg-white/[0.04] px-3 py-2 font-mono text-xs ring-1 ring-white/10 focus:outline-none focus:ring-primary" />
          <button onClick={() => update({ jvmArgs: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC' })}
            className="rounded-lg bg-white/[0.06] px-3 py-2 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Сбросить</button>
        </div>
      </Row>

      <Row icon={<MonitorPlay className="h-4 w-4" />} label="Закрывать лаунчер при запуске" hint="Освобождает ОЗУ">
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

  return (
    <>
      <Row icon={<Languages className="h-4 w-4" />} label="Язык интерфейса">
        <select value={settings?.language ?? 'ru'} onChange={(e) => update({ language: e.target.value as 'ru' | 'en' })}
          className="rounded-lg bg-white/[0.04] px-3 py-1.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary">
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </Row>

      <Row icon={<RefreshCw className="h-4 w-4" />} label="Авто-обновление" hint="Применится при следующем запуске">
        <Toggle value={settings?.autoUpdate ?? true} onChange={(v) => update({ autoUpdate: v })} />
      </Row>

      <Row icon={<Rocket className="h-4 w-4" />} label="Автозапуск игры" hint="Сразу нажимать ИГРАТЬ при старте">
        <Toggle value={!!settings?.autoLaunch} onChange={(v) => update({ autoLaunch: v })} />
      </Row>

      <Row icon={<FileText className="h-4 w-4" />} label="Логи" hint="Открыть страницу логов">
        <button onClick={() => { close(); navigate('/logs'); }}
          className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-white/[0.1]">Открыть</button>
      </Row>

      <Row icon={<Trash2 className="h-4 w-4" />} label="Сбросить настройки" hint={`Версия лаунчера ${appVersion}`}>
        {confirm ? (
          <div className="flex gap-2">
            <button onClick={() => { reset(); setConfirm(false); }} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-white">Точно</button>
            <button onClick={() => setConfirm(false)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs ring-1 ring-white/10">Отмена</button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} className="rounded-lg bg-white/[0.06] px-3 py-1.5 text-xs text-red-400 ring-1 ring-white/10 hover:bg-white/[0.1]">Сбросить</button>
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
