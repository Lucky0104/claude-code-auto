import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@repo/types': new URL('../../packages/types/index.ts', import.meta.url).pathname,
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: 'src/popup/popup.html',
      },
    },
  },
});
