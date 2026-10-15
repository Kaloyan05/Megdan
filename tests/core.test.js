import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { replay, placementsOf, nextHost } from '../src/core/engine.js';
import { eloDeltas } from '../src/core/elo.js';

// Тестова игра: играчите редуват да добавят 1–3; който стигне 10, печели.
const race = {
  id: 'race', minPlayers: 2, maxPlayers: 4,
  init: (seed, players) => ({ players, turn: 0, total: 0, winner: null }),
  currentPlayer: (s) => s.players[s.turn],
  validateMove(s, m, p) {
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (![1, 2, 3].includes(m?.add)) return { ok: false, reason: 'bad-move' };
    return { ok: true };
  },
  applyMove(s, m, p) {
    const total = s.total + m.add;
    return { ...s, total, winner: total >= 10 ? p : null, turn: (s.turn + 1) % s.players.length };
  },
  autoMove: (s, p, rng) => ({ add: 1 + rng.int(3) }),
  isOver: (s) => s.winner !== null,
  winner: (s) => s.winner,
};

const P = ['a', 'b'];
const rec = (i, p, add, t = i * 1000) => ({ i, p, t, m: { add } });

test('rng: един и същ seed → една и съща поредица', () => {
  const x = createRng('abc'), y = createRng('abc'), z = createRng('abd');
  const xs = [x.next(), x.next(), x.next()];
  assert.deepEqual(xs, [y.next(), y.next(), y.next()]);
  assert.notDeepEqual(xs, [z.next(), z.next(), z.next()]);
  assert.deepEqual(createRng(1).shuffle([1, 2, 3, 4, 5]), createRng(1).shuffle([1, 2, 3, 4, 5]));
});

test('replay: прилага валидни ходове по ред', () => {
  const r = replay(race, { seed: 's', players: P, log: [rec(0, 'a', 3), rec(1, 'b', 2)] });
  assert.equal(r.state.total, 5);
  assert.equal(r.current, 'a');
  assert.equal(r.accepted.length, 2);
  assert.equal(r.nextIndex, 2);
});

test('replay: ход извън ред и невалиден ход се отхвърлят', () => {
  const r = replay(race, {
    seed: 's', players: P,
    log: [rec(0, 'b', 3), rec(1, 'a', 9), rec(2, 'a', 2), rec(3, 'x', 1)],
  });
  assert.equal(r.state.total, 2);
  assert.deepEqual(r.rejected.map((x) => x.reason), ['not-your-turn', 'bad-move', 'not-a-player']);
});

test('replay: дубликат на същия индекс → само първият минава', () => {
  const r = replay(race, { seed: 's', players: P, log: [rec(0, 'a', 1, 5), rec(0, 'a', 3, 9)] });
  assert.equal(r.state.total, 1);
  assert.equal(r.rejected[0].reason, 'not-your-turn');
});

test('replay: резултатът не зависи от реда на пристигане', () => {
  const log = [rec(0, 'a', 3), rec(1, 'b', 3), rec(2, 'a', 3), rec(3, 'b', 1)];
  const r1 = replay(race, { seed: 's', players: P, log });
  const r2 = replay(race, { seed: 's', players: P, log: log.slice().reverse() });
  assert.deepEqual(r1.state, r2.state);
  assert.equal(r1.winner, 'b');
});

test('replay: ходове след края се отхвърлят', () => {
  const log = [rec(0, 'a', 3), rec(1, 'b', 3), rec(2, 'a', 3), rec(3, 'b', 1), rec(4, 'a', 1)];
  const r = replay(race, { seed: 's', players: P, log });
  assert.equal(r.rejected.at(-1).reason, 'over');
});

test('таймаут: валиден само след изтичане и прави автоматичен ход', () => {
  const opts = { seed: 's', players: P, startedAt: 0, turnLimitMs: 45000 };
  const early = replay(race, { ...opts, log: [{ i: 0, p: 'b', t: 10000, m: { type: 'timeout' } }] });
  assert.equal(early.rejected[0].reason, 'too-early');

  const late = replay(race, { ...opts, log: [{ i: 0, p: 'b', t: 45000, m: { type: 'timeout' } }] });
  assert.equal(late.accepted.length, 1);
  assert.equal(late.accepted[0].actor, 'a');
  assert.equal(late.current, 'b');

  const again = replay(race, { ...opts, log: [{ i: 0, p: 'b', t: 45000, m: { type: 'timeout' } }] });
  assert.deepEqual(again.state, late.state);

  const noTimer = replay(race, { seed: 's', players: P, log: [{ i: 0, p: 'b', t: 99999, m: { type: 'timeout' } }] });
  assert.equal(noTimer.rejected[0].reason, 'no-timer');
});

test('класиране по подразбиране от победителя', () => {
  const r = replay(race, { seed: 's', players: P, log: [rec(0, 'a', 3), rec(1, 'b', 3), rec(2, 'a', 3), rec(3, 'b', 1)] });
  assert.deepEqual(placementsOf(race, r.state, P), { a: 2, b: 1 });
});

test('домакин: следващият по ред на влизане', () => {
  const m = [{ id: 'a', joinedAt: 1 }, { id: 'c', joinedAt: 3 }, { id: 'b', joinedAt: 2 }];
  assert.equal(nextHost(m, 'a'), 'b');
  assert.equal(nextHost([{ id: 'a', joinedAt: 1 }], 'a'), null);
});

test('ELO: победа над равен = +16, сумата е ~0', () => {
  const d = eloDeltas({ a: 1000, b: 1000 }, { a: 1, b: 2 });
  assert.deepEqual(d, { a: 16, b: -16 });
  assert.deepEqual(eloDeltas({ a: 1000, b: 1000 }, { a: 1, b: 1 }), { a: 0, b: 0 });
  const four = eloDeltas({ a: 1000, b: 1100, c: 900, d: 1000 }, { a: 1, b: 2, c: 3, d: 4 });
  assert.ok(Math.abs(Object.values(four).reduce((s, x) => s + x, 0)) <= 2);
  assert.ok(four.a > 0 && four.d < 0);
});
