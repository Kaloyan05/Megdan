// E2E: цяла партида от всяка игра през интерфейса, с 2 или 3 играчи в отделни табове.
// node e2e/all-games.mjs [папка за снимки]
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const out = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();

// Един ход за играча на ред, според играта.
const ACT = {
  'Четири в редица': async (p) => p.locator('.c4-col:not([disabled])').first().click(),
  'Реверси': async (p) => p.locator('.rv-cell.hint').first().click(),
  'Точки и кутийки': async (p) => {
    const lines = p.locator('.db-line:not([disabled])');
    const n = await lines.count();
    await lines.nth(Math.floor(Math.random() * n)).click();
  },
  'Цветна осмица': async (p) => {
    const card = p.locator('.c8-in-hand:not([disabled])');
    if (await card.count()) {
      await card.first().click();
      if (await p.locator('.c8-picker:not([hidden])').count()) await p.locator('.c8-swatch').first().click();
      return;
    }
    if (await p.locator('.c8-pile:not([disabled])').count()) return p.locator('.c8-pile').click();
    return p.getByRole('button', { name: 'Пропусни' }).click();
  },
};

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
  const code = (await host.locator('.room-code').textContent()).trim();
  for (const g of guests) {
    await g.fill('#code', code);
    await g.getByRole('button', { name: 'Влез', exact: true }).click();
    await g.getByRole('button', { name: 'Готов', exact: true }).click();
  }
  await host.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Старт');
    return b && !b.disabled;
  });
  await host.getByRole('button', { name: 'Старт' }).click();

  let moves = 0, shot = false;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await host.locator('.result-banner').count()) break;
    let acted = false;
    for (const p of pages) {
      if ((await p.locator('.status-line').textContent().catch(() => '')).includes('Твой ход')) {
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
  console.log(`${name} (${n} играчи): ${moves} хода → ${banners.join(' / ')}`);
  await ctx.close();
  return banners;
}

const results = [];
results.push(await playGame('Четири в редица', 2, 'c4'));
results.push(await playGame('Реверси', 2, 'rv'));
results.push(await playGame('Точки и кутийки', 3, 'db'));
results.push(await playGame('Цветна осмица', 3, 'c8'));
await browser.close();

const ok = results.every((b) => !b.includes('НЯМА'));
console.log(ok ? 'всички партиди завършиха' : 'НЯКОЯ ПАРТИДА НЕ ЗАВЪРШИ');
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
process.exit(ok && !errors.length ? 0 : 1);
