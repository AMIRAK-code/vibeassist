import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PRESET_CHOICES, PRESET_STORAGE_KEY, PresetContext, resolvePreset, SMALL_SCREEN } from './preset';

const readChoice = () => {
  try {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    return PRESET_CHOICES.includes(stored) ? stored : 'auto';
  } catch {
    return 'auto';
  }
};
const smallNow = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(SMALL_SCREEN).matches : false);

// Tracks the screen size and the saved choice; other tabs on this device follow along
export function PresetProvider({ children }) {
  const [choice, setChoiceState] = useState(readChoice);
  const [small, setSmall] = useState(smallNow);

  useEffect(() => {
    const query = window.matchMedia?.(SMALL_SCREEN);
    const onResize = () => setSmall(query.matches);
    const onStorage = (e) => {
      if (e.key === PRESET_STORAGE_KEY || e.key === null) setChoiceState(readChoice());
    };
    query?.addEventListener('change', onResize);
    window.addEventListener('storage', onStorage);
    return () => {
      query?.removeEventListener('change', onResize);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setChoice = useCallback((next) => {
    if (!PRESET_CHOICES.includes(next)) return;
    setChoiceState(next);
    try {
      if (next === 'auto') localStorage.removeItem(PRESET_STORAGE_KEY);
      else localStorage.setItem(PRESET_STORAGE_KEY, next);
    } catch {
      // storage blocked: the choice still holds for this visit
    }
  }, []);

  const value = useMemo(() => ({ choice, small, preset: resolvePreset(choice, small), setChoice }), [choice, small, setChoice]);
  return <PresetContext.Provider value={value}>{children}</PresetContext.Provider>;
}
