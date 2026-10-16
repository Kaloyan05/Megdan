import { test } from 'node:test';
import assert from 'node:assert/strict';
import pong, { pongModel, ballPos } from '../src/games/pong.js';
import hockey, { hockeyModel, walls, collide, zone } from '../src/games/hockey.js';
import { modelParams, FH } from '../src/games/live.js';
import { replay } from '../src/core/engine.js';

test('резултатът в лога: само валиден краен резултат', () => {
  for (const g of [pong, hockey]) {
    const s = g.init('x', ['a', 'b'], { target: 5 });
    assert.equal(g.validateMove(s, { type: 'result', score: [5, 3] }, 'a').ok, true);
    assert.equal(g.validateMove(s, { type: 'result', score: [4, 3] }, 'a').ok, false);
    assert.equal(g.validateMove(s, { type: 'result', score: [5, 5] }, 'a').ok, false);
    assert.equal(g.validateMove(s, { type: 'result', score: [6, 1] }, 'b').ok, false);
    assert.equal(g.validateMove(s, { type: 'result', score: [5, 1] }, 'z').ok, false);
    const r = replay(g, { seed: 'x', players: ['a', 'b'], options: { target: 5 }, log: [
      { i: 0, p: 'b', t: 1, m: { type: 'result', score: [2, 5] } },
      { i: 0, p: 'a', t: 2, m: { type: 'result', score: [2, 5] } },
    ] });
    assert.equal(r.over, true);
    assert.equal(r.winner, 'b');
    assert.equal(r.accepted.length, 1);
    assert.equal(g.realtime, true);
    assert.equal(g.currentPlayer(s), null);
  }
});

test('топката отскача от страничните стени', () => {
  const ev = { x: 0.5, y: 0.8, vx: 1, vy: 0 };
  for (let t = 0; t < 5; t += 0.05) {
    const p = ballPos(ev, t);
    assert.ok(p.x >= 0 && p.x <= 1, `x=${p.x}`);
  }
  assert.ok(Math.abs(ballPos(ev, 0.478).x - 0.978) < 0.01);
});

// Мрежа на ужким: всеки модел публикува, другите го виждат след `lag` ms.
function network(models, lag) {
  const queue = [];
  const seen = new Map(); // id → Map(peerId → presence)
  for (const id of Object.keys(models)) seen.set(id, new Map());
  return {
    tick(now, dt, inputs) {
      for (const [id, m] of Object.entries(models)) {
        const peers = seen.get(id);
        const present = Object.keys(models).every((o) => o === id || peers.has(o));
        m.step(dt, now, { peers, present, input: inputs[id]?.(m) ?? null });
        const out = m.publish();
        if (out) queue.push({ at: now + lag, from: id, data: structuredClone(out) });
      }
      while (queue.length && queue[0].at <= now) {
        const q = queue.shift();
        for (const [id, peers] of seen) if (id !== q.from) peers.set(q.from, q.data);
      }
    },
  };
}

function run(models, { lag = 80, seconds = 240, inputs = {} } = {}) {
  const net = network(models, lag);
  const dt = 1 / 60;
  let now = 1000;
  for (let i = 0; i < seconds * 60; i++) {
    now += dt * 1000;
    net.tick(now, dt, inputs);
    if (Object.values(models).every((m) => m.final)) break;
  }
  return now;
}

test('Понг: двама с мрежово забавяне стигат до един и същ краен резултат', () => {
  const players = ['a', 'b'];
  const A = pongModel(modelParams({ players, me: 'a', target: 3 }));
  const B = pongModel(modelParams({ players, me: 'b', target: 3 }));
  // a стои в левия край, b стои в центъра: точките са непредвидими, но играта свършва.
  run({ a: A, b: B }, { lag: 90, inputs: { a: () => ({ x: 0, y: 0 }), b: () => ({ x: 0.5, y: 0 }) } });
  assert.ok(A.final && B.final, 'играта трябва да свърши');
  assert.deepEqual(A.final, B.final);
  assert.equal(Math.max(...A.final), 3);
});

test('Понг срещу бот: първият човек води бота', () => {
  const players = ['a', 'bot-1'];
  const A = pongModel(modelParams({ players, me: 'a', target: 3, botLevel: () => 'hard' }));
  run({ a: A }, { inputs: { a: () => ({ x: 1, y: 0 }) } });
  assert.deepEqual(A.final, [0, 3]);
});

test('Хокей: стени, врата и удар', () => {
  const pk = { x: 0.5, y: FH + 0.05, vx: 0, vy: 1 };
  assert.equal(walls(pk, 0), 'goal');
  const side = { x: 0.1, y: FH - 0.01, vx: 0, vy: 1 };
  assert.equal(walls(side, 0), null);
  assert.ok(side.vy < 0);
  const p2 = { x: 0.5, y: 1.0, vx: 0, vy: 0 };
  assert.equal(collide(p2, { x: 0.5, y: 1.08 }, { x: 0, y: -2 }), true);
  assert.ok(p2.vy < -1);
  const z = zone(0);
  assert.ok(z.y0 > FH / 2 && z.y1 < FH);
});

test('Хокей срещу бот: ботът вкарва на неподвижен човек', () => {
  const players = ['a', 'bot-1'];
  const A = hockeyModel(modelParams({ players, me: 'a', target: 2, botLevel: () => 'hard' }));
  run({ a: A }, { seconds: 300, inputs: { a: () => ({ x: 0.05, y: FH * 0.6 }) } });
  assert.deepEqual(A.final, [0, 2]);
});

test('Хокей: двама с предаване на шайбата през мрежата', () => {
  const players = ['a', 'b'];
  const A = hockeyModel(modelParams({ players, me: 'a', target: 2 }));
  const B = hockeyModel(modelParams({ players, me: 'b', target: 2 }));
  // Всеки гони шайбата (по своя изглед), за да има удари и предавания.
  const chase = (dir) => (m) => { const pk = m.debugPuck(); return pk ? { x: pk.x + (Math.random() - 0.5) * 0.08, y: pk.y + dir * 0.05 } : null; };
  run({ a: A, b: B }, { lag: 70, seconds: 400, inputs: { a: chase(-1), b: chase(1) } });
  assert.ok(A.final && B.final, 'играта трябва да свърши');
  assert.deepEqual(A.final, B.final);
  assert.ok(A.passes > 0);
});
