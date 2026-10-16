import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../src/games/index.js';
import { botMove, makeBot, isBot } from '../src/core/bots.js';
import { replay } from '../src/core/engine.js';

// Партида само с ботове: всеки ход е валиден, играта свършва, replay съвпада.
async function botGame(game, n, seed, levels) {
  const players = [...Array(n).keys()].map((k) => `bot-${k + 1}`);
  let s = game.init(seed, players);
  const log = [];
  for (let i = 0; i < 6000 && !game.isOver(s); i++) {
    let moved = false;
    for (const [k, id] of players.entries()) {
      const m = await botMove(game, s, id, { seed, index: i, level: levels[k] });
      if (!m) continue;
      const v = game.validateMove(s, m, id);
      assert.ok(v.ok, `${game.id}: ${id} ${JSON.stringify(m)} → ${v.reason}`);
      s = game.applyMove(s, m, id);
      log.push({ i, p: id, t: i, m });
      moved = true;
      break;
    }
    assert.ok(moved, `${game.id}: никой бот не може да ходи`);
  }
  assert.ok(game.isOver(s), `${game.id} свършва`);
  const r = replay(game, { seed, players, log });
  assert.equal(r.rejected.length, 0);
  return { s, r, players };
}

for (const game of GAMES.filter((g) => !g.realtime)) {
  test(`бот: ${game.name} — цяла партида само с ботове`, async () => {
    await botGame(game, game.minPlayers === 2 && game.maxPlayers > 2 ? 3 : game.minPlayers, `b-${game.id}`, ['hard', 'easy', 'hard']);
  });
}

test('хитрият бот бие лесния в Четири в редица и Реверси', async () => {
  for (const id of ['connect4', 'reversi', 'uttt']) {
    const game = GAMES.find((g) => g.id === id);
    let wins = 0;
    for (let k = 0; k < 10; k++) {
      // редуваме кой започва
      const levels = k % 2 ? ['easy', 'hard'] : ['hard', 'easy'];
      const { r, players } = await botGame(game, 2, `duel-${id}-${k}`, levels);
      const hard = players[levels.indexOf('hard')];
      if (r.winner === hard) wins++;
    }
    assert.ok(wins >= 7, `${id}: хитрият печели ${wins}/10`);
  }
});

test('трудният бот бие средния в Четири в редица и Реверси', async () => {
  for (const id of ['connect4', 'reversi']) {
    const game = GAMES.find((g) => g.id === id);
    let wins = 0, losses = 0;
    for (let k = 0; k < 8; k++) {
      const levels = k % 2 ? ['medium', 'hard'] : ['hard', 'medium'];
      const { r, players } = await botGame(game, 2, `hm-${id}-${k}`, levels);
      const hard = players[levels.indexOf('hard')];
      if (r.winner === hard) wins++; else if (r.winner !== 'draw') losses++;
    }
    assert.ok(wins > losses, `${id}: труден ${wins}, среден ${losses}`);
  }
});

test('морски бой: трудният бот потопява по-бързо от лесния', async () => {
  const game = GAMES.find((g) => g.id === 'battleship');
  const shotsTo = async (level, seed) => {
    const { s } = await botGame(game, 2, seed, [level, 'easy']);
    return s.shots[0].length + (s.winner === 0 ? 0 : 100);
  };
  let hard = 0, easy = 0;
  for (let k = 0; k < 4; k++) { hard += await shotsTo('hard', `bs-${k}`); easy += await shotsTo('easy', `bs-${k}`); }
  assert.ok(hard < easy, `труден ${hard}, лесен ${easy}`);
});

test('ботове: имена и id', () => {
  const a = makeBot([]);
  const b = makeBot([a], 'easy');
  assert.equal(a.id, 'bot-1');
  assert.equal(b.id, 'bot-2');
  assert.equal(b.level, 'easy');
  assert.ok(isBot(a.id) && !isBot('u_abc'));
});
