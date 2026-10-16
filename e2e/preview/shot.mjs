// node e2e/preview/shot.mjs <изход.png> '<query>'  [W=360] [DARK=1]
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const [out, query] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: Number(process.env.W ?? 400), height: 900 }, deviceScaleFactor: 2, colorScheme: process.env.DARK ? 'dark' : 'light' });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${pathToFileURL(process.cwd() + '/dist/preview.html')}?${query}`);
await p.waitForTimeout(Number(process.env.WAIT ?? 600));
await p.locator('.board-wrap').screenshot({ path: out });
console.log(errs.length ? errs.join('\n') : 'ok');
await b.close();
