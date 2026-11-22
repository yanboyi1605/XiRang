import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const INDEX_PATH = path.join(ROOT, 'data', 'stock-index.json');

let indexPromise = null;
const MARKET_PRIORITY = { CN: 3, HK: 2, US: 1 };
const MARKET_LABEL = { CN: 'A股', HK: '港股', US: '美股' };

async function loadIndex() {
  if (!indexPromise) {
    indexPromise = fs
      .readFile(INDEX_PATH, 'utf8')
      .then((text) => JSON.parse(text))
      .catch(() => []);
  }
  return indexPromise;
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s._-]/g, '');
}

function scoreItem(item, raw, compact) {
  const name = String(item.name || '').toLowerCase();
  const nameCompact = normalize(name);
  const symbol = String(item.symbol || '').toLowerCase();
  const code = String(item.code || '').toLowerCase();
  const pinyin = String(item.pinyin || '').toLowerCase();
  const initials = String(item.initials || '').toLowerCase();
  const aliases = (item.aliases || []).map((x) => normalize(x));

  let score = 0;
  if (nameCompact === compact) score = Math.max(score, 130);
  if (symbol === raw || symbol === compact) score = Math.max(score, 126);
  if (code === compact) score = Math.max(score, 124);
  if (aliases.includes(compact)) score = Math.max(score, 120);
  if (pinyin === compact) score = Math.max(score, 118);
  if (initials === compact) score = Math.max(score, 114);
  if (nameCompact.startsWith(compact)) score = Math.max(score, 104);
  if (code.startsWith(compact)) score = Math.max(score, 100);
  if (symbol.startsWith(compact)) score = Math.max(score, 98);
  if (aliases.some((a) => a.startsWith(compact))) score = Math.max(score, 94);
  if (pinyin.startsWith(compact)) score = Math.max(score, 90);
  if (initials.startsWith(compact)) score = Math.max(score, 88);
  if (nameCompact.includes(compact)) score = Math.max(score, 74);
  if (aliases.some((a) => a.includes(compact))) score = Math.max(score, 70);
  if (pinyin.includes(compact)) score = Math.max(score, 64);
  if (initials.includes(compact)) score = Math.max(score, 62);
  if (code.includes(compact)) score = Math.max(score, 58);
  if (symbol.includes(compact)) score = Math.max(score, 52);
  return score;
}

export async function searchStocks(query, { market = 'ALL', limit = 20 } = {}) {
  const q = String(query || '').trim();
  if (!q) return [];
  const raw = q.toLowerCase();
  const compact = normalize(q);
  if (!compact) return [];

  const index = await loadIndex();
  const filtered = market && market !== 'ALL' ? index.filter((x) => x.market === market) : index;
  const hits = [];
  for (const item of filtered) {
    const score = scoreItem(item, raw, compact);
    if (!score) continue;
    hits.push({ item, score });
  }

  hits.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const pm = (MARKET_PRIORITY[b.item.market] || 0) - (MARKET_PRIORITY[a.item.market] || 0);
    if (pm) return pm;
    const len = String(a.item.name).length - String(b.item.name).length;
    if (len) return len;
    return String(a.item.symbol).localeCompare(String(b.item.symbol));
  });

  return hits.slice(0, limit).map(({ item }) => ({
    symbol: item.symbol,
    code: item.code,
    name: item.name,
    market: item.market,
    marketLabel: MARKET_LABEL[item.market] || item.market,
    exchange: item.exchange || '',
    pinyin: item.pinyin || '',
  }));
}

export async function getHotStocks(limit = 12) {
  const index = await loadIndex();
  const wanted = ['601398.SS', '600900.SS', '601088.SS', '600519.SS', '0700.HK', 'AAPL', 'KO', 'VOO', 'NVDA', 'MSFT', '600036.SS', '601318.SS'];
  const map = new Map(index.map((x) => [x.symbol, x]));
  return wanted
    .map((symbol) => map.get(symbol))
    .filter(Boolean)
    .slice(0, limit)
    .map((item) => ({
      symbol: item.symbol,
      code: item.code,
      name: item.name,
      market: item.market,
      marketLabel: MARKET_LABEL[item.market] || item.market,
    }));
}

export async function findStockName(symbol) {
  const index = await loadIndex();
  const item = index.find((x) => x.symbol === symbol);
  return item ? item.name : '';
}
