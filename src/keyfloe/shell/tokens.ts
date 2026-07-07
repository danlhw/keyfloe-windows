/**
 * Keyfloe brand tokens (TS mirror of keyfloe.css).
 * Import these when a value must live in JS (e.g. inline SVG fills, canvas).
 * For styling prefer the `kf-` CSS classes in keyfloe.css.
 */
export const KF = {
  font: {
    sans: '"Geist", -apple-system, "Segoe UI", system-ui, sans-serif',
    serif: '"Fraunces", Georgia, "Times New Roman", serif',
    mono: '"Departure Mono", ui-monospace, "Cascadia Mono", monospace',
  },
  color: {
    gold: "#d69646",
    blue: "#6070ff",
    green: "#3ad17a",
    red: "#e5484d",
    paper: "#f5f1ea",
    ink900: "#0a0a0b",
    ink600: "#5b5b5e",
  },
} as const;

export type KfTheme = "light" | "dark" | "system";
