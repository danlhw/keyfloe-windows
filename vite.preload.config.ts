import { defineConfig } from 'vite';
import path from 'node:path';
import { builtinModules } from 'node:module';

// Preload script — same SSR treatment as main.
export default defineConfig({
  build: {
    outDir: 'dist/preload',
    emptyOutDir: true,
    target: 'node20',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'src/preload/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: { format: 'cjs', exports: 'auto' },
    },
    minify: false,
    sourcemap: true,
  },
});
