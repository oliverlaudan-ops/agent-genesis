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
  plugins: [
    {
      // Compile src/sw.ts → /sw.js at the root of dist/. We DON'T want it
      // bundled into the main app (Vite would hash the filename and break
      // the registration in main.ts which references '/sw.js' literally).
      // So we run a separate esbuild pass and write the output manually.
      name: 'build-sw',
      apply: 'build',
      closeBundle: {
        order: 'post',
        async handler() {
          // Dynamic import of esbuild — vite config is ESM, so `require`
          // doesn't exist. esbuild is a Vite dep so it's resolvable from
          // the config context.
          const { build } = await import('esbuild');
          await build({
            entryPoints: [fileURLToPath(new URL('./src/sw.ts', import.meta.url))],
            bundle: true,
            minify: true,
            target: 'es2020',
            format: 'iife',
            platform: 'browser',
            outfile: fileURLToPath(new URL('./dist/sw.js', import.meta.url)),
            logLevel: 'error',
          });
        },
      },
    },
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
