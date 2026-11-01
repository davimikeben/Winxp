#!/usr/bin/env node
/**
 * server.js - servidor estatico minimo (zero dependencias) para o player
 * WASM de FIFA 99.
 *
 * Por que nao usar `python -m http.server` ou `npx serve`?
 * O modo multi-thread do core mupen64plus_next depende de SharedArrayBuffer,
 * que o navegador so habilita quando a pagina e "cross-origin isolated".
 * Isso exige dois headers que servidores prontos nao enviam por padrao:
 *
 *   Cross-Origin-Opener-Policy: same-origin
 *   Cross-Origin-Embedder-Policy: require-corp
 *
 * Uso:
 *   node server.js              # http://localhost:8080
 *   PORT=3000 node server.js    # outra porta
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname);
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.z64': 'application/octet-stream',
  '.n64': 'application/octet-stream',
  '.v64': 'application/octet-stream',
  '.rom': 'application/octet-stream',
  '.bin': 'application/octet-stream',
  '.zip': 'application/zip',
  '.7z': 'application/x-7z-compressed',
  '.state': 'application/octet-stream',
  '.sav': 'application/octet-stream'
};

function baseHeaders(extra) {
  return Object.assign(
    {
      // Isolamento de origem -> habilita SharedArrayBuffer (threads do core).
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    },
    extra || {}
  );
}

function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const target = path.resolve(ROOT, '.' + decoded);
  // Bloqueia path traversal para fora do projeto.
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) return null;
  return target;
}

function sendError(res, code, message, headOnly) {
  const body = `${code} ${message}\n`;
  res.writeHead(
    code,
    baseHeaders({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    })
  );
  res.end(headOnly ? undefined : body);
}

function serveFile(req, res, filePath, stats) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headOnly = req.method === 'HEAD';
  const range = req.headers.range;

  // Suporte a HTTP Range (util para ROMs grandes e para o <video>/fetch).
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (match) {
      let start = match[1] === '' ? null : parseInt(match[1], 10);
      let end = match[2] === '' ? null : parseInt(match[2], 10);
      if (start === null) {
        start = Math.max(0, stats.size - (end || 0));
        end = stats.size - 1;
      }
      if (end === null || end >= stats.size) end = stats.size - 1;
      if (start > end || start >= stats.size) {
        res.writeHead(416, baseHeaders({ 'Content-Range': `bytes */${stats.size}` }));
        res.end();
        return;
      }
      res.writeHead(
        206,
        baseHeaders({
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes'
        })
      );
      if (headOnly) return res.end();
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }

  res.writeHead(
    200,
    baseHeaders({
      'Content-Type': type,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes'
    })
  );
  if (headOnly) return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendError(res, 405, 'Metodo nao permitido');
  }

  let target = resolvePath(req.url || '/');
  if (!target) return sendError(res, 403, 'Acesso negado', req.method === 'HEAD');

  fs.stat(target, (err, stats) => {
    if (!err && stats.isDirectory()) {
      target = path.join(target, 'index.html');
      return fs.stat(target, (err2, stats2) => {
        if (err2) return sendError(res, 404, 'Nao encontrado', req.method === 'HEAD');
        serveFile(req, res, target, stats2);
      });
    }
    if (err) return sendError(res, 404, 'Nao encontrado', req.method === 'HEAD');
    serveFile(req, res, target, stats);
  });
}

function localAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  Object.keys(ifaces).forEach((name) => {
    (ifaces[name] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    });
  });
  return out;
}

http.createServer(handler).listen(PORT, HOST, () => {
  console.log('FIFA 99 WebAssembly - servidor pronto\n');
  console.log(`  Local:   http://localhost:${PORT}`);
  localAddresses().forEach((ip) => {
    console.log(`  Celular: http://${ip}:${PORT}   (mesmo Wi-Fi)`);
  });
  console.log('\n  Headers COOP/COEP ativos -> SharedArrayBuffer disponivel.');
  console.log('  Ctrl+C para parar.\n');
});
