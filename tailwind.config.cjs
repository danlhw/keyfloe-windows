/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      // Editorial palette — paper + bone + ink. Auto-flips via the CSS
      // variables in globals.css (--paper / --bone / --ink-*). Exposed
      // to Tailwind via the var() bridge so utility classes like
      // bg-paper / text-ink-900 / border-hairline still work.
      colors: {
        paper:   'var(--paper)',
        bone:    'var(--bone)',
        ink: {
          900: 'var(--ink-900)',
          600: 'var(--ink-600)',
          400: 'var(--ink-400)',
        },
        hairline: 'var(--hairline)',
        // Live / OK semantic colors (StatusChip dots).
        live:    '#20c55c',
        // Kept for the accent/cursor highlight in Clicky overlay only.
        cursor:  '#60a5fa',
      },
      fontFamily: {
        sans:   ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI Variable"',
                 '"Segoe UI"', 'system-ui', 'sans-serif'],
        serif:  ['Fraunces', 'Georgia', 'serif'],
        pixel:  ['DepartureMono', 'ui-monospace', '"Cascadia Mono"',
                 'Consolas', 'monospace'],
      },
      fontSize: {
        // Display ramp from OneClickStyle.Display
        'display-xl': ['64px', { lineHeight: '1.04', letterSpacing: '-0.01em' }],
        'display-lg': ['44px', { lineHeight: '1.05', letterSpacing: '-0.01em' }],
        'display-md': ['36px', { lineHeight: '1.08', letterSpacing: '-0.005em' }],
        'display-sm': ['26px', { lineHeight: '1.12' }],
        'eyebrow':    ['10.5px', { letterSpacing: '0.16em', lineHeight: '1' }],
      },
      borderRadius: {
        pill: '999px',
        card: '12px',
      },
      letterSpacing: {
        eyebrow: '0.16em',
        widest2: '0.22em',
      },
    },
  },
  plugins: [],
};
