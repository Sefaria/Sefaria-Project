import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// PLAN §2.8. Django serves the build from /static/bundles/devportal/ and finds the entry through
// dist/.vite/manifest.json (devportal/templatetags/devportal_assets.py). There is no index.html:
// the only entry is src/app/main.tsx, which mounts on #dp-root and reads #dp-data.
export default defineConfig({
  base: '/static/bundles/devportal/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: 'src/app/main.tsx',
    },
  },
  css: {
    modules: {
      // Component styles are CSS Modules (contract C5). Scoped names keep the dp- prefix so that
      // every class in the DOM is recognisably the portal's.
      generateScopedName: 'dp-[name]__[local]--[hash:base64:5]',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
