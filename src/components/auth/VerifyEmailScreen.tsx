import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MailCheck, ArrowLeft } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { isValidCode } from '../../lib/validators';

const RESEND_COOLDOWN = 30;

export function VerifyEmailScreen() {
  const verify = useAccountStore((s) => s.verify);
  const resend = useAccountStore((s) => s.resend);
  const cancelVerify = useAccountStore((s) => s.cancelVerify);
  const email = useAccountStore((s) => s.pendingEmail);
  const error = useAccountStore((s) => s.error);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    try {
      await verify(code);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1 && timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return c - 1;
      });
    }, 1000);
    await resend();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">ПОДТВЕРЖДЕНИЕ</div>
      <div className="mt-2 text-xs text-muted">Код отправлен на {email}</div>
      <div className="mt-5 flex flex-col gap-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="6-значный код"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-center font-mono text-lg tracking-[0.4em] ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button
          disabled={!isValidCode(code) || busy}
          onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
        >
          <MailCheck className="h-4 w-4" /> ПОДТВЕРДИТЬ
        </button>
        <button
          onClick={handleResend}
          disabled={cooldown > 0}
          className="text-xs text-muted hover:text-white disabled:opacity-40 disabled:hover:text-muted"
        >
          {cooldown > 0 ? `Отправить повторно (${cooldown}с)` : 'Отправить код повторно'}
        </button>
        <button
          onClick={cancelVerify}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-muted hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Изменить email
        </button>
      </div>
    </motion.div>
  );
}
