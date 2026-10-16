// E2E: цяла партида от всяка игра през интерфейса, с 2 или 3 играчи в отделни табове.
// node e2e/all-games.mjs [папка за снимки]
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const out = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();

import { ACT } from './actions.mjs';

async function setProfile(p, nick) {
  await p.fill('#nick', nick);
  await p.getByRole('button', { name: 'Към мегдана' }).click();
  await p.getByRole('heading', { name: `Здравей, ${nick}!` }).waitFor();
}

async function playGame(name, n, tag) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  const pages = [];
  for (let i = 0; i < n; i++) {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${tag}/${i} ${e.message}`));
    p.on('console', (m) => m.type() === 'error' && errors.push(`${tag}/${i} console: ${m.text()}`));
    await p.goto(`${BASE}?store=local&as=${tag}${i}`);
    await setProfile(p, ['Калоян', 'Мила', 'Иво'][i]);
    pages.push(p);
  }
  const [host, ...guests] = pages;
  await host.getByRole('button', { name: new RegExp(name) }).click();
  if (tag === 'c8') { await host.waitForTimeout(300); await host.screenshot({ path: `${out}/${tag}-sheet.png` }); }
  await host.getByRole('button', { name: 'Създай стая' }).click();
  await host.locator('.code-chip-code').waitFor();
  const code = (await host.locator('.code-chip-code').textContent()).trim();
  for (const g of guests) {
    await g.fill('#code', code);
    await g.getByRole('button', { name: 'Влез', exact: true }).click();
    await g.getByRole('button', { name: 'Не съм готов' }).waitFor(); // влезлият по покана е готов сам
  }
  await host.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Старт');
    return b && !b.disabled;
  });
  await host.getByRole('button', { name: 'Старт' }).click();

  if (tag === 'bs') {
    for (const p of pages) {
      await p.getByRole('button', { name: 'Разбъркай' }).click();
      await p.getByRole('button', { name: 'Готово' }).click();
    }
  }
  let moves = 0, shot = false;
  const deadline = Date.now() + 480000;
  while (Date.now() < deadline) {
    if (await host.locator('.result-banner').count()) break;
    let acted = false;
    for (const p of pages) {
      if (/Твой (ход|удар)/.test(await p.locator('.status-line').textContent().catch(() => ''))) {
        await ACT[name](p).catch(() => {});
        acted = true; moves++;
        if (moves === 6 && !shot) { shot = true; await p.waitForTimeout(300); await p.screenshot({ path: `${out}/${tag}-play.png`, fullPage: true }); }
        await p.waitForTimeout(60);
        break;
      }
    }
    if (!acted) await host.waitForTimeout(80);
  }
  const banners = await Promise.all(pages.map((p) => p.locator('.result-banner h2').textContent({ timeout: 5000 }).catch(() => 'НЯМА')));
  await host.screenshot({ path: `${out}/${tag}-end.png`, fullPage: true });
  if (tag === 'bs') {
    await host.locator('.bs-verify', { hasText: 'съвпада' }).waitFor({ timeout: 10000 }).catch(() => {});
    console.log('проверка на флотовете:', await host.locator('.bs-verify').textContent().catch(() => 'НЯМА'));
  }
  console.log(`${name} (${n} играчи): ${moves} хода → ${banners.join(' / ')}`);
  await ctx.close();
  return banners;
}

const ALL = [
  ['Четири в редица', 2, 'c4'], ['Реверси', 2, 'rv'], ['Точки и кутийки', 3, 'db'], ['Цветна осмица', 3, 'c8'],
  ['Ултимат морски шах', 2, 'ut'], ['Покер със зарове', 2, 'dp'], ['Мемори', 3, 'mm'],
  ['Не се сърди човече', 3, 'ld'], ['Табла', 2, 'tb'], ['Морски бой', 2, 'bs'], ['Мини голф', 3, 'gf'], ['Дама', 2, 'ck'], ['Викторина', 3, 'qz'], ['Реакция-рали', 3, 'rx'],
];
const only = process.env.ONLY?.split(',');
const results = [];
for (const [name, n, tag] of ALL) if (!only || only.includes(tag)) results.push(await playGame(name, n, tag));
await browser.close();

const ok = results.every((b) => !b.includes('НЯМА'));
console.log(ok ? 'всички партиди завършиха' : 'НЯКОЯ ПАРТИДА НЕ ЗАВЪРШИ');
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
process.exit(ok && !errors.length ? 0 : 1);
