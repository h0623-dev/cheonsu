import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream';
import { createGzip } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../tmp/safari-dist/', import.meta.url));
const release = JSON.parse(await readFile(path.join(root, 'web-release.json'), 'utf8'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', ...release })); return;
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(part => part.startsWith('.'))) {
      res.writeHead(404); res.end(); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) { res.writeHead(404); res.end(); return; }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); res.end(); return; }
    const type = types[path.extname(file)] || 'application/octet-stream';
    const revalidate = /\.(?:html|webmanifest|json)$/.test(file) || /\/(?:sw|service-worker)\.js$/.test(file);
    const immutable = /^\/assets\/.*-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(pathname);
    const etag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', revalidate ? 'no-cache' : immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    res.setHeader('ETag', etag);
    res.setHeader('Accept-Ranges', 'bytes');
    if (req.headers['if-none-match'] === etag && !req.headers.range) { res.writeHead(304); res.end(); return; }
    let start = 0, end = info.size - 1, status = 200;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
      if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
      else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return;
      }
      status = 206; res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    }
    const compressible = /^(?:text\/|application\/(?:json|manifest\+json))/.test(type);
    const gzip = status === 200 && compressible && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (compressible) res.setHeader('Vary', 'Accept-Encoding');
    if (gzip) res.setHeader('Content-Encoding', 'gzip');
    else res.setHeader('Content-Length', Math.max(0, end - start + 1));
    res.writeHead(status);
    if (req.method === 'HEAD' || info.size === 0) { res.end(); return; }
    const input = createReadStream(file, { start, end });
    const complete = error => { if (error) res.destroy(); };
    if (gzip) pipeline(input, createGzip(), res, complete);
    else pipeline(input, res, complete);
  } catch (error) {
    if (!res.headersSent) res.writeHead(error instanceof URIError ? 400 : 404);
    res.end();
  }
});

server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => {
  console.log(`천수 Safari 웹 실행: ${release.gameVersion} / ${release.webRevision}`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
