import { useState } from 'react';
import { motion } from 'framer-motion';
import { MailCheck } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { isValidCode } from '../../lib/validators';

export function VerifyEmailScreen() {
  const verify = useAccountStore((s) => s.verify);
  const resend = useAccountStore((s) => s.resend);
  const email = useAccountStore((s) => s.pendingEmail);
  const error = useAccountStore((s) => s.error);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await verify(code);
    setBusy(false);
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
        <button onClick={resend} className="text-xs text-muted hover:text-white">
          Отправить код повторно
        </button>
      </div>
    </motion.div>
  );
}
