import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, X } from 'lucide-react';
import { bridge } from '../../services/native-bridge';
import { useAccountStore } from '../../store/useAccountStore';
import { pick, useLang } from '../../i18n';

type Step = 'verify-current' | 'loading' | 'scan' | 'done' | 'error';

const ru = {
    title: 'Двухфакторная защита',
    loading: 'Загрузка…',
    error: 'Ошибка',
    networkError: 'Ошибка сети',
    initialError: 'Не удалось начать настройку. Попробуйте ещё раз.',
    currentFactor: 'Введите код из текущего приложения или резервный код, чтобы подтвердить замену.',
    currentCodePlaceholder: 'Текущий код или резервный код',
    continue: 'ПРОДОЛЖИТЬ',
    checking: 'ПРОВЕРКА…',
    scan: 'Отсканируйте QR в Google Authenticator (или введите ключ вручную), затем введите код.',
    secretLabel: 'Ключ для ручного ввода',
    newCodePlaceholder: 'Код нового приложения',
    enable: 'ВКЛЮЧИТЬ',
    replace: 'ЗАМЕНИТЬ',
    enabled: '2FA включена.',
    replaced: 'Приложение 2FA заменено.',
    backupCodes: 'Сохраните резервные коды — показаны один раз. Каждый работает однократно, если потеряете телефон.',
    finish: 'ГОТОВО (войти заново)',
    retry: 'ПОВТОРИТЬ',
    close: 'Закрыть',
};
const en: typeof ru = {
    title: 'Two-factor security',
    loading: 'Loading…',
    error: 'Error',
    networkError: 'Network error',
    initialError: 'Could not start setup. Try again.',
    currentFactor: 'Enter a code from your current authenticator or a backup code to confirm the replacement.',
    currentCodePlaceholder: 'Current or backup code',
    continue: 'CONTINUE',
    checking: 'CHECKING…',
    scan: 'Scan the QR code in Google Authenticator (or enter the key manually), then enter a code.',
    secretLabel: 'Manual setup key',
    newCodePlaceholder: 'New authenticator code',
    enable: 'ENABLE',
    replace: 'REPLACE',
    enabled: 'Two-factor authentication is enabled.',
    replaced: 'Authenticator app replaced.',
    backupCodes: 'Save these backup codes. They are shown once and each can be used only once if you lose your phone.',
    finish: 'DONE (sign in again)',
    retry: 'RETRY',
    close: 'Close',
};
const COPY = { ru, en };

// Modal: turn on TOTP 2FA. Scan the QR in Google Authenticator, confirm a code, save
// the backup codes. Enabling invalidates the current session server-side, so on close
// we log the user out → they sign back in through the new 2FA step.
export function TwoFactorSetup({ onClose, reconfigure = false }: { onClose: () => void; reconfigure?: boolean }) {
  const [step, setStep] = useState<Step>(reconfigure ? 'verify-current' : 'loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>('');
  const [currentCode, setCurrentCode] = useState('');
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestBusy = useRef(false);
  const logout = useAccountStore((s) => s.logout);
  const t = pick(useLang(), COPY);

  const requestSetup = useCallback(async (stepUpCode?: string) => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = reconfigure
        ? await bridge.account.twoFactorSetup({ code: stepUpCode?.trim() })
        : await bridge.account.twoFactorSetup();
      if (res.ok) {
        setQr(res.data.qr);
        const m = /secret=([A-Z2-7]+)/.exec(res.data.otpauthUri);
        setSecret(m?.[1] ?? '');
        setCurrentCode('');
        setStep('scan');
      } else {
        setError(res.error.message);
        if (!reconfigure) setStep('error');
      }
    } catch {
      setError(t.networkError);
      if (!reconfigure) setStep('error');
    } finally {
      requestBusy.current = false;
      setBusy(false);
    }
  }, [reconfigure, t]);

  useEffect(() => {
    if (!reconfigure) void requestSetup();
  }, [reconfigure, requestSetup]);

  const confirm = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await bridge.account.twoFactorEnable({ code: code.trim() });
      if (res.ok) { setCodes(res.data.backupCodes); setStep('done'); }
      else setError(res.error.message);
    } catch {
      setError(t.networkError);
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
        <button
          aria-label={t.close}
          onClick={step === 'done' ? finish : onClose}
          className="absolute right-4 top-4 text-muted hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 font-display text-2xl tracking-wide">
          <ShieldCheck className="h-5 w-5 text-primary" /> {t.title}
        </div>

        {step === 'loading' && <div className="mt-6 text-sm text-muted">{t.loading}</div>}
        {step === 'error' && (
          <div className="mt-6 flex flex-col gap-3 text-sm text-primary">
            <div>{error ?? t.initialError ?? t.error}</div>
            <button
              disabled={busy}
              onClick={() => void requestSetup()}
              className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white disabled:opacity-40"
            >
              {t.retry}
            </button>
          </div>
        )}

        {step === 'verify-current' && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="text-xs text-muted">{t.currentFactor}</div>
            <input
              autoFocus
              autoComplete="one-time-code"
              value={currentCode}
              maxLength={64}
              onChange={(event) => setCurrentCode(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && currentCode.trim() && !busy && void requestSetup(currentCode)}
              placeholder={t.currentCodePlaceholder}
              className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm tracking-widest ring-1 ring-white/10 focus:outline-none focus:ring-primary"
            />
            {error && <div className="text-xs text-primary" role="alert">{error}</div>}
            <button
              disabled={!currentCode.trim() || busy}
              onClick={() => void requestSetup(currentCode)}
              className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
            >
              {busy ? t.checking : t.continue}
            </button>
          </div>
        )}

        {step === 'scan' && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="text-xs text-muted">{t.scan}</div>
            {qr && <img src={qr} alt="QR" width={180} height={180} className="mx-auto rounded-lg bg-white p-2" />}
            {secret && (
              <div className="text-center">
                <div className="mb-1 text-[10px] text-muted">{t.secretLabel}</div>
                <div className="font-mono text-[11px] text-muted">{secret}</div>
              </div>
            )}
            <input
              autoFocus
              autoComplete="one-time-code"
              value={code}
              maxLength={64}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t.newCodePlaceholder}
              onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 6 && !busy && confirm()}
              className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm tracking-widest ring-1 ring-white/10 focus:outline-none focus:ring-primary"
            />
            {error && <div className="text-xs text-primary">{error}</div>}
            <button
              disabled={code.trim().length < 6 || busy}
              onClick={confirm}
              className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
            >
              {reconfigure ? t.replace : t.enable}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="text-sm text-success">{reconfigure ? t.replaced : t.enabled}</div>
            <div className="text-xs text-muted">{t.backupCodes}</div>
            <ul className="grid grid-cols-2 gap-1 rounded-lg bg-white/[0.04] p-3 font-mono text-xs ring-1 ring-white/10">
              {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <button onClick={finish} className="rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow">
              {t.finish}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
