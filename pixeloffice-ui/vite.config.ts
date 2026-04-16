import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pixel-office/',
  build: {
    outDir: '../internal/pixeloffice/ui/dist',
    emptyOutDir: true,
  },
});
