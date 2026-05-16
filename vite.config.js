import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.js',
        vite: {
          build: {
            rollupOptions: {
              external: ['electron', 'path', 'fs', 'https', 'child_process', 'url', 'fs-extra', '@aws-sdk/client-s3', '7zip-bin', 'node-7z', 'axios', 'cheerio', 'xml2js']
            }
          }
        }
      },
      {
        entry: 'electron/preload.js',
        onstart(options) {
          options.reload()
        },
      },
    ]),
    renderer(),
  ],
})
