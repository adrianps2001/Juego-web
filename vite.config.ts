import { defineConfig } from 'vite';

// base relativa para que funcione en GitHub Pages (/juego-web/)
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1000 },
});
