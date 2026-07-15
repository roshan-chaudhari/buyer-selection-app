import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import https from 'https'
import http from 'http'
import { URL } from 'url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(), 
    tailwindcss(),
    {
      name: 'dynamic-cors-proxy',
      configureServer(server) {
        server.middlewares.use('/cors-proxy', (req, res) => {
          const targetUrl = req.headers['x-target-url'] as string;
          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing x-target-url header');
            return;
          }

          try {
            const parsedUrl = new URL(targetUrl);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const headers = { ...req.headers };
            delete headers['host'];
            delete headers['x-target-url'];
            delete headers['referer'];
            delete headers['origin'];

            const proxyReq = client.request({
              hostname: parsedUrl.hostname,
              port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
              path: parsedUrl.pathname + parsedUrl.search,
              method: req.method,
              headers: headers,
              rejectUnauthorized: false
            }, (proxyRes) => {
              res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
              proxyRes.pipe(res);
            });

            proxyReq.on('error', (err) => {
              res.statusCode = 500;
              res.end(`Proxy error: ${err.message}`);
            });

            req.pipe(proxyReq);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            res.statusCode = 400;
            res.end(`Invalid target URL: ${message}`);
          }
        });
      }
    }
  ],
  css: {
    lightningcss: {
      errorRecovery: true
    }
  },
  build: {
    chunkSizeWarningLimit: 1500
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      }
    }
  }
})
