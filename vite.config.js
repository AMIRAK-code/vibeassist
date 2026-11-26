import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  server: {
    port: 5173,
    strictPort: false,
    host: host || false,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
})
