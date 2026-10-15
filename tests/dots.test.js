import { test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../src/games/dots.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

// 4×4 кутийки: хоризонтални 0..19 (5 реда × 4), вертикални 20..39 (4 реда × 5).
const h = (r, c) => r * 4 + c;
const v = (r, c) => 20 + r * 5 + c;

test('размер: 4×4 за двама, 5×5 за трима и четирима', () => {
  assert.equal(db.init('s', ['a', 'b']).boxes.length, 16);
  assert.equal(db.init('s', ['a', 'b', 'c']).boxes.length, 25);
  assert.equal(db.init('s', ['a', 'b', 'c']).lines.length, 60);
});

test('затворена кутийка дава точка и още ход', () => {
  const log = [h(0, 0), h(1, 0), v(0, 0), v(0, 1)].map((line, i) => ({ i, p: ['a', 'b', 'a', 'b'][i], t: i, m: { line } }));
  const r = replay(db, { seed: 's', players: ['a', 'b'], log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state.scores, [0, 1]);
  assert.equal(r.state.boxes[0], 1);
  assert.equal(r.current, 'b', 'b затвори и играе пак');
});

test('една линия затваря две кутийки наведнъж', () => {
  let s = db.init('s', ['a', 'b']);
  const pre = [h(0, 0), h(1, 0), v(0, 0), h(0, 1), h(1, 1), v(0, 2)];
  for (const line of pre) s = db.applyMove(s, { line }, db.currentPlayer(s));
  const who = s.turn;
  s = db.applyMove(s, { line: v(0, 1) }, db.currentPlayer(s));
  assert.equal(s.scores[who], 2);
  assert.equal(s.turn, who);
});

test('заета линия и ход извън ред се отхвърлят', () => {
  const s = db.applyMove(db.init('s', ['a', 'b']), { line: 0 }, 'a');
  assert.equal(db.validateMove(s, { line: 0 }, 'b').reason, 'line-taken');
  assert.equal(db.validateMove(s, { line: 1 }, 'a').reason, 'not-your-turn');
  assert.equal(db.validateMove(s, { line: 999 }, 'b').reason, 'bad-line');
});

test('партида с 3 играчи до края: класиране по точки', () => {
  const P = ['a', 'b', 'c'];
  let s = db.init('s', P);
  for (let k = 0; k < 200 && !db.isOver(s); k++) {
    const p = db.currentPlayer(s);
    const m = db.autoMove(s, p, createRng(k));
    assert.ok(db.validateMove(s, m, p).ok);
    s = db.applyMove(s, m, p);
  }
  assert.ok(db.isOver(s));
  assert.equal(s.scores.reduce((x, y) => x + y, 0), 25);
  const pl = db.placements(s);
  const best = P[s.scores.indexOf(Math.max(...s.scores))];
  assert.equal(pl[best], 1);
});

test('автоматичният ход затваря кутийка, когато може', () => {
  let s = db.init('s', ['a', 'b']);
  for (const line of [h(0, 0), h(1, 0), v(0, 0)]) s = db.applyMove(s, { line }, db.currentPlayer(s));
  assert.equal(db.autoMove(s, db.currentPlayer(s), createRng(1)).line, v(0, 1));
});
