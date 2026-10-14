import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    // A classic single bundle can also be embedded in a file://-safe HTML release.
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
