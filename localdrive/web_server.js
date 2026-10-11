const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8666;
const BACKEND_PORT = 7443;
const FORWARD_PORT = 8080;
const WEB_DIR = path.join(__dirname, 'build', 'web');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm'
};

function proxyRequest(req, res, targetPort) {
  console.log(`[Proxy -> :${targetPort}] ${req.method} ${req.url}`);
  const options = {
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`,
      'x-forwarded-for': req.socket.remoteAddress || ''
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[Proxy Error :${targetPort}]`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'bad_gateway', message: err.message } }));
    }
  });

  req.pipe(proxyReq);
}

function handleUpgrade(req, socket, head, targetPort) {
  console.log(`[WS Upgrade -> :${targetPort}] ${req.url}`);
  const proxyReq = http.request({
    hostname: '127.0.0.1',
    port: targetPort,
    path: req.url,
    method: 'GET',
    headers: {
      ...req.headers,
      host: `127.0.0.1:${targetPort}`
    }
  });

  proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n') +
      '\r\n\r\n'
    );
    if (proxyHead && proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxyReq.on('error', (err) => {
    console.error(`[WS Error :${targetPort}]`, err.message);
    socket.destroy();
  });

  proxyReq.end();
}

function handleRequest(req, res) {
  const urlPath = req.url.split('?')[0];
  console.log(`[HTTP ${req.method}] ${req.url}`);

  // Proxy API and share routes directly to the Go backend
  if (urlPath.startsWith('/api/') || urlPath.startsWith('/s/') || urlPath === '/healthz') {
    proxyRequest(req, res, BACKEND_PORT);
    return;
  }

  let filePath = path.join(WEB_DIR, decodeURIComponent(urlPath));

  // If path is directory or doesn't exist, check index.html for SPA routing
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback
    filePath = path.join(WEB_DIR, 'index.html');
  }

  const ext = String(path.extname(filePath)).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
}

const PORTS = [8666, 8080];
PORTS.forEach((port) => {
  const s = http.createServer(handleRequest);
  s.on('upgrade', (req, socket, head) => {
    handleUpgrade(req, socket, head, BACKEND_PORT);
  });
  s.on('error', (err) => {
    console.warn(`[Port ${port}] Could not bind:`, err.message);
  });
  s.listen(port, '0.0.0.0', () => {
    console.log(`LocalDrive Web Client is running on http://localhost:${port}`);
    console.log(`API requests to /api/ on :${port} are proxied to http://127.0.0.1:${BACKEND_PORT}`);
  });
});

