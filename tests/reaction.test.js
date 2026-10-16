import { test } from 'node:test';
import assert from 'node:assert/strict';
import rx from '../src/games/reaction.js';
import { replay } from '../src/core/engine.js';

const P = ['a', 'b', 'c'];

test('забавянията са еднакви за всички и в границите', () => {
  const s = rx.init('s', P);
  assert.deepEqual(s.delays, rx.init('s', P).delays);
  assert.ok(s.delays.every((d) => d >= 1500 && d < 4500));
});

test('най-бързият печели рунда; подранилият губи', () => {
  let s = rx.init('s', P);
  s = rx.applyMove(s, { type: 'tap', r: 0, ms: -1 }, 'a');
  assert.equal(rx.validateMove(s, { type: 'tap', r: 0, ms: 100 }, 'a').reason, 'answered');
  s = rx.applyMove(s, { type: 'tap', r: 0, ms: 320 }, 'b');
  s = rx.applyMove(s, { type: 'tap', r: 0, ms: 280 }, 'c');
  assert.equal(s.r, 1);
  assert.deepEqual(s.wins, [0, 0, 1]);
  assert.deepEqual(s.last.winners, ['c']);
  assert.equal(rx.validateMove(s, { type: 'tap', r: 0, ms: 5 }, 'a').reason, 'old-round');
});

test('пропускане на закъснелите и край след 5 рунда', () => {
  let s = rx.init('s', P);
  const log = [];
  const push = (p, m) => { assert.ok(rx.validateMove(s, m, p).ok, JSON.stringify(m)); s = rx.applyMove(s, m, p); log.push({ i: log.length, p, t: log.length, m }); };
  for (let r = 0; r < 5; r++) {
    push('a', { type: 'tap', r, ms: 250 + r });
    push('a', { type: 'skip', r });
  }
  assert.ok(rx.isOver(s));
  assert.equal(rx.winner(s), 'a');
  assert.deepEqual(replay(rx, { seed: 's', players: P, log }).state, s);
});
