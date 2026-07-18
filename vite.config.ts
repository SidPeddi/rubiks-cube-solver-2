/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.{mjs,wasm}', dest: 'ort' }],
    }),
  ],
  base: './',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/cube/**', 'src/solver/**', 'src/vision/**'],
    },
  },
});
