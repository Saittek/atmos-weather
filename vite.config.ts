import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Absolute paths for the live web app (fixes mobile SPA routes like /radar).
// Capacitor iOS builds set CAPACITOR=1 for relative paths in the app bundle.
const isCapacitor = process.env.CAPACITOR === '1'

export default defineConfig({
  plugins: [react()],
  base: isCapacitor ? './' : '/',
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
    target: 'es2020',
    cssCodeSplit: true,
    modulePreload: {
      polyfill: false,
      // Don't force-load Leaflet on first paint (mobile bandwidth / parse cost)
      resolveDependencies: (_filename, deps) =>
        deps.filter((d) => !d.includes('map-vendor')),
    },
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
