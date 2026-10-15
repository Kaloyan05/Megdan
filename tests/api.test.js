import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../src/net/store-local.js';
import { createApi, normalizeCode, activeMembers } from '../src/net/api.js';
import { replay } from '../src/core/engine.js';
import c4 from '../src/games/connect4.js';

const tick = () => new Promise((r) => setTimeout(r, 30));

// Двама „браузъра“: отделни store-ове, свързани през BroadcastChannel (има го в Node).
function pair(name) {
  const ca = new BroadcastChannel(name), cb = new BroadcastChannel(name);
  const a = createApi(createLocalStore({ me: 'alice', channel: ca }));
  const b = createApi(createLocalStore({ me: 'bob', channel: cb }));
  return { a, b, close: () => { ca.close(); cb.close(); } };
}

function latest(api, code) {
  let v = null;
  const off = api.watchRoom(code, (x) => { v = x; });
  return { get: () => v, off };
}

test('код: главни букви, кирилица → латиница, 4 знака', () => {
  assert.equal(normalizeCode('abcd'), 'ABCD');
  assert.equal(normalizeCode('мкох'), 'MKOX');
  assert.equal(normalizeCode(' a-b c d e '), 'ABCD');
});

test('стая: създай, влез с код, готовност, старт, партида, статистика', async () => {
  const { a, b, close } = pair('t1');
  try {
    const code = await a.createRoom({ gameId: 'connect4', profile: { nick: 'Али', avatar: '🦊', color: 1 } });
    await tick();
    assert.equal((await b.joinRoom(code, { nick: 'Боби', avatar: '🐸', color: 2 })).ok, true);
    assert.equal((await b.joinRoom('ZZZZ', {})).reason, 'not-found');
    await tick();

    const va = latest(a, code), vb = latest(b, code);
    await tick();
    assert.equal(activeMembers(va.get().members).length, 2);

    // Без готовност на Боби: стартира само домакинът → твърде малко играчи.
    let s = va.get();
    assert.equal((await a.startGame(code, s.room, s.members, c4)).reason, 'too-few');

    s = vb.get();
    await b.setReady(code, s.room, s.members, true);
    await tick();
    s = va.get();
    assert.equal((await b.startGame(code, s.room, s.members, c4)).reason, 'not-host');
    assert.equal((await a.startGame(code, s.room, s.members, c4)).ok, true);
    await tick();

    // Партида: alice печели вертикално в колона 0.
    const cols = [0, 1, 0, 1, 0, 1, 0];
    for (let k = 0; k < cols.length; k++) {
      const api = k % 2 ? b : a;
      const v = (k % 2 ? vb : va).get();
      const r = replay(c4, { seed: v.room.seed, players: v.room.players, log: v.log });
      assert.equal(r.current, api.me, `ход ${k}`);
      await api.sendMove(code, v.room.round, { col: cols[k] }, r.nextIndex);
      await tick();
    }

    // Ход извън ред от Боби след края → отхвърлен.
    for (const v of [va.get(), vb.get()]) {
      const r = replay(c4, { seed: v.room.seed, players: v.room.players, log: v.log });
      assert.equal(r.winner, 'alice');
    }

    const v = va.get();
    const r = replay(c4, { seed: v.room.seed, players: v.room.players, log: v.log });
    assert.deepEqual(await a.recordResult(code, v.room, r, 'connect4'), { outcome: 'w', delta: 16 });
    assert.equal(await a.recordResult(code, v.room, r, 'connect4'), null, 'втори запис се пропуска');
    await b.recordResult(code, vb.get().room, r, 'connect4');
    await tick();
    assert.equal((await a.getStats('alice')).rating, 1016);
    assert.equal((await a.getStats('bob')).rating, 984);
    assert.equal((await a.getStats('bob')).games.connect4.l, 1);

    // Реванш: нов рунд, нов seed, празен лог.
    s = vb.get();
    await b.setReady(code, s.room, s.members, true);
    await tick();
    s = va.get();
    const oldSeed = s.room.seed;
    assert.equal((await a.startGame(code, s.room, s.members, c4)).ok, true);
    await tick();
    assert.equal(va.get().room.round, 2);
    assert.notEqual(va.get().room.seed, oldSeed);
    assert.equal(vb.get().log.length, 0);

    // Чат.
    await b.sendChat(code, vb.get().chatDocs ?? [], { text: '  Добра игра! ' });
    await tick();
    await a.sendChat(code, va.get().chatDocs ?? [], { emoji: '🎉' });
    await tick();
    assert.deepEqual(va.get().chat.map((m) => m.text ?? m.emoji), ['Добра игра!', '🎉']);

    // Домакинът излиза → Боби поема.
    s = va.get();
    await a.leaveRoom(code, s.room, s.members);
    await tick();
    assert.equal(vb.get().room.hostId, 'bob');

    va.off(); vb.off();
  } finally {
    close();
  }
});
