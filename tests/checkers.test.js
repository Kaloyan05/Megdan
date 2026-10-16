import { test } from 'node:test';
import assert from 'node:assert/strict';
import ck, { legalSteps } from '../src/games/checkers.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];
const sq = (name) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);
function empty(opts = {}) {
  const s = ck.init('s', P, opts);
  s.board = Array(64).fill(null);
  return s;
}

test('начало: по 12 пула, 7 хода за първия', () => {
  const s = ck.init('s', P);
  assert.equal(s.board.filter((v) => v === 0).length, 12);
  assert.equal(s.board.filter((v) => v === 1).length, 12);
  assert.equal(legalSteps(s).length, 7);
});

test('вземането е задължително; ход извън ред се отхвърля', () => {
  const s = empty();
  s.board[sq('c3')] = 0; s.board[sq('d4')] = 1; s.board[sq('h2')] = 0; s.board[sq('a7')] = 1;
  assert.equal(ck.validateMove(s, { from: sq('h2'), to: sq('g3') }, 'a').reason, 'must-capture');
  assert.ok(ck.validateMove(s, { from: sq('c3'), to: sq('e5') }, 'a').ok);
  assert.equal(ck.validateMove(s, { from: sq('c3'), to: sq('e5') }, 'b').reason, 'not-your-turn');
  const r = ck.applyMove(s, { from: sq('c3'), to: sq('e5') }, 'a');
  assert.equal(r.board[sq('d4')], null);
  assert.equal(r.turn, 1);
});

test('многократно вземане със същата фигура, взетите се махат накрая', () => {
  const s = empty();
  s.board[sq('a1')] = 0; s.board[sq('b2')] = 1; s.board[sq('d4')] = 1; s.board[sq('h8')] = 1;
  let r = ck.applyMove(s, { from: sq('a1'), to: sq('c3') }, 'a');
  assert.equal(r.chain, sq('c3'));
  assert.equal(r.turn, 0, 'същият играч продължава');
  assert.equal(r.board[sq('b2')], 1, 'взетият стои до края');
  assert.equal(ck.validateMove(r, { from: sq('a1'), to: sq('b2') }, 'a').reason, 'continue-capture');
  assert.equal(ck.validateMove(r, { from: sq('c3'), to: sq('e5') }, 'b').reason, 'not-your-turn');
  r = ck.applyMove(r, { from: sq('c3'), to: sq('e5') }, 'a');
  assert.equal(r.chain, null);
  assert.equal(r.board[sq('b2')], null);
  assert.equal(r.board[sq('d4')], null);
  assert.equal(r.turn, 1);
});

test('пулът взема назад (руски правила), без тази опция не може', () => {
  const s = empty();
  s.board[sq('d4')] = 0; s.board[sq('c3')] = 1; s.board[sq('h8')] = 1;
  assert.ok(legalSteps(s).some((x) => x.from === sq('d4') && x.to === sq('b2')));
  const noBack = empty({ back: false });
  noBack.board[sq('d4')] = 0; noBack.board[sq('c3')] = 1; noBack.board[sq('h8')] = 1;
  assert.ok(!legalSteps(noBack).some((x) => x.over !== null));
});

test('промоция по време на вземане: продължава като дама', () => {
  const s = empty();
  // a пул на b6 взема c7 → d8 (става дама), после като летяща дама взема f6 → g5/h4.
  s.board[sq('b6')] = 0; s.board[sq('c7')] = 1; s.board[sq('f6')] = 1; s.board[sq('a1')] = 1;
  let r = ck.applyMove(s, { from: sq('b6'), to: sq('d8') }, 'a');
  assert.equal(r.board[sq('d8')], 2, 'дама');
  assert.equal(r.chain, sq('d8'));
  const next = legalSteps(r).map((x) => x.to).sort((a, b) => a - b);
  assert.deepEqual(next, [sq('h4'), sq('g5')].sort((a, b) => a - b));
  r = ck.applyMove(r, { from: sq('d8'), to: sq('h4') }, 'a');
  assert.equal(r.turn, 1);
});

test('летяща дама: ход и вземане от разстояние; без летене — по едно поле', () => {
  const s = empty();
  s.board[sq('a1')] = 2; s.board[sq('e5')] = 1; s.board[sq('h2')] = 1;
  const caps = legalSteps(s).filter((x) => x.over !== null).map((x) => x.to).sort((a, b) => a - b);
  assert.deepEqual(caps, [sq('f6'), sq('g7'), sq('h8')].sort((a, b) => a - b));
  const short = empty({ flying: false });
  short.board[sq('a1')] = 2; short.board[sq('e5')] = 1; short.board[sq('h2')] = 1;
  assert.ok(legalSteps(short).every((x) => x.over === null));
  assert.deepEqual(legalSteps(short).map((x) => x.to), [sq('b2')]);
});

test('губи който няма ход', () => {
  const s = empty();
  s.board[sq('c3')] = 0; s.board[sq('d4')] = 1;
  const r = ck.applyMove(s, { from: sq('c3'), to: sq('e5') }, 'a');
  assert.equal(ck.winner(r), 'a');
});

test('ботове: трудният бие средния, цели партиди през replay', async () => {
  const { botMove } = await import('../src/core/bots.js');
  let hardWins = 0, mediumWins = 0;
  for (let k = 0; k < 4; k++) {
    const levels = k % 2 ? ['medium', 'hard'] : ['hard', 'medium'];
    const players = ['bot-1', 'bot-2'];
    let s = ck.init(`ck${k}`, players);
    const log = [];
    for (let i = 0; i < 500 && !ck.isOver(s); i++) {
      const p = ck.currentPlayer(s);
      const m = await botMove(ck, s, p, { seed: `ck${k}`, index: i, level: levels[players.indexOf(p)] });
      assert.ok(ck.validateMove(s, m, p).ok);
      s = ck.applyMove(s, m, p);
      log.push({ i, p, t: i, m });
    }
    assert.ok(ck.isOver(s));
    const r = replay(ck, { seed: `ck${k}`, players, log });
    assert.deepEqual(r.state, s);
    const w = ck.winner(s);
    if (w === players[levels.indexOf('hard')]) hardWins++;
    else if (w !== 'draw') mediumWins++;
  }
  assert.ok(hardWins > mediumWins, `труден ${hardWins}, среден ${mediumWins}`);
});

test('случайна партида до край', () => {
  let s = ck.init('rnd', P);
  for (let i = 0; i < 1000 && !ck.isOver(s); i++) {
    const p = ck.currentPlayer(s);
    const m = ck.autoMove(s, p, createRng(i));
    s = ck.applyMove(s, m, p);
  }
  assert.ok(ck.isOver(s));
});
