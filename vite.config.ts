import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version as string;

export default defineConfig({
  root: 'client',
  define: { __VERSION__: JSON.stringify(version) },
  build: { outDir: '../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
  plugins: process.env.SANS_PWA ? [] : [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icone.svg', 'icone-180.png'],
      manifest: {
        name: 'All-In Club',
        short_name: 'All-In Club',
        description: "Poker Texas Hold'em entre amis, en ligne ou en solo contre des bots.",
        lang: 'fr',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#231A3B',
        theme_color: '#231A3B',
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/ws/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ['push-sw.js'],
      },
    }),
  ],
});
