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
