import { defineConfig } from 'vite';

// Capacitor loads the built web assets from ./dist
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2019',
  },
  server: {
    port: 5174,
    host: true,
  },
});
