import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, LogOut, Pencil, ShieldCheck, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAccountStore } from '../store/useAccountStore';
import { isValidUsername } from '../lib/validators';
import { useCopied } from '../hooks/useCopied';
import { useLang, pick } from '../i18n';

const ru = {
  fallbackName: 'Аккаунт',
  copyUuid: 'Копировать UUID',
  copied: 'Скопировано',
  newNickPh: 'Новый ник',
  changeNick: 'Сменить ник',
  security: 'Двухфакторка (2FA)',
  securityOn: '2FA включена',
  replaceSecurity: 'Заменить приложение 2FA',
  logout: 'Выйти (это устройство)',
  logoutGlobal: 'Выйти со всех устройств',
  sessionPersistenceWarning: 'Не удалось сохранить сессию в защищённом хранилище. Текущий вход действует до закрытия лаунчера; после перезапуска потребуется войти снова.',
  logoutFailed: 'Не удалось очистить сохранённую сессию. Выход не подтверждён; повторите попытку.',
};
const en: typeof ru = {
  fallbackName: 'Account',
  copyUuid: 'Copy UUID',
  copied: 'Copied',
  newNickPh: 'New username',
  changeNick: 'Change username',
  security: 'Two-factor (2FA)',
  securityOn: '2FA enabled',
  replaceSecurity: 'Replace 2FA app',
  logout: 'Log out (this device)',
  logoutGlobal: 'Log out everywhere',
  sessionPersistenceWarning: 'The session could not be saved to secure storage. This sign-in lasts until the launcher closes; you will need to sign in again after restarting.',
  logoutFailed: 'The saved session could not be cleared. Logout was not confirmed; please retry.',
};
const TR = { ru, en };
const TwoFactorSetup = lazy(() => import('./auth/TwoFactorSetup').then(({ TwoFactorSetup: component }) => ({
  default: component,
})));

export function ProfileMenu() {
  // The offline MC profile (uuid, nick) only exists after the first Play; the account
  // session is what gates the app. Drive this menu off the account so "Выйти" is always
  // reachable — even right after registering, before the game has ever launched.
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const accountLogout = useAccountStore((s) => s.logout);
  const accountLogoutGlobal = useAccountStore((s) => s.logoutGlobal);
  const accountName = useAccountStore((s) => s.user?.username);
  const accountEmail = useAccountStore((s) => s.user?.email);
  const twoFactorEnabled = useAccountStore((s) => s.user?.twoFactorEnabled);
  const twoFactorMethod = useAccountStore((s) => s.user?.twoFactorMethod);
  const persistenceWarning = useAccountStore((s) => s.persistenceWarning);
  const logoutFailed = useAccountStore((s) => s.logoutFailed);

  const [open, setOpen] = useState(false);
  const [twoFactorAction, setTwoFactorAction] = useState<'enable' | 'replace' | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, markCopied] = useCopied();
  const ref = useRef<HTMLDivElement>(null);
  const t = pick(useLang(), TR);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setRenaming(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const displayName = accountName ?? user?.username ?? t.fallbackName;

  const copyUuid = async () => {
    if (!user) return;
    await navigator.clipboard.writeText(user.uuid);
    markCopied();
  };

  const submitRename = async () => {
    const trimmed = nameDraft.trim();
    if (!user || !trimmed || trimmed === user.username) {
      setRenaming(false);
      return;
    }
    // Reject invalid nicks (length / charset) without submitting; keep the input
    // open so the user can correct it.
    if (!isValidUsername(trimmed)) return;
    await logout();
    await login(trimmed);
    setRenaming(false);
    setOpen(false);
  };

  const handleLogout = async () => {
    if (!(await accountLogout())) return;
    await logout();
    setOpen(false);
  };

  const handleLogoutGlobal = async () => {
    if (!(await accountLogoutGlobal())) return;
    await logout();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-2 rounded-lg bg-white/[0.04] px-3 text-xs font-medium text-white/85 ring-1 ring-white/[0.06] hover:bg-white/[0.08] hover:text-white transition-colors"
      >
        <User className="h-3.5 w-3.5" />
        {displayName}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-[calc(100%+6px)] z-[70] w-64 overflow-hidden rounded-xl glass-strong shadow-premium ring-1 ring-white/[0.06]"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-3 py-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{displayName}</div>
                <div className="truncate text-[10px] font-mono text-muted">
                  {user ? `${user.uuid.slice(0, 18)}…` : accountEmail ?? ''}
                </div>
              </div>
            </div>

            <div className="flex flex-col p-1">
              {persistenceWarning && (
                <div role="status" className="mx-2 my-1 rounded-lg border border-amber-400/20 bg-amber-400/[0.08] px-2.5 py-2 text-[11px] leading-4 text-amber-100">
                  {t.sessionPersistenceWarning}
                </div>
              )}
              {logoutFailed && (
                <div role="alert" className="mx-2 my-1 rounded-lg border border-primary/20 bg-primary/[0.08] px-2.5 py-2 text-[11px] leading-4 text-primary">
                  {t.logoutFailed}
                </div>
              )}
              {user && (
                <button
                  onClick={copyUuid}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? t.copied : t.copyUuid}
                </button>
              )}

              {/*
                Renaming only rewrites the local offline profile. With a server
                session the in-game nick comes from that session, so the button
                changed nothing visible — offer it only in offline mode.
              */}
              {user && !accountName && renaming ? (
                <div className="flex items-center gap-1 px-1 py-1">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    placeholder={t.newNickPh}
                    className="flex-1 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-white ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                  />
                  <button
                    onClick={submitRename}
                    className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primary-glow"
                  >
                    OK
                  </button>
                </div>
              ) : user && !accountName ? (
                <button
                  onClick={() => {
                    setNameDraft(user.username);
                    setRenaming(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t.changeNick}
                </button>
              ) : null}

              {accountName && twoFactorEnabled && (
                <div className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-success">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.securityOn}
                  <Check className="ml-auto h-3.5 w-3.5" />
                </div>
              )}
              {accountName && !twoFactorEnabled && (
                <button
                  onClick={() => { setTwoFactorAction('enable'); setOpen(false); }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.security}
                </button>
              )}
              {accountName && twoFactorEnabled && twoFactorMethod === 'totp' && (
                <button
                  onClick={() => { setTwoFactorAction('replace'); setOpen(false); }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t.replaceSecurity}
                </button>
              )}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t.logout}
              </button>

              <button
                onClick={handleLogoutGlobal}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-primary/10 hover:text-primary"
              >
                <LogOut className="h-3.5 w-3.5" />
                {t.logoutGlobal}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        {twoFactorAction && (
          <TwoFactorSetup
            reconfigure={twoFactorAction === 'replace'}
            onClose={() => setTwoFactorAction(null)}
          />
        )}
      </Suspense>
    </div>
  );
}
