import fs from 'node:fs/promises';
import path from 'node:path';
import { findStockName } from './search.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const SEED_DIR = path.join(ROOT, 'data', 'seed');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export const PRESETS = [
  { symbol: '601398.SS', name: '工商银行', tag: '高股息银行' },
  { symbol: '600900.SS', name: '长江电力', tag: '水电现金牛' },
  { symbol: '601088.SS', name: '中国神华', tag: '煤炭高息' },
  { symbol: '600519.SS', name: '贵州茅台', tag: '消费龙头' },
  { symbol: 'KO', name: '可口可乐', tag: '股息贵族' },
  { symbol: 'AAPL', name: '苹果', tag: '科技成长' },
  { symbol: 'VOO', name: '标普500 ETF', tag: '宽基指数' },
];

const PRESET_NAMES = new Map(PRESETS.map((p) => [p.symbol, p.name]));
const inflight = new Map();
let cookieCache = { value: '', expires: 0 };

export function isCnSymbol(symbol) {
  return /\.(SS|SZ|BJ)$/.test(symbol);
}

async function getYahooCookie(force = false) {
  if (!force && cookieCache.value && Date.now() < cookieCache.expires) return cookieCache.value;
  try {
    const res = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(4500),
    });
    const list = res.headers.getSetCookie?.() || [];
    const cookie = list.map((c) => c.split(';')[0]).join('; ');
    if (cookie) cookieCache = { value: cookie, expires: Date.now() + 3600 * 1000 };
    return cookie;
  } catch {
    return cookieCache.value;
  }
}

export async function warmup() {
  await getYahooCookie();
}

const fatalError = (message) => Object.assign(new Error(message), { fatal: true });

export function normalizeSymbol(raw) {
  let s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!s) throw new Error('请输入股票代码');
  s = s.replace(/^SH(\d{6})$/, '$1.SS').replace(/^SZ(\d{6})$/, '$1.SZ');
  s = s.replace(/^(\d{6})\.SH$/, '$1.SS').replace(/^(\d{6})\.SZ$/, '$1.SZ');
  if (/^\d{6}$/.test(s)) {
    if (/^[69]/.test(s)) s = `${s}.SS`;
    else if (/^[03]/.test(s)) s = `${s}.SZ`;
    else if (/^[48]/.test(s)) s = `${s}.BJ`;
  }
  if (/^\d{5}$/.test(s)) s = `${s.slice(1)}.HK`;
  if (/^0\d{4}\.HK$/.test(s)) s = s.slice(1);
  if (!/^[A-Z0-9.^=_-]{1,12}$/.test(s)) throw new Error('股票代码格式不正确，例如 601398、0700.HK、AAPL');
  return s;
}

function cacheFile(symbol, dir) {
  return path.join(dir, `${symbol.replace(/[^\w.^-]/g, '_')}.json`);
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data));
  await fs.rename(tmp, file);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function marketOf(symbol) {
  if (/\.(SS|SZ|BJ)$/.test(symbol)) return 'CN';
  if (/\.HK$/.test(symbol)) return 'HK';
  return 'US';
}

function cnExchange(symbol) {
  if (symbol.endsWith('.SS')) return '上交所';
  if (symbol.endsWith('.SZ')) return '深交所';
  if (symbol.endsWith('.BJ')) return '北交所';
  return '';
}

/* =========================================================
   Yahoo Finance（美股 / 港股 / 其他市场）
   ========================================================= */

function normalizeYahoo(symbol, result, presetName) {
  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const prices = [];
  for (let i = 0; i < ts.length; i++) {
    const close = closes[i];
    if (close == null || !Number.isFinite(close) || close <= 0) continue;
    prices.push([new Date(ts[i] * 1000).toISOString().slice(0, 10), Number(close.toFixed(4))]);
  }
  prices.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (!prices.length) throw new Error('该代码没有可用行情');

  const dividends = Object.values(result.events?.dividends || {})
    .filter((d) => d && d.amount > 0 && d.date)
    .map((d) => [new Date(d.date * 1000).toISOString().slice(0, 10), Number(Number(d.amount).toFixed(6))])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  const market = marketOf(symbol);
  return {
    symbol: meta.symbol || symbol,
    name: presetName || meta.longName || meta.shortName || symbol,
    nameEn: meta.longName || meta.shortName || '',
    currency: meta.currency || 'USD',
    exchange: meta.fullExchangeName || meta.exchangeName || '',
    exchangeCode: meta.exchangeName || '',
    market,
    prices,
    dividends,
    shareEvents: [],
    firstDate: prices[0][0],
    lastDate: prices[prices.length - 1][0],
    lastPrice: prices[prices.length - 1][1],
    fetchedAt: new Date().toISOString(),
    source: 'Yahoo Finance',
    sourceLabel: 'Yahoo Finance · 拆股复权',
  };
}

async function fetchYahoo(symbol) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  const now = Math.floor(Date.now() / 1000);
  let cookie = await getYahooCookie();
  let lastErr = '数据源无响应';
  for (let attempt = 0; attempt < 3; attempt++) {
    const host = hosts[attempt % hosts.length];
    const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=0&period2=${now}&interval=1d&events=div%2Csplits`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': UA,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          ...(cookie ? { Cookie: cookie } : {}),
          Origin: 'https://finance.yahoo.com',
          Referer: 'https://finance.yahoo.com/',
        },
        signal: AbortSignal.timeout(12000),
      });
      const text = await res.text();
      if (text.startsWith('{')) {
        const json = JSON.parse(text);
        if (json?.chart?.error) {
          const desc = json.chart.error.description || '';
          if (/not found|no data|delisted|invalid/i.test(desc)) {
            throw fatalError('找不到该股票代码，请检查代码或换一个市场');
          }
          throw fatalError(desc || '该股票暂时没有可用行情');
        }
        const result = json?.chart?.result?.[0];
        if (result?.timestamp?.length) return result;
        throw fatalError('该股票暂时没有可用行情');
      }
      if (res.status === 404) {
        throw fatalError('找不到该股票代码，请检查代码或换一个市场');
      }
      if (res.status === 403 || res.status === 429) {
        cookie = await getYahooCookie(true);
        lastErr = '数据源繁忙，正在重试';
      } else {
        lastErr = `数据源返回 ${res.status}`;
      }
    } catch (err) {
      if (err.fatal) throw err;
      lastErr = err.name === 'TimeoutError' ? '数据源响应超时' : err.message;
    }
    if (attempt < 2) await sleep(1000 * 2 ** attempt + Math.random() * 500);
  }
  throw new Error(lastErr === '数据源无响应' ? '数据源暂时不可用' : lastErr);
}

/* =========================================================
   东方财富（A 股：不复权价 + 实际分红 / 送转）
   ========================================================= */

function emSecid(symbol) {
  const m = /^(\d{6})\.(SS|SZ|BJ)$/.exec(symbol);
  if (!m) return null;
  return `${m[2] === 'SS' ? '1' : '0'}.${m[1]}`;
}

async function fetchEastmoneyPrices(symbol) {
  const secid = emSecid(symbol);
  if (!secid) throw new Error('不是 A 股代码');
  const url =
    `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}` +
    '&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    '&klt=101&fqt=0&beg=19900101&end=20500101';
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`东方财富行情请求失败（${res.status}）`);
  const json = await res.json();
  const data = json?.data;
  if (!data?.klines?.length) throw new Error('东方财富暂无该股票行情');

  const prices = [];
  for (const line of data.klines) {
    const cols = line.split(',');
    const date = cols[0];
    const close = Number(cols[2]);
    if (!date || !Number.isFinite(close) || close <= 0) continue;
    prices.push([date, Number(close.toFixed(4))]);
  }
  prices.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  if (!prices.length) throw new Error('东方财富暂无该股票行情');
  return { name: data.name, prices };
}

async function fetchEastmoneyDividends(symbol) {
  const code = symbol.slice(0, 6);
  const rows = [];
  for (let page = 1; page <= 3; page++) {
    const filter = encodeURIComponent(`(SECURITY_CODE="${code}")`);
    const url =
      `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL` +
      `&filter=${filter}&pageNumber=${page}&pageSize=500&sortColumns=EX_DIVIDEND_DATE&sortTypes=-1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Referer: 'https://data.eastmoney.com/' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`东方财富分红请求失败（${res.status}）`);
    const json = await res.json();
    const list = json?.result?.data || [];
    rows.push(...list);
    if (!json?.result?.pages || page >= json.result.pages) break;
  }

  const dividends = [];
  const shareEvents = [];
  for (const row of rows) {
    const date = String(row.EX_DIVIDEND_DATE || '').slice(0, 10);
    if (!date) continue;
    if (row.ASSIGN_PROGRESS && !String(row.ASSIGN_PROGRESS).includes('实施')) continue;
    const cashPerShare = Number(row.PRETAX_BONUS_RMB || 0) / 10;
    const bonusPer10 = Number(row.BONUS_IT_RATIO || 0) + Number(row.BONUS_RATIO || 0);
    const ratio = bonusPer10 > 0 ? 1 + bonusPer10 / 10 : 1;
    if (cashPerShare > 0) {
      dividends.push([date, Number(cashPerShare.toFixed(6))]);
    }
    if (ratio > 1.000001) {
      shareEvents.push([date, Number(ratio.toFixed(6))]);
    }
  }
  dividends.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  shareEvents.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { dividends, shareEvents };
}

async function fetchEastmoney(symbol, presetName) {
  const [{ name, prices }, { dividends, shareEvents }] = await Promise.all([
    fetchEastmoneyPrices(symbol),
    fetchEastmoneyDividends(symbol),
  ]);
  return {
    symbol,
    name: presetName || name || symbol,
    nameEn: '',
    currency: 'CNY',
    exchange: cnExchange(symbol),
    exchangeCode: symbol.slice(-2),
    market: 'CN',
    prices,
    dividends,
    shareEvents,
    firstDate: prices[0][0],
    lastDate: prices[prices.length - 1][0],
    lastPrice: prices[prices.length - 1][1],
    fetchedAt: new Date().toISOString(),
    source: 'Eastmoney',
    sourceLabel: '东方财富 · 不复权',
  };
}

/* =========================================================
   对外：抓取、缓存、切片
   ========================================================= */

export async function fetchStockData(symbol, presetName) {
  let indexedName = '';
  try {
    indexedName = await findStockName(symbol);
  } catch {
    indexedName = '';
  }
  const preferredName = presetName || indexedName || PRESET_NAMES.get(symbol);
  if (isCnSymbol(symbol)) {
    try {
      return await fetchEastmoney(symbol, preferredName);
    } catch (err) {
      // A 股优先用东方财富；失败时回退 Yahoo，并明确标记数据口径
      try {
        const yahoo = normalizeYahoo(symbol, await fetchYahoo(symbol), preferredName);
        return {
          ...yahoo,
          warning: `东方财富数据不可用（${err.message}），已回退 Yahoo，送转股口径可能不准确`,
          sourceLabel: 'Yahoo Finance · 备用数据',
        };
      } catch {
        throw err;
      }
    }
  }
  return normalizeYahoo(symbol, await fetchYahoo(symbol), preferredName);
}

async function refresh(symbol) {
  if (inflight.has(symbol)) return inflight.get(symbol);
  const task = (async () => {
    const data = await fetchStockData(symbol);
    await writeJson(cacheFile(symbol, CACHE_DIR), data);
    return data;
  })();
  inflight.set(symbol, task);
  try {
    return await task;
  } finally {
    inflight.delete(symbol);
  }
}

function hydrate(data) {
  const market = data.market || marketOf(data.symbol);
  return {
    ...data,
    market,
    shareEvents: data.shareEvents || [],
    sourceLabel:
      data.sourceLabel ||
      (data.source === 'Eastmoney' ? '东方财富 · 不复权' : 'Yahoo Finance · 拆股复权'),
  };
}

export async function loadStock(rawSymbol, { force = false } = {}) {
  const symbol = normalizeSymbol(rawSymbol);
  const cachePath = cacheFile(symbol, CACHE_DIR);
  const seedPath = cacheFile(symbol, SEED_DIR);
  const cachedRaw = (await readJson(cachePath)) || (await readJson(seedPath));
  const cached = cachedRaw ? hydrate(cachedRaw) : null;
  if (cached) {
    try {
      const indexedName = await findStockName(symbol);
      if (indexedName) cached.name = indexedName;
    } catch {
      /* ignore */
    }
  }

  if (cached && !force) {
    const age = Date.now() - Date.parse(cached.fetchedAt || 0);
    if (age < 6 * 3600 * 1000) return { ...cached, stale: false };
    refreshInBackground(symbol);
    return { ...cached, stale: true };
  }

  try {
    const data = await refresh(symbol);
    return { ...hydrate(data), stale: false };
  } catch (err) {
    if (cached) return { ...cached, stale: true, warning: err.message };
    throw err;
  }
}

function refreshInBackground(symbol) {
  if (inflight.has(symbol)) return;
  refresh(symbol).catch(() => {});
}

export function sliceForRange(data, start) {
  const from = start || data.firstDate;
  const prices = data.prices.filter(([d]) => d >= from);
  const dividends = data.dividends.filter(([d]) => d >= from);
  const shareEvents = (data.shareEvents || []).filter(([d]) => d >= from);
  return {
    symbol: data.symbol,
    name: data.name,
    nameEn: data.nameEn,
    currency: data.currency,
    exchange: data.exchange,
    exchangeCode: data.exchangeCode,
    market: data.market,
    prices,
    dividends,
    shareEvents,
    firstDate: data.firstDate,
    lastDate: data.lastDate,
    lastPrice: data.lastPrice,
    fetchedAt: data.fetchedAt,
    source: data.source,
    sourceLabel: data.sourceLabel,
    stale: data.stale,
    warning: data.warning,
  };
}
