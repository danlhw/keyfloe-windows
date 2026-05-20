/// ThemeProvider — sets data-theme on the document root so the CSS
/// variable swaps in globals.css fire. Three modes (system/light/dark)
/// match the Mac AppearanceController:
///   • system → follow OS prefers-color-scheme
///   • light  → force light
///   • dark   → force dark
///
/// Reads from electron-store via window.keyfloe.settings.get on mount,
/// then subscribes to settingsChanged so Settings → Appearance updates
/// reach every open window instantly.

import { useEffect } from 'react';
import type { Appearance } from '@shared/types';

function applyTheme(appearance: Appearance) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', appearance);
}

function applyAcrylic(hasAcrylic: boolean) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-acrylic', hasAcrylic ? 'true' : 'false');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Apply once from current settings — main process already loaded
    // the persisted value from electron-store at startup.
    window.keyfloe.settings.get().then((s) => applyTheme(s.appearance));
    // Subscribe — any window changing Appearance broadcasts via
    // settingsChanged and every other open window re-applies the theme.
    const off = window.keyfloe.settings.onChange((s) => applyTheme(s.appearance));
    // Platform info — set data-acrylic on the document root so
    // .pill-glass and .notch-shell pick the right rendering path
    // (let OS acrylic show vs. paint our own CSS backdrop-filter).
    window.keyfloe.platform.info().then((p) => applyAcrylic(p.hasAcrylic));
    return () => { off(); };
  }, []);
  return <>{children}</>;
}
