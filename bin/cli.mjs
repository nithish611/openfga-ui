#!/usr/bin/env node

import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { createServer } from 'http';
import { extname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const distDir = join(__dirname, '..', 'dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

function parseArgs() {
  const args = process.argv.slice(2);
  let port = 3000;
  let host = 'localhost';
  let open = true;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '-p' || args[i] === '--port') && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    } else if ((args[i] === '-H' || args[i] === '--host') && args[i + 1]) {
      host = args[i + 1];
      i++;
    } else if (args[i] === '--no-open') {
      open = false;
    } else if (args[i] === '-h' || args[i] === '--help') {
      console.log(`
  openfga-ui — Standalone UI for OpenFGA

  Usage:
    npx openfga-ui [options]

  Options:
    -p, --port <port>   Port to listen on (default: 3000)
    -H, --host <host>   Host to bind to (default: localhost)
    --no-open           Don't auto-open the browser
    -h, --help          Show this help message
`);
      process.exit(0);
    }
  }

  return { port, host, open };
}

function serveFile(res, filePath) {
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
  return true;
}

async function openBrowser(url) {
  const { platform } = process;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';

  try {
    const { exec } = await import('child_process');
    exec(`${cmd} ${url}`);
  } catch {
    // Silently fail — user can open manually
  }
}

function startServer({ port, host, open }) {
  if (!existsSync(distDir)) {
    console.error('\n  Error: Built files not found.');
    console.error('  The package may be corrupted. Try reinstalling:\n');
    console.error('    npm install -g openfga-ui\n');
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${host}:${port}`);
    let pathname = url.pathname;

    if (pathname === '/') {
      pathname = '/index.html';
    }

    const filePath = join(distDir, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(distDir)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    if (!serveFile(res, filePath)) {
      // SPA fallback: serve index.html for client-side routing
      serveFile(res, join(distDir, 'index.html'));
    }
  });

  server.listen(port, host, () => {
    const url = `http://${host}:${port}`;
    console.log(`
  ┌─────────────────────────────────────────┐
  │                                         │
  │   OpenFGA UI                            │
  │                                         │
  │   Local:  ${url.padEnd(28)}│
  │                                         │
  │   Press Ctrl+C to stop                  │
  │                                         │
  └─────────────────────────────────────────┘
`);

    if (open) {
      openBrowser(url);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Error: Port ${port} is already in use.`);
      console.error(`  Try a different port: npx openfga-ui --port ${port + 1}\n`);
      process.exit(1);
    }
    throw err;
  });
}

startServer(parseArgs());
