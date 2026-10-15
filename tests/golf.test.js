import { test } from 'node:test';
import assert from 'node:assert/strict';
import gf, { simulate, COURSES } from '../src/games/golf.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];

test('физика: една и съща позиция и удар → един и същ път', () => {
  const a = simulate(COURSES[2], [50, 140], 0.6, -0.8, 0.9);
  const b = simulate(COURSES[2], [50, 140], 0.6, -0.8, 0.9);
  assert.deepEqual(a, b);
});

test('физика: топката не минава през стени и не излиза от пистата', () => {
  for (const c of COURSES) {
    for (let k = 0; k < 40; k++) {
      const rng = createRng(k);
      const dx = rng.next() * 2 - 1, dy = rng.next() * 2 - 1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const r = simulate(c, c.tee, dx / len, dy / len, 1);
      for (const [x, y] of r.path) {
        assert.ok(x >= 2 && x <= 98 && y >= 2 && y <= 148, `извън пистата: ${x},${y}`);
        assert.ok(!c.walls.some(([x0, y0, x1, y1]) => x > x0 - 2 && x < x1 + 2 && y > y0 - 2 && y < y1 + 2), `в стена: ${x},${y}`);
      }
    }
  }
});

test('физика: точен бавен удар влиза; твърде бърз прескача', () => {
  const c = COURSES[0];
  assert.equal(simulate(c, [50, 40], 0, -1, 0.15).holed, true);
  const fast = simulate(c, [50, 40], 0, -1, 1);
  assert.ok(fast.path.some(([, y]) => y < 12), 'бързата топка минава отвъд дупката и отскача от стената');
});

test('пясъкът спира топката по-рано', () => {
  const clean = { ...COURSES[2], sand: [] };
  const a = simulate(COURSES[2], [50, 95], 0, -1, 0.5);
  const b = simulate(clean, [50, 95], 0, -1, 0.5);
  assert.ok(a.y > b.y, 'с пясък стига по-малко нагоре');
});

test('невалиден удар и удар извън ред се отхвърлят', () => {
  const s = gf.init('s', P);
  assert.equal(gf.validateMove(s, { dx: 0, dy: -1, power: 0.5 }, 'b').reason, 'not-your-turn');
  assert.equal(gf.validateMove(s, { dx: 0.3, dy: -0.3, power: 0.5 }, 'a').reason, 'bad-shot');
  assert.equal(gf.validateMove(s, { dx: 0, dy: -1, power: 3 }, 'a').reason, 'bad-shot');
  assert.equal(gf.validateMove(s, { dx: 0, dy: -1, power: 0.5 }, 'a').ok, true);
});

test('ред: вкаралият се пропуска; пистата свършва при всички вкарали или 8 удара', () => {
  let s = gf.init('s', P);
  s.balls[0] = { ...s.balls[0], x: 50, y: 40 };
  s = gf.applyMove(s, { dx: 0, dy: -1, power: 0.15 }, 'a');
  assert.equal(s.balls[0].holed, true);
  assert.equal(s.turn, 1);
  for (let k = 0; k < 8; k++) s = gf.applyMove(s, { dx: 1, dy: 0, power: 0.05 }, 'b');
  assert.equal(s.hole, 1, 'следваща писта');
  assert.deepEqual(s.scores, [[1], [8]]);
  assert.equal(s.turn, 1, 'на втората писта започва вторият');
});

test('цяла игра с 3 играчи, replay съвпада, класиране по най-малко удари', () => {
  const players = ['a', 'b', 'c'];
  let s = gf.init('g', players);
  const log = [];
  for (let k = 0; k < 500 && !gf.isOver(s); k++) {
    const p = gf.currentPlayer(s);
    const m = gf.autoMove(s, p, createRng(k));
    assert.ok(gf.validateMove(s, m, p).ok, JSON.stringify(m));
    s = gf.applyMove(s, m, p);
    log.push({ i: k, p, t: k, m });
  }
  assert.ok(gf.isOver(s));
  assert.ok(s.scores.every((x) => x.length === 3));
  const r = replay(gf, { seed: 'g', players, log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state, s);
  const totals = s.scores.map((x) => x.reduce((a, b) => a + b, 0));
  assert.equal(gf.placements(s)[players[totals.indexOf(Math.min(...totals))]], 1);
});
