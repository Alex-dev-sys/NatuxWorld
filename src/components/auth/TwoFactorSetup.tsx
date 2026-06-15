import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { bridge } from '../../services/electron-bridge';
import { useAccountStore } from '../../store/useAccountStore';

type Step = 'loading' | 'scan' | 'done' | 'error';

// Modal: turn on TOTP 2FA. Scan the QR in Google Authenticator, confirm a code, save
// the backup codes. Enabling invalidates the current session server-side, so on close
// we log the user out → they sign back in through the new 2FA step.
export function TwoFactorSetup({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const logout = useAccountStore((s) => s.logout);

  useEffect(() => {
    (async () => {
      const res = await bridge.account.twoFactorSetup();
      if (res.ok) {
        setQr(res.data.qr);
        const m = /secret=([A-Z2-7]+)/.exec(res.data.otpauthUri);
        setSecret(m?.[1] ?? '');
        setStep('scan');
      } else { setError(res.error.message); setStep('error'); }
    })();
  }, []);

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const res = await bridge.account.twoFactorEnable({ code: code.trim() });
      if (res.ok) { setCodes(res.data.backupCodes); setStep('done'); }
      else setError(res.error.message);
    } finally { setBusy(false); }
  };

  // After enabling, the old session is dead — force re-login on close.
  const finish = async () => { await logout(); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-[400px] rounded-2xl glass-strong p-6 shadow-premium"
      >
        <button onClick={step === 'done' ? finish : onClose} className="absolute right-4 top-4 text-muted hover:text-white">
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 font-display text-2xl tracking-wide">
          <ShieldCheck className="h-5 w-5 text-primary" /> 2FA
        </div>

        {step === 'loading' && <div className="mt-6 text-sm text-muted">Загрузка…</div>}
        {step === 'error' && <div className="mt-6 text-sm text-primary">{error ?? 'Ошибка'}</div>}

        {step === 'scan' && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="text-xs text-muted">Отсканируйте QR в Google Authenticator (или введите ключ вручную), затем введите код.</div>
            {qr && <img src={qr} alt="QR" width={180} height={180} className="mx-auto rounded-lg bg-white p-2" />}
            {secret && <div className="text-center font-mono text-[11px] text-muted">{secret}</div>}
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-значный код"
              onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 6 && !busy && confirm()}
              className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm tracking-widest ring-1 ring-white/10 focus:outline-none focus:ring-primary"
            />
            {error && <div className="text-xs text-primary">{error}</div>}
            <button
              disabled={code.trim().length < 6 || busy}
              onClick={confirm}
              className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
            >
              ВКЛЮЧИТЬ
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="text-sm text-success">2FA включена.</div>
            <div className="text-xs text-muted">Сохраните резервные коды — показаны один раз. Каждый работает однократно, если потеряете телефон.</div>
            <ul className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-3 font-mono text-xs ring-1 ring-white/10">
              {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <button onClick={finish} className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow">
              ГОТОВО (войти заново)
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
