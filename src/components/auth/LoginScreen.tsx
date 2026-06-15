import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { useLang, pick } from '../../i18n';

const ru = {
  title: 'ВХОД',
  loginPh: 'Ник или email',
  passwordPh: 'Пароль',
  submit: 'ВОЙТИ',
  toRegister: 'Нет аккаунта? Регистрация',
  twoFaTitle: 'ДВУХФАКТОРКА',
  twoFaHintTotp: 'Введите код из приложения-аутентификатора',
  twoFaHintEmail: 'Введите код, отправленный на email',
  codePh: 'Код или резервный код',
  confirm: 'ПОДТВЕРДИТЬ',
  back: 'Назад',
};
const en: typeof ru = {
  title: 'SIGN IN',
  loginPh: 'Username or email',
  passwordPh: 'Password',
  submit: 'LOG IN',
  toRegister: 'No account? Sign up',
  twoFaTitle: 'TWO-FACTOR',
  twoFaHintTotp: 'Enter the code from your authenticator app',
  twoFaHintEmail: 'Enter the code sent to your email',
  codePh: 'Code or backup code',
  confirm: 'CONFIRM',
  back: 'Back',
};
const TR = { ru, en };

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const login = useAccountStore((s) => s.login);
  const error = useAccountStore((s) => s.error);
  const twoFactorChallenge = useAccountStore((s) => s.twoFactorChallenge);
  const twoFactorMethod = useAccountStore((s) => s.twoFactorMethod);
  const submitTwoFactor = useAccountStore((s) => s.submitTwoFactor);
  const cancelTwoFactor = useAccountStore((s) => s.cancelTwoFactor);
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = loginField.length >= 3 && password.length >= 8 && !busy;
  const t = pick(useLang(), TR);

  const submit = async () => {
    setBusy(true);
    try {
      await login(loginField, password);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async () => {
    setBusy(true);
    try {
      await submitTwoFactor(code.trim());
    } finally {
      setBusy(false);
    }
  };

  if (twoFactorChallenge) {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
        <div className="font-display text-3xl tracking-wide">{t.twoFaTitle}</div>
        <div className="mt-2 text-xs text-muted">{twoFactorMethod === 'email' ? t.twoFaHintEmail : t.twoFaHintTotp}</div>
        <div className="mt-5 flex flex-col gap-3">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t.codePh}
            onKeyDown={(e) => e.key === 'Enter' && code.trim().length >= 6 && !busy && submitCode()}
            className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm tracking-widest ring-1 ring-white/10 focus:outline-none focus:ring-primary"
          />
          {error && <div className="text-xs text-primary">{error}</div>}
          <button
            disabled={code.trim().length < 6 || busy}
            onClick={submitCode}
            className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
          >
            <LogIn className="h-4 w-4" /> {t.confirm}
          </button>
          <button onClick={() => { setCode(''); cancelTwoFactor(); }} className="text-xs text-muted hover:text-white">
            {t.back}
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">{t.title}</div>
      <div className="mt-5 flex flex-col gap-3">
        <input
          value={loginField}
          onChange={(e) => setLoginField(e.target.value)}
          placeholder={t.loginPh}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.passwordPh}
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" /> {t.submit}
        </button>
        <button onClick={onRegister} className="text-xs text-muted hover:text-white">
          {t.toRegister}
        </button>
      </div>
    </motion.div>
  );
}
