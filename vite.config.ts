import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy requests from /api to your backend server
      '/api': {
        target: 'http://localhost:5000', // Your Flask server's address
        changeOrigin: true, // Needed for virtual hosted sites
        secure: false,      // Optional: if your backend is not https
      },
    },
  },
})