// E2E: „Играй с компютъра“ за всяка игра — един човек срещу ботове през интерфейса.
// node e2e/bots.mjs [папка за снимки]   (ONLY=connect4,tabla за част от игрите)
import { createRequire } from 'node:module';
import { ACT } from './actions.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const out = process.argv[2] ?? '.';
const only = process.env.ONLY?.split(',');
const errors = [];
const browser = await chromium.launch();

async function solo(name, tag, level) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`));
  await p.goto(`${BASE}?store=local&as=solo-${tag}`);
  await p.fill('#nick', 'Калоян');
  await p.getByRole('button', { name: 'Към мегдана' }).click();
  await p.getByRole('button', { name: new RegExp(name) }).first().click();
  if (level) await p.locator('.pills[aria-label="Ниво на бота"] .pill', { hasText: level }).click();
  await p.getByRole('button', { name: 'Играй с компютъра' }).click();
  await p.locator('.code-chip-code').waitFor();
  if (tag === 'battleship') {
    await p.getByRole('button', { name: 'Готово' }).click();
  }
  const deadline = Date.now() + 360000;
  let moves = 0;
  while (Date.now() < deadline) {
    if (await p.locator('.result-banner').count()) break;
    const st = await p.locator('.status-line').textContent().catch(() => '');
    if (/Твой (ход|удар)/.test(st)) {
      await ACT[name](p).catch(() => {});
      moves++;
      if (moves === 4) await p.screenshot({ path: `${out}/bot-${tag}.png`, fullPage: true });
      await p.waitForTimeout(80);
    } else await p.waitForTimeout(150);
  }
  const banner = await p.locator('.result-banner h2').textContent({ timeout: 3000 }).catch(() => 'НЯМА');
  console.log(`${name} срещу бот${level ? ` (${level})` : ''}: ${moves} мои хода → ${banner}`);
  await ctx.close();
  return banner !== 'НЯМА';
}

const LIST = [
  ['Четири в редица', 'connect4'], ['Реверси', 'reversi'], ['Точки и кутийки', 'dots'], ['Цветна осмица', 'color8'],
  ['Ултимат морски шах', 'uttt'], ['Покер със зарове', 'dice'], ['Мемори', 'memory'], ['Не се сърди човече', 'ludo'],
  ['Табла', 'tabla'], ['Морски бой', 'battleship'], ['Мини голф', 'golf'],
];
const extra = JSON.parse(process.env.EXTRA ?? '[]');
let ok = true;
for (const [name, tag] of [...LIST, ...extra]) {
  if (only && !only.includes(tag)) continue;
  ok = (await solo(name, tag, process.env.LEVEL)) && ok;
}
await browser.close();
console.log(ok ? 'всички партиди завършиха' : 'НЯКОЯ ПАРТИДА НЕ ЗАВЪРШИ');
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
process.exit(ok && !errors.length ? 0 : 1);
