import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const manualChunks = (id) => {
  if (!id.includes('node_modules')) return

  if (id.includes('react') || id.includes('scheduler')) {
    return 'react-core'
  }

  if (id.includes('socket.io-client') || id.includes('mediasoup-client') || id.includes('simple-peer')) {
    return 'realtime-core'
  }

  if (id.includes('zustand')) {
    return 'state-core'
  }

  if (id.includes('react-icons')) {
    return 'ui-icons'
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'node',
  },
})
