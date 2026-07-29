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
        deps.filter((d) => !d.includes('map-vendor') && !d.includes('globe-vendor')),
    },
    rollupOptions: {
      output: {
        /**
         * Only split pure heavy libs. Never put React into a map/globe chunk —
         * dual React copies crash the SPA on a blank white screen.
         */
        manualChunks(id) {
          const norm = id.replace(/\\/g, '/')
          if (!norm.includes('node_modules/')) return
          if (norm.includes('node_modules/maplibre-gl/')) return 'globe-vendor'
          // Leaflet only (not react-leaflet — that must share React with the app)
          if (
            norm.includes('node_modules/leaflet/') &&
            !norm.includes('react-leaflet')
          ) {
            return 'map-vendor'
          }
          if (norm.includes('node_modules/@capacitor/')) return 'cap-vendor'
        },
      },
    },
  },
})
