// Снимки за преглед на вида: една игра срещу бот, снимки след няколко хода и по средата на анимация.
// GAME="Дама" MOVES=6 node e2e/look.mjs <папка>   (DARK=1 за тъмна тема, W=1280 за десктоп)
import { createRequire } from 'node:module';
import { ACT } from './actions.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8081/';
const GAME = process.env.GAME ?? 'Дама';
const MOVES = Number(process.env.MOVES ?? 6);
const out = process.argv[2] ?? '.';
const tag = process.env.TAG ?? 'look';
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: Number(process.env.W ?? 360), height: Number(process.env.H ?? 780) }, deviceScaleFactor: 2,
  colorScheme: process.env.DARK ? 'dark' : 'light', reducedMotion: process.env.RM ? 'reduce' : 'no-preference',
});
const p = await ctx.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto(`${BASE}?store=local&as=look-${Date.now()}`);
await p.fill('#nick', 'Калоян');
await p.getByRole('button', { name: 'Към мегдана' }).click();
await p.getByRole('button', { name: new RegExp(GAME) }).first().click();
for (const [group, label] of JSON.parse(process.env.PICK ?? '[]')) await p.locator(`.pills[aria-label="${group}"] .pill`, { hasText: label }).click();
await p.getByRole('button', { name: 'Играй с компютъра' }).click();
await p.locator('.code-chip-code').waitFor();
if (process.env.PREP) await eval(process.env.PREP);
let moves = 0;
let shots = 0;
const deadline = Date.now() + 120000;
while (moves < MOVES && Date.now() < deadline) {
  if (await p.locator('.result-banner').count()) break;
  const mine = await p.locator('.status-line.mine').count();
  if (mine) {
    if (moves === MOVES - 1) await p.screenshot({ path: `${out}/${tag}-myturn.png` });
    await ACT[GAME](p).catch(() => {});
    moves++;
    if (moves === MOVES - 1) {
      // по средата на анимацията на моя ход
      await p.waitForTimeout(120);
      await p.screenshot({ path: `${out}/${tag}-mid.png` });
    }
  }
  await p.waitForTimeout(100);
}
await p.waitForTimeout(400);
// Чакам хода на бота и снимам по средата на неговата анимация.
const before = await p.locator('.status-line').textContent().catch(() => '');
for (let i = 0; i < 40; i++) {
  await p.waitForTimeout(50);
  if (await p.locator('.status-line.mine').count()) { await p.waitForTimeout(140); await p.screenshot({ path: `${out}/${tag}-botmove.png` }); shots++; break; }
}
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/${tag}-after.png` });
console.log(`${GAME}: ${moves} хода, снимки готови${shots ? '' : ' (без снимка на бота)'}; ${before}`);
console.log(errors.length ? `ГРЕШКИ: ${errors.join(' | ')}` : 'без грешки');
await browser.close();
