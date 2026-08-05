const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 80;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5000';

console.log(`[Server] Starting frontend server on port ${PORT}...`);
console.log(`[Server] Backend URL proxy target is: ${BACKEND_URL}`);

app.use('/cors-proxy', (req, res, next) => {
  console.log('FRONTEND PROXY HIT:', req.method, req.originalUrl);
  next();
});

// Proxy API requests to the backend
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  logLevel: 'debug'
}));

// Proxy CORS proxy requests to the backend
// app.use(
//   "/cors-proxy",
//   createProxyMiddleware({
//     target: "*",
//     changeOrigin: true,
//     logLevel: "debug",
//     onProxyReq(proxyReq, req) {
//       console.log("Forwarding to:", proxyReq.path);
//     },
//   })
// );
// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback to index.html for React Router SPA behavior
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[Server] Frontend server running successfully on port ${PORT}`);
});
