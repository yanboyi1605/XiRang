import test from 'node:test';
import assert from 'node:assert/strict';
import { searchStocks, findStockName } from '../lib/search.js';

test('中文名称搜索：工商返回 A 股工商银行', async () => {
  const results = await searchStocks('工商');
  assert.ok(results.length > 0);
  assert.equal(results[0].symbol, '601398.SS');
  assert.equal(results[0].name, '工商银行');
});

test('拼音首字母搜索：gsyh / maotai', async () => {
  const icbc = await searchStocks('gsyh');
  assert.equal(icbc[0].symbol, '601398.SS');
  const moutai = await searchStocks('maotai');
  assert.equal(moutai[0].symbol, '600519.SS');
});

test('股票代码与港股中文名称搜索', async () => {
  const moutai = await searchStocks('600519');
  assert.equal(moutai[0].name, '贵州茅台');
  const tencent = await searchStocks('腾讯');
  assert.equal(tencent[0].symbol, '0700.HK');
  assert.equal(await findStockName('0700.HK'), '腾讯控股');
});

test('市场筛选：港股只返回港股', async () => {
  const results = await searchStocks('工商', { market: 'HK' });
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.market === 'HK'));
});
