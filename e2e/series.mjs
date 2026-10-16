// E2E: Вечер на игрите с двама души — избрани игри, точки, следваща игра, шампион, нова вечер.
import { createRequire } from 'node:module';
import { ACT } from './actions.mjs';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const out = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
const pages = [await ctx.newPage(), await ctx.newPage()];
for (const [i, p] of pages.entries()) {
  p.on('pageerror', (e) => errors.push(`${i} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${i} console: ${m.text()}`));
  await p.goto(`${BASE}?store=local&as=ser${i}`);
  await p.fill('#nick', ['Калоян', 'Мила'][i]);
  await p.getByRole('button', { name: 'Към мегдана' }).click();
}
const [host, guest] = pages;
await host.getByRole('button', { name: 'Вечер на игрите' }).click();
await host.locator('.pills[aria-label="Как да изберем игрите"] .pill', { hasText: 'Избирам сам' }).click();
await host.locator('.series-game', { hasText: 'Четири в редица' }).click();
await host.locator('.series-game', { hasText: 'Реверси' }).click();
await host.screenshot({ path: `${out}/series-sheet.png` });
await host.getByRole('button', { name: 'Създай стая' }).click();
const code = (await host.locator('.code-chip-code').textContent()).trim();
await guest.fill('#code', code);
await guest.getByRole('button', { name: 'Влез', exact: true }).click();
await guest.getByRole('button', { name: 'Не съм готов' }).waitFor(); // влезлият по покана е готов сам
await host.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent === 'Старт' && !b.disabled));
await host.getByRole('button', { name: 'Старт' }).click();

const NAMES = { 'Четири в редица': 'Четири в редица', 'Реверси': 'Реверси' };
async function playOut() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (await host.locator('.result-banner').count()) return true;
    let acted = false;
    for (const p of pages) {
      const st = await p.locator('.status-line').textContent().catch(() => '');
      if (/Твой ход/.test(st)) {
        const label = await p.locator('.room-game').textContent();
        const name = Object.keys(NAMES).find((n) => label.startsWith(n));
        await ACT[name](p).catch(() => {});
        acted = true;
        break;
      }
    }
    if (!acted) await host.waitForTimeout(100);
  }
  return false;
}

console.log('игра 1:', await playOut());
await host.getByRole('button', { name: 'Следваща игра' }).waitFor();
console.log('точки след игра 1:', (await host.locator('.series-table').textContent()).replace(/\s+/g, ' '));
await host.screenshot({ path: `${out}/series-after1.png`, fullPage: true });
for (const p of pages) await p.getByRole('button', { name: 'Следваща игра' }).click();
await host.locator('.room-game', { hasText: 'Реверси' }).waitFor();
await host.locator('.status-line').waitFor();
console.log('игра 2:', await playOut());
await host.locator('.result-banner.champ').waitFor();
console.log('шампион:', (await host.locator('.result-banner.champ').textContent()).replace(/\s+/g, ' '));
await host.screenshot({ path: `${out}/series-champ.png`, fullPage: true });
await host.getByRole('button', { name: 'Нова вечер' }).click();
for (const p of pages) await p.getByRole('button', { name: 'Следваща игра' }).click().catch(() => {});
await host.locator('.room-game', { hasText: 'Четири в редица, игра 1 от 2' }).waitFor({ timeout: 10000 });
console.log('нова вечер: ок');
await browser.close();
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
