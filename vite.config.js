// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // We ship our own public/site.webmanifest (generated + hand-tuned
      // already) rather than having the plugin generate one from config —
      // manifest: false just means "don't touch it, I'll link it myself".
      manifest: false,
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'favicon-48x48.png',
        'apple-touch-icon.png',
        'android-chrome-192x192.png',
        'android-chrome-512x512.png',
      ],
      // No runtimeCaching entries on purpose: map tiles (OpenFreeMap) and
      // all Supabase calls must stay live, never served stale from a
      // service-worker cache — the whole product is "what's happening
      // right now". Workbox's generateSW only precaches this app's own
      // built JS/CSS/HTML (globPatterns below); it does not intercept or
      // cache any other origin unless explicitly told to.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
      },
    }),
  ],
})
