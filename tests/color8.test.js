import { test } from 'node:test';
import assert from 'node:assert/strict';
import c8, { card, canPlay } from '../src/games/color8.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P3 = ['a', 'b', 'c'];
const id = (color, slot) => color * 16 + slot; // slot: 0..7 числа, 8–9 осмици, 10–11 пропусни, 12–13 обратно, 14–15 +2

// Състояние с конкретни ръце, за да тестваме правилата.
function rig(players, hands, topCard, drawPile = [id(3, 0), id(3, 1), id(3, 2), id(3, 3)]) {
  const s = c8.init('s', players);
  s.hands = hands.map((h) => h.slice());
  s.discard = [topCard];
  s.draw = drawPile.slice();
  s.color = card(topCard).color;
  return s;
}

test('раздаване: по 7 карти, 64 общо, първата карта е число', () => {
  for (const n of [2, 3, 6]) {
    const s = c8.init(`seed${n}`, [...'abcdef'].slice(0, n));
    const all = [...s.hands.flat(), ...s.draw, ...s.discard];
    assert.equal(new Set(all).size, 64);
    assert.ok(s.hands.every((h) => h.length === 7));
    assert.match(card(s.discard[0]).kind, /^[1-79]$/);
  }
  assert.deepEqual(c8.init('x', P3), c8.init('x', P3), 'детерминистично');
});

test('съвпадение по цвят или стойност; осмицата върви винаги и иска цвят', () => {
  const s = rig(P3, [[id(0, 3), id(1, 0), id(2, 2), id(1, 8)], [id(0, 1)], [id(0, 2)]], id(0, 0));
  assert.ok(canPlay(s, id(0, 3)), 'същият цвят');
  assert.ok(canPlay(s, id(1, 0)), 'същата стойност');
  assert.ok(!canPlay(s, id(2, 2)));
  assert.equal(c8.validateMove(s, { type: 'play', card: id(2, 2) }, 'a').reason, 'no-match');
  assert.equal(c8.validateMove(s, { type: 'play', card: id(1, 8) }, 'a').reason, 'pick-color');
  const after = c8.applyMove(s, { type: 'play', card: id(1, 8), color: 2 }, 'a');
  assert.equal(after.color, 2);
  assert.equal(after.turn, 1);
});

test('чужда карта, ход извън ред, пас без теглене се отхвърлят', () => {
  const s = rig(P3, [[id(0, 3)], [id(0, 1)], [id(0, 2)]], id(0, 0));
  assert.equal(c8.validateMove(s, { type: 'play', card: id(0, 1) }, 'a').reason, 'not-in-hand');
  assert.equal(c8.validateMove(s, { type: 'play', card: id(0, 1) }, 'b').reason, 'not-your-turn');
  assert.equal(c8.validateMove(s, { type: 'pass' }, 'a').reason, 'draw-first');
});

test('„Пропусни“ прескача следващия; „Обратно“ обръща посоката', () => {
  const s = rig(P3, [[id(0, 10), id(0, 4)], [id(0, 1)], [id(0, 2)]], id(0, 0));
  const sk = c8.applyMove(s, { type: 'play', card: id(0, 10) }, 'a');
  assert.equal(sk.turn, 2);
  const s2 = rig(P3, [[id(0, 12), id(0, 4)], [id(0, 1)], [id(0, 2)]], id(0, 0));
  const rv = c8.applyMove(s2, { type: 'play', card: id(0, 12) }, 'a');
  assert.equal(rv.dir, -1);
  assert.equal(rv.turn, 2, 'след a идва c');
});

test('„Обратно“ при двама: играеш пак', () => {
  const s = rig(['a', 'b'], [[id(0, 12), id(0, 4)], [id(0, 1)]], id(0, 0));
  assert.equal(c8.applyMove(s, { type: 'play', card: id(0, 12) }, 'a').turn, 0);
});

test('+2: следващият тегли две и пропуска', () => {
  const s = rig(P3, [[id(0, 14), id(0, 4)], [id(0, 1)], [id(0, 2)]], id(0, 0));
  const r = c8.applyMove(s, { type: 'play', card: id(0, 14) }, 'a');
  assert.equal(r.hands[1].length, 3);
  assert.equal(r.turn, 2);
});

test('теглене: годна карта чака, негодна → редът минава', () => {
  const good = rig(P3, [[id(2, 3)], [id(0, 1)], [id(0, 2)]], id(0, 0), [id(0, 5)]);
  const g = c8.applyMove(good, { type: 'draw' }, 'a');
  assert.equal(g.pending, id(0, 5));
  assert.equal(g.turn, 0);
  assert.equal(c8.validateMove(g, { type: 'play', card: id(2, 3) }, 'a').reason, 'only-drawn');
  assert.equal(c8.validateMove(g, { type: 'draw' }, 'a').reason, 'already-drew');
  assert.equal(c8.applyMove(g, { type: 'pass' }, 'a').turn, 1);

  const bad = rig(P3, [[id(2, 3)], [id(0, 1)], [id(0, 2)]], id(0, 0), [id(1, 5)]);
  const b = c8.applyMove(bad, { type: 'draw' }, 'a');
  assert.equal(b.pending, null);
  assert.equal(b.turn, 1);
});

test('празно тесте: изхвърлените се разбъркват детерминистично', () => {
  const s = rig(P3, [[id(2, 3)], [id(0, 1)], [id(0, 2)]], id(0, 0), []);
  s.discard = [id(1, 1), id(1, 2), id(1, 3), id(0, 0)];
  const a = c8.applyMove(s, { type: 'draw' }, 'a');
  const b = c8.applyMove(s, { type: 'draw' }, 'a');
  assert.deepEqual(a, b);
  assert.deepEqual(a.discard, [id(0, 0)]);
  assert.equal(a.hands[0].length, 2);
});

test('първият без карти печели; класиране по брой карти', () => {
  const s = rig(P3, [[id(0, 3)], [id(0, 1), id(1, 1)], [id(0, 2)]], id(0, 0));
  const r = c8.applyMove(s, { type: 'play', card: id(0, 3) }, 'a');
  assert.equal(c8.winner(r), 'a');
  assert.deepEqual(c8.placements(r), { a: 1, b: 3, c: 2 });
});

test('цяла партида с 6 играчи и автоматични ходове през replay', () => {
  const P = [...'abcdef'];
  let s = c8.init('full', P);
  const log = [];
  for (let k = 0; k < 2000 && !c8.isOver(s); k++) {
    const p = c8.currentPlayer(s);
    const m = c8.autoMove(s, p, createRng(k));
    assert.ok(c8.validateMove(s, m, p).ok, JSON.stringify(m));
    s = c8.applyMove(s, m, p);
    log.push({ i: k, p, t: k, m });
  }
  assert.ok(c8.isOver(s), 'партидата свършва');
  const r = replay(c8, { seed: 'full', players: P, log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state, s);
  const all = [...r.state.hands.flat(), ...r.state.draw, ...r.state.discard];
  assert.equal(new Set(all).size, 64, 'нито една карта не се губи');
});
