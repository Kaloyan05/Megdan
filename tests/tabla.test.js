import { test } from 'node:test';
import assert from 'node:assert/strict';
import tb, { legalSteps } from '../src/games/tabla.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];
const empty = () => {
  const s = tb.init('s', P);
  s.points = Array(24).fill(0);
  s.phase = 'move';
  return s;
};
const total = (s, seat) => s.points.reduce((a, v) => a + (seat === 0 ? Math.max(v, 0) : Math.max(-v, 0)), 0) + s.bar[seat] + s.off[seat];

test('начална позиция: по 15 пула', () => {
  const s = tb.init('s', P);
  assert.equal(total(s, 0), 15);
  assert.equal(total(s, 1), 15);
});

test('хвърляне: чифт дава 4 хода, обикновено 2', () => {
  let found = { double: false, plain: false };
  for (let k = 0; k < 40 && !(found.double && found.plain); k++) {
    const s = tb.applyMove({ ...tb.init(`r${k}`, P) }, { type: 'roll' }, 'a');
    if (s.rolled[0] === s.rolled[1]) { found.double = true; assert.ok(s.dice.length === 4 || s.turn === 1); }
    else { found.plain = true; assert.ok(s.dice.length === 2 || s.turn === 1); }
  }
  assert.ok(found.double && found.plain);
});

test('не се каца на 2+ чужди; самотен чужд отива на бара', () => {
  const s = empty();
  s.points[10] = 1; s.points[7] = -2; s.points[5] = -1; s.points[0] = 14;
  s.dice = [3, 5];
  const steps = legalSteps(s);
  assert.ok(!steps.some((x) => x.from === 10 && x.to === 7), '7 е блокирано');
  assert.ok(steps.some((x) => x.from === 10 && x.to === 5));
  const r = tb.applyMove(s, { type: 'step', from: 10, die: 5 }, 'a');
  assert.equal(r.bar[1], 1);
  assert.equal(r.points[5], 1);
  assert.equal(r.last.hit, true);
});

test('пул на бара влиза пръв', () => {
  const s = empty();
  s.bar[0] = 1; s.points[12] = 14; s.points[1] = -15;
  s.dice = [2, 4];
  const steps = legalSteps(s);
  assert.ok(steps.length > 0);
  assert.ok(steps.every((x) => x.from === 'bar'));
  assert.deepEqual(steps.map((x) => x.to).sort((a, b) => a - b), [20, 22]);
});

test('изнасяне: само когато всички са в дома; по-голям зар изнася от най-високото', () => {
  const s = empty();
  s.points[3] = 2; s.points[1] = 13; s.points[20] = -15;
  s.dice = [6, 1];
  const steps = legalSteps(s);
  assert.ok(steps.some((x) => x.from === 3 && x.to === 'off' && x.die === 6), '6 изнася от поле 4 (най-високото)');
  assert.ok(!steps.some((x) => x.from === 1 && x.die === 6), 'не от по-ниско, докато има по-високо');
  const notHome = empty();
  notHome.points[8] = 1; notHome.points[1] = 14; notHome.points[20] = -15;
  notHome.dice = [2, 1];
  assert.ok(!legalSteps(notHome).some((x) => x.to === 'off'));
});

test('трябва да се изиграят и двата зара, ако може', () => {
  // Пул на 7. С 6 → 1, с 1 → 6. Вариантът 6 после 1 стига до 0; блокираме 1 → тогава задължително 1 първо.
  const s = empty();
  s.points[7] = 1; s.points[0] = 14;
  s.points[1] = -2; s.points[23] = -13;
  s.dice = [6, 1];
  const steps = legalSteps(s);
  assert.deepEqual(steps.map((x) => x.die), [1], '6 първо води до блокирано поле 1, затова само 1 първо');
});

test('ако може само единият от два различни зара, играеш по-големия', () => {
  const s = empty();
  s.points[9] = 1; s.points[0] = 14;
  s.points[3] = -2; s.points[4] = -2; s.points[5] = -2; s.points[6] = -2; s.points[23] = -7;
  s.dice = [5, 1]; // 9-1=8 свободно, после 8-5=3 блокирано; 9-5=4 блокирано
  // и двата сами по себе: 1 → 8 (после 5 → 3 блокирано). 5 → 4 блокирано. Значи само 1.
  assert.deepEqual(legalSteps(s).map((x) => x.die), [1]);
  const t = empty();
  t.points[9] = 1; t.points[0] = 14;
  t.points[8] = -2; t.points[2] = -2; t.points[3] = -2; t.points[23] = -9;
  t.dice = [6, 1]; // 1 → 8 блокирано; 6 → 3 блокирано... даваме изход: 6 → 3 блокирано
  t.points[3] = 0; t.points[22] = -2; // сега 6 → 3 свободно, после 1 → 2 блокирано; 1 → 8 блокирано
  assert.deepEqual(legalSteps(t).map((x) => x.die), [6]);
});

test('цяла партида до край, броят пулове се пази, replay съвпада', () => {
  for (const seed of ['g1', 'g2']) {
    let s = tb.init(seed, P);
    const log = [];
    for (let k = 0; k < 4000 && !tb.isOver(s); k++) {
      const p = tb.currentPlayer(s);
      const m = tb.autoMove(s, p, createRng(k));
      assert.ok(tb.validateMove(s, m, p).ok, JSON.stringify(m));
      s = tb.applyMove(s, m, p);
      assert.equal(total(s, 0), 15);
      assert.equal(total(s, 1), 15);
      log.push({ i: k, p, t: k, m });
    }
    assert.ok(tb.isOver(s));
    const r = replay(tb, { seed, players: P, log });
    assert.equal(r.rejected.length, 0);
    assert.deepEqual(r.state, s);
  }
});
