// Един ход за играча на ред, според играта.
export const ACT = {
  'Четири в редица': async (p) => p.locator('.c4-col:not([disabled])').first().click(),
  'Реверси': async (p) => p.locator('.rv-cell.hint').first().click(),
  'Точки и кутийки': async (p) => {
    const lines = p.locator('.db-line:not([disabled])');
    const n = await lines.count();
    await lines.nth(Math.floor(Math.random() * n)).click();
  },
  'Цветна осмица': async (p) => {
    const card = p.locator('.c8-in-hand:not([disabled])');
    if (await p.locator('.c8-call').count() && Math.random() < 0.7) await p.locator('.c8-call').click();
    if (await card.count()) {
      await card.first().click();
      if (await p.locator('.c8-picker:not([hidden])').count()) await p.locator('.c8-swatch').first().click();
      return;
    }
    if (await p.locator('.c8-pile:not([disabled])').count()) return p.locator('.c8-pile').click();
    return p.getByRole('button', { name: 'Пропусни' }).click();
  },
  'Ултимат морски шах': async (p) => {
    const cells = p.locator('.ut-cell:not([disabled])');
    await cells.nth(Math.floor(Math.random() * (await cells.count()))).click();
  },
  'Покер със зарове': async (p) => {
    const picks = p.locator('.dp-pick');
    const roll = p.locator('.dp-tray .btn-primary:not([disabled])');
    if (await picks.count() && (!(await roll.count()) || Math.random() < 0.4)) {
      const vals = await picks.allTextContents();
      const best = vals.map(Number).reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
      return picks.nth(best).click();
    }
    const dice = p.locator('.dp-die:not([disabled])');
    if (await dice.count()) await dice.first().click();
    return roll.click();
  },
  'Не се сърди човече': async (p) => {
    const pcs = p.locator('.ld-piece.can');
    if (await pcs.count()) return pcs.first().click();
    return p.locator('.ld-bar .btn-primary:not([disabled])').click();
  },
  'Табла': async (p) => {
    const roll = p.locator('.ld-bar .btn-primary:not([disabled])');
    if (await roll.count()) return roll.click();
    const tgt = p.locator('.tb-pt.tgt, .tb-offbox.tgt');
    if (await tgt.count()) return tgt.first().click();
    const src = p.locator('.tb-pt.src, .tb-barcol.src');
    if (await src.count()) {
      await src.first().click();
      await p.waitForTimeout(30);
      if (await tgt.count()) await tgt.first().click();
    }
  },
  'Морски бой': async (p) => {
    const cells = p.locator('button.bs-cell:not([disabled])');
    await cells.nth(Math.floor(Math.random() * (await cells.count()))).click();
  },
  'Мини голф': async (p) => {
    if (Math.random() < 0.5) {
      // прашка: от топката назад
      const ball = p.locator('.gf-ball.now');
      const box = await ball.boundingBox();
      if (box) {
        const x = box.x + box.width / 2, y = box.y + box.height / 2;
        await p.mouse.move(x, y);
        await p.mouse.down();
        await p.mouse.move(x + (Math.random() - 0.5) * 30, y + 25 + Math.random() * 40, { steps: 4 });
        await p.mouse.up();
        return;
      }
    }
    await p.locator('#gf-power').evaluate((el) => { el.value = String(15 + Math.floor(Math.random() * 50)); el.dispatchEvent(new Event('input')); });
    await p.getByRole('button', { name: 'Удари' }).click();
  },
  'Мемори': async (p) => {
    const cards = p.locator('.mm-card:not([disabled])');
    await cards.nth(Math.floor(Math.random() * (await cards.count()))).click();
  },
  'Дама': async (p) => {
    const tgt = p.locator('.ck-cell.tgt');
    if (await tgt.count()) return tgt.nth(Math.floor(Math.random() * (await tgt.count()))).click();
    const src = p.locator('.ck-cell.src');
    await src.nth(Math.floor(Math.random() * (await src.count()))).click();
    await p.waitForTimeout(30);
    if (await tgt.count()) await tgt.first().click();
  },
  'Викторина': async (p) => {
    const a = p.locator('.qz-a:not([disabled])');
    if (await a.count()) await a.nth(Math.floor(Math.random() * (await a.count()))).click();
  },
  'Реакция-рали': async (p) => {
    const pad = p.locator('.rx-pad:not([disabled])');
    if (!(await pad.count())) return;
    if (Math.random() < 0.1) return pad.click(); // понякога подранява
    await p.locator('.rx-pad.go').waitFor({ timeout: 6000 }).catch(() => {});
    await pad.click().catch(() => {});
  },
};
