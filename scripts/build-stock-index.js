// Build data/stock-index.json: A-share full list + curated HK/US names.
// Usage: node scripts/build-stock-index.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { pinyin } from 'pinyin-pro';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data', 'stock-index.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMMON_ALIASES = {
  '601398.SS': ['工行', 'icbc'],
  '601939.SS': ['建行', 'ccb'],
  '601288.SS': ['农行', 'abc'],
  '601988.SS': ['中行', 'boc'],
  '600036.SS': ['招行', 'cmb'],
  '600519.SS': ['茅台', 'maotai'],
  '601088.SS': ['神华', 'shenhua'],
  '600900.SS': ['长电', 'changdian'],
  '601318.SS': ['平安', 'pingan'],
  '002594.SZ': ['比亚迪', 'byd'],
  '300750.SZ': ['宁德', 'ningde', 'catl'],
  '601857.SS': ['中石油', 'petrochina'],
  '600028.SS': ['中石化', 'sinopec'],
  '600941.SS': ['中移动', 'cmcc'],
  '600050.SS': ['联通', 'unicom'],
  '601728.SS': ['中电信', 'ct'],
};

const CURATED = [
  { symbol: '0700.HK', name: '腾讯控股', market: 'HK', exchange: '港交所', aliases: ['腾讯', 'tengxun', 'tencent', 'tx'] },
  { symbol: '9988.HK', name: '阿里巴巴-W', market: 'HK', exchange: '港交所', aliases: ['阿里', '阿里巴巴', 'alibaba', 'albb'] },
  { symbol: '3690.HK', name: '美团-W', market: 'HK', exchange: '港交所', aliases: ['美团', 'meituan', 'mt'] },
  { symbol: '1810.HK', name: '小米集团-W', market: 'HK', exchange: '港交所', aliases: ['小米', 'xiaomi', 'xm'] },
  { symbol: '1211.HK', name: '比亚迪股份', market: 'HK', exchange: '港交所', aliases: ['比亚迪', 'byd'] },
  { symbol: '0939.HK', name: '建设银行', market: 'HK', exchange: '港交所', aliases: ['建行', 'ccb'] },
  { symbol: '1398.HK', name: '工商银行', market: 'HK', exchange: '港交所', aliases: ['工行', 'icbc'] },
  { symbol: '3988.HK', name: '中国银行', market: 'HK', exchange: '港交所', aliases: ['中行', 'boc'] },
  { symbol: '0941.HK', name: '中国移动', market: 'HK', exchange: '港交所', aliases: ['中移动', 'cmcc'] },
  { symbol: '0883.HK', name: '中国海洋石油', market: 'HK', exchange: '港交所', aliases: ['中海油', 'cnooc'] },
  { symbol: '2318.HK', name: '中国平安', market: 'HK', exchange: '港交所', aliases: ['平安', 'pingan'] },
  { symbol: '0005.HK', name: '汇丰控股', market: 'HK', exchange: '港交所', aliases: ['汇丰', 'hsbc'] },
  { symbol: '1299.HK', name: '友邦保险', market: 'HK', exchange: '港交所', aliases: ['友邦', 'aia'] },
  { symbol: '0388.HK', name: '香港交易所', market: 'HK', exchange: '港交所', aliases: ['港交所', 'hkex'] },
  { symbol: '9618.HK', name: '京东集团-SW', market: 'HK', exchange: '港交所', aliases: ['京东', 'jd'] },
  { symbol: '1024.HK', name: '快手-W', market: 'HK', exchange: '港交所', aliases: ['快手', 'kuaishou', 'ks'] },
  { symbol: '2015.HK', name: '理想汽车-W', market: 'HK', exchange: '港交所', aliases: ['理想', 'lixiang', 'lx'] },
  { symbol: '9866.HK', name: '蔚来-SW', market: 'HK', exchange: '港交所', aliases: ['蔚来', 'nio'] },
  { symbol: '9868.HK', name: '小鹏汽车-W', market: 'HK', exchange: '港交所', aliases: ['小鹏', 'xpeng', 'xp'] },
  { symbol: 'AAPL', name: '苹果', market: 'US', exchange: '纳斯达克', aliases: ['apple', 'pingguo', 'aapl'] },
  { symbol: 'MSFT', name: '微软', market: 'US', exchange: '纳斯达克', aliases: ['microsoft', 'weiruan', 'msft'] },
  { symbol: 'NVDA', name: '英伟达', market: 'US', exchange: '纳斯达克', aliases: ['nvidia', 'yingweida', 'nvda'] },
  { symbol: 'GOOGL', name: '谷歌', market: 'US', exchange: '纳斯达克', aliases: ['alphabet', 'google', 'guge', 'googl'] },
  { symbol: 'AMZN', name: '亚马逊', market: 'US', exchange: '纳斯达克', aliases: ['amazon', 'yamaxun', 'amzn'] },
  { symbol: 'TSLA', name: '特斯拉', market: 'US', exchange: '纳斯达克', aliases: ['tesla', 'tesila', 'tsla'] },
  { symbol: 'META', name: 'Meta', market: 'US', exchange: '纳斯达克', aliases: ['脸书', 'facebook', 'meta', 'lian shu'] },
  { symbol: 'KO', name: '可口可乐', market: 'US', exchange: '纽交所', aliases: ['coca-cola', 'coke', 'kekoukele', 'ko'] },
  { symbol: 'PEP', name: '百事可乐', market: 'US', exchange: '纳斯达克', aliases: ['pepsi', 'baishikele', 'pep'] },
  { symbol: 'MCD', name: '麦当劳', market: 'US', exchange: '纽交所', aliases: ["mcdonald's", 'maidanglao', 'mcd'] },
  { symbol: 'JNJ', name: '强生', market: 'US', exchange: '纽交所', aliases: ['johnson & johnson', 'qiangsheng', 'jnj'] },
  { symbol: 'PG', name: '宝洁', market: 'US', exchange: '纽交所', aliases: ['procter & gamble', 'baojie', 'pg'] },
  { symbol: 'JPM', name: '摩根大通', market: 'US', exchange: '纽交所', aliases: ['jpmorgan', 'mogen', 'jpm'] },
  { symbol: 'V', name: '维萨', market: 'US', exchange: '纽交所', aliases: ['visa', 'weisa', 'v'] },
  { symbol: 'MA', name: '万事达', market: 'US', exchange: '纽交所', aliases: ['mastercard', 'wanshida', 'ma'] },
  { symbol: 'BRK-B', name: '伯克希尔', market: 'US', exchange: '纽交所', aliases: ['berkshire', 'bokeer', 'brk'] },
  { symbol: 'VOO', name: '标普500ETF', market: 'US', exchange: 'NYSE Arca', aliases: ['标普500', 's&p500', 'sp500', 'voo'] },
  { symbol: 'SPY', name: '标普500ETF-SPY', market: 'US', exchange: 'NYSE Arca', aliases: ['标普500', 's&p500', 'sp500', 'spy'] },
  { symbol: 'QQQ', name: '纳指100ETF', market: 'US', exchange: '纳斯达克', aliases: ['纳斯达克100', 'nasdaq100', 'qqq'] },
  { symbol: 'SCHD', name: '红利ETF-SCHD', market: 'US', exchange: 'NYSE Arca', aliases: ['红利etf', 'dividend etf', 'schd'] },
  { symbol: 'O', name: 'Realty Income', market: 'US', exchange: '纽交所', aliases: ['房地产信托', 'realty income', 'o'] },
  { symbol: 'T', name: 'AT&T', market: 'US', exchange: '纽交所', aliases: ['美国电话电报', 'att', 't'] },
  { symbol: 'VZ', name: '威瑞森', market: 'US', exchange: '纽交所', aliases: ['verizon', 'weiruis', 'vz'] },
  { symbol: 'XOM', name: '埃克森美孚', market: 'US', exchange: '纽交所', aliases: ['exxon', 'exxonmobil', 'xom'] },
  { symbol: 'CVX', name: '雪佛龙', market: 'US', exchange: '纽交所', aliases: ['chevron', 'xuefolong', 'cvx'] },
  { symbol: 'HD', name: '家得宝', market: 'US', exchange: '纽交所', aliases: ['home depot', 'jiadebao', 'hd'] },
  { symbol: 'COST', name: '好市多', market: 'US', exchange: '纳斯达克', aliases: ['costco', 'haoshiduo', 'cost'] },
  { symbol: 'WMT', name: '沃尔玛', market: 'US', exchange: '纽交所', aliases: ['walmart', 'woerma', 'wmt'] },
  { symbol: 'DIS', name: '迪士尼', market: 'US', exchange: '纽交所', aliases: ['disney', 'dishini', 'dis'] },
  { symbol: 'NFLX', name: '奈飞', market: 'US', exchange: '纳斯达克', aliases: ['netflix', 'naifei', 'nflx'] },
  { symbol: 'BABA', name: '阿里巴巴', market: 'US', exchange: '纽交所', aliases: ['阿里', 'alibaba', 'baba'] },
  { symbol: 'PDD', name: '拼多多', market: 'US', exchange: '纳斯达克', aliases: ['pinduoduo', 'pdd'] },
  { symbol: 'JD', name: '京东', market: 'US', exchange: '纳斯达克', aliases: ['jd.com', 'jingdong', 'jd'] },
  { symbol: 'NIO', name: '蔚来', market: 'US', exchange: '纽交所', aliases: ['nio', 'weilai'] },
  { symbol: 'XPEV', name: '小鹏汽车', market: 'US', exchange: '纽交所', aliases: ['xpeng', 'xiaopeng', 'xpev'] },
  { symbol: 'LI', name: '理想汽车', market: 'US', exchange: '纳斯达克', aliases: ['lixiang', 'li auto', 'li'] },
  { symbol: 'TCEHY', name: '腾讯ADR', market: 'US', exchange: 'OTC', aliases: ['腾讯', 'tencent', 'tcehy'] },
];

function pinyinParts(name) {
  const full = pinyin(name, { toneType: 'none', type: 'array' }).join('').toLowerCase();
  const initials = pinyin(name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase();
  return { pinyin: full, initials };
}

function withPinyin(item) {
  const { pinyin: full, initials } = pinyinParts(item.name);
  return {
    ...item,
    pinyin: full,
    initials,
    aliases: [...new Set((item.aliases || []).map((x) => String(x).toLowerCase()))],
  };
}

async function fetchPage(pn) {
  const url =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=' +
    pn +
    '&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3' +
    '&fs=' +
    encodeURIComponent('m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23') +
    '&fields=f12,f14,f13';
  const res = await fetch(url, { headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json?.data?.diff || [];
}

async function main() {
  const first = await fetchPage(1);
  const total = 5565; // fetched dynamically below if available
  // The API caps page size at 100; the total is in data.total, read it from a fresh response.
  const firstUrl =
    'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=100&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3' +
    '&fs=' +
    encodeURIComponent('m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23') +
    '&fields=f12,f14,f13';
  const firstRes = await fetch(firstUrl, { headers: { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' } });
  const firstJson = await firstRes.json();
  const totalCount = firstJson?.data?.total || total;
  const pages = Math.ceil(totalCount / 100);
  console.log(`A股 ${totalCount} 只，共 ${pages} 页`);

  const rows = [...first];
  for (let pn = 2; pn <= pages; pn++) {
    let pageRows = [];
    for (let attempt = 0; attempt < 3 && !pageRows.length; attempt++) {
      try {
        pageRows = await fetchPage(pn);
      } catch (err) {
        console.warn(`  page ${pn} retry ${attempt + 1}: ${err.message}`);
        await sleep(500);
      }
    }
    rows.push(...pageRows);
    if (pn % 10 === 0 || pn === pages) console.log(`  ${pn}/${pages}`);
    await sleep(120);
  }

  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const code = String(row.f12 || '').trim();
    const name = String(row.f14 || '').trim();
    if (!/^\d{6}$/.test(code) || !name) continue;
    const market = Number(row.f13) === 1 ? 'SS' : code.startsWith('4') || code.startsWith('8') ? 'BJ' : 'SZ';
    const symbol = `${code}.${market}`;
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    const item = withPinyin({
      symbol,
      code,
      name,
      market: 'CN',
      exchange: market === 'SS' ? '上交所' : market === 'BJ' ? '北交所' : '深交所',
      aliases: COMMON_ALIASES[symbol] || [],
    });
    items.push(item);
  }

  for (const item of CURATED) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    items.push(withPinyin({ ...item, code: item.symbol.split('.')[0] }));
  }

  items.sort((a, b) => a.symbol.localeCompare(b.symbol));
  await fs.writeFile(OUT, JSON.stringify(items));
  console.log(`saved ${OUT} · ${items.length} items`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
