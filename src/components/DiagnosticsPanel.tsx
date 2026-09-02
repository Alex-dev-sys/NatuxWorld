import { useState } from 'react';
import { motion } from 'framer-motion';
import { Stethoscope, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { bridge } from '../services/electron-bridge';
import type { DiagnosticCheck } from '../../electron/services/DiagnosticsService';
import { useLang, pick } from '../i18n';

const ru = {
  run: 'Проверить систему',
  running: 'Проверяем…',
  hint: 'Java, место на диске, связь с сайтом и каналом обновлений',
  allOk: 'Всё в порядке — можно играть',
  someFail: 'Есть проблемы (см. ниже)',
};
const en: typeof ru = {
  run: 'Run system check',
  running: 'Checking…',
  hint: 'Java, disk space, site and update channel reachability',
  allOk: 'All good — ready to play',
  someFail: 'Issues found (see below)',
};
const TR = { ru, en };

export function DiagnosticsPanel() {
  const [checks, setChecks] = useState<DiagnosticCheck[] | null>(null);
  const [running, setRunning] = useState(false);
  const t = pick(useLang(), TR);

  const run = async () => {
    setRunning(true);
    setChecks(null);
    try {
      setChecks(await bridge.shell.diagnosticsRun());
    } catch {
      setChecks([]);
    } finally {
      setRunning(false);
    }
  };

  const allOk = checks !== null && checks.length > 0 && checks.every((c) => c.ok);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 rounded-2xl glass p-5"
    >
      <div className="flex items-center gap-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
          <Stethoscope className="h-4 w-4" />
        </div>
        <div>
          <div className="font-display text-xl">{t.run}</div>
          <div className="text-xs text-muted">{t.hint}</div>
        </div>
        <button
          onClick={run}
          disabled={running}
          className="ml-auto flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {running ? t.running : t.run}
        </button>
      </div>
      {checks !== null && (
        <div className="flex flex-col gap-2">
          {checks.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl bg-white/[0.02] px-3 py-2 ring-1 ring-white/[0.04]">
              {c.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                : <XCircle className="h-4 w-4 shrink-0 text-red-400" />}
              <div className="text-sm text-white/85">{c.label}</div>
              {c.detail && <div className="ml-auto text-xs text-muted">{c.detail}</div>}
            </div>
          ))}
          <div className={`text-xs ${allOk ? 'text-success' : 'text-warning'}`}>
            {allOk ? t.allOk : t.someFail}
          </div>
        </div>
      )}
    </motion.div>
  );
}
