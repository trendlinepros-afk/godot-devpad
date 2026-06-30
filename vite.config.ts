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
  // Relative asset paths so the renderer loads correctly over file:// in the
  // packaged app (absolute "/assets/…" paths resolve to the drive root under
  // file:// and 404, leaving a blank window).
  base: './',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  plugins: [
    react(),
    // Strip the `crossorigin` attribute Vite adds to the bundled <script>/<link>
    // tags — over file:// in the packaged app a crossorigin module request has no
    // CORS response and the script silently fails to execute (blank window).
    {
      name: 'zirtola-strip-crossorigin',
      enforce: 'post',
      transformIndexHtml(html: string) {
        return html.replace(/\s+crossorigin\b/g, '')
      },
    },
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
                'koffi',
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
            // Build the preload as CommonJS (.cjs). ESM preload (.mjs) fails to
            // load in the packaged app, leaving window.devpad undefined; a CJS
            // preload + contextBridge is the reliable, standard combination.
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
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
