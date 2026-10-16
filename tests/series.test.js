import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seriesPoints, seriesTotals, seriesDone, pickSeriesGames } from '../src/core/series.js';
import { GAMES } from '../src/games/index.js';
import { createLocalStore } from '../src/net/store-local.js';
import { createApi } from '../src/net/api.js';

test('точки: победа 3, второ място 1 при 3+ играчи, реми 1', () => {
  assert.deepEqual(seriesPoints({ a: 1, b: 2 }), { a: 3, b: 0 });
  assert.deepEqual(seriesPoints({ a: 2, b: 1, c: 3 }), { a: 1, b: 3, c: 0 });
  assert.deepEqual(seriesPoints({ a: 1, b: 1 }), { a: 1, b: 1 });
  assert.deepEqual(seriesPoints({ a: 1, b: 1, c: 2 }), { a: 3, b: 3, c: 1 });
});

test('сбор и край на вечерта', () => {
  const s = { games: ['connect4', 'reversi', 'dots'], index: 2, results: [{ round: 1, placements: { a: 1, b: 2 } }, { round: 2, placements: { a: 2, b: 1 } }] };
  assert.deepEqual(seriesTotals(s), { a: 3, b: 3 });
  assert.equal(seriesDone(s), false);
  assert.equal(seriesDone({ ...s, index: 3 }), true);
});

test('изненада: различни игри, подходящи за броя играчи', () => {
  const four = pickSeriesGames(GAMES, 5, 4, () => 0.3);
  assert.equal(four.length, 5);
  assert.equal(new Set(four).size, 5);
  for (const id of four) {
    const g = GAMES.find((x) => x.id === id);
    assert.ok(g.minPlayers <= 4 && g.maxPlayers >= 4, id);
  }
});

test('api: записът минава към следващата игра, втори запис за същия рунд се пропуска', async () => {
  const store = createLocalStore({ me: 'alice' });
  const api = createApi(store);
  const code = await api.createRoom({ gameId: 'connect4', profile: { nick: 'А' }, series: { games: ['connect4', 'reversi'], index: 0, results: [] } });
  let room = { ...(await store.get(`rooms/${code}`)), round: 1 };
  await api.seriesRecord(code, room, { alice: 1, bob: 2 });
  room = await store.get(`rooms/${code}`);
  assert.equal(room.series.index, 1);
  assert.equal(room.gameId, 'reversi');
  await api.seriesRecord(code, { ...room, round: 1 }, { alice: 2, bob: 1 });
  assert.deepEqual((await store.get(`rooms/${code}`)).series.results, [{ round: 1, placements: { alice: 1, bob: 2 } }]);
});

test('api: нова вечер нулира точките, без да чака нов запис', async () => {
  const store = createLocalStore({ me: 'alice' });
  const api = createApi(store);
  const code = await api.createRoom({ gameId: 'connect4', profile: { nick: 'А' }, series: { games: ['connect4'], index: 0, results: [] } });
  let room = { ...(await store.get(`rooms/${code}`)), round: 3 };
  await api.seriesRecord(code, room, { alice: 1, bob: 2 });
  room = { ...(await store.get(`rooms/${code}`)), round: 3 };
  assert.equal(room.series.index, 1);
  await api.seriesRestart(code, room);
  const after = await store.get(`rooms/${code}`);
  assert.deepEqual(after.series.results, []);
  assert.equal(after.series.recorded, 3);
  assert.equal(after.gameId, 'connect4');
});
