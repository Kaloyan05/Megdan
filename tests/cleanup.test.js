import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalStore } from '../src/net/store-local.js';
import { createApi } from '../src/net/api.js';
import { sweepRooms, sweepMySecrets, MAX_AGE_MS } from '../src/net/cleanup.js';
import c4 from '../src/games/connect4.js';

const DAY = 24 * 3600 * 1000;

test('почистване: трие само стаи без активност от 30 дни, заедно с поддокументите им', async () => {
  let clock = 1_000_000_000_000;
  const store = createLocalStore({ me: 'alice' });
  const api = createApi(store, { now: () => clock });
  const profile = { nick: 'Али', avatar: '🦊', color: 1 };

  const old = await api.createRoom({ gameId: 'connect4', profile });
  const room = await store.get(`rooms/${old}`);
  await api.startGame(old, room, await store.list(`rooms/${old}/members`), { ...c4, minPlayers: 1 });
  await api.sendMove(old, 1, { col: 3 }, 0);
  await api.sendChat(old, [], { text: 'здрасти' });

  clock += 20 * DAY;
  const active = await api.createRoom({ gameId: 'reversi', profile });

  // Стара по създаване, но с ход преди 5 дни → остава.
  clock -= 20 * DAY;
  const revived = await api.createRoom({ gameId: 'dots', profile });
  clock += 35 * DAY;
  await api.sendChat(revived, [], { text: 'още сме тук' });

  clock += 5 * DAY; // сега: old е на 40 дни, active на 20, revived има чат преди 5 дни
  const deleted = await sweepRooms(store, { now: clock });
  assert.deepEqual(deleted, [old]);
  assert.equal(await store.get(`rooms/${old}`), null);
  assert.deepEqual(await store.list(`rooms/${old}/members`), []);
  assert.deepEqual(await store.list(`rooms/${old}/r1`), []);
  assert.deepEqual(await store.list(`rooms/${old}/chat`), []);
  assert.ok(await store.get(`rooms/${active}`));
  assert.ok(await store.get(`rooms/${revived}`));
  assert.equal(MAX_AGE_MS, 30 * DAY);
});

test('почистване: личните тайни за изчезнали или стари рундове се трият', async () => {
  const store = createLocalStore({ me: 'bob' });
  await store.set('rooms/ABCD', { round: 3 });
  await store.set('data/users/bob/secret-ABCD-r2', { ships: [] });
  await store.set('data/users/bob/secret-ABCD-r3', { ships: [] });
  await store.set('data/users/bob/secret-ZZZZ-r1', { ships: [] });
  await store.set('data/users/bob/myrooms', { rooms: [] });
  assert.equal(await sweepMySecrets(store, 'bob'), 2);
  assert.deepEqual((await store.list('data/users/bob')).map((d) => d.id).sort(), ['myrooms', 'secret-ABCD-r3']);
});
