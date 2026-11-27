import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const APP_VERSION = '2.8.0';
const BUILD_TIME = Date.now();
const RAW_BASE_PATH = process.env.VITE_BASE_PATH || '/';
const BASE_PATH = RAW_BASE_PATH.endsWith('/') ? RAW_BASE_PATH : `${RAW_BASE_PATH}/`;

// Custom plugin to generate version.json for in-app live update detection
function versionGeneratorPlugin(): Plugin {
  const versionPayload = JSON.stringify(
    {
      version: APP_VERSION,
      buildTime: BUILD_TIME,
      buildDate: new Date(BUILD_TIME).toISOString(),
      appName: 'Internal Technical Audit',
    },
    null,
    2
  );

  return {
    name: 'version-generator-plugin',
    buildStart() {
      try {
        const publicDir = path.resolve('public');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        fs.writeFileSync(path.join(publicDir, 'version.json'), versionPayload);
      } catch (err) {
        console.error('Failed to write public/version.json', err);
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: versionPayload,
      });
    },
  };
}

export default defineConfig(() => {
  return {
    base: BASE_PATH,
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __APP_BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionGeneratorPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'version.json'],
        manifest: {
          id: BASE_PATH,
          name: 'Internal Technical Audit',
          short_name: 'TechAudit',
          description: 'Factory Technical & QMS Inspection Suite by Sabuj Mahmud',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: BASE_PATH,
          scope: BASE_PATH,
          icons: [
            {
              src: `${BASE_PATH}pwa-192x192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${BASE_PATH}pwa-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: `${BASE_PATH}pwa-maskable-512x512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: `${BASE_PATH}index.html`,
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio to prevent WebSocket closed without opened errors.
      hmr: false,
      watch: null,
    },
  };
});
