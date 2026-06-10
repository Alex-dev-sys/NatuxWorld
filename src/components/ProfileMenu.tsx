import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, LogOut, Pencil, User } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { useAccountStore } from '../store/useAccountStore';

export function ProfileMenu() {
  // The offline MC profile (uuid, nick) only exists after the first Play; the account
  // session is what gates the app. Drive this menu off the account so "Выйти" is always
  // reachable — even right after registering, before the game has ever launched.
  const user = useAuthStore((s) => s.user);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const accountLogout = useAccountStore((s) => s.logout);
  const accountName = useAccountStore((s) => s.user?.username);
  const accountEmail = useAccountStore((s) => s.user?.email);

  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  const displayName = accountName ?? user?.username ?? 'Аккаунт';

  const copyUuid = async () => {
    if (!user) return;
    await navigator.clipboard.writeText(user.uuid);
    setCopied(true);
  };

  const submitRename = async () => {
    const trimmed = nameDraft.trim();
    if (!user || !trimmed || trimmed === user.username) {
      setRenaming(false);
      return;
    }
    await logout();
    await login(trimmed);
    setRenaming(false);
    setOpen(false);
  };

  const handleLogout = async () => {
    await accountLogout();
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
              {user && (
                <button
                  onClick={copyUuid}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Скопировано' : 'Копировать UUID'}
                </button>
              )}

              {user && renaming ? (
                <div className="flex items-center gap-1 px-1 py-1">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitRename();
                      if (e.key === 'Escape') setRenaming(false);
                    }}
                    placeholder="Новый ник"
                    className="flex-1 rounded-md bg-white/[0.05] px-2 py-1 text-xs text-white ring-1 ring-white/10 focus:outline-none focus:ring-primary"
                  />
                  <button
                    onClick={submitRename}
                    className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-white hover:bg-primary-glow"
                  >
                    OK
                  </button>
                </div>
              ) : user ? (
                <button
                  onClick={() => {
                    setNameDraft(user.username);
                    setRenaming(true);
                  }}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-white/[0.06] hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Сменить ник
                </button>
              ) : null}

              <button
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/80 hover:bg-primary/10 hover:text-primary"
              >
                <LogOut className="h-3.5 w-3.5" />
                Выйти
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
