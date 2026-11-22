const api = require('../../utils/api');
const fmt = require('../../utils/format');
const { simulate } = require('../../utils/simulate');

const DEFAULT_START = '2015-01-05';
const STORAGE_KEY = 'xirang.config.v1';

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

Page({
  data: {
    loading: true,
    error: '',
    stockName: '工商银行',
    stockSymbol: '601398.SS',
    stockMeta: '上交所 · CNY',
    stockIcon: '工',
    stockPrice: '',
    stockRange: '',
    sourceLabel: '',
    currency: 'CNY',
    currencySymbol: '¥',
    isCN: true,
    startDate: DEFAULT_START,
    minDate: '1990-01-01',
    maxDate: '2026-11-20',
    dateError: '',
    dateFix: '',
    dateNotice: '',
    freq: 'monthly',
    initial: '50000',
    recurring: '2000',
    reinvest: true,
    holdingTax: true,
    taxRate: '0',
    schedulePolicy: 'roll',
    showAdvanced: false,
    result: null,
    insights: null,
    yearRows: [],
    yearCount: 0,
  },

  onLoad(options) {
    this.loadSeq = 0;
    this.taxTouched = false;
    this.expandedYears = {};
    this.priceDates = {};
    this.canvasReady = false;
    this.searchTimer = null;
    this.amountTimer = null;

    let saved = null;
    try {
      saved = wx.getStorageSync(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }
    if (saved && saved.symbol) {
      if (saved.startDate) this.setData({ startDate: saved.startDate });
      if (saved.freq) this.setData({ freq: saved.freq });
      if (saved.initial != null) this.setData({ initial: String(saved.initial) });
      if (saved.recurring != null) this.setData({ recurring: String(saved.recurring) });
      if (typeof saved.reinvest === 'boolean') this.setData({ reinvest: saved.reinvest });
      if (typeof saved.holdingTax === 'boolean') this.setData({ holdingTax: saved.holdingTax });
      if (saved.taxRate != null) this.setData({ taxRate: String(saved.taxRate) });
      if (saved.schedulePolicy) this.setData({ schedulePolicy: saved.schedulePolicy });
      this.taxTouched = Boolean(saved.taxTouched);
    }

    wx.showShareMenu({ menus: ['shareAppMessage'] });
    const symbol = (options && options.symbol) || (saved && saved.symbol) || '601398.SS';
    this.loadStock(symbol);
  },

  onReady() {
    this.canvasReady = true;
    if (this.main) this.drawCharts();
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    clearTimeout(this.amountTimer);
  },

  onShareAppMessage() {
    return {
      title: `${this.data.stockName} · 股票分红计算器`,
      path: `/pages/index/index?symbol=${this.data.stockSymbol}`,
    };
  },

  openAbout() {
    wx.navigateTo({ url: '/pages/about/about' });
  },

  loadStock(symbol) {
    if (!symbol) return;
    const seq = ++this.loadSeq;
    this.setData({ loading: true, error: '' });
    api
      .getStock(symbol)
      .then((data) => {
        if (seq !== this.loadSeq) return;
        this.stock = data;
        this.priceDates = {};
        data.prices.forEach((p) => {
          this.priceDates[p[0]] = true;
        });
        this.expandedYears = {};

        const preferred = this.data.startDate || DEFAULT_START;
        const resolved = this.resolveStartDate(preferred);
        let hold = this.data.holdingTax;
        if (!this.taxTouched) hold = data.market === 'CN';

        this.setData(
          {
            loading: false,
            stockName: data.name || data.symbol,
            stockSymbol: data.symbol,
            stockMeta: `${data.exchange || '交易所'} · ${data.currency || 'CNY'}`,
            stockIcon: (data.name || data.symbol || '息').charAt(0),
            stockPrice: '最新 ' + fmt.fmtNum(data.lastPrice, 2),
            stockRange: `${fmt.fmtDateDot(data.firstDate)} — ${fmt.fmtDateDot(data.lastDate)}`,
            sourceLabel: data.sourceLabel || '公开行情',
            currency: data.currency || 'CNY',
            currencySymbol: fmt.currencySymbol(data.currency || 'CNY'),
            isCN: data.market === 'CN',
            startDate: resolved,
            minDate: data.firstDate,
            maxDate: data.lastDate,
            dateError: '',
            dateFix: '',
            dateNotice: resolved !== preferred ? `已调整到 ${fmt.fmtDateDot(resolved)}` : '',
            holdingTax: hold,
          },
          () => this.calculate(false),
        );
      })
      .catch((err) => {
        if (seq !== this.loadSeq) return;
        this.setData({ loading: false, error: err.message || '行情加载失败' });
      });
  },

  resolveStartDate(preferred) {
    if (!this.stock || !this.stock.prices.length) return preferred || DEFAULT_START;
    let start = preferred || DEFAULT_START;
    if (start < this.stock.firstDate) start = this.stock.firstDate;
    if (start > this.stock.lastDate) start = this.stock.lastDate;
    if (!this.priceDates[start]) {
      const next = this.nextTradingDate(start);
      if (next) start = next;
    }
    return start;
  },

  nextTradingDate(date) {
    if (!this.stock) return '';
    const prices = this.stock.prices;
    let lo = 0;
    let hi = prices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (prices[mid][0] < date) lo = mid + 1;
      else hi = mid;
    }
    return lo < prices.length ? prices[lo][0] : '';
  },

  onDateChange(e) {
    const date = e.detail.value;
    if (!this.priceDates[date]) {
      const next = this.nextTradingDate(date);
      this.setData({
        startDate: date,
        dateError: `${fmt.fmtDateDot(date)} 不是交易日，请选择交易日`,
        dateFix: next,
        dateNotice: '',
      });
      return;
    }
    this.setData({ startDate: date, dateError: '', dateFix: '', dateNotice: '' }, () => this.calculate(false));
  },

  useNextDate() {
    if (!this.data.dateFix) return;
    this.setData(
      { startDate: this.data.dateFix, dateError: '', dateFix: '', dateNotice: `已改用下一交易日 ${fmt.fmtDateDot(this.data.dateFix)}` },
      () => this.calculate(false),
    );
  },

  onFreq(e) {
    const freq = e.currentTarget.dataset.freq;
    this.setData({ freq }, () => this.calculate(false));
  },

  onAmountInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({ [field]: value });
    clearTimeout(this.amountTimer);
    this.amountTimer = setTimeout(() => this.calculate(false), 360);
  },

  onTaxInput(e) {
    this.setData({ taxRate: e.detail.value });
    clearTimeout(this.amountTimer);
    this.amountTimer = setTimeout(() => this.calculate(false), 360);
  },

  onReinvest(e) {
    this.setData({ reinvest: e.detail.value }, () => this.calculate(false));
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  },

  onHoldingTax(e) {
    this.taxTouched = true;
    this.setData({ holdingTax: e.detail.value }, () => this.calculate(false));
  },

  onPolicy(e) {
    this.setData({ schedulePolicy: e.currentTarget.dataset.value }, () => this.calculate(false));
  },

  openSearch() {
    wx.navigateTo({
      url: '/pages/search/search',
      events: {
        selectStock: (item) => {
          if (item && item.symbol) this.loadStock(item.symbol);
        },
      },
    });
  },

  onCalculate() {
    this.calculate(true);
  },

  onRetry() {
    this.loadStock(this.data.stockSymbol || '601398.SS');
  },

  readConfig() {
    const initial = clampNumber(this.data.initial, 0, 1e12, 0);
    const recurring = clampNumber(this.data.recurring, 0, 1e12, 0);
    const taxPercent = clampNumber(this.data.taxRate, 0, 50, 0);
    return {
      symbol: this.data.stockSymbol,
      start: this.data.startDate,
      freq: this.data.freq,
      initial,
      recurring: this.data.freq === 'none' ? 0 : recurring,
      reinvest: this.data.reinvest,
      holdingTax: this.data.isCN && this.data.holdingTax,
      taxPercent,
      schedulePolicy: this.data.schedulePolicy,
    };
  },

  calculate(scroll) {
    if (!this.stock || this.data.loading) return;
    const cfg = this.readConfig();
    if (!cfg.start) {
      this.setData({ error: '请选择开始日期' });
      return;
    }
    if (!this.priceDates[cfg.start]) {
      const next = this.nextTradingDate(cfg.start);
      this.setData({
        dateError: `${fmt.fmtDateDot(cfg.start)} 不是交易日，请选择交易日`,
        dateFix: next,
        error: '',
      });
      return;
    }
    if (cfg.initial <= 0 && (cfg.freq === 'none' || cfg.recurring <= 0)) {
      this.setData({ error: '请输入大于 0 的投资金额', dateError: '' });
      return;
    }

    const base = {
      prices: this.stock.prices,
      dividends: this.stock.dividends,
      shareEvents: this.stock.shareEvents || [],
      startDate: cfg.start,
      initialAmount: cfg.initial,
      frequency: cfg.freq,
      recurringAmount: cfg.recurring,
      taxMode: cfg.holdingTax ? 'holding' : 'fixed',
      taxRate: cfg.taxPercent / 100,
      schedulePolicy: cfg.schedulePolicy,
    };

    let main;
    let alt;
    try {
      main = simulate(Object.assign({}, base, { reinvest: cfg.reinvest }));
      alt = simulate(Object.assign({}, base, { reinvest: !cfg.reinvest }));
    } catch (err) {
      this.setData({ error: err.message || '测算失败' });
      return;
    }

    this.main = main;
    this.alt = alt;
    this.cfg = cfg;
    const view = this.buildView(main, alt, cfg);

    this.setData(Object.assign({ error: '', dateError: '', dateFix: '' }, view), () => {
      this.saveConfig(cfg);
      this.drawCharts();
      if (scroll) {
        setTimeout(() => {
          wx.pageScrollTo({ selector: '#result', offsetTop: -16, duration: 320 });
        }, 80);
      }
    });
  },

  saveConfig(cfg) {
    try {
      wx.setStorageSync(STORAGE_KEY, {
        symbol: cfg.symbol,
        startDate: cfg.start,
        freq: cfg.freq,
        initial: cfg.initial,
        recurring: cfg.recurring,
        reinvest: cfg.reinvest,
        holdingTax: cfg.holdingTax,
        taxRate: cfg.taxPercent,
        schedulePolicy: cfg.schedulePolicy,
        taxTouched: this.taxTouched,
      });
    } catch (e) {
      /* ignore */
    }
  },

  buildView(main, alt, cfg) {
    const s = main.summary;
    const cur = this.data.currency;
    const taxText =
      s.totalTax > 0.5
        ? ` · 红利税 ${fmt.fmtMoney(s.totalTax, cur)}（${fmt.fmtPct(s.effectiveTaxRate, 1)}）`
        : cfg.holdingTax && s.dividendCount > 0
          ? ' · 持有满 1 年免税'
          : '';
    const freqText =
      cfg.freq === 'monthly'
        ? `每月 ${fmt.fmtMoney(cfg.recurring, cur)}`
        : cfg.freq === 'yearly'
          ? `每年 ${fmt.fmtMoney(cfg.recurring, cur)}`
          : `一次性 ${fmt.fmtMoney(cfg.initial, cur)}`;

    const result = {
      finalValue: fmt.fmtNum(s.finalValue, 0),
      returnPct: fmt.fmtSignedPct(s.returnPct, 1),
      returnClass: s.totalReturn >= 0 ? 'up' : 'down',
      profit: fmt.fmtSignedMoney(s.totalReturn, cur),
      multiple: s.multiple ? s.multiple.toFixed(2) + ' 倍' : '—',
      invested: fmt.fmtMoney(s.totalInvested, cur),
      dividends: fmt.fmtMoney(s.totalDividends, cur),
      xirr: s.xirr == null ? '—' : fmt.fmtSignedPct(s.xirr, 2),
      shares: fmt.fmtShares(s.finalShares),
      asOf: fmt.fmtDateDot(s.endDate),
      footLeft: `${s.dividendCount} 次分红 · ${cfg.reinvest ? '全部再投资' : '现金留存'}${taxText}`,
      footRight: `${freqText} · 期末现金 ${fmt.fmtMoney(s.cash, cur)}`,
    };

    const coverage = s.totalInvested > 0 ? s.totalDividends / s.totalInvested : 0;
    const diff = cfg.reinvest
      ? main.summary.finalValue - alt.summary.finalValue
      : alt.summary.finalValue - main.summary.finalValue;
    let compoundText;
    if (s.dividendCount === 0) {
      compoundText = '所选区间没有分红记录。';
    } else if (cfg.reinvest) {
      compoundText =
        diff >= 0
          ? `同样的投入，再投资比现金分红多 ${fmt.fmtMoney(diff, cur)}。`
          : `这段行情里，再投资比现金分红少 ${fmt.fmtMoney(Math.abs(diff), cur)}。`;
    } else {
      compoundText =
        diff >= 0
          ? `当前为现金分红；若全部再投资，期末多 ${fmt.fmtMoney(diff, cur)}。`
          : `当前为现金分红；这段行情里再投资反而少 ${fmt.fmtMoney(Math.abs(diff), cur)}。`;
    }
    const insights = {
      coverage: fmt.fmtPct(coverage, 1),
      coverageText: `累计税后分红 ${fmt.fmtMoney(s.totalDividends, cur)}，相当于投入本金的 ${fmt.fmtPct(coverage, 1)}。`,
      compoundLabel: cfg.reinvest ? '再投资差额' : '再投资潜力',
      compoundValue: fmt.fmtSignedMoney(diff, cur),
      compoundText,
      yield: s.currentYield == null ? '—' : fmt.fmtPct(s.currentYield, 2),
      yieldText:
        s.ttmDividends > 0
          ? `近 12 个月税后分红 ${fmt.fmtMoney(s.ttmDividends, cur)}。`
          : '近 12 个月没有分红记录。',
    };

    let cumInvested = 0;
    const asc = main.yearly.map((y) => {
      cumInvested += y.invested;
      return Object.assign({}, y, { cumInvested, cumReturn: y.endValue - cumInvested });
    });

    const yearRows = asc
      .slice()
      .reverse()
      .map((y, index) => {
        const year = String(y.year);
        const divs = main.transactions.filter((t) => t.type === 'dividend' && t.date.slice(0, 4) === year);
        const events = main.transactions.filter((t) => t.type === 'share' && t.date.slice(0, 4) === year);
        return {
          year: y.year,
          partial: y.partial,
          count: y.dividendCount || 0,
          latest: index === 0,
          endValue: fmt.fmtNum(y.endValue, 0),
          invested: fmt.fmtNum(y.invested, 0),
          net: fmt.fmtNum(y.dividends, 0),
          tax: fmt.fmtNum(y.tax, 0),
          reinvest: cfg.reinvest ? fmt.fmtNum(y.reinvestedShares, 2) : '—',
          shares: fmt.fmtNum(y.endShares, y.endShares >= 1000 ? 0 : 2),
          cumReturn: fmt.fmtSignedMoney(y.cumReturn, cur, 0),
          cumReturnClass: y.cumReturn >= 0 ? 'up' : 'down',
          expanded: !!this.expandedYears[y.year],
          dividends: divs.map((d) => ({
            exDate: fmt.fmtDateDot(d.exDate),
            perShare: fmt.fmtNum(d.perShare, 4),
            gross: fmt.fmtNum(d.gross, 2),
            tax: fmt.fmtNum(d.tax, 2),
            rate: fmt.fmtPct(d.taxRate, 1),
            net: fmt.fmtNum(d.net, 2),
            price: d.reinvested ? fmt.fmtNum(d.price, 2) : '—',
            shares: d.reinvested ? fmt.fmtNum(d.sharesBought, 2) : '现金',
          })),
          shareEvents: events.map((ev) => {
            const per10 = Number(((ev.ratio - 1) * 10).toFixed(2));
            return {
              date: fmt.fmtDateDot(ev.date),
              text: `每 10 股送转 ${fmt.fmtNum(per10, per10 % 1 === 0 ? 0 : 2)} 股 · 新增 ${fmt.fmtNum(ev.added, 2)} 股`,
            };
          }),
        };
      });

    return {
      result,
      insights,
      yearRows,
      yearCount: yearRows.length,
    };
  },

  toggleYear(e) {
    const year = Number(e.currentTarget.dataset.year);
    this.expandedYears[year] = !this.expandedYears[year];
    const expanded = !!this.expandedYears[year];
    const rows = this.data.yearRows.map((row) =>
      row.year === year ? Object.assign({}, row, { expanded }) : row,
    );
    this.setData({ yearRows: rows });
  },

  noop() {},

  drawCharts() {
    if (!this.canvasReady || !this.main) return;
    setTimeout(() => {
      this.drawAssetChart();
      this.drawDividendChart();
    }, 40);
  },

  getCanvas(id, callback, retry) {
    const query = wx.createSelectorQuery().in(this);
    query
      .select('#' + id)
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0] || !res[0].node || !res[0].width) {
          if ((retry || 0) < 3) {
            setTimeout(() => this.getCanvas(id, callback, (retry || 0) + 1), 100);
          }
          return;
        }
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
        const dpr = info.pixelRatio || 2;
        const width = res[0].width;
        const height = res[0].height;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.scale(dpr, dpr);
        callback(ctx, width, height);
      });
  },

  drawAssetChart() {
    this.getCanvas('assetChart', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const points = this.main.points;
      if (!points.length) return;
      const sampled = samplePoints(points, 220);
      const pad = { left: 44, right: 12, top: 12, bottom: 24 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;
      const maxV = Math.max.apply(
        null,
        sampled.map((p) => p.value),
      ) || 1;
      const niceMax = niceNumber(maxV * 1.04);

      ctx.font = '10px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH * i) / 5;
        const value = niceMax - (niceMax * i) / 5;
        ctx.strokeStyle = 'rgba(23,37,31,.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillStyle = '#8a938c';
        ctx.fillText(fmt.fmtCompact(value), pad.left - 7, y);
      }

      const xOf = (i) => pad.left + (plotW * i) / (sampled.length - 1 || 1);
      const yOf = (v) => pad.top + plotH - (Math.max(0, v) / niceMax) * plotH;

      // 累计投入
      ctx.beginPath();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = '#b58f52';
      ctx.lineWidth = 1.2;
      sampled.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(i), yOf(p.invested));
        else ctx.lineTo(xOf(i), yOf(p.invested));
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // 总资产面积
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, 'rgba(44,111,84,.3)');
      grad.addColorStop(0.75, 'rgba(44,111,84,.06)');
      grad.addColorStop(1, 'rgba(44,111,84,0)');
      ctx.beginPath();
      sampled.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(i), yOf(p.value));
        else ctx.lineTo(xOf(i), yOf(p.value));
      });
      ctx.lineTo(xOf(sampled.length - 1), pad.top + plotH);
      ctx.lineTo(pad.left, pad.top + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 总资产线
      ctx.beginPath();
      ctx.strokeStyle = '#1f5e46';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      sampled.forEach((p, i) => {
        if (i === 0) ctx.moveTo(xOf(i), yOf(p.value));
        else ctx.lineTo(xOf(i), yOf(p.value));
      });
      ctx.stroke();

      const lastX = xOf(sampled.length - 1);
      const lastY = yOf(sampled[sampled.length - 1].value);
      ctx.beginPath();
      ctx.fillStyle = '#1f5e46';
      ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
      ctx.fill();

      // x 轴年份
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#8a938c';
      const ticks = Math.min(5, sampled.length);
      for (let i = 0; i < ticks; i++) {
        const idx = Math.round((sampled.length - 1) * (i / (ticks - 1 || 1)));
        const year = String(sampled[idx].date).slice(0, 4);
        const x = xOf(idx);
        if (i === 0) ctx.textAlign = 'left';
        else if (i === ticks - 1) ctx.textAlign = 'right';
        else ctx.textAlign = 'center';
        ctx.fillText(year, x, pad.top + plotH + 7);
      }
    });
  },

  drawDividendChart() {
    this.getCanvas('dividendChart', (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const rows = this.main.yearly;
      if (!rows.length) return;
      const pad = { left: 42, right: 10, top: 12, bottom: 26 };
      const plotW = w - pad.left - pad.right;
      const plotH = h - pad.top - pad.bottom;
      const values = rows.map((y) => y.dividends);
      const maxV = niceNumber((Math.max.apply(null, values) || 1) * 1.12);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;

      ctx.font = '10px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 5; i++) {
        const y = pad.top + (plotH * i) / 5;
        ctx.strokeStyle = 'rgba(23,37,31,.07)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.fillStyle = '#8a938c';
        ctx.fillText(fmt.fmtCompact(maxV - (maxV * i) / 5), pad.left - 6, y);
      }

      const slot = plotW / rows.length;
      const barW = Math.max(6, Math.min(20, slot * 0.56));
      const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
      grad.addColorStop(0, '#d9ba7d');
      grad.addColorStop(1, '#b58f52');

      rows.forEach((row, i) => {
        const value = row.dividends;
        const bh = (value / maxV) * plotH;
        const x = pad.left + slot * i + (slot - barW) / 2;
        const y = pad.top + plotH - bh;
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, barW, bh);
      });

      if (avg > 0) {
        const y = pad.top + plotH - (avg / maxV) * plotH;
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(18,59,44,.28)';
        ctx.lineWidth = 1;
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + plotW, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#7d877e';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('年均 ' + fmt.fmtCompact(avg), pad.left + 2, y - 3);
      }

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#8a938c';
      const step = Math.max(1, Math.ceil(rows.length / 6));
      rows.forEach((row, i) => {
        if (i % step !== 0) return;
        const x = pad.left + slot * i + slot / 2;
        ctx.fillText(String(row.year), x, pad.top + plotH + 7);
      });
    });
  },
});

function samplePoints(points, max) {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
}

function niceNumber(value) {
  if (!value || value <= 0) return 1;
  const power = Math.pow(10, Math.floor(Math.log(value) / Math.LN10));
  const n = value / power;
  let nice;
  if (n <= 1) nice = 1;
  else if (n <= 2) nice = 2;
  else if (n <= 5) nice = 5;
  else nice = 10;
  return nice * power;
}
