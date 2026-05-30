import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri: fixed port + clear screen disabled so Tauri's output is visible
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    watch: {
      // Tell Vite to ignore watching src-tauri so it doesn't thrash on Rust recompiles
      ignored: ["**/src-tauri/**"]
    }
  },
  // Tauri works better with env prefix
  envPrefix: ["VITE_", "TAURI_"],
})
