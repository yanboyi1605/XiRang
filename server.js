import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadStock, sliceForRange, PRESETS, warmup } from './lib/data.js';
import { searchStocks, getHotStocks } from './lib/search.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3210;
const HOST = process.env.HOST || '127.0.0.1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (body.length > 1024 && /\bgzip\b/.test(res.req.headers['accept-encoding'] || '')) {
    const gz = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers['Content-Length'] = gz.length;
    res.writeHead(status, headers);
    res.end(gz);
  } else {
    headers['Content-Length'] = Buffer.byteLength(body);
    res.writeHead(status, headers);
    res.end(body);
  }
}

async function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function serveStatic(res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(PUBLIC, `.${rel}`);
  if (!file.startsWith(PUBLIC + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new Error('not a file');
    const data = await fs.readFile(file);
    const ext = path.extname(file).toLowerCase();
    const cache = rel.startsWith('/vendor/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, now: new Date().toISOString() });
  }

  if (url.pathname === '/api/presets') {
    return sendJson(res, 200, { ok: true, presets: PRESETS });
  }

  if (url.pathname === '/api/search') {
    const q = url.searchParams.get('q') || '';
    const market = (url.searchParams.get('market') || 'ALL').toUpperCase();
    const limit = Math.min(30, Math.max(1, Number(url.searchParams.get('limit')) || 20));
    try {
      const results = await searchStocks(q, {
        market: ['CN', 'HK', 'US'].includes(market) ? market : 'ALL',
        limit,
      });
      return sendJson(res, 200, { ok: true, query: q, results });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (url.pathname === '/api/hot') {
    try {
      return sendJson(res, 200, { ok: true, results: await getHotStocks() });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }

  if (url.pathname === '/api/stock') {
    const symbol = url.searchParams.get('symbol');
    const start = url.searchParams.get('start');
    if (!symbol) return sendJson(res, 400, { ok: false, error: '缺少股票代码' });
    if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      return sendJson(res, 400, { ok: false, error: '日期格式应为 YYYY-MM-DD' });
    }
    try {
      const data = await withTimeout(
        loadStock(symbol, { force: url.searchParams.get('refresh') === '1' }),
        16000,
        '获取行情超时，请稍后重试',
      );
      const sliced = sliceForRange(data, start);
      if (!sliced.prices.length) {
        return sendJson(res, 422, { ok: false, error: '该日期之后没有行情，请把开始日期调早一些' });
      }
      return sendJson(res, 200, { ok: true, ...sliced });
    } catch (err) {
      const notFound = /找不到|股票代码|格式/.test(err.message || '');
      return sendJson(res, notFound ? 404 : 502, {
        ok: false,
        error: notFound ? err.message : `暂时无法获取行情：${err.message}`,
      });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
  }

  return serveStatic(res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`息壤 · 股息复利计算器  →  http://${HOST}:${PORT}`);
  warmup().catch(() => {});
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`端口 ${PORT} 已被占用，请设置 PORT 环境变量后重启。`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
