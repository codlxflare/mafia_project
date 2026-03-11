import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:3000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') return;
            console.error('[proxy]', err?.message || err);
          });
          proxy.on('proxyReqWs', (_proxyReq, req, socket) => {
            socket.on('error', (err) => {
              if (err?.code === 'EPIPE' || err?.code === 'ECONNRESET') return;
              console.error('[proxy ws]', err?.message || err);
            });
          });
        },
      },
      '/api': { target: 'http://127.0.0.1:3000' },
    },
  },
});
