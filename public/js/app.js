import { simulate } from './simulate.js';

/* =========================================================
   Constants & helpers
   ========================================================= */

const FALLBACK_PRESETS = [
  { symbol: '601398.SS', name: '工商银行', tag: '高股息银行' },
  { symbol: '600900.SS', name: '长江电力', tag: '水电现金牛' },
  { symbol: '601088.SS', name: '中国神华', tag: '煤炭高息' },
  { symbol: '600519.SS', name: '贵州茅台', tag: '消费龙头' },
  { symbol: 'KO', name: '可口可乐', tag: '股息贵族' },
  { symbol: 'AAPL', name: '苹果', tag: '科技成长' },
  { symbol: 'VOO', name: '标普500 ETF', tag: '宽基指数' },
];

const DEFAULT_CONFIG = {
  symbol: '601398.SS',
  start: '2015-01-05',
  freq: 'monthly',
  initial: 50000,
  recurring: 2000,
  reinvest: true,
  holdingTax: null,
  tax: 0,
  schedulePolicy: 'roll',
};

const STORAGE_KEY = 'xirang.config.v2';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  stock: null,
  cache: new Map(),
  main: null,
  alt: null,
  cfg: null,
  freq: 'monthly',
  charts: { growth: null, dividend: null, shares: null },
  loading: false,
  abort: null,
  requestSeq: 0,
  toastTimer: null,
  stateTimer: null,
  debounceTimer: null,
  loadingHintTimer: null,
  tradingDates: new Set(),
  taxPref: null,
  schedulePolicy: 'roll',
  dateNotice: '',
  expandedYears: new Set(),
  searchTimer: null,
  searchSeq: 0,
};

const els = {
  configForm: $('#configForm'),
  symbolInput: $('#symbolInput'),
  loadSymbolBtn: $('#loadSymbolBtn'),
  searchResults: $('#searchResults'),
  presets: $('#presetsEl'),
  stockIcon: $('#stockIcon'),
  stockCardName: $('#stockCardName'),
  stockCardCode: $('#stockCardCode'),
  stockCurrency: $('#stockCurrency'),
  stockRange: $('#stockRange'),
  stockPrice: $('#stockPrice'),
  startDate: $('#startDate'),
  dateHint: $('#dateHint'),
  dateFixBtn: $('#dateFixBtn'),
  dateFixText: $('#dateFixText'),
  freqSegment: $('#freqSegment'),
  initialAmount: $('#initialAmount'),
  initialLabel: $('#initialLabel'),
  initialHint: $('#initialHint'),
  amountGrid: $('#amountGrid'),
  recurringWrap: $('#recurringWrap'),
  recurringLabel: $('#recurringLabel'),
  recurringAmount: $('#recurringAmount'),
  scheduleHint: $('#scheduleHint'),
  schedulePolicy: $('#schedulePolicy'),
  schedulePolicyRow: $('#schedulePolicyRow'),
  reinvestToggle: $('#reinvestToggle'),
  holdingTax: $('#holdingTax'),
  holdingTaxRow: $('#holdingTaxRow'),
  holdingTaxNote: $('#holdingTaxNote'),
  fixedTaxRow: $('#fixedTaxRow'),
  taxHint: $('#taxHint'),
  taxTip: $('#taxTip'),
  taxRate: $('#taxRate'),
  refreshDataBtn: $('#refreshDataBtn'),
  calcBtn: $('#calcBtn'),
  formError: $('#formError'),
  stockName: $('#stockName'),
  stockTicker: $('#stockTicker'),
  resultRange: $('#resultRange'),
  dataChip: $('#dataChip'),
  dataChipText: $('#dataChipText'),
  dataChipSub: $('#dataChipSub'),
  errorBanner: $('#errorBanner'),
  errorText: $('#errorText'),
  retryBtn: $('#retryBtn'),
  finalValue: $('#finalValue'),
  heroCurrency: $('#heroCurrency'),
  gainPill: $('#gainPill'),
  heroProfit: $('#heroProfit'),
  totalInvested: $('#totalInvested'),
  totalDividends: $('#totalDividends'),
  xirrValue: $('#xirrValue'),
  finalShares: $('#finalShares'),
  asOf: $('#asOf'),
  heroFootLeft: $('#heroFootLeft'),
  heroFootRight: $('#heroFootRight'),
  coverageValue: $('#coverageValue'),
  coverageText: $('#coverageText'),
  coverageBar: $('#coverageBar'),
  compoundLabel: $('#compoundLabel'),
  compoundValue: $('#compoundValue'),
  compoundText: $('#compoundText'),
  yieldValue: $('#yieldValue'),
  yieldText: $('#yieldText'),
  reinvestDiffText: $('#reinvestDiffText'),
  dividendUnit: $('#dividendUnit'),
  tableUnit: $('#tableUnit'),
  yearlyTableBody: $('#yearlyTableBody'),
  tableFootnote: $('#tableFootnote'),
  calcState: $('#calcState'),
  loadingLine: $('#loadingLine'),
  shareBtn: $('#shareBtn'),
  toast: $('#toast'),
};

/* =========================================================
   Formatting
   ========================================================= */

function currencySymbol(currency = state.stock?.currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  if (currency === 'CNY') return '¥';
  return currency ? `${currency} ` : '¥';
}

function fmtNum(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtMoney(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const sign = n < 0 ? '−' : '';
  return `${sign}${currencySymbol()}${fmtNum(Math.abs(n), digits)}`;
}

function fmtSignedMoney(n, digits = 0) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${currencySymbol()}${fmtNum(Math.abs(n), digits)}`;
}

function fmtCompact(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n / 1e8).toFixed(abs >= 1e9 ? 0 : 1).replace(/\.0$/, '')}亿`;
  if (abs >= 1e4) return `${(n / 1e4).toFixed(abs >= 1e6 ? 0 : 1).replace(/\.0$/, '')}万`;
  return fmtNum(n, 0);
}

function fmtPct(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtSignedPct(n, digits = 2) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

function fmtShares(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  if (Math.abs(n) >= 1000) return `${fmtNum(n, 0)} 股`;
  return `${fmtNum(n, 2)} 股`;
}

function fmtDateDot(date) {
  return date ? date.replaceAll('-', '.') : '—';
}

function fmtDateCn(date) {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

/* =========================================================
   Symbol / config
   ========================================================= */

function localNormalize(raw) {
  let s = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  s = s.replace(/^SH(\d{6})$/, '$1.SS').replace(/^SZ(\d{6})$/, '$1.SZ');
  s = s.replace(/^(\d{6})\.SH$/, '$1.SS').replace(/^(\d{6})\.SZ$/, '$1.SZ');
  if (/^\d{6}$/.test(s)) {
    if (/^[69]/.test(s)) s = `${s}.SS`;
    else if (/^[03]/.test(s)) s = `${s}.SZ`;
    else if (/^[48]/.test(s)) s = `${s}.BJ`;
  }
  if (/^\d{5}$/.test(s)) s = `${s.slice(1)}.HK`;
  if (/^0\d{4}\.HK$/.test(s)) s = s.slice(1);
  return s;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function readUrlConfig() {
  const p = new URLSearchParams(location.search);
  const symbol = p.get('s');
  if (!symbol) return null;
  return {
    symbol: localNormalize(symbol),
    start: /^\d{4}-\d{2}-\d{2}$/.test(p.get('start') || '') ? p.get('start') : DEFAULT_CONFIG.start,
    freq: ['none', 'monthly', 'yearly'].includes(p.get('freq')) ? p.get('freq') : DEFAULT_CONFIG.freq,
    initial: p.has('init') ? clampNumber(p.get('init'), 0, 1e12, DEFAULT_CONFIG.initial) : DEFAULT_CONFIG.initial,
    recurring: p.has('rec') ? clampNumber(p.get('rec'), 0, 1e12, DEFAULT_CONFIG.recurring) : DEFAULT_CONFIG.recurring,
    reinvest: p.get('re') !== '0',
    holdingTax: p.has('htax') ? p.get('htax') !== '0' : null,
    tax: p.has('tax') ? clampNumber(p.get('tax'), 0, 50, 0) : 0,
    schedulePolicy: p.get('miss') === 'skip' ? 'skip' : 'roll',
  };
}

function readSavedConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg || !cfg.symbol) return null;
    return {
      symbol: localNormalize(cfg.symbol),
      start: /^\d{4}-\d{2}-\d{2}$/.test(cfg.start || '') ? cfg.start : DEFAULT_CONFIG.start,
      freq: ['none', 'monthly', 'yearly'].includes(cfg.freq) ? cfg.freq : DEFAULT_CONFIG.freq,
      initial: clampNumber(cfg.initial, 0, 1e12, DEFAULT_CONFIG.initial),
      recurring: clampNumber(cfg.recurring, 0, 1e12, DEFAULT_CONFIG.recurring),
      reinvest: cfg.reinvest !== false,
      holdingTax: typeof cfg.holdingTax === 'boolean' ? cfg.holdingTax : null,
      tax: clampNumber(cfg.tax, 0, 50, 0),
      schedulePolicy: cfg.schedulePolicy === 'skip' ? 'skip' : 'roll',
    };
  } catch {
    return null;
  }
}

function readFormConfig() {
  const initial = clampNumber(els.initialAmount.value, 0, 1e12, 0);
  const recurring = clampNumber(els.recurringAmount.value, 0, 1e12, 0);
  const tax = clampNumber(els.taxRate.value, 0, 50, 0);
  return {
    symbol: state.stock?.symbol || els.symbolInput.value,
    start: els.startDate.value,
    freq: state.freq,
    initial,
    recurring: state.freq === 'none' ? 0 : recurring,
    reinvest: els.reinvestToggle.getAttribute('aria-checked') === 'true',
    holdingTax: els.holdingTax.checked,
    tax,
    schedulePolicy: els.schedulePolicy.value === 'skip' ? 'skip' : 'roll',
  };
}

function syncUrl(cfg) {
  const p = new URLSearchParams();
  p.set('s', cfg.symbol);
  p.set('start', cfg.start);
  p.set('freq', cfg.freq);
  p.set('init', String(Math.round(cfg.initial)));
  p.set('rec', String(Math.round(cfg.recurring)));
  p.set('re', cfg.reinvest ? '1' : '0');
  if (state.stock?.market === 'CN') p.set('htax', cfg.holdingTax ? '1' : '0');
  if (cfg.tax) p.set('tax', String(cfg.tax));
  if (cfg.freq !== 'none' && cfg.schedulePolicy === 'skip') p.set('miss', 'skip');
  try {
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...cfg,
        holdingTax: state.stock?.market === 'CN' ? cfg.holdingTax : null,
      }),
    );
  } catch {
    /* ignore */
  }
}

/* =========================================================
   UI helpers
   ========================================================= */

function setFreqUI(freq) {
  state.freq = freq;
  $$('#freqSegment button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.freq === freq);
  });
  const recurring = freq !== 'none';
  els.recurringWrap.hidden = !recurring;
  els.amountGrid.classList.toggle('single', !recurring);
  els.schedulePolicyRow.hidden = !recurring;
  if (freq === 'monthly') {
    els.initialLabel.textContent = '初始投入';
    els.initialHint.textContent = '开始日买入';
    els.recurringLabel.textContent = '每月定投';
    els.scheduleHint.textContent = '初始投入在开始日买入；每月同日定投，遇非交易日按高级设定处理。';
  } else if (freq === 'yearly') {
    els.initialLabel.textContent = '初始投入';
    els.initialHint.textContent = '开始日买入';
    els.recurringLabel.textContent = '每年定投';
    els.scheduleHint.textContent = '初始投入在开始日买入；每年同日定投，遇非交易日按高级设定处理。';
  } else {
    els.initialLabel.textContent = '投资金额';
    els.initialHint.textContent = '开始日买入';
    els.scheduleHint.textContent = '一次性买入，开始日必须是交易日。';
  }
}

function updateTaxUI() {
  const cn = state.stock?.market === 'CN';
  if (!cn) els.holdingTax.checked = false;
  const holding = cn && els.holdingTax.checked;
  els.holdingTaxRow.hidden = !cn;
  els.holdingTaxNote.hidden = !holding;
  els.fixedTaxRow.hidden = holding;
  els.taxHint.textContent = holding
    ? 'A 股按除息日持有期估算；实际在卖出时结算。'
    : cn
      ? '未勾选时按固定税率扣除。'
      : '美股 / 港股常见预扣税率为 10%–30%，可按券商实际填写。';
  els.taxTip.textContent = cn ? '不勾选则按固定税率' : '常见 10%–30%';
}

function setReinvestUI(on) {
  els.reinvestToggle.classList.toggle('on', on);
  els.reinvestToggle.setAttribute('aria-checked', String(on));
}

function updateCurrencyUI() {
  const symbol = currencySymbol();
  $$('.currency-prefix').forEach((el) => {
    el.textContent = symbol;
    el.parentElement?.classList.toggle('long', symbol.length > 1);
  });
  els.heroCurrency.textContent = symbol;
  const cur = state.stock?.currency || 'CNY';
  els.dividendUnit.textContent = cur;
  els.tableUnit.textContent = `单位：${cur}`;
  els.stockCurrency.textContent = cur;
}

function showFormError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function clearFormError() {
  els.formError.hidden = true;
  els.formError.textContent = '';
}

function showError(message) {
  els.errorText.textContent = message;
  els.errorBanner.hidden = false;
}

function hideError() {
  els.errorBanner.hidden = true;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function setLoading(loading) {
  state.loading = loading;
  els.loadingLine.classList.toggle('active', loading);
  els.calcBtn.classList.toggle('loading', loading);
  els.calcBtn.querySelector('span').textContent = loading ? '获取行情…' : '开始测算';
  if (loading) {
    els.calcState.innerHTML = '<i></i>获取行情…';
    els.dataChipText.textContent = '正在获取行情';
    els.dataChipSub.textContent = '连接行情数据源';
    els.dataChip.classList.remove('stale', 'warn');
    clearTimeout(state.loadingHintTimer);
    state.loadingHintTimer = setTimeout(() => {
      if (!state.loading) return;
      els.dataChipText.textContent = '仍在获取行情…';
      els.dataChipSub.textContent = '请确认股票代码是否正确';
    }, 4800);
  } else {
    clearTimeout(state.loadingHintTimer);
  }
}

function markCalcState() {
  els.calcState.innerHTML = '<i></i>已更新';
  clearTimeout(state.stateTimer);
  state.stateTimer = setTimeout(() => {
    els.calcState.innerHTML = '<i></i>自动测算';
  }, 2200);
}

/* =========================================================
   Presets
   ========================================================= */

function renderPresets(presets) {
  els.presets.innerHTML = '';
  for (const preset of presets) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset';
    btn.dataset.symbol = preset.symbol;
    btn.title = `${preset.symbol}${preset.tag ? ` · ${preset.tag}` : ''}`;
    btn.textContent = preset.name;
    btn.addEventListener('click', () => loadStock(preset.symbol));
    els.presets.appendChild(btn);
  }
  updateActivePreset();
}

function updateActivePreset() {
  const symbol = state.stock?.symbol;
  $$('#presetsEl .preset').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.symbol === symbol);
  });
}

async function fetchPresets() {
  try {
    const res = await fetch('/api/presets');
    const json = await res.json();
    if (json.ok && Array.isArray(json.presets) && json.presets.length) renderPresets(json.presets);
  } catch {
    /* fallback already rendered */
  }
}

/* =========================================================
   Stock search (Chinese / pinyin / code)
   ========================================================= */

function hideSearchResults() {
  if (els.searchResults) els.searchResults.hidden = true;
}

function renderSearchResults(items) {
  if (!els.searchResults) return;
  els.searchResults.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'search-empty';
    empty.textContent = '没有匹配的股票，可直接输入完整代码后加载。';
    els.searchResults.appendChild(empty);
    els.searchResults.hidden = false;
    return;
  }
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'search-result';
    const icon = document.createElement('span');
    icon.className = 'sr-icon';
    icon.textContent = (item.name || item.symbol).charAt(0);
    const copy = document.createElement('span');
    copy.className = 'sr-copy';
    const name = document.createElement('span');
    name.className = 'sr-name';
    name.textContent = item.name;
    const code = document.createElement('span');
    code.className = 'sr-code';
    code.textContent = `${item.code || ''} · ${item.symbol}`;
    copy.append(name, code);
    const market = document.createElement('span');
    market.className = 'sr-market';
    market.textContent = item.marketLabel || item.market || '';
    btn.append(icon, copy, market);
    btn.addEventListener('click', () => {
      hideSearchResults();
      els.symbolInput.value = item.symbol;
      loadStock(item.symbol);
    });
    els.searchResults.appendChild(btn);
  }
  els.searchResults.hidden = false;
}

async function searchSymbols(query) {
  const q = String(query || '').trim();
  if (!q) {
    hideSearchResults();
    return;
  }
  const seq = ++state.searchSeq;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`);
    const json = await res.json();
    if (seq !== state.searchSeq) return;
    if (json.ok) renderSearchResults(json.results || []);
  } catch {
    if (seq === state.searchSeq) hideSearchResults();
  }
}

function scheduleSymbolSearch() {
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(() => searchSymbols(els.symbolInput.value), 220);
}

/* =========================================================
   Stock loading
   ========================================================= */

function exchangeLabel(data) {
  const symbol = data.symbol || '';
  if (symbol.endsWith('.SS')) return '上交所';
  if (symbol.endsWith('.SZ')) return '深交所';
  if (symbol.endsWith('.BJ')) return '北交所';
  if (symbol.endsWith('.HK')) return '港交所';
  const map = {
    SHH: '上交所',
    SHZ: '深交所',
    HKG: '港交所',
    NMS: '纳斯达克',
    NGM: '纳斯达克',
    NCM: '纳斯达克',
    NYQ: '纽交所',
    PCX: 'NYSE Arca',
    ASE: '美交所',
    BTS: 'BATS',
  };
  return map[data.exchangeCode] || data.exchange || '证券交易所';
}

async function loadStock(rawSymbol, { force = false } = {}) {
  const symbol = localNormalize(rawSymbol);
  if (!symbol) {
    showFormError('请输入股票代码');
    return;
  }
  if (!/^[A-Z0-9.^=_-]{1,12}$/.test(symbol)) {
    showFormError('股票代码格式不正确，例如 601398、0700.HK、AAPL');
    return;
  }
  hideSearchResults();

  if (!force && state.cache.has(symbol)) {
    applyStock(state.cache.get(symbol));
    return;
  }

  state.abort?.abort();
  const controller = new AbortController();
  state.abort = controller;
  const seq = ++state.requestSeq;

  setLoading(true);
  hideError();
  clearFormError();

  try {
    const res = await fetch(
      `/api/stock?symbol=${encodeURIComponent(symbol)}&start=1900-01-01${force ? '&refresh=1' : ''}`,
      { signal: controller.signal },
    );
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || `行情请求失败（${res.status}）`);
    if (seq !== state.requestSeq) return;
    state.cache.set(json.symbol, json);
    applyStock(json);
    if (force) toast(json.stale ? '刷新失败，已沿用缓存数据' : '行情数据已刷新');
  } catch (err) {
    if (err.name === 'AbortError') return;
    if (seq !== state.requestSeq) return;
    showError(err.message || '无法获取行情，请稍后重试');
    if (state.stock) {
      els.symbolInput.value = state.stock.symbol;
      updateDataChip(state.stock);
    }
  } finally {
    if (seq === state.requestSeq) setLoading(false);
  }
}

function nextTradingDate(date) {
  if (!state.stock) return null;
  const prices = state.stock.prices;
  let lo = 0;
  let hi = prices.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (prices[mid][0] < date) lo = mid + 1;
    else hi = mid;
  }
  return lo < prices.length ? prices[lo][0] : null;
}

function isTradingDate(date) {
  return Boolean(date && state.tradingDates.has(date));
}

function applyStock(data) {
  state.stock = data;
  state.tradingDates = new Set(data.prices.map(([d]) => d));
  state.expandedYears.clear();
  els.symbolInput.value = data.symbol;
  updateCurrencyUI();

  els.stockIcon.textContent = (data.name || data.symbol).trim().charAt(0) || '息';
  els.stockCardName.textContent = data.name || data.symbol;
  els.stockCardCode.textContent = `${data.symbol} · ${exchangeLabel(data)}`;
  els.stockRange.textContent = `${fmtDateDot(data.firstDate)} — ${fmtDateDot(data.lastDate)}`;
  els.stockPrice.textContent = `最新 ${fmtNum(data.lastPrice, 2)}`;

  els.stockName.textContent = data.name || data.symbol;
  els.stockTicker.textContent = data.symbol;

  els.startDate.min = data.firstDate;
  els.startDate.max = data.lastDate;
  let start = els.startDate.value || state.cfg?.start || DEFAULT_CONFIG.start;
  const requestedStart = start;
  if (start < data.firstDate) start = data.firstDate;
  if (start > data.lastDate) start = data.lastDate;
  if (start !== requestedStart) {
    state.dateNotice = `已调整到 ${fmtDateDot(start)}`;
  }
  if (!state.tradingDates.has(start)) {
    const next = nextTradingDate(start);
    if (next) {
      start = next;
      state.dateNotice = `已调整到下一交易日 ${fmtDateDot(start)}`;
    }
  } else if (start === requestedStart) {
    state.dateNotice = '';
  }
  els.startDate.value = start;
  els.dateFixBtn.hidden = true;
  els.dateHint.classList.remove('warn');

  if (data.market === 'CN') {
    els.holdingTax.checked = state.taxPref === null ? true : state.taxPref;
  } else {
    els.holdingTax.checked = false;
  }
  els.schedulePolicy.value = state.schedulePolicy;
  updateTaxUI();

  updateActivePreset();
  updateDataChip(data);
  runSimulation({ animate: true, sync: true });
}

function updateDataChip(data) {
  els.dataChip.classList.toggle('stale', Boolean(data.stale));
  els.dataChip.classList.toggle('warn', Boolean(data.warning));
  els.dataChipText.textContent = data.stale
    ? `缓存数据 · ${fmtDateDot(data.lastDate)}`
    : data.warning
      ? `备用数据 · ${fmtDateDot(data.lastDate)}`
      : `数据截至 ${fmtDateDot(data.lastDate)}`;
  const cur = data.currency || 'CNY';
  els.dataChipSub.textContent = `${data.sourceLabel || '行情数据'} · ${cur}`;
  els.dataChip.title = data.warning || '价格与分红来自公开行情数据源';
}

/* =========================================================
   Simulation
   ========================================================= */

function runSimulation({ animate = false, sync = true, scroll = false } = {}) {
  if (!state.stock) return;
  clearFormError();

  const cfg = readFormConfig();
  if (!cfg.start) {
    showFormError('请选择开始日期');
    return;
  }
  if (cfg.start < state.stock.firstDate) {
    showFormError(`开始日期不能早于 ${fmtDateDot(state.stock.firstDate)}`);
    return;
  }
  if (cfg.start > state.stock.lastDate) {
    showFormError(`开始日期不能晚于最新行情 ${fmtDateDot(state.stock.lastDate)}`);
    return;
  }
  if (!isTradingDate(cfg.start)) {
    const next = nextTradingDate(cfg.start);
    els.dateFixBtn.hidden = !next;
    if (next) els.dateFixText.textContent = fmtDateDot(next);
    els.dateHint.textContent = next ? `非交易日 · 下一交易日 ${fmtDateDot(next)}` : '该日期没有交易';
    els.dateHint.classList.add('warn');
    showFormError(`${fmtDateDot(cfg.start)} 不是交易日，请选择交易日${next ? `（下一交易日 ${fmtDateDot(next)}）` : ''}`);
    return;
  }
  if (cfg.initial <= 0 && (cfg.freq === 'none' || cfg.recurring <= 0)) {
    showFormError('请输入大于 0 的投资金额');
    return;
  }

  const base = {
    prices: state.stock.prices,
    dividends: state.stock.dividends,
    shareEvents: state.stock.shareEvents || [],
    startDate: cfg.start,
    initialAmount: cfg.initial,
    frequency: cfg.freq,
    recurringAmount: cfg.recurring,
    taxMode: cfg.holdingTax ? 'holding' : 'fixed',
    taxRate: cfg.tax / 100,
    schedulePolicy: cfg.schedulePolicy,
  };

  try {
    const main = simulate({ ...base, reinvest: cfg.reinvest });
    const alt = simulate({ ...base, reinvest: !cfg.reinvest });
    state.main = main;
    state.alt = alt;
    state.cfg = cfg;
  } catch (err) {
    showFormError(err.message || '测算失败，请检查参数');
    return;
  }

  renderAll(animate);
  if (sync) syncUrl(cfg);
  markCalcState();

  if (scroll && matchMedia('(max-width: 1024px)').matches) {
    $('#resultCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/* =========================================================
   Render
   ========================================================= */

function renderAll(animate) {
  const { main, alt, cfg } = state;
  renderHeader(main, cfg);
  renderHero(main, alt, cfg, animate);
  renderInsights(main, alt, cfg);
  renderCharts(main, cfg);
  renderTable(main, cfg);
}

function renderHeader(main, cfg) {
  const s = main.summary;
  const buyCount = main.transactions.filter((t) => t.type === 'buy').length;
  els.resultRange.textContent = `${fmtDateDot(s.startDate)} — ${fmtDateDot(s.endDate)} · ${s.years.toFixed(1)} 年 · ${s.dividendCount} 次分红 · ${buyCount} 次买入`;
  const notice = state.dateNotice ? `${state.dateNotice} · ` : '';
  els.dateHint.textContent = `${notice}至今 · ${s.years.toFixed(1)} 年 · 共 ${buyCount} 次买入`;
  els.dateHint.classList.toggle('warn', Boolean(state.dateNotice));
  els.asOf.textContent = `截至 ${fmtDateDot(s.endDate)}`;
  updateDataChip(state.stock);
}

function renderHero(main, alt, cfg, animate) {
  const s = main.summary;
  const cur = state.stock.currency;
  const prefix = currencySymbol(cur);

  if (animate) {
    animateNumber(els.finalValue, s.finalValue, (v) => fmtNum(v, 0));
  } else {
    els.finalValue.textContent = fmtNum(s.finalValue, 0);
  }
  els.finalValue.dataset.value = String(s.finalValue);
  els.heroCurrency.textContent = prefix;

  const isUp = s.totalReturn >= 0;
  els.gainPill.textContent = fmtSignedPct(s.returnPct, 1);
  els.gainPill.classList.toggle('negative', !isUp);
  els.heroProfit.textContent = `总收益 ${fmtSignedMoney(s.totalReturn)} · ${s.multiple ? `${s.multiple.toFixed(2)} 倍` : '—'}`;

  els.totalInvested.textContent = fmtMoney(s.totalInvested);
  els.totalDividends.textContent = fmtMoney(s.totalDividends);
  els.xirrValue.textContent = s.xirr == null ? '—' : fmtSignedPct(s.xirr, 2);
  els.xirrValue.style.color = s.xirr != null && s.xirr < 0 ? '#b3d5c1' : '';
  els.finalShares.textContent = fmtShares(s.finalShares);

  const taxText =
    s.totalTax > 0.5
      ? ` · 红利税 ${fmtMoney(s.totalTax)}（${fmtPct(s.effectiveTaxRate, 1)}）`
      : cfg.holdingTax && s.dividendCount > 0
        ? ' · 持有满 1 年免税'
        : '';
  els.heroFootLeft.textContent = `${s.dividendCount} 次分红 · ${cfg.reinvest ? '全部再投资' : '现金留存'}${taxText}`;
  const freqText = cfg.freq === 'monthly' ? `每月 ${fmtMoney(cfg.recurring)}` : cfg.freq === 'yearly' ? `每年 ${fmtMoney(cfg.recurring)}` : `一次性 ${fmtMoney(cfg.initial)}`;
  els.heroFootRight.textContent = `${freqText} · 期末现金 ${fmtMoney(s.cash)}`;
}

function renderInsights(main, alt, cfg) {
  const s = main.summary;
  const coverage = s.totalInvested > 0 ? s.totalDividends / s.totalInvested : 0;
  els.coverageValue.textContent = fmtPct(coverage, 1);
  els.coverageText.textContent = `累计税后分红 ${fmtMoney(s.totalDividends)}，相当于投入本金的 ${fmtPct(coverage, 1)}。`;
  els.coverageBar.style.width = `${Math.min(100, Math.max(0, coverage * 100))}%`;

  const diff = cfg.reinvest ? main.summary.finalValue - alt.summary.finalValue : alt.summary.finalValue - main.summary.finalValue;
  els.compoundLabel.textContent = cfg.reinvest ? '再投资差额' : '再投资潜力';
  els.compoundValue.textContent = fmtSignedMoney(diff);
  els.compoundValue.classList.toggle('negative', diff < 0);
  if (s.dividendCount === 0) {
    els.compoundValue.textContent = fmtMoney(0);
    els.compoundText.textContent = '所选区间没有分红记录，两种方案的结果相同。';
  } else if (cfg.reinvest) {
    els.compoundText.textContent =
      diff >= 0
        ? `同样的投入，分红再投资比现金分红多出 ${fmtMoney(diff)}。`
        : `这段行情里，分红再投资比现金分红少 ${fmtMoney(Math.abs(diff))}（分红买在了较高价位）。`;
  } else {
    els.compoundText.textContent =
      diff >= 0
        ? `当前选择现金分红；若全部分红再投资，期末资产会多 ${fmtMoney(diff)}。`
        : `当前选择现金分红；这段行情里再投资反而少 ${fmtMoney(Math.abs(diff))}。`;
  }

  const y = s.currentYield;
  els.yieldValue.textContent = y == null ? '—' : fmtPct(y, 2);
  els.yieldText.textContent =
    s.ttmDividends > 0
      ? `近 12 个月税后分红 ${fmtMoney(s.ttmDividends)}，按期末市值计算的组合股息率。`
      : '近 12 个月没有分红记录。';

  const diffText =
    s.dividendCount === 0
      ? '所选区间没有分红记录，复利差额为 0。'
      : cfg.reinvest
        ? diff >= 0
          ? `分红再投资让期末资产多出 ${fmtMoney(diff)}，这就是复利继续买入的力量。`
          : `分红再投资让期末资产少了 ${fmtMoney(Math.abs(diff))}，但换来了更多股份。`
        : `若把分红全部用于再投资，期末资产预计多出 ${fmtMoney(diff)}。`;
  els.reinvestDiffText.textContent = diffText;
}

function renderTable(main, cfg) {
  const ascending = [];
  let cumInvested = 0;
  for (const y of main.yearly) {
    cumInvested += y.invested;
    ascending.push({ ...y, cumInvested, cumReturn: y.endValue - cumInvested });
  }
  const rows = ascending.slice().reverse();
  els.yearlyTableBody.innerHTML = '';

  if (!rows.length) {
    els.yearlyTableBody.innerHTML = '<tr><td colspan="9" class="empty-cell">暂无年度数据</td></tr>';
    els.tableFootnote.textContent = '—';
    return;
  }

  for (const [index, row] of rows.entries()) {
    const year = String(row.year);
    const divs = main.transactions.filter((t) => t.type === 'dividend' && t.date.slice(0, 4) === year);
    const shareEvents = main.transactions.filter((t) => t.type === 'share' && t.date.slice(0, 4) === year);
    const open = state.expandedYears.has(row.year);
    const partial = row.partial ? '*' : '';
    const yearTag = index === 0 ? '<span class="year-tag">至今</span>' : '';
    const returnClass = row.cumReturn >= 0 ? 'pos' : 'neg';

    const tr = document.createElement('tr');
    tr.className = `year-row${index === 0 ? ' latest' : ''}${open ? ' expanded' : ''}`;
    tr.dataset.year = year;
    tr.innerHTML = `
      <td class="year-cell">
        <button class="year-toggle" type="button" aria-expanded="${open}" aria-controls="detail-${year}">
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          <span>${row.year}${partial}${yearTag}</span>
          ${row.dividendCount ? `<small>${row.dividendCount} 次</small>` : ''}
        </button>
      </td>
      <td>${fmtNum(row.endValue, 0)}</td>
      <td>${fmtNum(row.invested, 0)}</td>
      <td class="col-gross">${fmtNum(row.grossDividends, 0)}</td>
      <td class="col-tax">${fmtNum(row.tax, 0)}</td>
      <td>${fmtNum(row.dividends, 0)}</td>
      <td class="col-reinvest">${cfg.reinvest ? fmtNum(row.reinvestedShares, 2) : '—'}</td>
      <td class="col-shares">${fmtNum(row.endShares, row.endShares >= 1000 ? 0 : 2)}</td>
      <td class="${returnClass}">${row.cumReturn >= 0 ? '+' : '−'}${fmtNum(Math.abs(row.cumReturn), 0)}</td>
    `;
    els.yearlyTableBody.appendChild(tr);

    const detailTr = document.createElement('tr');
    detailTr.className = 'year-detail';
    detailTr.id = `detail-${year}`;
    detailTr.dataset.year = year;
    detailTr.hidden = !open;

    let content = '';
    if (divs.length) {
      const totalNet = divs.reduce((sum, d) => sum + d.net, 0);
      const totalShares = divs.reduce((sum, d) => sum + d.sharesBought, 0);
      const divRows = divs
        .map(
          (d) => `
          <tr>
            <td>${fmtDateDot(d.exDate)}</td>
            <td>${fmtNum(d.perShare, 4)}</td>
            <td>${fmtNum(d.gross, 2)}</td>
            <td>${fmtPct(d.taxRate, 1)}</td>
            <td>${fmtNum(d.tax, 2)}</td>
            <td>${fmtNum(d.net, 2)}</td>
            <td>${d.reinvested ? fmtNum(d.price, 2) : '—'}</td>
            <td>${d.reinvested ? fmtNum(d.sharesBought, 2) : '<span class="cash-tag">现金</span>'}</td>
          </tr>`,
        )
        .join('');
      content += `
        <div class="detail-head">
          <span>${row.year} 年分红与再投入</span>
          <span>税后合计 <b>${fmtMoney(totalNet)}</b>${cfg.reinvest ? ` · 再投入 <b>${fmtNum(totalShares, 2)}</b> 股` : ' · 现金留存'}</span>
        </div>
        ${
          cfg.holdingTax && state.stock?.market === 'CN'
            ? '<div class="detail-hint">实际税率为各买入批次按持有期加权：≤1 个月 20% · 1 个月–1 年 10% · &gt;1 年 0%。</div>'
            : ''
        }
        <div class="detail-scroll">
          <p class="detail-mobile-hint">左右滑动查看完整分红明细 →</p>
          <table class="detail-table">
            <thead>
              <tr>
                <th>除息日</th><th>每股派息</th><th>税前</th><th>实际税率</th>
                <th>红利税</th><th>税后</th><th>再投价</th><th>再投份额</th>
              </tr>
            </thead>
            <tbody>${divRows}</tbody>
          </table>
        </div>`;
    }
    if (shareEvents.length) {
      const notes = shareEvents
        .map((s) => {
          const per10 = Number(((s.ratio - 1) * 10).toFixed(2));
          return `${fmtDateDot(s.date)} · 每 10 股送转 ${fmtNum(per10, per10 % 1 === 0 ? 0 : 2)} 股 · 新增 ${fmtNum(s.added, 2)} 股`;
        })
        .join('<br />');
      content += `<div class="detail-actions"><span>送转股</span><p>${notes}</p></div>`;
    }
    if (!content) content = '<p class="detail-empty">本年没有分红或送转记录。</p>';

    detailTr.innerHTML = `<td colspan="9"><div class="detail-inner">${content}</div></td>`;
    els.yearlyTableBody.appendChild(detailTr);
  }

  const partialYears = rows.filter((r) => r.partial).map((r) => r.year);
  const partialNote = partialYears.length ? `* ${partialYears.join('、')} 为不完整年度。` : '';
  els.tableFootnote.textContent = `${partialNote}金额单位：${state.stock.currency}；累计收益 = 年末资产 − 累计投入；分红与红利税均为当年发生额。`;
}

/* =========================================================
   Number animation
   ========================================================= */

function animateNumber(el, target, formatter) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const from = Number(el.dataset.value);
  if (reduce || !Number.isFinite(from) || Math.abs(target - from) < 1) {
    el.textContent = formatter(target);
    return;
  }
  cancelAnimationFrame(el._raf);
  const start = performance.now();
  const duration = 620;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = formatter(from + (target - from) * eased);
    if (p < 1) el._raf = requestAnimationFrame(tick);
    else el.textContent = formatter(target);
  };
  el._raf = requestAnimationFrame(tick);
}

/* =========================================================
   Charts
   ========================================================= */

const CHART_FONT = '"Inter","PingFang SC","Microsoft YaHei","Segoe UI",sans-serif';
const AXIS_TEXT = '#8a938c';
const GRID_LINE = 'rgba(23,37,31,.075)';
const GOLD = '#b58f52';
const FOREST = '#1f5e46';

function ensureCharts() {
  if (!window.echarts) return false;
  if (!state.charts.growth) state.charts.growth = window.echarts.init($('#growthChart'));
  if (!state.charts.dividend) state.charts.dividend = window.echarts.init($('#dividendChart'));
  if (!state.charts.shares) state.charts.shares = window.echarts.init($('#sharesChart'));
  return true;
}

function samplePoints(points, max = 2800) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % step === 0);
  if (out.at(-1) !== points.at(-1)) out.push(points.at(-1));
  return out;
}

function renderCharts(main, cfg) {
  if (!ensureCharts()) return;
  const points = main.points;
  const sampled = samplePoints(points, 2800);
  const pointMap = new Map(sampled.map((p) => [p.date, p]));
  const assetData = sampled.map((p) => [p.date, Number(p.value.toFixed(2))]);
  const investedData = sampled.map((p) => [p.date, Number(p.invested.toFixed(2))]);

  const tooltipBase = {
    backgroundColor: 'rgba(18,59,44,.97)',
    borderWidth: 0,
    padding: [10, 12],
    textStyle: { color: '#f4efe4', fontSize: 11, fontFamily: CHART_FONT },
    extraCssText: 'border-radius:10px;box-shadow:0 18px 34px -18px rgba(18,59,44,.65);',
  };

  state.charts.growth.setOption(
    {
      animationDuration: 650,
      animationEasing: 'cubicOut',
      textStyle: { fontFamily: CHART_FONT },
      grid: { left: 6, right: 12, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        ...tooltipBase,
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(181,143,82,.45)', type: 'dashed' } },
        formatter(params) {
          if (!params?.length) return '';
          const raw = params[0].value?.[0];
          const date = typeof raw === 'string' ? raw : new Date(raw).toISOString().slice(0, 10);
          const p = pointMap.get(date);
          if (!p) return '';
          const gain = p.value - p.invested;
          return `
            <div style="font-size:9px;letter-spacing:.1em;opacity:.55;margin-bottom:5px">${fmtDateDot(date)}</div>
            <div style="font-size:19px;line-height:1.2;font-family:${CHART_FONT};color:#faf5e9">${fmtMoney(p.value)}</div>
            <div style="font-size:9px;opacity:.55;margin-bottom:8px">账户总资产</div>
            <div style="height:1px;background:rgba(236,212,166,.16);margin:7px 0"></div>
            <div style="display:flex;justify-content:space-between;gap:26px;font-size:10px;line-height:1.9">
              <span style="opacity:.6">累计投入</span><span>${fmtMoney(p.invested)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:26px;font-size:10px;line-height:1.9">
              <span style="opacity:.6">浮动收益</span><span style="color:${gain >= 0 ? '#efd3a3' : '#a9d0b8'}">${fmtSignedMoney(gain)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;gap:26px;font-size:10px;line-height:1.9">
              <span style="opacity:.6">持有股数</span><span>${fmtNum(p.shares, 0)}</span>
            </div>`;
        },
      },
      xAxis: {
        type: 'time',
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(23,37,31,.13)' } },
        axisTick: { show: false },
        axisLabel: {
          color: AXIS_TEXT,
          fontSize: 9,
          hideOverlap: true,
          formatter(value) {
            const d = new Date(value);
            return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}`;
          },
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 9, formatter: (v) => fmtCompact(v) },
        splitLine: { lineStyle: { color: GRID_LINE, type: [3, 4] } },
      },
      dataZoom: [{ type: 'inside', throttle: 60, zoomOnMouseWheel: 'shift', moveOnMouseMove: true }],
      series: [
        {
          name: '总资产',
          type: 'line',
          data: assetData,
          showSymbol: sampled.length < 30,
          symbol: 'circle',
          symbolSize: 4,
          smooth: 0.08,
          lineStyle: { width: 2.3, color: FOREST },
          itemStyle: { color: FOREST, borderColor: '#fbf8f0', borderWidth: 2 },
          areaStyle: {
            color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(44,111,84,.32)' },
              { offset: 0.7, color: 'rgba(44,111,84,.07)' },
              { offset: 1, color: 'rgba(44,111,84,0)' },
            ]),
          },
          emphasis: { focus: 'series' },
          z: 2,
        },
        {
          name: '累计投入',
          type: 'line',
          data: investedData,
          showSymbol: false,
          step: 'end',
          lineStyle: { width: 1.3, color: GOLD, type: [4, 3] },
          itemStyle: { color: GOLD },
          emphasis: { focus: 'series' },
          z: 4,
        },
      ],
    },
    true,
  );

  renderDividendChart(main);
  renderSharesChart(main);
}

function renderDividendChart(main) {
  const years = main.yearly.map((y) => String(y.year));
  const divs = main.yearly.map((y) => Number(y.dividends.toFixed(0)));
  const sum = divs.reduce((a, b) => a + b, 0);
  const avg = years.length ? sum / years.length : 0;

  state.charts.dividend.setOption(
    {
      animationDuration: 600,
      textStyle: { fontFamily: CHART_FONT },
      grid: { left: 4, right: 8, top: 16, bottom: 2, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(181,143,82,.07)' } },
        backgroundColor: 'rgba(18,59,44,.97)',
        borderWidth: 0,
        padding: [9, 11],
        textStyle: { color: '#f4efe4', fontSize: 10.5, fontFamily: CHART_FONT },
        extraCssText: 'border-radius:9px;box-shadow:0 14px 26px -16px rgba(18,59,44,.6);',
        formatter(params) {
          const i = params[0].dataIndex;
          const row = main.yearly[i];
          return `<div style="font-size:9px;opacity:.55;margin-bottom:3px">${years[i]} 年 · ${row.dividendCount || 0} 次分红</div>
            <div style="font-size:16px;color:#faf5e9">${fmtMoney(row.dividends)}</div>
            <div style="font-size:9px;opacity:.55;margin-top:2px">税后分红</div>
            <div style="height:1px;background:rgba(236,212,166,.16);margin:6px 0"></div>
            <div style="display:flex;justify-content:space-between;gap:24px;font-size:9.5px;line-height:1.9"><span style="opacity:.6">税前</span><span>${fmtMoney(row.grossDividends)}</span></div>
            <div style="display:flex;justify-content:space-between;gap:24px;font-size:9.5px;line-height:1.9"><span style="opacity:.6">红利税</span><span>${fmtMoney(row.tax)}</span></div>
            <div style="display:flex;justify-content:space-between;gap:24px;font-size:9.5px;line-height:1.9"><span style="opacity:.6">再投份额</span><span>${fmtNum(row.reinvestedShares, 2)} 股</span></div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: 'rgba(23,37,31,.13)' } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 8.5, interval: years.length > 12 ? 'auto' : 0, hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 8.5, formatter: (v) => fmtCompact(v) },
        splitLine: { lineStyle: { color: GRID_LINE, type: [3, 4] } },
      },
      series: [
        {
          type: 'bar',
          data: divs,
          barMaxWidth: 24,
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#d9ba7d' },
              { offset: 1, color: '#b58f52' },
            ]),
          },
          emphasis: { itemStyle: { color: '#c9a66b' } },
          markLine:
            years.length > 1 && sum > 0
              ? {
                  silent: true,
                  symbol: 'none',
                  lineStyle: { color: 'rgba(18,59,44,.26)', type: [3, 3] },
                  label: {
                    formatter: `年均 ${fmtCompact(avg)}`,
                    color: '#7d877e',
                    fontSize: 8,
                    position: 'insideStartTop',
                    backgroundColor: 'rgba(251,248,240,.82)',
                    padding: [2, 4],
                    borderRadius: 3,
                  },
                  data: [{ type: 'average' }],
                }
              : undefined,
        },
      ],
    },
    true,
  );
}

function renderSharesChart(main) {
  const years = main.yearly.map((y) => String(y.year));
  const invested = main.yearly.map((y) => Number(y.invested.toFixed(0)));
  const shares = main.yearly.map((y) => Number(y.endShares.toFixed(0)));

  state.charts.shares.setOption(
    {
      animationDuration: 600,
      textStyle: { fontFamily: CHART_FONT },
      grid: { left: 4, right: 2, top: 16, bottom: 2, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(29,90,67,.06)' } },
        backgroundColor: 'rgba(18,59,44,.97)',
        borderWidth: 0,
        padding: [9, 11],
        textStyle: { color: '#f4efe4', fontSize: 10.5, fontFamily: CHART_FONT },
        extraCssText: 'border-radius:9px;box-shadow:0 14px 26px -16px rgba(18,59,44,.6);',
        formatter(params) {
          const i = params[0].dataIndex;
          return `<div style="font-size:9px;opacity:.55;margin-bottom:3px">${years[i]} 年</div>
            <div style="display:flex;justify-content:space-between;gap:22px;font-size:10px;line-height:1.9"><span style="opacity:.6">当年投入</span><span>${fmtMoney(invested[i])}</span></div>
            <div style="display:flex;justify-content:space-between;gap:22px;font-size:10px;line-height:1.9"><span style="opacity:.6">年末股数</span><span>${fmtNum(shares[i], 0)} 股</span></div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: 'rgba(23,37,31,.13)' } },
        axisTick: { show: false },
        axisLabel: { color: AXIS_TEXT, fontSize: 8.5, interval: years.length > 12 ? 'auto' : 0, hideOverlap: true },
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: AXIS_TEXT, fontSize: 8.5, formatter: (v) => fmtCompact(v) },
          splitLine: { lineStyle: { color: GRID_LINE, type: [3, 4] } },
        },
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: AXIS_TEXT, fontSize: 8.5, formatter: (v) => fmtCompact(v) },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '当年投入',
          type: 'bar',
          data: invested,
          barMaxWidth: 20,
          itemStyle: { color: 'rgba(169,192,174,.78)', borderRadius: [3, 3, 0, 0] },
          emphasis: { itemStyle: { color: 'rgba(140,170,148,.9)' } },
        },
        {
          name: '年末股数',
          type: 'line',
          yAxisIndex: 1,
          data: shares,
          smooth: 0.18,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 1.8, color: GOLD },
          itemStyle: { color: GOLD, borderColor: '#fbf8f0', borderWidth: 2 },
        },
      ],
    },
    true,
  );
}

function resizeCharts() {
  Object.values(state.charts).forEach((chart) => chart?.resize());
}

/* =========================================================
   Share
   ========================================================= */

async function sharePlan() {
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    toast('方案链接已复制，可直接分享');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('方案链接已复制，可直接分享');
    } catch {
      toast('复制失败，请手动复制地址栏链接');
    }
    ta.remove();
  }
}

/* =========================================================
   Events & boot
   ========================================================= */

function scheduleSimulation() {
  clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => runSimulation({ animate: false }), 320);
}

function bindEvents() {
  els.configForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runSimulation({ animate: true, scroll: true });
  });

  els.loadSymbolBtn.addEventListener('click', () => loadStock(els.symbolInput.value));
  els.symbolInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadStock(els.symbolInput.value);
    } else if (e.key === 'Escape') {
      hideSearchResults();
    }
  });
  els.symbolInput.addEventListener('input', scheduleSymbolSearch);
  els.symbolInput.addEventListener('focus', () => {
    if (els.symbolInput.value.trim()) scheduleSymbolSearch();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.symbol-field')) hideSearchResults();
  });

  els.freqSegment.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-freq]');
    if (!btn) return;
    setFreqUI(btn.dataset.freq);
    runSimulation({ animate: false });
  });

  els.reinvestToggle.addEventListener('click', () => {
    const next = els.reinvestToggle.getAttribute('aria-checked') !== 'true';
    setReinvestUI(next);
    runSimulation({ animate: true });
  });

  els.holdingTax.addEventListener('change', () => {
    state.taxPref = els.holdingTax.checked;
    updateTaxUI();
    runSimulation({ animate: false });
  });

  els.schedulePolicy.addEventListener('change', () => {
    state.schedulePolicy = els.schedulePolicy.value === 'skip' ? 'skip' : 'roll';
    runSimulation({ animate: false });
  });

  const advanced = document.querySelector('.advanced');
  advanced?.addEventListener('toggle', () => {
    const scroller = document.querySelector('.panel-scroll');
    if (!scroller) return;
    requestAnimationFrame(() => {
      scroller.scrollTo({
        top: advanced.open ? scroller.scrollHeight : 0,
        behavior: 'smooth',
      });
    });
  });

  els.initialAmount.addEventListener('input', scheduleSimulation);
  els.recurringAmount.addEventListener('input', scheduleSimulation);
  els.taxRate.addEventListener('input', scheduleSimulation);
  els.startDate.addEventListener('change', () => {
    state.dateNotice = '';
    els.dateFixBtn.hidden = true;
    els.dateHint.classList.remove('warn');
    runSimulation({ animate: true });
  });

  els.dateFixBtn.addEventListener('click', () => {
    const next = nextTradingDate(els.startDate.value);
    if (!next) return;
    els.startDate.value = next;
    state.dateNotice = `已改用下一交易日 ${fmtDateDot(next)}`;
    els.dateFixBtn.hidden = true;
    els.dateHint.classList.remove('warn');
    runSimulation({ animate: true });
  });

  els.yearlyTableBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.year-toggle');
    if (!btn) return;
    const tr = btn.closest('tr.year-row');
    if (!tr) return;
    const year = Number(tr.dataset.year);
    const detail = document.getElementById(`detail-${year}`);
    if (!detail) return;
    const open = detail.hidden;
    detail.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    tr.classList.toggle('expanded', open);
    if (open) {
      state.expandedYears.add(year);
      requestAnimationFrame(() => {
        const wrap = detail.closest('.table-wrap');
        if (!wrap) return;
        const dr = detail.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        wrap.scrollBy({ top: dr.top - wr.top - 34, behavior: 'smooth' });
      });
    } else {
      state.expandedYears.delete(year);
    }
  });

  els.calcBtn.addEventListener('click', () => runSimulation({ animate: true, scroll: true }));
  els.shareBtn.addEventListener('click', sharePlan);
  els.retryBtn.addEventListener('click', () => loadStock(els.symbolInput.value, { force: true }));
  els.refreshDataBtn.addEventListener('click', () => loadStock(state.stock?.symbol || els.symbolInput.value, { force: true }));

  window.addEventListener('resize', () => {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(resizeCharts, 120);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resizeCharts();
  });
}

function boot() {
  renderPresets(FALLBACK_PRESETS);
  fetchPresets();
  bindEvents();

  const cfg = readUrlConfig() || readSavedConfig() || DEFAULT_CONFIG;
  state.taxPref = cfg.holdingTax;
  state.schedulePolicy = cfg.schedulePolicy || 'roll';
  els.symbolInput.value = cfg.symbol;
  els.startDate.value = cfg.start;
  els.initialAmount.value = cfg.initial;
  els.recurringAmount.value = cfg.recurring;
  els.taxRate.value = cfg.tax;
  els.schedulePolicy.value = state.schedulePolicy;
  setFreqUI(cfg.freq);
  setReinvestUI(cfg.reinvest);

  loadStock(cfg.symbol);
}

boot();
