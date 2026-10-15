// E2E: двама играчи в два таба (общ локален store през BroadcastChannel).
// node e2e/connect4.mjs [изходна папка за снимки]
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8080/';
const out = process.argv[2] ?? '.';
const errors = [];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2 });
const p1 = await ctx.newPage();
const p2 = await ctx.newPage();
for (const [name, p] of [['p1', p1], ['p2', p2]]) {
  p.on('pageerror', (e) => errors.push(`${name} pageerror: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${name} console: ${m.text()}`));
}

async function setProfile(p, nick, avatarIdx) {
  await p.fill('#nick', nick);
  await p.locator('.choice-grid').first().locator('button').nth(avatarIdx).click();
  await p.getByRole('button', { name: 'Към мегдана' }).click();
  await p.getByRole('heading', { name: `Здравей, ${nick}!` }).waitFor();
}

await p1.goto(`${BASE}?store=local&as=p1`);
await p1.screenshot({ path: `${out}/01-profile.png`, fullPage: true });
await setProfile(p1, 'Калоян', 0);
await p1.screenshot({ path: `${out}/02-lobby.png`, fullPage: true });

await p1.getByRole('button', { name: /Четири в редица/ }).click();
await p1.locator('.room-code').waitFor();
const code = (await p1.locator('.room-code').textContent()).trim();
console.log('код:', code);

await p2.goto(`${BASE}?store=local&as=p2`);
await setProfile(p2, 'Мила', 3);
await p2.fill('#code', code.toLowerCase());
await p2.getByRole('button', { name: 'Влез', exact: true }).click();
await p2.locator('.room-code').waitFor();
await p2.getByRole('button', { name: 'Готов', exact: true }).click();

await p1.getByRole('button', { name: 'Старт' }).waitFor();
await p1.waitForFunction(() => !document.querySelector('.btn-primary')?.disabled);
await p1.screenshot({ path: `${out}/03-room-setup.png`, fullPage: true });
await p1.getByRole('button', { name: 'Старт' }).click();

// Калоян печели вертикално в колона 1; Мила играе в колона 2.
const moves = [[p1, 1], [p2, 2], [p1, 1], [p2, 2], [p1, 1], [p2, 2]];
for (const [p, col] of moves) {
  await p.locator('.status-line', { hasText: 'Твой ход' }).waitFor();
  await p.getByRole('button', { name: `Колона ${col}` }).click();
}
// Ход извън ред: Мила опитва, докато е ред на Калоян → бутоните са изключени.
await p2.locator('.status-line', { hasText: 'Ход на Калоян' }).waitFor();
const disabled = await p2.getByRole('button', { name: 'Колона 3' }).isDisabled();
console.log('ход извън ред блокиран:', disabled);
await p1.locator('.status-line', { hasText: 'Твой ход' }).waitFor();
await p2.screenshot({ path: `${out}/04-playing.png`, fullPage: true });
await p1.getByRole('button', { name: 'Колона 1' }).click();

await p1.getByRole('heading', { name: 'Победа!' }).waitFor();
await p2.getByRole('heading', { name: 'Загуба' }).waitFor();
await p1.waitForTimeout(400);
await p1.screenshot({ path: `${out}/05-win.png`, fullPage: true });

// Чат и реакция
await p2.fill('#chat-text', 'Добра игра!');
await p2.getByRole('button', { name: 'Прати' }).click();
await p1.getByText('Добра игра!').waitFor();

// Реванш
await p2.getByRole('button', { name: 'Готов', exact: true }).click();
await p1.getByRole('button', { name: 'Нова партида' }).click();
await p2.locator('.status-line', { hasText: /Твой ход|Ход на Калоян/ }).waitFor();

// Презареждане по средата
await p2.reload();
await p2.locator('.room-code').waitFor();
await p2.locator('.status-line', { hasText: /Твой ход|Ход на Калоян/ }).waitFor();
console.log('презареждане: ок');

// Класация
await p1.getByRole('button', { name: 'Класация' }).click();
await p1.getByRole('cell', { name: '1016' }).waitFor();
await p1.screenshot({ path: `${out}/06-leaderboard.png`, fullPage: true });

// Десктоп + тъмна тема
const d = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' });
const dp = await d.newPage();
dp.on('pageerror', (e) => errors.push(`dark pageerror: ${e.message}`));
await dp.goto(`${BASE}?store=local&as=p3`);
await setProfile(dp, 'Иво', 5);
await dp.screenshot({ path: `${out}/07-lobby-dark-desktop.png` });

await browser.close();
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
