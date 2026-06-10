import { useState } from 'react';
import { useAccountStore } from '../../store/useAccountStore';
import { AppBackdrop } from '../AppBackdrop';
import { LoginScreen } from './LoginScreen';
import { RegisterScreen } from './RegisterScreen';
import { VerifyEmailScreen } from './VerifyEmailScreen';

export function AuthGate() {
  const pendingEmail = useAccountStore((s) => s.pendingEmail);
  const clearError = useAccountStore((s) => s.clearError);
  const [mode, setMode] = useState<'login' | 'register'>('login');

  const go = (m: 'login' | 'register') => {
    clearError();
    setMode(m);
  };

  return (
    <div className="relative grid h-screen w-screen place-items-center overflow-hidden rounded-2xl bg-bg ring-1 ring-white/[0.04]">
      <AppBackdrop />
      <div className="relative z-10">
        {pendingEmail ? (
          <VerifyEmailScreen />
        ) : mode === 'login' ? (
          <LoginScreen onRegister={() => go('register')} />
        ) : (
          <RegisterScreen onBack={() => go('login')} />
        )}
      </div>
    </div>
  );
}
