const { apiBase } = require('../config');

function request(path, data) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: apiBase + path,
      data: data || {},
      method: 'GET',
      timeout: 20000,
      success(res) {
        const body = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && body.ok !== false) {
          resolve(body);
        } else {
          reject(new Error(body.error || `请求失败（${res.statusCode}）`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络连接失败'));
      },
    });
  });
}

function getStock(symbol) {
  return request('/api/stock', { symbol, start: '1900-01-01' });
}

function searchStocks(query, market) {
  return request('/api/search', { q: query, market: market || 'ALL', limit: 20 });
}

function getHotStocks() {
  return request('/api/hot');
}

function getPresets() {
  return request('/api/presets');
}

module.exports = {
  getStock,
  searchStocks,
  getHotStocks,
  getPresets,
};
