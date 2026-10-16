// Четири в редица — 7×6 (или 8×7, 9×7 по избор), 2 играчи.

import { bestBy } from '../core/bots.js';

// Размерът идва от състоянието. Всички функции са синхронни, затова всеки вход в модула
// първо задава размера чрез use(s).
let COLS = 7;
let ROWS = 6;
let ORDER = [3, 2, 4, 1, 5, 0, 6];
const SIZES = { '7x6': [7, 6], '8x7': [8, 7], '9x7': [9, 7] };
function use(s) {
  const c = s.cols ?? 7;
  if (c === COLS && s.board.length === c * ROWS) return;
  COLS = c;
  ROWS = s.board.length / c;
  const mid = (COLS - 1) / 2;
  ORDER = [...Array(COLS).keys()].sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
}
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

// Търсене (negamax с алфа-бета) за трудния бот. Детерминистично: същата позиция → същият ход.
function evalWindow(cells, who) {
  let mine = 0, theirs = 0;
  for (const v of cells) { if (v === who) mine++; else if (v !== null) theirs++; }
  if (mine && theirs) return 0;
  if (mine === 3) return 5; if (mine === 2) return 2;
  if (theirs === 3) return -4; if (theirs === 2) return -1;
  return 0;
}
function evalC4(b, who) {
  let v = 0;
  const mid = Math.floor(COLS / 2);
  for (let r = 0; r < ROWS; r++) if (b[r * COLS + mid] === who) v += 3; else if (b[r * COLS + mid] !== null) v -= 3;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dc, dr] of DIRS) {
    const ec = c + dc * 3, er = r + dr * 3;
    if (ec < 0 || ec >= COLS || er < 0 || er >= ROWS) continue;
    v += evalWindow([0, 1, 2, 3].map((k) => b[(r + dr * k) * COLS + c + dc * k]), who);
  }
  return v;
}
function negamax(b, who, depth, alpha, beta) {
  if (depth === 0) return evalC4(b, who);
  let any = false;
  for (const c of ORDER) {
    const r = dropRow(b, c);
    if (r === -1) continue;
    any = true;
    b[r * COLS + c] = who;
    const won = findLine(b, c, r);
    const v = won ? 10000 + depth : -negamax(b, 1 - who, depth - 1, -beta, -alpha);
    b[r * COLS + c] = null;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return any ? alpha : 0;
}
function searchC4(b, who, depth) {
  let best = null, bestV = -Infinity;
  for (const c of ORDER) {
    const r = dropRow(b, c);
    if (r === -1) continue;
    b[r * COLS + c] = who;
    const v = findLine(b, c, r) ? 100000 : -negamax(b, 1 - who, depth - 1, -Infinity, -bestV);
    b[r * COLS + c] = null;
    if (v > bestV) { bestV = v; best = c; }
  }
  return best;
}

export default {
  id: 'connect4',
  name: 'Четири в редица',
  icon: '🔴',
  blurb: 'Пусни жетон и подреди четири.',
  rules: ["Редувате се да пускате жетон в колона. Той пада най-долу.", "Печели първият с четири поред: хоризонтално, вертикално или по диагонал.", "Ако дъската се напълни без четворка, е равенство."],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'drop',
  options: [
    { id: 'size', label: 'Дъска', default: '7x6', choices: [{ value: '7x6', label: '7×6' }, { value: '8x7', label: '8×7' }, { value: '9x7', label: '9×7' }] },
  ],

  init: (seed, players, opts = {}) => ({
    players: players.slice(),
    cols: (SIZES[opts.size] ?? SIZES['7x6'])[0],
    board: Array((SIZES[opts.size] ?? SIZES['7x6'])[0] * (SIZES[opts.size] ?? SIZES['7x6'])[1]).fill(null),
    turn: 0,
    winner: null,
    line: null,
    last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, move, p) {
    use(s);
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(move?.col) || move.col < 0 || move.col >= COLS) return { ok: false, reason: 'bad-column' };
    if (dropRow(s.board, move.col) === -1) return { ok: false, reason: 'column-full' };
    return { ok: true };
  },

  applyMove(s, move, p) {
    use(s);
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

  autoMove: (s, p, rng) => { use(s); return { col: rng.pick(validCols(s)) }; },

  // Хитър бот: печели, ако може; блокира; не подава победа; предпочита центъра.
  botMove(s, p, rng, level = 'medium') {
    use(s);
    const me = s.turn;
    if (level === 'hard') return { col: searchC4(s.board.slice(), me, COLS > 7 ? 5 : 6) };
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
    return { col: bestBy(pool, (c) => -Math.abs((COLS - 1) / 2 - c) + noise[pool.indexOf(c)] * 0.9) };
  },
  isOver: (s) => s.winner !== null,
  winner: (s) => s.winner,

  render(el, s, ctx) {
    use(s);
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    const canDrop = new Set(myTurn ? validCols(s) : []);
    const win = new Set(s.line || []);
    el.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'c4';
    grid.style.setProperty('--c4-cols', COLS);
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
.c4 { display:grid; grid-template-columns:repeat(var(--c4-cols, 7),minmax(0,1fr)); gap:clamp(3px,1.2vw,8px);
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
