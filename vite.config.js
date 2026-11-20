import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
    watch: {
      ignored: ['**/*.zip', '**/wordpress-plugin/**', '**/.git/**']
    },
    proxy: {
      '/api-wp': {
        target: 'https://www.bimxdesign.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api-wp/, '')
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      includeAssets: ['favicon.ico', 'favicon.svg', 'favicon.png', 'apple-touch-icon.png', 'icons/*.png'],
      manifest: {
        name: 'Site Visit Assistant',
        short_name: 'Site Visit Assistant',
        description: 'Simply on-site reports for Architects and Contractors',
        theme_color: '#7e0b1d',
        background_color: '#ffffff',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'any',
        categories: ['productivity', 'business', 'utilities'],
        scope: './',
        start_url: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        shortcuts: [
          {
            name: 'Projects',
            short_name: 'Projects',
            description: 'View all inspection projects',
            url: './#projects',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          },
          {
            name: 'Settings & Backup',
            short_name: 'Settings',
            description: 'Open Settings, Preferences, and Cloud Backup',
            url: './#settings',
            icons: [{ src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
        globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,woff2,webmanifest,wasm}'],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: ['es2020', 'safari14', 'ios14'],
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/docx')) {
            return 'vendor-office'
          }
          if (id.includes('node_modules/jspdf')) {
            return 'vendor-jspdf'
          }
          if (id.includes('node_modules/fabric')) {
            return 'vendor-fabric'
          }
          if (id.includes('node_modules/firebase')) {
            return 'vendor-firebase'
          }
          if (id.includes('node_modules/dexie')) {
            return 'vendor-dexie'
          }
          if (
            id.includes('node_modules/react') ||
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router-dom') ||
            id.includes('node_modules/zustand')
          ) {
            return 'vendor-react'
          }
        }
      }
    }
  }
})
