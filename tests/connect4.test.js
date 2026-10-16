import { test } from 'node:test';
import assert from 'node:assert/strict';
import c4 from '../src/games/connect4.js';
import { replay } from '../src/core/engine.js';

const P = ['a', 'b'];
const play = (cols) => replay(c4, {
  seed: 's', players: P,
  log: cols.map((col, i) => ({ i, p: P[i % 2], t: i, m: { col } })),
});

test('жетонът пада най-долу и редът се сменя', () => {
  const r = play([3, 3]);
  assert.equal(r.state.board[3], 0);
  assert.equal(r.state.board[7 + 3], 1);
  assert.equal(r.current, 'a');
});

test('победа вертикално', () => {
  const r = play([0, 1, 0, 1, 0, 1, 0]);
  assert.equal(r.winner, 'a');
  assert.equal(r.state.line.length, 4);
});

test('победа хоризонтално', () => {
  const r = play([0, 0, 1, 1, 2, 2, 3]);
  assert.equal(r.winner, 'a');
});

test('победа по диагонал', () => {
  // a: 0,1,2,3 по диагонал нагоре
  const r = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  assert.equal(r.winner, 'a');
});

test('победа по обратен диагонал за втория играч', () => {
  // b: (6,0) (5,1) (4,2) (3,3)
  const r = play([5, 6, 4, 5, 4, 3, 3, 0, 3, 4, 0, 3]);
  assert.equal(r.winner, 'b');
});

test('пълна колона и ход извън ред се отхвърлят', () => {
  const r = play([0, 0, 0, 0, 0, 0, 0]);
  assert.equal(r.rejected.at(-1).reason, 'column-full');
  const s = c4.init('s', P);
  assert.equal(c4.validateMove(s, { col: 1 }, 'b').reason, 'not-your-turn');
  assert.equal(c4.validateMove(s, { col: 9 }, 'a').reason, 'bad-column');
  assert.equal(c4.validateMove(s, { col: '1' }, 'a').reason, 'bad-column');
});

test('равенство при пълна дъска', () => {
  // Колони запълнени по схема без четворка.
  const order = [0, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 2, 3, 2, 3, 2, 3, 3, 2, 3, 2, 3, 2,
    4, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 6, 6, 6, 6, 6, 6];
  const r = play(order);
  assert.equal(r.rejected.length, 0, JSON.stringify(r.rejected));
  assert.equal(r.winner, 'draw');
});

test('автоматичният ход е валиден', async () => {
  const { createRng } = await import('../src/core/rng.js');
  const s = play([0, 0, 0, 0, 0, 0]).state;
  for (let i = 0; i < 20; i++) {
    const m = c4.autoMove(s, 'a', createRng(i));
    assert.ok(c4.validateMove(s, m, 'a').ok);
  }
});

test('по-голяма дъска 9×7: размер, ход и бот', async () => {
  const { createRng } = await import('../src/core/rng.js');
  const s = c4.init('s', P, { size: '9x7' });
  assert.equal(s.board.length, 63);
  assert.equal(s.cols, 9);
  assert.ok(c4.validateMove(s, { col: 8 }, 'a').ok);
  assert.equal(c4.validateMove(s, { col: 9 }, 'a').reason, 'bad-column');
  let st = s;
  const log = [];
  for (let k = 0; k < 63 && !c4.isOver(st); k++) {
    const p = c4.currentPlayer(st);
    const m = c4.botMove(st, p, createRng(k), k % 2 ? 'hard' : 'medium');
    assert.ok(c4.validateMove(st, m, p).ok);
    st = c4.applyMove(st, m, p);
    log.push({ i: k, p, t: k, m });
  }
  const r = replay(c4, { seed: 's', players: P, log, options: { size: '9x7' } });
  assert.deepEqual(r.state, st);
  // смесване с класическа дъска в същия процес не обърква размера
  const classic = c4.applyMove(c4.init('s', P), { col: 6 }, 'a');
  assert.equal(classic.board[6], 0);
});
