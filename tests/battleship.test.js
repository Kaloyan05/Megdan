import { test } from 'node:test';
import assert from 'node:assert/strict';
import bs, { randomFleet, validFleet, commitOf, answerFor, verifyAll, TOTAL } from '../src/games/battleship.js';
import { replay } from '../src/core/engine.js';

const P = ['a', 'b'];

test('случаен флот: валиден, 20 полета, без допиране', () => {
  for (let k = 0; k < 30; k++) {
    const f = randomFleet(`f${k}`);
    assert.ok(validFleet(f), JSON.stringify(f));
    assert.equal(f.flat().length, TOTAL);
  }
  assert.ok(!validFleet([[0, 1, 2, 3], [5, 6, 7], [9, 19, 29], [40, 41], [43, 44], [46, 47], [60], [62], [64], [11]]), 'допиращи се кораби');
});

test('хеш: един и същ флот и сол → един и същ хеш; друга сол → друг', async () => {
  const f = randomFleet('h');
  assert.equal(await commitOf(f, 'x'), await commitOf(f, 'x'));
  assert.notEqual(await commitOf(f, 'x'), await commitOf(f, 'y'));
  assert.match(await commitOf(f, 'x'), /^[0-9a-f]{64}$/);
});

// Цяла партида: и двата клиента отговарят от скрития си флот.
async function fullGame() {
  const fleets = [randomFleet('A'), randomFleet('B')];
  const salts = ['sa', 'sb'];
  let s = bs.init('s', P);
  const log = [];
  let i = 0;
  const push = (p, m) => {
    const v = bs.validateMove(s, m, p);
    assert.ok(v.ok, `${p} ${JSON.stringify(m)} → ${v.reason}`);
    s = bs.applyMove(s, m, p);
    log.push({ i, p, t: i, m }); i++;
  };
  push('b', { type: 'place', commit: await commitOf(fleets[1], salts[1]) });
  assert.equal(bs.validateMove(s, { type: 'shot', cell: 0 }, 'a').reason, 'wait-place');
  push('a', { type: 'place', commit: await commitOf(fleets[0], salts[0]) });
  const order = [[...Array(100).keys()], [...Array(100).keys()].reverse()];
  const pos = [0, 0];
  while (!bs.isOver(s)) {
    const shooter = s.turn;
    let cell;
    do { cell = order[shooter][pos[shooter]++]; } while (s.shots[shooter].some((x) => x.cell === cell));
    push(P[shooter], { type: 'shot', cell });
    assert.equal(bs.validateMove(s, { type: 'shot', cell: 55 }, P[shooter]).reason, 'wait-answer');
    const def = 1 - shooter;
    const ans = await bs.onTurn(s, { me: P[def], secret: { load: async () => ({ ships: fleets[def], salt: salts[def] }) } });
    push(P[def], ans);
  }
  return { s, log, fleets, salts };
}

test('цяла партида: отговорите идват от скрития флот, попадение дава още изстрел', async () => {
  const { s, log, fleets, salts } = await fullGame();
  assert.equal(s.hits[s.winner], TOTAL);
  const r = replay(bs, { seed: 's', players: P, log });
  assert.equal(r.rejected.length, 0);
  assert.deepEqual(r.state, s);
  const reveals = { a: { ships: fleets[0], salt: salts[0] }, b: { ships: fleets[1], salt: salts[1] } };
  assert.deepEqual(await verifyAll(s, reveals), [true, true]);
  // Мамене: b разкрива друг флот → проверката го хваща.
  const fake = { ...reveals, b: { ships: randomFleet('other'), salt: salts[1] } };
  assert.deepEqual(await verifyAll(s, fake), [true, false]);
});

test('отговор: потопен кораб връща всичките му полета', () => {
  const ships = [[0, 1], [50]];
  assert.deepEqual(answerFor(ships, 5, []), { type: 'answer', hit: false });
  assert.deepEqual(answerFor(ships, 0, []), { type: 'answer', hit: true, sunk: null });
  assert.deepEqual(answerFor(ships, 1, [{ cell: 0, hit: true }]), { type: 'answer', hit: true, sunk: [0, 1] });
  assert.deepEqual(answerFor(ships, 50, []).sunk, [50]);
});

test('чужд отговор, повторен изстрел и стрелба извън ред се отхвърлят', async () => {
  let s = bs.init('s', P);
  s = bs.applyMove(s, { type: 'place', commit: 'a'.repeat(64) }, 'a');
  s = bs.applyMove(s, { type: 'place', commit: 'b'.repeat(64) }, 'b');
  assert.equal(bs.validateMove(s, { type: 'shot', cell: 3 }, 'b').reason, 'not-your-turn');
  s = bs.applyMove(s, { type: 'shot', cell: 3 }, 'a');
  assert.equal(bs.validateMove(s, { type: 'answer', hit: false }, 'a').reason, 'not-your-turn');
  s = bs.applyMove(s, { type: 'answer', hit: false }, 'b');
  s = bs.applyMove(s, { type: 'shot', cell: 7 }, 'b');
  s = bs.applyMove(s, { type: 'answer', hit: false }, 'a');
  assert.equal(bs.validateMove(s, { type: 'shot', cell: 3 }, 'a').reason, 'shot-twice');
  assert.equal(bs.validateMove(s, { type: 'place', commit: 'c'.repeat(64) }, 'a').reason, 'already-placed');
});
