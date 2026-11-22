function currencySymbol(currency) {
  if (currency === 'USD') return '$';
  if (currency === 'HKD') return 'HK$';
  if (currency === 'CNY') return '¥';
  return currency ? currency + ' ' : '¥';
}

function fmtNum(value, digits) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const d = digits || 0;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const fixed = abs.toFixed(d);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + parts.join('.');
}

function fmtMoney(value, currency, digits) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  return sign + currencySymbol(currency) + fmtNum(Math.abs(n), digits || 0);
}

function fmtSignedMoney(value, currency, digits) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return sign + currencySymbol(currency) + fmtNum(Math.abs(n), digits || 0);
}

function fmtPct(value, digits) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  return (n * 100).toFixed(digits == null ? 2 : digits) + '%';
}

function fmtSignedPct(value, digits) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return sign + (n * 100).toFixed(digits == null ? 2 : digits) + '%';
}

function fmtCompact(value) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, '') + '亿';
  if (abs >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return fmtNum(n, 0);
}

function fmtShares(value) {
  const n = Number(value);
  if (!isFinite(n)) return '—';
  if (Math.abs(n) >= 1000) return fmtNum(n, 0) + ' 股';
  return fmtNum(n, 2) + ' 股';
}

function fmtDateDot(date) {
  return date ? String(date).replace(/-/g, '.') : '—';
}

function fmtDateCn(date) {
  if (!date) return '—';
  const parts = String(date).split('-');
  return parts[0] + ' 年 ' + Number(parts[1]) + ' 月 ' + Number(parts[2]) + ' 日';
}

module.exports = {
  currencySymbol,
  fmtNum,
  fmtMoney,
  fmtSignedMoney,
  fmtPct,
  fmtSignedPct,
  fmtCompact,
  fmtShares,
  fmtDateDot,
  fmtDateCn,
};
