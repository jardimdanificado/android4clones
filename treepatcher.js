/**
 * treepatcher.js - CLI Device Tree Source (DTS) Patcher for Android on RK3326 handhelds
 */

import { readFileSync, writeFileSync } from 'fs';
import { parseDTS } from './parser36.js';
import { applyAndroidPatches } from './patcher-logic.js';

const showHelp = () => console.log(`
Usage: node treepatcher.js <target.dts> [options]

Options:
  --stock <stock.dts>    Sync hardware parameters (DDR, Panel) from a working stock DTS.
  --experimental         Apply experimental tweaks (MMC, PWM, LDO, Panel sync).
  -o <output.dts>        Output file name (default: rk3326-r36-android.dts).
  --help, -h             Show this help message.

Example:
  node treepatcher.js base.dts --stock stock.dts --experimental -o my-device.dts
`);

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

const targetFile = process.argv[2];
const stockFile = process.argv.includes('--stock')
  ? process.argv[process.argv.indexOf('--stock') + 1]
  : null;
const experimental = process.argv.includes('--experimental');
const outputFile = process.argv.includes('-o')
  ? process.argv[process.argv.indexOf('-o') + 1]
  : 'rk3326-r36-android.dts';

if (!targetFile || targetFile.startsWith('-')) {
  showHelp();
  process.exit(1);
}

try {
  const dts = parseDTS(readFileSync(targetFile, 'utf8'));
  const stock = stockFile
    ? (console.log(`Loading stock info from ${stockFile}...`), parseDTS(readFileSync(stockFile, 'utf8')))
    : null;

  applyAndroidPatches(dts, stock, { experimental });

  writeFileSync(outputFile, dts.toString());
  console.log(`Done! Result in ${outputFile}`);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
