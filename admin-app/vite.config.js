import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  server: { port: 5175 },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        signup: resolve(__dirname, 'signup.html'),
      },
    },
  },
});
