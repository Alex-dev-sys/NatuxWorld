import { useState } from 'react';
import { motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { useAccountStore } from '../../store/useAccountStore';

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const login = useAccountStore((s) => s.login);
  const error = useAccountStore((s) => s.error);
  const [loginField, setLoginField] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = loginField.length >= 3 && password.length >= 8 && !busy;

  const submit = async () => {
    setBusy(true);
    await login(loginField, password);
    setBusy(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="w-[380px] rounded-2xl glass-strong p-6 shadow-premium">
      <div className="font-display text-3xl tracking-wide">ВХОД</div>
      <div className="mt-5 flex flex-col gap-3">
        <input
          value={loginField}
          onChange={(e) => setLoginField(e.target.value)}
          placeholder="Ник или email"
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          onKeyDown={(e) => e.key === 'Enter' && canSubmit && submit()}
          className="rounded-lg bg-white/[0.04] px-3 py-2.5 text-sm ring-1 ring-white/10 focus:outline-none focus:ring-primary"
        />
        {error && <div className="text-xs text-primary">{error}</div>}
        <button
          disabled={!canSubmit}
          onClick={submit}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 font-display tracking-widest text-white shadow-glow disabled:opacity-40"
        >
          <LogIn className="h-4 w-4" /> ВОЙТИ
        </button>
        <button onClick={onRegister} className="text-xs text-muted hover:text-white">
          Нет аккаунта? Регистрация
        </button>
      </div>
    </motion.div>
  );
}
