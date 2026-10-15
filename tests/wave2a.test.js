import { test } from 'node:test';
import assert from 'node:assert/strict';
import ut from '../src/games/uttt.js';
import dice, { scoreFor, totals, CATS } from '../src/games/dice.js';
import mm from '../src/games/memory.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];

function playOut(game, players, seed = 's', max = 3000) {
  let s = game.init(seed, players);
  const log = [];
  for (let k = 0; k < max && !game.isOver(s); k++) {
    const p = game.currentPlayer(s);
    const m = game.autoMove(s, p, createRng(k));
    assert.ok(game.validateMove(s, m, p).ok, `${game.id}: ${JSON.stringify(m)} → ${JSON.stringify(game.validateMove(s, m, p))}`);
    s = game.applyMove(s, m, p);
    log.push({ i: k, p, t: k, m });
  }
  assert.ok(game.isOver(s), `${game.id} свършва`);
  const r = replay(game, { seed, players, log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state, s, 'replay дава същото');
  return s;
}

// ---- Ултимат морски шах ----
test('uttt: ходът праща противника в дъската по полето', () => {
  let s = ut.init('s', P);
  s = ut.applyMove(s, { cell: 4 }, 'a'); // дъска 0, поле 4
  assert.equal(s.forced, 4);
  assert.equal(ut.validateMove(s, { cell: 0 }, 'b').reason, 'wrong-board');
  assert.ok(ut.validateMove(s, { cell: 36 }, 'b').ok);
  assert.equal(ut.validateMove(s, { cell: 36 }, 'a').reason, 'not-your-turn');
});

test('uttt: спечелена малка дъска се затваря; пратен в решена → свободен избор', () => {
  let s = ut.init('s', P);
  // a печели дъска 0 с полета 0,1,2; b играе в дъски 0..2 на поле, което връща a в 0.
  const seq = [[0, 'a'], [0 * 9 + 9, 'b'], [9 * 0 + 1, 'a'], [9 + 0, 'b']];
  s = ut.applyMove(s, { cell: 0 }, 'a');            // → дъска 0
  s = ut.applyMove(s, { cell: 3 }, 'b');            // b в дъска 0, поле 3 → a в дъска 3
  s = ut.applyMove(s, { cell: 27 }, 'a');           // a в дъска 3, поле 0 → b в дъска 0
  s = ut.applyMove(s, { cell: 4 }, 'b');            // b в дъска 0, поле 4 → a в дъска 4
  s = ut.applyMove(s, { cell: 36 }, 'a');           // a в дъска 4, поле 0 → b в дъска 0
  s = ut.applyMove(s, { cell: 5 }, 'b');            // b печели дъска 0 (3,4,5) → a в дъска 5
  assert.equal(s.small[0], 1);
  s = ut.applyMove(s, { cell: 45 }, 'a');           // a в дъска 5, поле 0 → дъска 0 е решена → свободно
  assert.equal(s.forced, null);
  assert.equal(ut.validateMove(s, { cell: 8 }, 'b').reason, 'board-closed');
  assert.ok(ut.validateMove(s, { cell: 80 }, 'b').ok);
  void seq;
});

test('uttt: цяла партида до край и детерминистичен replay', () => {
  for (const seed of ['x', 'y', 'z']) {
    const s = playOut(ut, P, seed);
    assert.ok(['draw', 'a', 'b'].includes(ut.winner(s)));
  }
});

// ---- Покер със зарове ----
test('зарове: точки по графи', () => {
  assert.equal(scoreFor('c3', [3, 3, 1, 3, 6]), 9);
  assert.equal(scoreFor('three', [3, 3, 1, 3, 6]), 16);
  assert.equal(scoreFor('four', [3, 3, 1, 3, 6]), 0);
  assert.equal(scoreFor('full', [2, 2, 5, 5, 5]), 25);
  assert.equal(scoreFor('full', [5, 5, 5, 5, 5]), 0);
  assert.equal(scoreFor('small', [1, 2, 3, 4, 6]), 30);
  assert.equal(scoreFor('small', [1, 2, 3, 5, 6]), 0);
  assert.equal(scoreFor('large', [2, 3, 4, 5, 6]), 40);
  assert.equal(scoreFor('poker', [4, 4, 4, 4, 4]), 50);
  assert.equal(scoreFor('chance', [1, 2, 3, 4, 6]), 16);
  const up = Object.fromEntries(CATS.filter((c) => c.upper).map((c) => [c.id, c.upper * 3]));
  assert.deepEqual(totals(up), { upper: 63, bonus: 35, lower: 0, total: 98 });
});

test('зарове: хвърляния, задържане, валидиране', () => {
  let s = dice.init('s', P);
  assert.equal(dice.validateMove(s, { type: 'score', cat: 'c1' }, 'a').reason, 'roll-first');
  s = dice.applyMove(s, { type: 'roll' }, 'a');
  const first = s.dice.slice();
  s = dice.applyMove(s, { type: 'roll', hold: [true, true, false, false, false] }, 'a');
  assert.deepEqual(s.dice.slice(0, 2), first.slice(0, 2), 'задържаните остават');
  s = dice.applyMove(s, { type: 'roll', hold: [true, true, true, true, true] }, 'a');
  assert.equal(dice.validateMove(s, { type: 'roll', hold: [false, false, false, false, false] }, 'a').reason, 'no-rolls');
  s = dice.applyMove(s, { type: 'score', cat: 'chance' }, 'a');
  assert.equal(s.turn, 1);
  assert.equal(s.rolls, 0);
  assert.equal(dice.validateMove(s, { type: 'roll' }, 'a').reason, 'not-your-turn');
  // b: графата на a не пречи на b, но своята използвана графа пречи
  s = dice.applyMove(s, { type: 'roll' }, 'b');
  s = dice.applyMove(s, { type: 'score', cat: 'chance' }, 'b');
  s = dice.applyMove(s, { type: 'roll' }, 'a');
  assert.equal(dice.validateMove(s, { type: 'score', cat: 'chance' }, 'a').reason, 'cat-used');
});

test('зарове: една и съща позиция → едни и същи зарове', () => {
  const a = dice.applyMove(dice.init('q', P), { type: 'roll' }, 'a');
  const b = dice.applyMove(dice.init('q', P), { type: 'roll' }, 'a');
  assert.deepEqual(a.dice, b.dice);
});

test('зарове: партида с 3 играчи свършва след 13 рунда', () => {
  const s = playOut(dice, ['a', 'b', 'c'], 'd3');
  assert.equal(s.turnNo, 39);
  assert.ok(s.sheets.every((sh) => Object.keys(sh).length === 13));
});

// ---- Мемори ----
test('мемори: двойка дава точка и още ход; различни → редът минава', () => {
  const s0 = mm.init('m', P);
  const a = s0.deck.indexOf(0);
  const b = s0.deck.indexOf(0, a + 1);
  const c = s0.deck.indexOf(1);
  let s = mm.applyMove(s0, { card: a }, 'a');
  assert.equal(mm.validateMove(s, { card: a }, 'a').reason, 'card-open');
  s = mm.applyMove(s, { card: b }, 'a');
  assert.deepEqual(s.scores, [1, 0]);
  assert.equal(s.turn, 0);
  assert.equal(mm.validateMove(s, { card: a }, 'a').reason, 'card-open');
  s = mm.applyMove(s, { card: c }, 'a');
  const d = s.deck.findIndex((v, i) => v !== 1 && s.owner[i] === null && i !== c);
  s = mm.applyMove(s, { card: d }, 'a');
  assert.equal(s.turn, 1);
  assert.deepEqual(s.peek, [c, d]);
});

test('мемори: 36 карти, по 2 от символ; цяла партида с 4 играчи', () => {
  const s0 = mm.init('m', P);
  for (let k = 0; k < 18; k++) assert.equal(s0.deck.filter((v) => v === k).length, 2);
  const s = playOut(mm, ['a', 'b', 'c', 'd'], 'm4');
  assert.equal(s.scores.reduce((x, y) => x + y, 0), 18);
});
