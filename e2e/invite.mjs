// E2E: поканата на собствения сайт. Домакинът създава стая; приятелят отваря линка за пръв път,
// пише име и влиза направо в стаята като „Готов“; домакинът стартира веднага.
// PAGE=dist/site/index.html node e2e/invite.mjs <папка>   (STORE=local по подразбиране, FIREBASE=1 за истинския Firebase)
import { createRequire } from 'node:module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');

const BASE = process.env.BASE ?? 'http://localhost:8081/';
const PAGE = process.env.PAGE ?? 'dist/site/index.html';
const real = Boolean(process.env.FIREBASE);
const out = process.argv[2] ?? '.';
const errors = [];
const browser = await chromium.launch();
const url = (id, hash = '') => `${BASE}${PAGE}${real ? '' : `?store=local&as=${id}`}${hash}`;

// Отделни контексти = отделни устройства (при Firebase всеки получава свой анонимен потребител).
const hostCtx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 });
const guestCtx = real ? await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 }) : hostCtx;
const watch = (p, tag) => {
  p.on('pageerror', (e) => errors.push(`${tag} ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && errors.push(`${tag} console: ${m.text()}`));
};
const host = await hostCtx.newPage();
watch(host, 'host');
await host.goto(url('inv-host'));
await host.fill('#nick', 'Калоян');
await host.getByRole('button', { name: 'Към мегдана' }).click();
await host.getByRole('button', { name: /Четири в редица/ }).first().click();
await host.getByRole('button', { name: 'Създай стая' }).click();
await host.locator('.code-chip-code').waitFor({ timeout: 20000 });
const code = (await host.locator('.code-chip-code').textContent()).trim();
await host.getByRole('button', { name: 'Покани приятел' }).waitFor();
await host.screenshot({ path: `${out}/invite-host.png` });
await hostCtx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
await host.getByRole('button', { name: 'Покани приятел' }).click();
await host.waitForTimeout(400);
const copied = await host.evaluate(() => navigator.clipboard.readText()).catch(() => '');
console.log('покана:', copied.replace(/\s+/g, ' '));

const guest = await guestCtx.newPage();
watch(guest, 'guest');
await guest.goto(url('inv-guest', `#${code}`));
await guest.locator('.join-banner').waitFor({ timeout: 20000 });
await guest.screenshot({ path: `${out}/invite-guest-name.png` });
await guest.fill('#nick', 'Мила');
await guest.getByRole('button', { name: 'Влез в играта' }).click();
await guest.getByRole('button', { name: 'Не съм готов' }).waitFor({ timeout: 20000 });
console.log('приятелят е в стаята и е готов');
await host.waitForFunction(() => {
  const b = [...document.querySelectorAll('button')].find((x) => x.textContent === 'Старт');
  return b && !b.disabled;
}, null, { timeout: 20000 });
await host.getByRole('button', { name: 'Старт' }).click();
await guest.locator('.c4').waitFor({ timeout: 20000 });
// По един ход на всеки, за да се види, че ходовете стигат.
for (let k = 0; k < 4; k++) {
  for (const p of [host, guest]) {
    if (await p.locator('.status-line.mine').count()) {
      await p.locator('.c4-col:not([disabled])').nth(k % 3).click();
      await p.waitForTimeout(real ? 1500 : 400);
    }
  }
}
const discs = await guest.locator('.disc').count();
console.log(`дискове при приятеля: ${discs}`);
await guest.screenshot({ path: `${out}/invite-guest-game.png` });
await browser.close();
console.log(errors.length ? `ГРЕШКИ:\n${errors.join('\n')}` : 'без грешки в конзолата');
process.exit(errors.length || discs < 2 ? 1 : 0);
