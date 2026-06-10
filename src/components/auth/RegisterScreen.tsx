import { useState } from 'react';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';
import { isValidUsername, isValidEmail, isValidPassword } from '../../lib/validators';
import { useLang, pick } from '../../i18n';

const ru = {
  title: 'РЕГИСТРАЦИЯ',
  usernamePh: 'Ник (3-16, A-Z 0-9 _)',
  emailPh: 'Email',
  passwordPh: 'Пароль (мин. 8)',
  confirmPh: 'Повторите пароль',
  submit: 'СОЗДАТЬ',
  toLogin: 'Уже есть аккаунт? Войти',
};
const en: typeof ru = {
  title: 'SIGN UP',
  usernamePh: 'Username (3-16, A-Z 0-9 _)',
  emailPh: 'Email',
  passwordPh: 'Password (min. 8)',
  confirmPh: 'Repeat password',
  submit: 'CREATE',
  toLogin: 'Already have an account? Sign in',
};
const TR = { ru, en };

export function RegisterScreen({ onBack }: { onBack: () => void }) {
  const register = useAccountStore((s) => s.register);
  const error = useAccountStore((s) => s.error);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const t = pick(useLang(), TR);

  const valid =
    isValidUsername(username) && isValidEmail(email) && isValidPassword(password) && password === confirm;

  const submit = async () => {
    setBusy(true);
    try {
      await register(username, email, password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">{t.title}</div>
      <div className="mt-5 flex flex-col gap-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={t.usernamePh}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.emailPh}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t.passwordPh}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t.confirmPh}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button
          disabled={!valid || busy}
          onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
        >
          <UserPlus className="h-4 w-4" /> {t.submit}
        </button>
        <button onClick={onBack} className="text-xs text-muted hover:text-white">
          {t.toLogin}
        </button>
      </div>
    </motion.div>
  );
}
