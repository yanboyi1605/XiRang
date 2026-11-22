Page({
  data: {
    version: '1.0.0',
    updated: '2026-11-22',
  },

  onShareAppMessage() {
    return {
      title: '息壤 · 股票分红计算器',
      path: '/pages/index/index',
    };
  },
});
