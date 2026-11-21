// Fetch bundled seed data for the preset stocks.
// Usage: node scripts/fetch-seed.js [SYMBOL ...]
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchStockData, PRESETS } from '../lib/data.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'data', 'seed');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const wanted = process.argv.slice(2);
  const list = wanted.length ? PRESETS.filter((p) => wanted.includes(p.symbol)) : PRESETS;
  for (const preset of list) {
    console.log(`\nFetching ${preset.symbol} (${preset.name})…`);
    try {
      const data = await fetchStockData(preset.symbol, preset.name);
      const file = path.join(OUT_DIR, `${preset.symbol.replace(/[^\w.-]/g, '_')}.json`);
      await fs.writeFile(file, JSON.stringify(data));
      console.log(
        `  saved ${path.basename(file)} · ${data.source} · ${data.prices.length} prices · ` +
          `${data.dividends.length} dividends · ${data.shareEvents.length} share events · ` +
          `${data.firstDate} → ${data.lastDate}`,
      );
    } catch (err) {
      console.error(`  FAILED ${preset.symbol}: ${err.message}`);
    }
    await sleep(1200);
  }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
