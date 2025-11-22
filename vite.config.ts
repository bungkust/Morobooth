import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
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
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor libraries from node_modules - MUST be checked first
          if (id.includes('node_modules')) {
            // React core
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor';
            }
            // p5.js (largest library ~500KB) - must be separate
            if (id.includes('p5') || id.includes('react-p5')) {
              return 'p5-vendor';
            }
            // Supabase
            if (id.includes('@supabase')) {
              return 'supabase-vendor';
            }
            // QR Code library
            if (id.includes('qrcode')) {
              return 'utils-vendor';
            }
            // HTML2Canvas
            if (id.includes('html2canvas')) {
              return 'utils-vendor';
            }
            // PWA/Workbox
            if (id.includes('workbox')) {
              return 'pwa-vendor';
            }
            // Other node_modules
            return 'vendor';
          }
          
          // Split large utils that are used by PhotoBooth (to reduce photobooth chunk size)
          if (id.includes('/utils/photoComposer')) {
            return 'utils-photocomposer';
          }
          if (id.includes('/utils/dithering')) {
            return 'utils-dithering';
          }
          if (id.includes('/utils/qrCodeGenerator')) {
            return 'utils-qrcode';
          }
          if (id.includes('/utils/')) {
            return 'utils';
          }
          
          // Split hooks used by PhotoBooth
          if (id.includes('/hooks/useAudio')) {
            return 'hooks-audio';
          }
          if (id.includes('/hooks/')) {
            return 'hooks';
          }
          
          // Internal components - split large components
          if (id.includes('/components/PhotoBooth.tsx') || id.includes('/components/PhotoBooth')) {
            return 'photobooth';
          }
          if (id.includes('/components/PhotoBoothApp.tsx') || id.includes('/components/PhotoBoothApp')) {
            return 'photobooth-app';
          }
          if (id.includes('/components/AdminPage.tsx') || id.includes('/components/AdminPage')) {
            return 'admin';
          }
          if (id.includes('/components/DownloadPage.tsx') || id.includes('/components/DownloadPage')) {
            return 'download';
          }
          
          // Service modules - group related services
          if (id.includes('/services/')) {
            // Supabase-related services
            if (id.includes('supabase') || id.includes('uploadService') || id.includes('photoStorageService') || id.includes('sessionService')) {
              return 'supabase-services';
            }
            // Bluetooth printer services (used by PhotoBoothApp)
            if (id.includes('BluetoothPrinter') || id.includes('hybridBluetoothPrinterService') || id.includes('universalBluetoothPrinterService')) {
              return 'services-bluetooth';
            }
            // Other services
            return 'services';
          }
          
          // Default: keep in main bundle for small modules
          return null;
        }
      }
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000
  }
})
