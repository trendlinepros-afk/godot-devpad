import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import path from 'node:path'

// DevPad uses vite-plugin-electron so the Electron main/preload sources live in
// ./electron while the React renderer lives in ./src. The main process is the
// only place that touches Node APIs, child_process, electron-store and the AI
// provider SDKs — the renderer reaches them exclusively through the preload
// contextBridge (see electron/preload.ts).
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // These are loaded at runtime from node_modules in the packaged
              // app and must not be bundled by Rollup.
              external: [
                'electron',
                'electron-store',
                'electron-updater',
                'express',
                'openai',
                'adm-zip',
                'ws',
                '@google/generative-ai',
              ],
            },
          },
          resolve: {
            alias: { '@shared': path.resolve(__dirname, 'src/shared') },
          },
        },
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: ['electron'] },
          },
        },
      },
      // Renderer config is handled by the top-level vite config below.
      renderer: {},
    }),
  ],
  build: {
    outDir: 'dist',
  },
})
