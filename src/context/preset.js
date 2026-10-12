import { createContext, useContext, useLayoutEffect } from 'react';
import { PALETTES } from '../lib/chartColors';

// Two looks for the signed-in app. "Simple" is the soft clay preset (Outfit, clay blue, puffy
// surfaces); "Advanced" is the full Creative Instrument design. "Automatic" picks Simple on
// phone-sized screens and Advanced on anything wider (unfolded foldables, tablets, laptops,
// desktops), and switches live as the screen changes. The choice is remembered per device.
export const PRESET_CHOICES = ['auto', 'simple', 'advanced'];
export const SMALL_SCREEN = '(max-width: 599.98px)';
export const PRESET_STORAGE_KEY = 'vibeassist:ui-preset';

export const resolvePreset = (choice, small) => (choice === 'auto' ? (small ? 'simple' : 'advanced') : choice);

export const PresetContext = createContext({ choice: 'auto', preset: 'advanced', small: false, setChoice: () => {} });

// { choice, preset, small, setChoice } from PresetProvider
export function usePreset() {
  return useContext(PresetContext);
}

// Puts the preset on <html> while the signed-in app is on screen, before paint so there's no
// flash. Leaving the app removes it, so the landing and other public pages keep their design.
export function useAppPreset() {
  const { preset } = usePreset();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.preset = preset;
    return () => {
      delete root.dataset.preset;
    };
  }, [preset]);
}

// Chart colours for the current preset (SVG attributes can't read CSS variables)
export function useChartPalette() {
  const { preset } = usePreset();
  return PALETTES[preset] ?? PALETTES.advanced;
}
