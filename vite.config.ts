import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  // When deployed to a custom domain (genesis.future-pulse.de), use '/' as the base.
  // For the fallback URL (oliverlaudan-ops.github.io/agent-genesis/) we'd need
  // '/agent-genesis/' — but since we're going custom-domain from day 1, '/' is correct.
  base: '/',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@viz': fileURLToPath(new URL('./src/viz', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
