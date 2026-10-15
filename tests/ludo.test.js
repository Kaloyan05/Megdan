import { test } from 'node:test';
import assert from 'node:assert/strict';
import ld, { legalPieces, PATH } from '../src/games/ludo.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];
const withDie = (s, die) => ({ ...s, phase: 'move', die });

test('пътят е 40 различни полета, всяко съседно на следващото', () => {
  assert.equal(PATH.length, 40);
  assert.equal(new Set(PATH.map((p) => p.join(','))).size, 40);
  for (let i = 0; i < 40; i++) {
    const [a, b] = PATH[i], [c, d] = PATH[(i + 1) % 40];
    assert.equal(Math.abs(a - c) + Math.abs(b - d), 1, `полета ${i} и ${(i + 1) % 40}`);
  }
});

test('изкарване само с шестица; 3 опита без фигури на пътя', () => {
  const s = ld.init('s', P);
  assert.deepEqual(legalPieces(withDie(s, 5)), []);
  assert.deepEqual(legalPieces(withDie(s, 6)), [0, 1, 2, 3]);
  assert.equal(s.tries, 3);
  assert.equal(ld.validateMove(s, { type: 'move', piece: 0 }, 'a').reason, 'roll-first');
  assert.equal(ld.validateMove(s, { type: 'roll' }, 'b').reason, 'not-your-turn');
});

test('шестица дава още хвърляне; иначе редът минава', () => {
  let s = withDie(ld.init('s', P), 6);
  s = ld.applyMove(s, { type: 'move', piece: 0 }, 'a');
  assert.equal(s.turn, 0);
  assert.equal(s.phase, 'roll');
  s = ld.applyMove(withDie(s, 3), { type: 'move', piece: 0 }, 'a');
  assert.equal(s.pieces[0][0], 3);
  assert.equal(s.turn, 1);
  assert.equal(s.tries, 3, 'b няма фигури на пътя');
});

test('чупене: стъпваш върху чужда фигура → тя е в базата', () => {
  const s = ld.init('s', P);
  // a е на ъгъл 0, b на ъгъл 2 (абсолютно поле 20 = неговия старт). a на rel 17 + 3 = 20.
  s.pieces[0][0] = 17;
  s.pieces[1][0] = 0;
  const r = ld.applyMove(withDie(s, 3), { type: 'move', piece: 0 }, 'a');
  assert.equal(r.pieces[1][0], -1);
  assert.equal(r.last.hit, 1);
});

test('свое поле е заето; къщичката не се прескача и не се надхвърля', () => {
  const s = ld.init('s', P);
  s.pieces[0] = [10, 12, 41, -1];
  assert.deepEqual(legalPieces(withDie(s, 2)), [1, 2], '10+2=12 е заето от свой');
  s.pieces[0] = [38, 43, 41, -1];
  assert.deepEqual(legalPieces(withDie(s, 4)), [], '38+4=42 прескача 41; 41+4 > 43');
  assert.deepEqual(legalPieces(withDie(s, 2)), [0], '38+2=40 е свободно; 41+2=43 е заето от свой');
});

test('цяла партида с 4 играчи до край, replay съвпада', () => {
  const players = ['a', 'b', 'c', 'd'];
  let s = ld.init('full', players);
  const log = [];
  for (let k = 0; k < 5000 && !ld.isOver(s); k++) {
    const p = ld.currentPlayer(s);
    const m = ld.autoMove(s, p, createRng(k));
    assert.ok(ld.validateMove(s, m, p).ok, JSON.stringify(m));
    s = ld.applyMove(s, m, p);
    log.push({ i: k, p, t: k, m });
  }
  assert.ok(ld.isOver(s));
  const r = replay(ld, { seed: 'full', players, log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state, s);
  assert.equal(ld.placements(s)[players[s.winner]], 1);
});
