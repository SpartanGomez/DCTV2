import { defineConfig } from 'vite'

// Vite convention: index.html lives at project root and is the entry.
// public/ is reserved for static assets (public/sprites/, public/audio/)
// per SPEC §4 & §6.
export default defineConfig({
  server: {
    port: 3000,
    strictPort: true,
  },
  preview: {
    port: 3000,
    strictPort: true,
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
})
