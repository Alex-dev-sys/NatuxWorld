import { useEffect, useState } from 'react';

/**
 * Tracks a transient "copied" flag that auto-resets to false after `timeout` ms.
 * Call `markCopied()` after a successful clipboard write to flip the flag on.
 */
export function useCopied(timeout = 1600): [boolean, () => void] {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), timeout);
    return () => clearTimeout(t);
  }, [copied, timeout]);

  return [copied, () => setCopied(true)];
}
