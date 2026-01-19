import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ['buffer', 'events', 'stream', 'util', 'process'],
      globals: {
        Buffer: true, // can also be 'build', 'dev', or false
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      process: 'process/browser',
    },
  },
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    include: ['defi-dash-sdk'],
  },
});
