import { useEffect, useState } from 'react';

// Like useState, but remembered for the browser tab (sessionStorage), so filters, periods and
// drafts survive moving between screens. Falls back to plain state if storage is unavailable.
export function usePersistentState(key, initialValue) {
  const storageKey = `vibeassist:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      return stored === null ? initialValue : JSON.parse(stored);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // storage full or blocked: keep working with in-memory state
    }
  }, [storageKey, value]);

  return [value, setValue];
}
