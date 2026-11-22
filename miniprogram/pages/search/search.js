const api = require('../../utils/api');

const FALLBACK_HOT = [
  { symbol: '601398.SS', name: '工商银行', market: 'CN', marketLabel: 'A股' },
  { symbol: '600900.SS', name: '长江电力', market: 'CN', marketLabel: 'A股' },
  { symbol: '600519.SS', name: '贵州茅台', market: 'CN', marketLabel: 'A股' },
  { symbol: '0700.HK', name: '腾讯控股', market: 'HK', marketLabel: '港股' },
  { symbol: 'AAPL', name: '苹果', market: 'US', marketLabel: '美股' },
  { symbol: 'KO', name: '可口可乐', market: 'US', marketLabel: '美股' },
  { symbol: 'VOO', name: '标普500ETF', market: 'US', marketLabel: '美股' },
  { symbol: 'NVDA', name: '英伟达', market: 'US', marketLabel: '美股' },
];

Page({
  data: {
    query: '',
    market: 'ALL',
    results: [],
    hot: FALLBACK_HOT,
    searching: false,
    searched: false,
    canDirect: false,
  },

  onLoad() {
    this.timer = null;
    this.setData({ hot: FALLBACK_HOT.map(withIcon) });
    api
      .getHotStocks()
      .then((res) => {
        if (res.results && res.results.length) {
          this.setData({ hot: res.results.map(withIcon) });
        }
      })
      .catch(() => {
        this.setData({ hot: FALLBACK_HOT.map(withIcon) });
      });
  },

  onUnload() {
    clearTimeout(this.timer);
  },

  onInput(e) {
    const query = e.detail.value;
    const canDirect = /^[A-Za-z0-9.^=_-]{1,12}$/.test(query.trim());
    this.setData({ query, canDirect });
    clearTimeout(this.timer);
    if (!query.trim()) {
      this.searchSeq = (this.searchSeq || 0) + 1;
      this.setData({ results: [], searched: false, searching: false });
      return;
    }
    this.timer = setTimeout(() => this.doSearch(), 260);
  },

  onConfirm() {
    this.doSearch();
  },

  clearQuery() {
    this.setData({ query: '', results: [], searched: false, searching: false, canDirect: false });
  },

  onMarket(e) {
    const market = e.currentTarget.dataset.market;
    this.setData({ market }, () => {
      if (this.data.query.trim()) this.doSearch();
    });
  },

  doSearch() {
    const query = this.data.query.trim();
    if (!query) return;
    const seq = (this.searchSeq || 0) + 1;
    this.searchSeq = seq;
    this.setData({ searching: true, searched: false });
    api
      .searchStocks(query, this.data.market)
      .then((res) => {
        if (seq !== this.searchSeq) return;
        const results = (res.results || []).map(withIcon);
        this.setData({ results, searching: false, searched: true });
      })
      .catch(() => {
        if (seq !== this.searchSeq) return;
        this.setData({ results: [], searching: false, searched: true });
      });
  },

  onSelect(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.results[index];
    if (item) this.pick(item);
  },

  onHot(e) {
    const symbol = e.currentTarget.dataset.symbol;
    const name = e.currentTarget.dataset.name || symbol;
    const market = e.currentTarget.dataset.market || '';
    this.pick({ symbol, name, marketLabel: market === 'CN' ? 'A股' : market === 'HK' ? '港股' : '美股' });
  },

  loadDirect() {
    const code = this.data.query.trim().toUpperCase();
    if (!code) return;
    this.pick({ symbol: code, name: code });
  },

  pick(item) {
    const channel = this.getOpenerEventChannel();
    if (channel && channel.emit) channel.emit('selectStock', item);
    wx.navigateBack();
  },
});

function withIcon(item) {
  return Object.assign({}, item, {
    icon: (item.name || item.symbol || '息').charAt(0),
  });
}
