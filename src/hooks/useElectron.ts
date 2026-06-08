import { useEffect, useState } from 'react';
import { bridge } from '../services/electron-bridge';

export function useIsMaximized(): boolean {
  const [isMaximized, setIsMaximized] = useState(false);
  useEffect(() => {
    bridge.window.isMaximized().then(setIsMaximized);
    return bridge.window.onMaximizedChange(setIsMaximized);
  }, []);
  return isMaximized;
}
