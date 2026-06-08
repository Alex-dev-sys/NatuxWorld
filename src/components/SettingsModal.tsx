import { AnimatePresence, motion } from 'framer-motion';
import { X, Cpu, MemoryStick, MonitorPlay, Languages } from 'lucide-react';
import { useEffect } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

export function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const close = useSettingsStore((s) => s.close);
  const settings = useSettingsStore((s) => s.settings);
  const load = useSettingsStore((s) => s.load);
  const update = useSettingsStore((s) => s.update);

  useEffect(() => {
    if (isOpen && !settings) load();
  }, [isOpen, settings, load]);

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
              <div className="font-display text-2xl tracking-wide">НАСТРОЙКИ</div>
              <button
                onClick={close}
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-white/[0.06]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <Row icon={<MemoryStick className="h-4 w-4" />} label="Память (MB)">
                <input
                  type="number"
                  min={1024}
                  max={32768}
                  step={512}
                  value={settings?.memory ?? 4096}
                  onChange={(e) => update({ memory: Number(e.target.value) })}
                  className="w-32 rounded-lg bg-white/[0.04] px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                />
              </Row>
              <Row icon={<MonitorPlay className="h-4 w-4" />} label="Полноэкранный режим">
                <Toggle
                  value={!!settings?.fullscreen}
                  onChange={(v) => update({ fullscreen: v })}
                />
              </Row>
              <Row icon={<Cpu className="h-4 w-4" />} label="JVM аргументы">
                <input
                  type="text"
                  value={settings?.jvmArgs ?? ''}
                  onChange={(e) => update({ jvmArgs: e.target.value })}
                  className="w-72 rounded-lg bg-white/[0.04] px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                />
              </Row>
              <Row icon={<Languages className="h-4 w-4" />} label="Язык">
                <select
                  value={settings?.language ?? 'ru'}
                  onChange={(e) => update({ language: e.target.value as 'ru' | 'en' })}
                  className="rounded-lg bg-white/[0.04] px-2 py-1 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                >
                  <option value="ru">Русский</option>
                  <option value="en">English</option>
                </select>
              </Row>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-white/[0.02] p-3 ring-1 ring-white/[0.04]">
      <div className="flex items-center gap-3 text-sm text-white/85">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        {label}
      </div>
      {children}
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
