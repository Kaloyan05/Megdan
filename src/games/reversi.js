// Реверси — 8×8, 2 играчи. Без ход → редът минава автоматично; без ходове за двамата → край.

import { bestBy } from '../core/bots.js';

const N = 8;
const WEIGHTS = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100,
];
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

// Минимакс с алфа-бета за трудния бот: позиционни тегла + подвижност.
function playOn(board, idx, who) {
  const b = board.slice();
  b[idx] = who;
  for (const i of flipsFor(board, idx, who)) b[i] = who;
  return b;
}
function evalRv(b, who) {
  let v = 0;
  for (let i = 0; i < 64; i++) if (b[i] === who) v += WEIGHTS[i]; else if (b[i] !== null) v -= WEIGHTS[i];
  return v + 4 * (validCells(b, who).length - validCells(b, 1 - who).length);
}
function rvNegamax(b, who, depth, alpha, beta) {
  const moves = validCells(b, who);
  if (depth === 0) return evalRv(b, who);
  if (!moves.length) {
    if (!validCells(b, 1 - who).length) { const d = count(b, who) - count(b, 1 - who); return d * 1000; }
    return -rvNegamax(b, 1 - who, depth - 1, -beta, -alpha);
  }
  for (const m of moves) {
    const v = -rvNegamax(playOn(b, m, who), 1 - who, depth - 1, -beta, -alpha);
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return alpha;
}
function searchRv(board, who, depth) {
  let best = null, bestV = -Infinity;
  for (const m of validCells(board, who)) {
    const v = -rvNegamax(playOn(board, m, who), 1 - who, depth - 1, -Infinity, -bestV);
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
}

export default {
  id: 'reversi',
  name: 'Реверси',
  icon: '⚫',
  blurb: 'Обгради и обърни. Повече цвят печели.',
  rules: ["Слагаш фигура така, че да заградиш редица фигури на противника.", "Заградените фигури стават твои. Точките показват къде можеш да играеш.", "Ако нямаш ход, пропускаш. Играта свършва, когато никой няма ход.", "Печели който има повече фигури накрая."],
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

  // Хитър бот: ъгли, ръбове, избягва полетата до ъглите, после повече обърнати.
  botMove(s, p, rng, level = 'medium') {
    if (level === 'hard') return { cell: searchRv(s.board, s.turn, 3) };
    const cells = validCells(s.board, s.turn);
    const noise = cells.map(() => rng.next());
    return { cell: bestBy(cells, (i) => WEIGHTS[i] + flipsFor(s.board, i, s.turn).length * 1.5 + noise[cells.indexOf(i)]) };
  },
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
    grid.setAttribute('role', 'group');
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
        const fresh = Boolean(ctx.last?.fresh);
        disc.className = 'rv-disc' + (fresh && flipped.has(i) ? ' flip' : '') + (i === s.last ? ' last' : '') + (fresh && i === s.last ? ' fx-pop' : '');
        disc.style.setProperty('--disc', `var(--seat-${v + 1})`);
        disc.style.setProperty('--under', `var(--seat-${(1 - v) + 1})`);
        if (fresh && flipped.has(i) && s.last !== null) {
          // Обръщат се една след друга, като вълна от новия диск.
          const d = Math.max(Math.abs((i % N) - (s.last % N)), Math.abs(Math.floor(i / N) - Math.floor(s.last / N)));
          disc.style.setProperty('--from', `var(--seat-${(1 - v) + 1})`);
          disc.style.animationDelay = `${120 + d * 90}ms`;
        }
        cell.append(disc);
      }
      grid.append(cell);
    }
    // Координати по ръба и четирите звездни точки като на истинска дъска.
    for (let k = 0; k < N; k++) {
      const f = document.createElement('span'); f.className = 'rv-coord file'; f.textContent = letters[k];
      f.style.left = `calc(10px + (100% - 20px) * ${(k + 0.5) / N})`;
      const r = document.createElement('span'); r.className = 'rv-coord rank'; r.textContent = String(k + 1);
      r.style.top = `calc(10px + (100% - 20px) * ${(k + 0.5) / N})`;
      grid.append(f, r);
    }
    for (const [x, y] of [[2, 2], [6, 2], [2, 6], [6, 6]]) {
      const st = document.createElement('i'); st.className = 'rv-star';
      st.style.left = `calc(10px + (100% - 20px) * ${x / N})`; st.style.top = `calc(10px + (100% - 20px) * ${y / N})`;
      grid.append(st);
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
.rv { position:relative; display:grid; grid-template-columns:repeat(8,1fr); gap:2px; padding:10px; width:min(100%,440px); margin-inline:auto; border-radius:var(--r-lg);
  background:linear-gradient(160deg, color-mix(in srgb, var(--felt-edge) 85%, #fff), var(--felt-edge) 40%, color-mix(in srgb, var(--felt-edge) 75%, #000));
  box-shadow: inset 0 2px 0 rgb(255 255 255 / .2), 0 7px 0 color-mix(in srgb, var(--felt-edge) 55%, #000), 0 14px 22px rgb(0 0 0 / .25); perspective:500px; }
.rv-cell { aspect-ratio:1; border:0; padding:0; border-radius:3px; display:grid; place-items:center; cursor:default;
  background: var(--felt-tex), radial-gradient(120% 120% at 30% 20%, color-mix(in srgb, var(--felt) 90%, #fff), var(--felt) 55%, color-mix(in srgb, var(--felt) 85%, #000));
  box-shadow: inset 0 1px 2px rgb(0 0 0 / .3); }
.rv-cell.hint { cursor:pointer; }
.rv-cell.hint::after { content:""; width:28%; height:28%; border-radius:50%; background:rgb(255 255 255 / .35); box-shadow:inset 0 1px 2px rgb(0 0 0 / .3); }
.rv-cell.hint:hover::after, .rv-cell.hint:focus-visible::after { background:rgb(255 255 255 / .7); }
.rv-cell:focus-visible { outline:3px solid var(--sun); outline-offset:-3px; }
.rv-disc { --face: radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--disc) 45%, #fff) 0 10%, var(--disc) 50%, color-mix(in srgb, var(--disc) 72%, #000) 100%);
  width:82%; height:82%; border-radius:50%; background:var(--face);
  /* Отстрани личи другият цвят, както при истинските дискове. */
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--disc) 70%, #000), 0 2px 0 color-mix(in srgb, var(--disc) 45%, #000), 0 4px 0 var(--under, #000), 0 6px 5px rgb(0 0 0 / .35); }
.rv-coord { position:absolute; font:700 9px/1 var(--f-body); color:rgb(255 255 255 / .75); pointer-events:none; }
.rv-coord.file { top:1px; translate:-50% 0; }
.rv-coord.rank { left:2px; translate:0 -50%; }
.rv-star { position:absolute; width:7px; height:7px; margin:-3.5px 0 0 -3.5px; border-radius:50%; background:#13361f; box-shadow:0 1px 0 rgb(255 255 255 / .2); pointer-events:none; z-index:1; }
.rv-disc.last { outline:3px solid var(--sun); outline-offset:1px; }
/* Обръщане: първата половина е в стария цвят, втората в новия. */
.rv-disc.flip { animation:rvflip .5s cubic-bezier(.4,0,.2,1) both; }
@keyframes rvflip {
  0% { transform:rotateY(0) translateY(0); background:radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--from) 45%, #fff) 0 10%, var(--from) 50%, color-mix(in srgb, var(--from) 72%, #000) 100%); }
  49% { transform:rotateY(90deg) translateY(-6px); background:radial-gradient(circle at 36% 30%, color-mix(in srgb, var(--from) 45%, #fff) 0 10%, var(--from) 50%, color-mix(in srgb, var(--from) 72%, #000) 100%); }
  51% { transform:rotateY(90deg) translateY(-6px); background:var(--face); }
  100% { transform:rotateY(0) translateY(0); background:var(--face); }
}
.rv-art { display:grid; grid-template-columns:repeat(4,20px); gap:2px; padding:4px; background:var(--felt-edge); border-radius:10px; }
.rv-art span { width:20px; height:20px; background:var(--felt); border-radius:3px; display:grid; place-items:center; }
.rv-art i { width:15px; height:15px; border-radius:50%; }
@media (prefers-reduced-motion: reduce) { .rv-disc.flip { animation:none; } }
`,
};
