import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Renderer build (the React UI loaded into each BrowserWindow).
// Each window points at its own HTML entry; Vite handles them as
// multi-page builds so the dashboard, pill, and overlay each get
// their own bundle and can be opened independently.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        notch:     path.resolve(__dirname, 'src/renderer/notch.html'),
        dashboard: path.resolve(__dirname, 'src/renderer/dashboard.html'),
        pill:      path.resolve(__dirname, 'src/renderer/pill.html'),
        overlay:   path.resolve(__dirname, 'src/renderer/overlay.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
