// Четири в редица — 7 колони × 6 реда, 2 играчи.

import { bestBy } from '../core/bots.js';

const COLS = 7;
const ROWS = 6;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

const at = (b, c, r) => (c < 0 || c >= COLS || r < 0 || r >= ROWS ? undefined : b[r * COLS + c]);

function findLine(board, c, r) {
  const who = at(board, c, r);
  for (const [dc, dr] of DIRS) {
    const line = [[c, r]];
    for (const s of [1, -1]) {
      let x = c + dc * s, y = r + dr * s;
      while (at(board, x, y) === who) { line.push([x, y]); x += dc * s; y += dr * s; }
    }
    if (line.length >= 4) return line.map(([x, y]) => y * COLS + x);
  }
  return null;
}

const dropRow = (board, col) => {
  for (let r = 0; r < ROWS; r++) if (board[r * COLS + col] === null) return r;
  return -1;
};

const validCols = (s) => [...Array(COLS).keys()].filter((c) => dropRow(s.board, c) !== -1);

export default {
  id: 'connect4',
  name: 'Четири в редица',
  icon: '🔴',
  blurb: 'Пусни жетон и подреди четири.',
  rules: ["Редувате се да пускате жетон в колона. Той пада най-долу.", "Печели първият с четири поред: хоризонтално, вертикално или по диагонал.", "Ако дъската се напълни без четворка, е равенство."],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'drop',

  init: (seed, players) => ({
    players: players.slice(),
    board: Array(COLS * ROWS).fill(null),
    turn: 0,
    winner: null,
    line: null,
    last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, move, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(move?.col) || move.col < 0 || move.col >= COLS) return { ok: false, reason: 'bad-column' };
    if (dropRow(s.board, move.col) === -1) return { ok: false, reason: 'column-full' };
    return { ok: true };
  },

  applyMove(s, move, p) {
    const board = s.board.slice();
    const row = dropRow(board, move.col);
    const idx = row * COLS + move.col;
    board[idx] = s.turn;
    const line = findLine(board, move.col, row);
    const full = board.every((x) => x !== null);
    return {
      ...s,
      board,
      last: idx,
      line,
      winner: line ? p : full ? 'draw' : null,
      turn: 1 - s.turn,
    };
  },

  autoMove: (s, p, rng) => ({ col: rng.pick(validCols(s)) }),

  // Хитър бот: печели, ако може; блокира; не подава победа; предпочита центъра.
  botMove(s, p, rng) {
    const me = s.turn;
    const cols = validCols(s);
    const after = (board, who, c) => { const r = dropRow(board, c); const b = board.slice(); b[r * COLS + c] = who; return { b, r }; };
    const wins = (board, who, c) => { if (dropRow(board, c) === -1) return false; const { b, r } = after(board, who, c); return Boolean(findLine(b, c, r)); };
    const win = cols.find((c) => wins(s.board, me, c));
    if (win !== undefined) return { col: win };
    const block = cols.find((c) => wins(s.board, 1 - me, c));
    if (block !== undefined) return { col: block };
    const safe = cols.filter((c) => { const { b } = after(s.board, me, c); return !wins(b, 1 - me, c); });
    const pool = safe.length ? safe : cols;
    const noise = pool.map(() => rng.next());
    return { col: bestBy(pool, (c) => -Math.abs(3 - c) + noise[pool.indexOf(c)] * 0.9) };
  },
  isOver: (s) => s.winner !== null,
  winner: (s) => s.winner,

  render(el, s, ctx) {
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    const canDrop = new Set(myTurn ? validCols(s) : []);
    const win = new Set(s.line || []);
    el.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'c4';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Дъска');
    for (let c = 0; c < COLS; c++) {
      const col = document.createElement('button');
      col.className = 'c4-col';
      col.disabled = !canDrop.has(c);
      col.setAttribute('aria-label', `Колона ${c + 1}`);
      col.addEventListener('click', () => ctx.onMove({ col: c }));
      for (let r = ROWS - 1; r >= 0; r--) {
        const i = r * COLS + c;
        const cell = document.createElement('span');
        cell.className = 'c4-cell';
        const v = s.board[i];
        if (v !== null) {
          const disc = document.createElement('span');
          disc.className = 'disc' + (i === s.last ? ' drop' : '') + (win.has(i) ? ' win' : '');
          disc.style.setProperty('--disc', `var(--seat-${v + 1})`);
          disc.style.setProperty('--rows', ROWS - r);
          cell.append(disc);
        }
        col.append(cell);
      }
      grid.append(col);
    }
    el.append(grid);
  },

  // Мини изглед за картата в лобито: истинско разположение от партида.
  art() {
    const el = document.createElement('div');
    el.className = 'c4-art';
    const rows = ['....', '..1.', '.21.', '1221'];
    for (const row of rows) for (const ch of row) {
      const s = document.createElement('span');
      if (ch !== '.') s.style.background = `var(--seat-${ch})`;
      el.append(s);
    }
    return el;
  },

  css: `
.c4-art { display:grid; grid-template-columns:repeat(4,18px); gap:5px; padding:8px; background:var(--board); border-radius:12px; }
.c4-art span { width:18px; height:18px; border-radius:50%; background:var(--board-hole); }
.c4 { display:grid; grid-template-columns:repeat(7,1fr); gap:clamp(3px,1.2vw,8px);
  background:var(--board); padding:clamp(6px,2vw,12px); border-radius:var(--r-lg);
  width:min(100%,440px); margin-inline:auto; box-shadow:var(--shadow-pop); }
.c4-col { display:flex; flex-direction:column; gap:clamp(3px,1.2vw,8px); border:0; padding:0;
  background:transparent; cursor:pointer; border-radius:999px; }
.c4-col:disabled { cursor:default; }
.c4-col:not(:disabled):hover .c4-cell, .c4-col:focus-visible .c4-cell { background:var(--board-hole-hi); }
.c4-col:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
.c4-cell { aspect-ratio:1; border-radius:50%; background:var(--board-hole); display:grid; overflow:hidden; }
.disc { border-radius:50%; background:var(--disc); box-shadow:inset 0 -4px 0 rgb(0 0 0 / .18); }
.disc.drop { animation:c4drop calc(.12s + var(--rows) * .05s) cubic-bezier(.5,0,.75,0) both,
  c4bounce .25s calc(.12s + var(--rows) * .05s) ease-out; }
.disc.win { animation:c4win .8s ease-in-out infinite alternate; }
@keyframes c4drop { from { transform:translateY(calc(var(--rows) * -115%)); } }
@keyframes c4bounce { 40% { transform:translateY(-12%); } }
@keyframes c4win { to { transform:scale(.82); box-shadow:0 0 0 4px var(--bg) inset; } }
@media (prefers-reduced-motion: reduce) { .disc.drop, .disc.win { animation:none; } }
`,
};
