// Ултимат морски шах — 9 малки дъски в една голяма, 2 играчи.
// Полето, в което играеш в малката дъска, определя в коя малка дъска играе противникът.
// Ако тя е решена, противникът играе където иска. Спечели три малки в редица.

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

function lineWinner(cells) {
  for (const [a, b, c] of LINES) if (cells[a] !== null && cells[a] !== 'draw' && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
  return null;
}

const playableBoards = (s) => (s.forced !== null ? [s.forced] : [...Array(9).keys()].filter((b) => s.small[b] === null));
const validCells = (s) => playableBoards(s).flatMap((b) => [...Array(9).keys()].map((c) => b * 9 + c).filter((i) => s.cells[i] === null));

export default {
  id: 'uttt',
  name: 'Ултимат морски шах',
  icon: '#',
  blurb: 'Морски шах в морски шах. Ходът ти праща противника.',
  rules: [
    'Голямата дъска има 9 малки. Слагаш знак в поле на малка дъска.',
    'Полето, в което играеш, казва в коя малка дъска играе противникът. Тя е оградена.',
    'Три в редица в малка дъска я печелят. Ако противникът трябва да играе в решена дъска, избира свободно.',
    'Печели който вземе три малки дъски в редица.',
  ],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'tap',

  init: (seed, players) => ({
    players: players.slice(), cells: Array(81).fill(null), small: Array(9).fill(null),
    forced: null, turn: 0, winner: null, last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(m?.cell) || m.cell < 0 || m.cell > 80) return { ok: false, reason: 'bad-cell' };
    const b = Math.floor(m.cell / 9);
    if (s.small[b] !== null) return { ok: false, reason: 'board-closed' };
    if (s.forced !== null && b !== s.forced) return { ok: false, reason: 'wrong-board' };
    if (s.cells[m.cell] !== null) return { ok: false, reason: 'cell-taken' };
    return { ok: true };
  },

  applyMove(s, m) {
    const cells = s.cells.slice();
    const small = s.small.slice();
    cells[m.cell] = s.turn;
    const b = Math.floor(m.cell / 9), c = m.cell % 9;
    const local = cells.slice(b * 9, b * 9 + 9);
    const w = lineWinner(local);
    if (w !== null) small[b] = w;
    else if (local.every((x) => x !== null)) small[b] = 'draw';
    let winner = lineWinner(small);
    if (winner === null && small.every((x) => x !== null)) winner = 'draw';
    const forced = small[c] === null ? c : null;
    return { ...s, cells, small, forced, winner, last: m.cell, turn: 1 - s.turn };
  },

  autoMove: (s, p, rng) => ({ cell: rng.pick(validCells(s)) }),
  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.winner === 'draw' ? 'draw' : s.players[s.winner]),

  render(el, s, ctx) {
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    const open = new Set(myTurn ? playableBoards(s) : []);
    const mark = (v) => (v === 0 ? '✕' : '◯');
    el.innerHTML = '';
    const big = document.createElement('div');
    big.className = 'ut';
    big.setAttribute('role', 'group');
    big.setAttribute('aria-label', 'Голяма дъска');
    for (let b = 0; b < 9; b++) {
      const sb = document.createElement('div');
      const decided = s.small[b];
      sb.className = 'ut-small' + (open.has(b) ? ' open' : '') + (decided !== null ? ' done' : '');
      for (let c = 0; c < 9; c++) {
        const i = b * 9 + c;
        const btn = document.createElement('button');
        btn.className = 'ut-cell' + (i === s.last ? ' last' : '');
        const v = s.cells[i];
        if (v !== null) { btn.textContent = mark(v); btn.style.color = `var(--seat-${v + 1})`; }
        btn.disabled = !open.has(b) || v !== null || decided !== null;
        btn.setAttribute('aria-label', `Дъска ${b + 1}, поле ${c + 1}${v !== null ? `, ${mark(v)}` : ''}`);
        btn.addEventListener('click', () => ctx.onMove({ cell: i }));
        sb.append(btn);
      }
      if (decided !== null) {
        const o = document.createElement('span');
        o.className = 'ut-over';
        o.textContent = decided === 'draw' ? '=' : mark(decided);
        if (decided !== 'draw') o.style.color = `var(--seat-${decided + 1})`;
        sb.append(o);
      }
      big.append(sb);
    }
    el.append(big);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'ut-art';
    const marks = ['✕', '', '◯', '', '✕', '', '◯', '', '✕'];
    marks.forEach((m, i) => {
      const s = document.createElement('span');
      s.textContent = m;
      if (m) s.style.color = `var(--seat-${m === '✕' ? 1 : 2})`;
      if (i === 4) s.className = 'hot';
      el.append(s);
    });
    return el;
  },

  css: `
.ut { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; width:min(100%,440px); margin-inline:auto; padding:6px;
  background:var(--ink); border-radius:var(--r-lg); box-shadow:var(--shadow-pop); }
.ut-small { position:relative; min-width:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:2px; padding:3px; border-radius:10px; background:var(--surface-2); }
.ut-small.open { background:var(--sun); }
.ut-small.done .ut-cell { opacity:.35; }
.ut-cell { min-width:0; aspect-ratio:1; border:0; padding:0; border-radius:6px; background:var(--surface); font:800 clamp(.9rem,4.4vw,1.4rem)/1 var(--f-display); cursor:pointer; display:grid; place-items:center; }
.ut-cell:disabled { cursor:default; }
.ut-cell.last { box-shadow:inset 0 0 0 2px var(--ink); }
.ut-cell:focus-visible { outline:3px solid var(--focus); outline-offset:-2px; }
.ut-over { position:absolute; inset:0; display:grid; place-items:center; font:800 clamp(2.4rem,14vw,4.4rem)/1 var(--f-display); pointer-events:none; color:var(--ink-2); }
.ut-art { display:grid; grid-template-columns:repeat(3,24px); gap:3px; padding:5px; background:var(--ink); border-radius:10px; }
.ut-art span { height:24px; background:var(--surface); border-radius:4px; display:grid; place-items:center; font:800 .9rem/1 var(--f-display); }
.ut-art span.hot { background:var(--sun); }
`,
};
