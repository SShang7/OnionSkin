import react from '@vitejs/plugin-react'
import { defineConfig, searchForWorkspaceRoot } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on your local network so friends on the same Wi-Fi can join.
    host: true,
    proxy: {
      '/ws': { target: 'ws://localhost:3001', ws: true },
    },
    fs: {
      // Allow importing ../shared/ops.js
      allow: [searchForWorkspaceRoot(import.meta.dirname)],
    },
  },
})
