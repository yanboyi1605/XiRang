import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, xirr, buildAnchors } from '../public/js/simulate.js';

const flat = (dates, price = 10) => dates.map((d) => [d, price]);

test('一次性买入：价格从 100 涨到 150，收益 50%', () => {
  const r = simulate({
    prices: [
      ['2021-01-01', 100],
      ['2022-01-01', 150],
    ],
    dividends: [],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.summary.totalInvested, 1000);
  assert.equal(r.summary.finalValue, 1500);
  assert.equal(r.summary.finalShares, 10);
  assert.ok(Math.abs(r.summary.returnPct - 0.5) < 1e-9);
  assert.ok(Math.abs(r.summary.xirr - 0.5) < 1e-6);
});

test('分红再投资：10 元股价、每股派 1 元', () => {
  const prices = flat(['2021-01-01', '2021-01-04', '2021-01-05']);
  const r = simulate({
    prices,
    dividends: [['2021-01-04', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.summary.totalDividends, 100);
  assert.ok(Math.abs(r.summary.finalShares - 110) < 1e-9);
  assert.ok(Math.abs(r.summary.finalValue - 1100) < 1e-9);
  assert.equal(r.summary.dividendCount, 1);
});

test('现金分红不复投：期末含现金', () => {
  const prices = flat(['2021-01-01', '2021-01-04', '2021-01-05']);
  const r = simulate({
    prices,
    dividends: [['2021-01-04', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: false,
    taxRate: 0,
  });
  assert.equal(r.summary.finalShares, 100);
  assert.equal(r.summary.cash, 100);
  assert.equal(r.summary.finalValue, 1100);
});

test('红利税 20%：100 元分红到手 80 元', () => {
  const prices = flat(['2021-01-01', '2021-01-04', '2021-01-05']);
  const r = simulate({
    prices,
    dividends: [['2021-01-04', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: false,
    taxRate: 0.2,
  });
  assert.equal(r.summary.totalDividends, 80);
  assert.equal(r.summary.cash, 80);
  assert.equal(r.summary.finalValue, 1080);
});

test('每月定投：从开始日（含）每月同日买入', () => {
  const prices = flat(['2021-01-01', '2021-02-01', '2021-03-01']);
  const r = simulate({
    prices,
    dividends: [],
    startDate: '2021-01-01',
    initialAmount: 0,
    frequency: 'monthly',
    recurringAmount: 1000,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.summary.totalInvested, 3000);
  assert.equal(r.summary.finalValue, 3000);
  assert.equal(r.transactions.filter((t) => t.type === 'buy').length, 3);
  assert.equal(r.summary.finalShares, 300);
});

test('每年定投：三年三次', () => {
  const prices = flat(['2020-01-01', '2021-01-01', '2022-01-01']);
  const r = simulate({
    prices,
    dividends: [],
    startDate: '2020-01-01',
    initialAmount: 0,
    frequency: 'yearly',
    recurringAmount: 1000,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.summary.totalInvested, 3000);
  assert.equal(r.transactions.filter((t) => t.type === 'buy').length, 3);
});

test('开始日为非交易日时拒绝买入', () => {
  const prices = flat(['2021-01-04']);
  assert.throws(
    () =>
      simulate({
        prices,
        dividends: [],
        startDate: '2021-01-02',
        initialAmount: 1000,
        frequency: 'none',
        recurringAmount: 0,
        reinvest: true,
        taxRate: 0,
      }),
    /交易日/,
  );
});

test('除息日当天才买入不享受当日分红', () => {
  const prices = flat(['2021-01-04', '2021-01-05']);
  const r = simulate({
    prices,
    dividends: [['2021-01-04', 5]],
    startDate: '2021-01-04',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.summary.totalDividends, 0);
  assert.equal(r.summary.finalValue, 1000);
});

test('月初/月末锚点按自然月顺延', () => {
  assert.deepEqual(buildAnchors('2021-01-31', '2021-04-30', 'monthly'), [
    '2021-01-31',
    '2021-02-28',
    '2021-03-31',
    '2021-04-30',
  ]);
  assert.deepEqual(buildAnchors('2020-02-29', '2023-03-01', 'yearly'), [
    '2020-02-29',
    '2021-02-28',
    '2022-02-28',
    '2023-02-28',
  ]);
});

test('年度汇总的投入与分红之和正确', () => {
  const prices = flat(['2021-01-01', '2021-06-01', '2022-01-01']);
  const r = simulate({
    prices,
    dividends: [['2021-06-01', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxRate: 0,
  });
  assert.equal(r.yearly.length, 2);
  assert.equal(r.yearly[0].year, 2021);
  assert.equal(r.yearly[0].invested, 1000);
  assert.equal(r.yearly[0].dividends, 100);
  assert.equal(r.yearly[0].dividendCount, 1);
  assert.equal(r.yearly[0].endValue, 1100);
});

test('XIRR 对两年翻倍给出约 41.4%', () => {
  const r = xirr([
    { date: '2021-01-01', amount: -1000 },
    { date: '2023-01-01', amount: 2000 },
  ]);
  assert.ok(Math.abs(r - (Math.sqrt(2) - 1)) < 1e-4, `got ${r}`);
});

test('A股持有期差别税：持有 19 天按 20% 扣税', () => {
  const r = simulate({
    prices: flat(['2021-01-01', '2021-01-20']),
    dividends: [['2021-01-20', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxMode: 'holding',
    taxRate: 0,
  });
  assert.equal(r.summary.grossDividends, 100);
  assert.equal(r.summary.totalTax, 20);
  assert.equal(r.summary.totalDividends, 80);
  assert.ok(Math.abs(r.summary.finalShares - 108) < 1e-9);
  assert.equal(r.summary.effectiveTaxRate, 0.2);
});

test('A股持有期差别税：持有 31 天按 10% 扣税', () => {
  const r = simulate({
    prices: flat(['2021-01-01', '2021-02-01']),
    dividends: [['2021-02-01', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: false,
    taxMode: 'holding',
    taxRate: 0,
  });
  assert.equal(r.summary.totalTax, 10);
  assert.equal(r.summary.totalDividends, 90);
});

test('A股持有期差别税：持有超过 1 年免税', () => {
  const r = simulate({
    prices: flat(['2021-01-01', '2022-01-02']),
    dividends: [['2022-01-02', 1]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: false,
    taxMode: 'holding',
    taxRate: 0,
  });
  assert.equal(r.summary.totalTax, 0);
  assert.equal(r.summary.totalDividends, 100);
});

test('A股多笔份额按各自持有期分别计税', () => {
  const r = simulate({
    prices: flat(['2021-01-01', '2021-02-01', '2021-02-15']),
    dividends: [['2021-02-15', 1]],
    startDate: '2021-01-01',
    initialAmount: 0,
    frequency: 'monthly',
    recurringAmount: 1000,
    reinvest: false,
    taxMode: 'holding',
    taxRate: 0,
  });
  // 1 月 1 日买入 100 股（45 天，10%）；2 月 1 日买入 100 股（14 天，20%）
  assert.equal(r.summary.grossDividends, 200);
  assert.equal(r.summary.totalTax, 30);
  assert.equal(r.summary.totalDividends, 170);
});

test('送转股：先分红、再送转、最后按除权价再投资', () => {
  const r = simulate({
    prices: [
      ['2021-01-01', 10],
      ['2021-01-04', 5],
    ],
    dividends: [['2021-01-04', 1]],
    shareEvents: [['2021-01-04', 2]],
    startDate: '2021-01-01',
    initialAmount: 1000,
    frequency: 'none',
    recurringAmount: 0,
    reinvest: true,
    taxMode: 'fixed',
    taxRate: 0,
  });
  assert.equal(r.summary.grossDividends, 100); // 按送转前 100 股计算
  assert.ok(Math.abs(r.summary.finalShares - 220) < 1e-9); // 200 股 + 100 元 / 5 元
  assert.equal(r.summary.finalValue, 1100);
  assert.equal(r.transactions.find((t) => t.type === 'share').added, 100);
});

test('定投遇非交易日：skip 跳过，roll 顺延', () => {
  const prices = flat(['2021-01-01', '2021-02-02', '2021-03-01']);
  const base = {
    prices,
    dividends: [],
    startDate: '2021-01-01',
    initialAmount: 0,
    frequency: 'monthly',
    recurringAmount: 1000,
    reinvest: true,
    taxRate: 0,
  };
  const skip = simulate({ ...base, schedulePolicy: 'skip' });
  const roll = simulate({ ...base, schedulePolicy: 'roll' });
  assert.equal(skip.summary.totalInvested, 2000);
  assert.equal(roll.summary.totalInvested, 3000);
  assert.equal(roll.transactions.filter((t) => t.type === 'buy').length, 3);
});

test('非法投入金额会报错', () => {
  assert.throws(
    () =>
      simulate({
        prices: flat(['2021-01-01']),
        dividends: [],
        startDate: '2021-01-01',
        initialAmount: 0,
        frequency: 'none',
        recurringAmount: 0,
      }),
    /大于 0/,
  );
});
