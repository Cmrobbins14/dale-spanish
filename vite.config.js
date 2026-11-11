import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { serviceWorkerPlugin } from './scripts/vite-sw-plugin.js';

// base './' = every URL is relative, so the site works from any GitHub
// Pages sub-folder (https://you.github.io/your-repo/).
export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorkerPlugin()],
  build: { outDir: 'dist', assetsDir: 'assets', target: 'safari15' },
  test: { include: ['tests/unit/**/*.test.js'], environment: 'node' },
});
