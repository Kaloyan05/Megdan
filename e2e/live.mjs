// E2E: игрите на живо (Понг, Въздушен хокей) — срещу бот и двама в отделни табове.
// node e2e/live.mjs [папка за снимки]   (LAG=120 за мрежово забавяне)
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const LAG = process.env.LAG ?? '0';
const out = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();

async function open(ctx, id, nick, tag) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`));
  await p.goto(`${BASE}?store=local&as=${id}&lag=${LAG}`);
  await p.fill('#nick', nick);
  await p.getByRole('button', { name: 'Към мегдана' }).click();
  await p.getByRole('heading', { name: `Здравей, ${nick}!` }).waitFor();
  return p;
}

// Държи мишката в даден ъгъл на игрището (в координати на екрана 0..1).
async function hold(p, fx, fy) {
  const box = await p.locator('.lv-canvas').boundingBox();
  if (box) await p.mouse.move(box.x + box.width * fx, box.y + box.height * fy);
}

async function waitResult(pages, ms, tick) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await pages[0].locator('.result-banner').count()) break;
    await tick?.();
    await pages[0].waitForTimeout(250);
  }
  return Promise.all(pages.map((p) => p.locator('.result-banner h2').textContent({ timeout: 5000 }).catch(() => 'НЯМА')));
}

async function solo(name, tag) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  const p = await open(ctx, `solo-${tag}`, 'Калоян', tag);
  await p.getByRole('button', { name: new RegExp(name) }).first().click();
  await p.locator('.pills[aria-label="Точки за победа"] .pill', { hasText: 'До 5' }).click();
  await p.locator('.pills[aria-label="Ниво на бота"] .pill', { hasText: 'Труден' }).click();
  await p.screenshot({ path: `${out}/live-sheet-${tag}.png` });
  await p.getByRole('button', { name: 'Играй с компютъра' }).click();
  await p.locator('.lv-canvas').waitFor();
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/live-${tag}.png` });
  const [banner] = await waitResult([p], 150000, () => hold(p, 0.02, 0.98));
  const final = await p.locator('.lv-final').textContent().catch(() => '');
  console.log(`${name} срещу бот: ${banner} (${final.replace(/\s+/g, ' ').trim()})`);
  await p.screenshot({ path: `${out}/live-${tag}-end.png`, fullPage: true });
  await ctx.close();
  return /Победа|печели|Загуба|загуби/i.test(banner) || banner !== 'НЯМА';
}

async function duo(name, tag, how) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
  const a = await open(ctx, `${tag}a`, 'Калоян', `${tag}/a`);
  const b = await open(ctx, `${tag}b`, 'Мила', `${tag}/b`);
  await a.getByRole('button', { name: new RegExp(name) }).first().click();
  await a.locator('.pills[aria-label="Точки за победа"] .pill', { hasText: 'До 5' }).click();
  await a.getByRole('button', { name: 'Създай стая' }).click();
  await a.locator('.code-chip-code').waitFor();
  const code = (await a.locator('.code-chip-code').textContent()).trim();
  await b.fill('#code', code);
  await b.getByRole('button', { name: 'Влез', exact: true }).click();
  await b.getByRole('button', { name: 'Не съм готов' }).waitFor(); // влезлият по покана е готов сам
  await a.waitForFunction(() => {
    const x = [...document.querySelectorAll('button')].find((y) => y.textContent === 'Старт');
    return x && !x.disabled;
  });
  await a.getByRole('button', { name: 'Старт' }).click();
  await a.locator('.lv-canvas').waitFor();
  await b.locator('.lv-canvas').waitFor();
  await a.waitForTimeout(3000);
  await a.screenshot({ path: `${out}/live-${tag}-a.png`, fullPage: true });
  await b.screenshot({ path: `${out}/live-${tag}-b.png` });
  let banners;
  if (how === 'resign') {
    await a.waitForTimeout(4000);
    await b.getByRole('button', { name: 'Предай се' }).click();
    await b.getByRole('button', { name: 'Да, предавам се' }).click();
    banners = await waitResult([a, b], 15000);
  } else {
    // a стои в левия ъгъл, b — в десния: и двамата пропускат.
    banners = await waitResult([a, b], 150000, async () => { await hold(a, 0.02, 0.98); await hold(b, 0.98, 0.98); });
  }
  const finals = await Promise.all([a, b].map((p) => p.locator('.lv-final').textContent().catch(() => '')));
  console.log(`${name}, двама (${how}): ${banners.join(' | ')} — ${finals.map((f) => f.replace(/\s+/g, ' ').trim()).join(' | ')}`);
  await ctx.close();
  const nums = finals.map((f) => f.replace(/\D+/g, ' ').trim());
  return banners.every((x) => x !== 'НЯМА') && nums[0] === nums[1];
}

let ok = true;
ok = (await solo('Понг', 'pong')) && ok;
ok = (await solo('Въздушен хокей', 'hockey')) && ok;
ok = (await duo('Понг', 'pong2', 'play')) && ok;
ok = (await duo('Въздушен хокей', 'hockey2', 'resign')) && ok;
await browser.close();
console.log(ok ? 'всички партиди завършиха' : 'НЯКОЯ ПАРТИДА НЕ ЗАВЪРШИ');
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
process.exit(ok && !errors.length ? 0 : 1);
