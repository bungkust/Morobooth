import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false, // Jika port sudah digunakan, akan mencari port lain
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Morobooth - Instant Photo Booth App',
        short_name: 'Morobooth',
        description: 'Professional photo booth app for events. Capture instant photos with Bluetooth thermal printer support.',
        theme_color: '#000000',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['photo', 'lifestyle', 'utilities'],
        icons: [
          {
            src: 'https://placehold.co/192x192/000000/FFFFFF?text=MORO',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'https://placehold.co/512x512/000000/FFFFFF?text=MORO',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ],
        screenshots: [],
        shortcuts: [
          {
            name: 'Start Photo Session',
            short_name: 'Photo Session',
            description: 'Start a new photo booth session',
            url: '/',
            icons: [{ src: '/icon-192x192.png', sizes: '192x192' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdnjs-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              }
            }
          }
        ]
      }
    })
  ]
})
