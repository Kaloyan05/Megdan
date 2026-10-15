import { test } from 'node:test';
import assert from 'node:assert/strict';
import rv, { validCells } from '../src/games/reversi.js';
import { replay } from '../src/core/engine.js';
import { createRng } from '../src/core/rng.js';

const P = ['a', 'b'];
const cell = (name) => (Number(name[1]) - 1) * 8 + 'ABCDEFGH'.indexOf(name[0]);

test('начална позиция: 4 валидни хода за първия', () => {
  const s = rv.init('s', P);
  assert.deepEqual(validCells(s.board, 0).sort((x, y) => x - y), [cell('D3'), cell('C4'), cell('F5'), cell('E6')].sort((x, y) => x - y));
});

test('ход обръща фигури и сменя реда', () => {
  const r = replay(rv, { seed: 's', players: P, log: [{ i: 0, p: 'a', t: 0, m: { cell: cell('D3') } }] });
  assert.equal(r.rejected.length, 0);
  assert.equal(r.state.board[cell('D4')], 0, 'D4 е обърната');
  assert.deepEqual(rv.score(r.state), [4, 1]);
  assert.equal(r.current, 'b');
});

test('невалидни ходове: без обръщане, заето поле, извън ред', () => {
  const s = rv.init('s', P);
  assert.equal(rv.validateMove(s, { cell: 0 }, 'a').reason, 'no-flip');
  assert.equal(rv.validateMove(s, { cell: cell('D4') }, 'a').reason, 'no-flip');
  assert.equal(rv.validateMove(s, { cell: cell('D3') }, 'b').reason, 'not-your-turn');
  assert.equal(rv.validateMove(s, { cell: 99 }, 'a').reason, 'bad-cell');
});

test('пропуск: ако противникът няма ход, редът остава', () => {
  // Изкуствена позиция: b няма ход, a има.
  const s = rv.init('s', P);
  s.board.fill(null);
  s.board[0] = 0; s.board[1] = 1; // a може да играе на 2 и обръща 1
  s.board[63] = 0;
  const next = rv.applyMove(s, { cell: 2 }, 'a');
  assert.equal(next.over, true, 'никой няма ход → край');
  assert.equal(rv.winner(next), 'a');
});

test('пълна партида с автоматични ходове завършва и е детерминистична', () => {
  const play = () => {
    let s = rv.init('s', P);
    for (let k = 0; k < 100 && !s.over; k++) {
      const p = rv.currentPlayer(s);
      const m = rv.autoMove(s, p, createRng(k));
      assert.ok(rv.validateMove(s, m, p).ok);
      s = rv.applyMove(s, m, p);
    }
    return s;
  };
  const a = play(), b = play();
  assert.equal(a.over, true);
  assert.deepEqual(a.board, b.board);
  const [x, y] = rv.score(a);
  assert.equal(rv.winner(a), x === y ? 'draw' : x > y ? 'a' : 'b');
});
