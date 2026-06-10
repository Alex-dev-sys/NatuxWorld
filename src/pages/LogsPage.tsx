import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Copy, Check, Trash2, ClipboardCheck } from 'lucide-react';
import { useLogStore } from '../store/useLogStore';
import { useLang, pick } from '../i18n';

const STREAM_COLOR: Record<string, string> = {
  stderr: 'text-red-400',
  forge: 'text-amber-400',
  launcher: 'text-primary',
  stdout: 'text-white/70',
};

const ru = {
  title: 'ЛОГИ',
  autoScroll: 'Автопрокрутка',
  copied: 'Скопировано',
  copyAll: 'Копировать всё',
  clear: 'Очистить',
  empty: 'Логов пока нет. Запусти игру через PLAY — вывод появится здесь.',
  footer: (n: number) => `${n} строк · скопируй и отправь в поддержку при вылете`,
};
const en: typeof ru = {
  title: 'LOGS',
  autoScroll: 'Auto-scroll',
  copied: 'Copied',
  copyAll: 'Copy all',
  clear: 'Clear',
  empty: 'No logs yet. Launch the game via PLAY — output will appear here.',
  footer: (n: number) => `${n} lines · copy and send to support if the game crashes`,
};
const TR = { ru, en };

export function LogsPage() {
  const t = pick(useLang(), TR);
  const lines = useLogStore((s) => s.lines);
  const clear = useLogStore((s) => s.clear);
  const asText = useLogStore((s) => s.asText);
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, autoScroll]);

  const copyAll = async () => {
    await navigator.clipboard.writeText(asText());
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl tracking-wide">{t.title}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 transition ${
              autoScroll ? 'bg-primary/15 text-primary' : 'text-muted hover:text-white'
            }`}
          >
            {t.autoScroll}
          </button>
          <button
            onClick={copyAll}
            disabled={lines.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/10 transition hover:bg-white/[0.08] disabled:opacity-40"
          >
            {copied ? <ClipboardCheck className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? t.copied : t.copyAll}
          </button>
          <button
            onClick={clear}
            disabled={lines.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-muted ring-1 ring-white/10 transition hover:text-red-400 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t.clear}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-2xl bg-black/40 p-4 font-mono text-[12px] leading-relaxed ring-1 ring-white/[0.06]">
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted">
            {t.empty}
          </div>
        ) : (
          <>
            {lines.map((l) => (
              <div key={l.id} className={`whitespace-pre-wrap break-all ${STREAM_COLOR[l.stream] ?? 'text-white/70'}`}>
                <span className="select-none text-white/25">[{l.stream}] </span>
                {l.line}
              </div>
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted">
        {copied ? <Check className="h-3.5 w-3.5 text-success" /> : null}
        {t.footer(lines.length)}
      </div>
    </motion.div>
  );
}
