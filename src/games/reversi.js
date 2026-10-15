// Реверси — 8×8, 2 играчи. Без ход → редът минава автоматично; без ходове за двамата → край.

const N = 8;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

function flipsFor(board, idx, who) {
  if (board[idx] !== null) return [];
  const x0 = idx % N, y0 = Math.floor(idx / N);
  const out = [];
  for (const [dx, dy] of DIRS) {
    const line = [];
    let x = x0 + dx, y = y0 + dy;
    while (x >= 0 && x < N && y >= 0 && y < N && board[y * N + x] === 1 - who) { line.push(y * N + x); x += dx; y += dy; }
    if (line.length && x >= 0 && x < N && y >= 0 && y < N && board[y * N + x] === who) out.push(...line);
  }
  return out;
}

export function validCells(board, who) {
  const out = [];
  for (let i = 0; i < N * N; i++) if (flipsFor(board, i, who).length) out.push(i);
  return out;
}

const count = (board, who) => board.filter((v) => v === who).length;

export default {
  id: 'reversi',
  name: 'Реверси',
  icon: '⚫',
  blurb: 'Обгради и обърни. Повече цвят печели.',
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'flip',

  init(seed, players) {
    const board = Array(N * N).fill(null);
    board[27] = 1; board[28] = 0; board[35] = 0; board[36] = 1;
    return { players: players.slice(), board, turn: 0, over: false, last: null, flipped: [], passed: false };
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, move, p) {
    if (s.over) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(move?.cell) || move.cell < 0 || move.cell >= N * N) return { ok: false, reason: 'bad-cell' };
    if (!flipsFor(s.board, move.cell, s.turn).length) return { ok: false, reason: 'no-flip' };
    return { ok: true };
  },

  applyMove(s, move) {
    const board = s.board.slice();
    const flipped = flipsFor(board, move.cell, s.turn);
    board[move.cell] = s.turn;
    for (const i of flipped) board[i] = s.turn;
    const next = 1 - s.turn;
    let turn = next, passed = false, over = false;
    if (!validCells(board, next).length) {
      if (validCells(board, s.turn).length) { turn = s.turn; passed = true; } else over = true;
    }
    return { ...s, board, turn, over, last: move.cell, flipped, passed };
  },

  autoMove: (s, p, rng) => ({ cell: rng.pick(validCells(s.board, s.turn)) }),
  isOver: (s) => s.over,
  winner(s) {
    const a = count(s.board, 0), b = count(s.board, 1);
    return a === b ? 'draw' : a > b ? s.players[0] : s.players[1];
  },
  score: (s) => [count(s.board, 0), count(s.board, 1)],

  render(el, s, ctx) {
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    const hints = new Set(myTurn ? validCells(s.board, s.turn) : []);
    const flipped = new Set(s.flipped);
    const [a, b] = [count(s.board, 0), count(s.board, 1)];
    el.innerHTML = '';

    const score = document.createElement('div');
    score.className = 'rv-score';
    s.players.forEach((p, i) => {
      const item = document.createElement('span');
      item.className = 'rv-score-item';
      const dot = document.createElement('span');
      dot.className = 'disc-dot';
      dot.style.setProperty('--disc', `var(--seat-${i + 1})`);
      const txt = document.createElement('span');
      txt.textContent = `${ctx.nickOf(p)}: ${i === 0 ? a : b}`;
      item.append(dot, txt);
      score.append(item);
    });
    if (s.passed && !s.over) {
      const note = document.createElement('span');
      note.className = 'rv-note';
      note.textContent = `${ctx.nickOf(s.players[1 - s.turn])} няма ход и пропуска.`;
      score.append(note);
    }

    const grid = document.createElement('div');
    grid.className = 'rv';
    grid.setAttribute('role', 'grid');
    grid.setAttribute('aria-label', 'Дъска');
    const letters = 'ABCDEFGH';
    for (let i = 0; i < N * N; i++) {
      const cell = document.createElement('button');
      cell.className = 'rv-cell' + (hints.has(i) ? ' hint' : '');
      cell.disabled = !hints.has(i);
      const v = s.board[i];
      cell.setAttribute('aria-label', `${letters[i % N]}${Math.floor(i / N) + 1}${v === null ? (hints.has(i) ? ', възможен ход' : '') : `, ${ctx.nickOf(s.players[v])}`}`);
      cell.addEventListener('click', () => ctx.onMove({ cell: i }));
      if (v !== null) {
        const disc = document.createElement('span');
        disc.className = 'rv-disc' + (flipped.has(i) ? ' flip' : '') + (i === s.last ? ' last' : '');
        disc.style.setProperty('--disc', `var(--seat-${v + 1})`);
        cell.append(disc);
      }
      grid.append(cell);
    }
    el.append(score, grid);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'rv-art';
    const rows = ['....', '.12.', '.21.', '..1.'];
    for (const row of rows) for (const ch of row) {
      const s = document.createElement('span');
      if (ch !== '.') { const d = document.createElement('i'); d.style.background = `var(--seat-${ch})`; s.append(d); }
      el.append(s);
    }
    return el;
  },

  css: `
.rv-score { display:flex; flex-wrap:wrap; gap:8px 16px; align-items:center; justify-content:center; margin-bottom:10px; font-weight:700; font-variant-numeric:tabular-nums; }
.rv-score-item { display:inline-flex; align-items:center; gap:6px; }
.rv-note { width:100%; text-align:center; font-weight:500; color:var(--ink-2); font-size:var(--step--1); }
.rv { display:grid; grid-template-columns:repeat(8,1fr); gap:2px; padding:6px; width:min(100%,440px); margin-inline:auto;
  background:var(--felt-edge); border-radius:var(--r-lg); box-shadow:var(--shadow-pop); }
.rv-cell { aspect-ratio:1; border:0; padding:0; background:var(--felt); border-radius:4px; display:grid; place-items:center; cursor:default; }
.rv-cell.hint { cursor:pointer; }
.rv-cell.hint::after { content:""; width:28%; height:28%; border-radius:50%; background:rgb(255 255 255 / .35); }
.rv-cell.hint:hover::after, .rv-cell.hint:focus-visible::after { background:rgb(255 255 255 / .7); }
.rv-cell:focus-visible { outline:3px solid var(--sun); outline-offset:-3px; }
.rv-disc { width:82%; height:82%; border-radius:50%; background:var(--disc); box-shadow:inset 0 -3px 0 rgb(0 0 0 / .25); }
.rv-disc.last { box-shadow:inset 0 -3px 0 rgb(0 0 0 / .25), 0 0 0 3px var(--sun); }
.rv-disc.flip { animation:rvflip .35s ease-out; }
@keyframes rvflip { 0% { transform:scaleX(1); } 50% { transform:scaleX(0); } 100% { transform:scaleX(1); } }
.rv-art { display:grid; grid-template-columns:repeat(4,20px); gap:2px; padding:4px; background:var(--felt-edge); border-radius:10px; }
.rv-art span { width:20px; height:20px; background:var(--felt); border-radius:3px; display:grid; place-items:center; }
.rv-art i { width:15px; height:15px; border-radius:50%; }
@media (prefers-reduced-motion: reduce) { .rv-disc.flip { animation:none; } }
`,
};
