/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mirrored 1:1 from app/Sources/Clicky/DesignSystem.swift
        // so the Windows surfaces match the Mac dashboard pixel-for-pixel.
        bg: {
          base: '#101211',
          1: '#171918',
          2: '#202221',
          3: '#272A29',
          4: '#2E3130',
        },
        border: {
          subtle: '#373B39',
          strong: '#444947',
        },
        text: {
          primary: '#ECEEED',
          secondary: '#ADB5B2',
          tertiary: '#6B736F',
        },
        accent: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
      },
      borderRadius: {
        pill: '22px',
      },
      fontFamily: {
        sans: [
          '"Segoe UI Variable"',
          '"Segoe UI"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        mono: ['"Cascadia Code"', '"Cascadia Mono"', 'Consolas', 'monospace'],
      },
      backdropBlur: {
        pill: '32px',
      },
      animation: {
        'pulse-mic': 'pulse-mic 1.4s ease-in-out infinite',
        'typing-dot': 'typing-dot 1.2s ease-in-out infinite',
        'reveal': 'reveal 240ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        'pulse-mic': {
          '0%, 100%': { transform: 'scaleY(0.3)' },
          '50%':       { transform: 'scaleY(1)' },
        },
        'typing-dot': {
          '0%, 80%, 100%': { opacity: '0.2', transform: 'scale(0.8)' },
          '40%':            { opacity: '1',   transform: 'scale(1.0)' },
        },
        'reveal': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
