import { defineConfig } from 'vite';
import path from 'node:path';
import { builtinModules } from 'node:module';

// Bundles the Electron main process. ssr: true makes Vite treat
// node built-ins as external out-of-the-box, so the various
// `import { exec } from 'node:child_process'` etc. survive the build
// instead of being rewritten as browser imports.
export default defineConfig({
  build: {
    outDir: 'dist/main',
    emptyOutDir: false,
    target: 'node20',
    ssr: true,
    lib: {
      entry: path.resolve(__dirname, 'src/main/index.ts'),
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      external: [
        'electron',
        'uiohook-napi',
        'electron-store',
        'node-fetch',
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
      ],
      output: {
        // Avoid Rollup wrapping the CommonJS export in an
        // immediately-invoked function — Electron expects a plain
        // commonjs file with side-effect imports.
        format: 'cjs',
        exports: 'auto',
      },
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@main': path.resolve(__dirname, 'src/main'),
    },
  },
});
