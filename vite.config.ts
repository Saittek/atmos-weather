import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative paths required so Capacitor can load assets from the app bundle
  base: './',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: true,
    // Smaller runtime polyfill surface; modern browsers only
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('leaflet') || id.includes('react-leaflet')) return 'map-vendor'
          if (id.includes('@capacitor')) return 'cap-vendor'
          if (
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('/react/') ||
            id.endsWith('/react/index.js') ||
            id.includes('\\react\\')
          ) {
            return 'react-vendor'
          }
        },
      },
    },
  },
})
