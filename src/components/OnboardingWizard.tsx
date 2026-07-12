import { Check, ChevronLeft, ChevronRight, Cpu, Loader2, MemoryStick, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { bridge } from '../services/electron-bridge';
import { useSettingsStore } from '../store/useSettingsStore';
import type { JavaInstallation } from '../../electron/services/JavaService';

type Step = 0 | 1 | 2;

function memoryBounds(systemMemoryMb: number) {
  // Keep at least 2 GB for Windows/macOS and cap the launcher UI at 8 GB. On tiny
  // machines the range still stays usable instead of displaying an invalid slider.
  const available = Math.floor(Math.max(1024, systemMemoryMb - 2048) / 512) * 512;
  const max = Math.max(1024, Math.min(8192, available));
  return { min: Math.min(2048, max), max };
}

export function OnboardingWizard() {
  const settings = useSettingsStore((s) => s.settings);
  const systemMemoryMb = useSettingsStore((s) => s.systemMemoryMb);
  const loadSystem = useSettingsStore((s) => s.loadSystem);
  const update = useSettingsStore((s) => s.update);
  const saving = useSettingsStore((s) => s.saving);
  const [step, setStep] = useState<Step>(0);
  const [java, setJava] = useState<JavaInstallation | null | undefined>(undefined);
  const [memory, setMemory] = useState(settings?.memory ?? 4096);
  const [crashReports, setCrashReports] = useState(settings?.crashReports ?? false);
  const { min, max } = useMemo(() => memoryBounds(systemMemoryMb), [systemMemoryMb]);

  useEffect(() => {
    void loadSystem();
    void bridge.java.detect().then(setJava).catch(() => setJava(null));
  }, [loadSystem]);

  useEffect(() => {
    setMemory((current) => Math.max(min, Math.min(max, current)));
  }, [min, max]);

  if (!settings || settings.onboardingCompleted) return null;

  const finish = async () => {
    await update({ memory, crashReports, onboardingCompleted: true });
  };

  const stepTitle = ['Добро пожаловать', 'Настроим игру', 'Ваша приватность'][step];

  return (
    <div className="absolute inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-5 backdrop-blur-md">
      <motion.section
        initial={{ opacity: 0, scale: 0.97, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.8, 0.36, 1] }}
        className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-white/10 bg-[#11131d]/95 shadow-2xl"
      >
        <div className="h-1 bg-white/5">
          <motion.div className="h-full bg-primary" animate={{ width: `${((step + 1) / 3) * 100}%` }} />
        </div>
        <div className="p-7">
          <div className="mb-6 flex items-center gap-3 text-primary">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/25">
              {step === 0 ? <Sparkles className="h-5 w-5" /> : step === 1 ? <Cpu className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted">Первый запуск · {step + 1}/3</p>
              <h1 className="font-display text-xl tracking-wide text-white">{stepTitle}</h1>
            </div>
          </div>

          {step === 0 && (
            <div className="space-y-4 text-sm leading-6 text-muted">
              <p>Сейчас за минуту подготовим лаунчер к игре. Все параметры позже можно изменить в настройках.</p>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="mb-1 flex items-center gap-2 font-medium text-white"><Cpu className="h-4 w-4 text-primary" /> Java 21</div>
                {java === undefined ? (
                  <div className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Проверяем компьютер…</div>
                ) : java ? (
                  <p>Готово: найдена Java {java.version} ({java.vendor === 'Temurin' ? 'встроенная' : 'системная'}).</p>
                ) : (
                  <p>Java не найдена. При первом нажатии «Играть» лаунчер сам скачает проверенную Java 21.</p>
                )}
              </div>
              <p className="text-xs text-muted/80">Не нужно искать Java или Forge вручную — лаунчер сделает это сам.</p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5 text-sm text-muted">
              <p>Сколько памяти выделить Minecraft? Это влияет на стабильность игры, но не делает её быстрее бесконечно.</p>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5">
                <div className="mb-4 flex items-end justify-between">
                  <div className="flex items-center gap-2 text-white"><MemoryStick className="h-4 w-4 text-primary" /> Память для игры</div>
                  <strong className="font-display text-2xl text-primary">{(memory / 1024).toFixed(memory % 1024 === 0 ? 0 : 1)} ГБ</strong>
                </div>
                <input
                  aria-label="Память для Minecraft"
                  type="range"
                  min={min}
                  max={max}
                  step="512"
                  value={memory}
                  onChange={(event) => setMemory(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
                <div className="mt-2 flex justify-between text-xs text-muted"><span>{(min / 1024).toFixed(min % 1024 === 0 ? 0 : 1)} ГБ</span><span>На компьютере: {(systemMemoryMb / 1024).toFixed(1)} ГБ</span><span>{(max / 1024).toFixed(max % 1024 === 0 ? 0 : 1)} ГБ</span></div>
              </div>
              <p className="text-xs text-muted/80">Оставим системе минимум 2 ГБ. Для большинства игроков достаточно 4 ГБ.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 text-sm leading-6 text-muted">
              <p>Если игра или лаунчер вылетит, можно анонимно отправить технический отчёт — это помогает находить и исправлять ошибки.</p>
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <p className="font-medium text-white">Что отправляется</p>
                <p className="mt-1 text-xs">Версия лаунчера, система, стадия ошибки и последние строки технического лога. Ник, пароль и токен аккаунта не отправляются.</p>
              </div>
              <button
                type="button"
                onClick={() => setCrashReports((value) => !value)}
                className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-colors ${crashReports ? 'border-primary/50 bg-primary/10' : 'border-white/[0.08] bg-white/[0.03]'}`}
              >
                <span><span className="block font-medium text-white">Анонимные отчёты о крашах</span><span className="block text-xs">{crashReports ? 'Включены — спасибо за помощь' : 'Выключены — можно включить позже'}</span></span>
                <span className={`grid h-6 w-6 place-items-center rounded-full ${crashReports ? 'bg-primary text-white' : 'bg-white/10 text-transparent'}`}><Check className="h-4 w-4" /></span>
              </button>
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            {step > 0 ? (
              <button type="button" onClick={() => setStep((step - 1) as Step)} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-muted hover:bg-white/[0.06] hover:text-white"><ChevronLeft className="h-4 w-4" /> Назад</button>
            ) : <span />}
            {step < 2 ? (
              <button type="button" onClick={() => setStep((step + 1) as Step)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow hover:bg-primary-glow">Продолжить <ChevronRight className="h-4 w-4" /></button>
            ) : (
              <button type="button" disabled={saving} onClick={() => void finish()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-glow disabled:cursor-wait disabled:opacity-70">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Готово</button>
            )}
          </div>
        </div>
      </motion.section>
    </div>
  );
}
