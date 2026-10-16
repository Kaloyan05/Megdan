// Ултимат морски шах — 9 малки дъски в една голяма, 2 играчи.
// Полето, в което играеш в малката дъска, определя в коя малка дъска играе противникът.
// Ако тя е решена, противникът играе където иска. Спечели три малки в редица.

import { bestBy } from '../core/bots.js';

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

  // Хитър бот: печели игра или малка дъска, блокира, не праща противника там, където печели.
  botMove(s, p, rng, level = 'medium') {
    const me = s.turn, opp = 1 - me;
    const cells = validCells(s);
    const canWinSmall = (cellsArr, b, who) => {
      for (let c = 0; c < 9; c++) {
        const i = b * 9 + c;
        if (cellsArr[i] !== null) continue;
        const local = cellsArr.slice(b * 9, b * 9 + 9);
        local[c] = who;
        if (lineWinner(local) === who) return true;
      }
      return false;
    };
    const noise = cells.map(() => rng.next());
    const score = (i) => {
      const b = Math.floor(i / 9), c = i % 9;
      const next = this.applyMove(s, { cell: i }, p);
      let v = noise[cells.indexOf(i)];
      if (next.winner === me) return 10000;
      if (next.small[b] === me) v += 40;
      const local = s.cells.slice(b * 9, b * 9 + 9);
      local[c] = opp;
      if (lineWinner(local) === opp) v += 25;
      if (next.forced === null) v -= 15;
      else if (canWinSmall(next.cells, next.forced, opp)) v -= 30;
      if (c === 4) v += 2;
      if (b === 4) v += 3;
      if (level === 'hard' && next.winner === null) {
        // Може ли противникът да спечели играта или малка дъска веднага след този ход?
        for (const j of validCells(next)) {
          const after = this.applyMove(next, { cell: j }, s.players[opp]);
          if (after.winner === opp) { v -= 5000; break; }
          if (after.small[Math.floor(j / 9)] === opp && next.small[Math.floor(j / 9)] === null) v -= 6;
        }
      }
      return v;
    };
    return { cell: bestBy(cells, score) };
  },
  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.winner === 'draw' ? 'draw' : s.players[s.winner]),

  render(el, s, ctx) {
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    const open = new Set(myTurn ? playableBoards(s) : []);
    const name = (v) => (v === 0 ? '✕' : '◯');
    const fresh = Boolean(ctx.last?.fresh);
    const sc = ctx.scratch ?? {};
    const prevSmall = sc.utSmall ?? s.small;
    sc.utSmall = s.small.slice();
    // Знак като щрих с тебешир: SVG, който може да се „изпише“.
    const NS = 'http://www.w3.org/2000/svg';
    const markSvg = (v, draw, cls = 'ut-mark') => {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('class', `${cls}${draw ? ' draw' : ''}`);
      svg.setAttribute('aria-hidden', 'true');
      svg.style.setProperty('--m', `var(--seat-${v + 1})`);
      const add = (d, delay = 0) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('d', d);
        p.setAttribute('pathLength', '1');
        if (delay) p.style.animationDelay = `${delay}ms`;
        svg.append(p);
      };
      if (v === 0) { add('M4.5 4.5 L15.5 15.5'); add('M15.5 4.5 L4.5 15.5', 160); } else add('M10 3.6 a6.4 6.4 0 1 1 -0.01 0');
      return svg;
    };
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
        if (v !== null) btn.append(markSvg(v, fresh && i === s.last));
        btn.disabled = !open.has(b) || v !== null || decided !== null;
        btn.setAttribute('aria-label', `Дъска ${b + 1}, поле ${c + 1}${v !== null ? `, ${name(v)}` : ''}`);
        btn.addEventListener('click', () => ctx.onMove({ cell: i }));
        sb.append(btn);
      }
      if (decided !== null) {
        const won = fresh && prevSmall[b] === null;
        if (decided === 'draw') {
          const o = document.createElement('span');
          o.className = 'ut-over draw-txt';
          o.textContent = '=';
          sb.append(o);
        } else {
          const o = markSvg(decided, won, 'ut-over');
          if (won) o.querySelectorAll('path').forEach((p) => { p.style.animationDelay = `${parseInt(p.style.animationDelay || '0', 10) + 380}ms`; });
          sb.append(o);
        }
      }
      big.append(sb);
    }
    // Поставка с тебешири и гъба под дъската.
    const tray = document.createElement('div');
    tray.className = 'ut-tray';
    tray.innerHTML = '<i class="chalk c0"></i><i class="chalk c1"></i><i class="chalk c2"></i><b class="sponge"></b>';
    el.append(big, tray);
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
/* Черна дъска с тебешир: дървена рамка, бели линии, цветни щрихи. */
.ut { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; width:min(100%,440px); margin-inline:auto; padding:12px; border-radius:14px;
  background: var(--felt-tex), radial-gradient(60% 40% at 70% 70%, rgb(255 255 255 / .05), transparent), radial-gradient(120% 100% at 30% 20%, #3c5a4c, #2a4136 60%, #213429);
  box-shadow: inset 0 0 0 7px #8a5a2c, inset 0 0 0 9px #5a3214, inset 0 0 30px rgb(0 0 0 / .45), 0 7px 0 #3a200c, 0 14px 22px rgb(0 0 0 / .25); }
.ut-small { position:relative; min-width:0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; padding:6px; transition: background-color .3s; }
.ut-small:nth-child(3n+1), .ut-small:nth-child(3n+2) { border-right: 3px solid rgb(240 240 230 / .75); }
.ut-small:nth-child(-n+6) { border-bottom: 3px solid rgb(240 240 230 / .75); }
.ut-small.open { background: rgb(255 199 67 / .2); box-shadow: inset 0 0 0 2px rgb(255 199 67 / .85); animation: utOpen 1.6s ease-in-out infinite alternate; }
@keyframes utOpen { to { background: rgb(255 199 67 / .3); } }
.ut-small.done .ut-cell { opacity:.28; }
.ut-cell { min-width:0; aspect-ratio:1; border:0; padding:8%; background:none; cursor:pointer; display:grid; place-items:center; }
.ut-cell:nth-child(3n+1), .ut-cell:nth-child(3n+2) { border-right:1.5px solid rgb(240 240 230 / .38); }
.ut-cell:nth-child(-n+6) { border-bottom:1.5px solid rgb(240 240 230 / .38); }
.ut-cell:disabled { cursor:default; }
.ut-small.open .ut-cell:not(:disabled):hover { background: rgb(255 255 255 / .12); }
.ut-cell.last { background: rgb(255 255 255 / .1); border-radius:4px; }
.ut-cell:focus-visible { outline:3px solid var(--focus); outline-offset:-2px; }
.ut-mark { width:100%; height:100%; overflow:visible; }
.ut-mark path, .ut-over path { fill:none; stroke:color-mix(in srgb, var(--m) 70%, #fff); stroke-width:2.6; stroke-linecap:round; filter: drop-shadow(0 0 1px rgb(255 255 255 / .35)); }
.ut-mark.draw path, .ut-over.draw path { stroke-dasharray:1; stroke-dashoffset:1; animation: utDraw .28s ease-out forwards; }
@keyframes utDraw { to { stroke-dashoffset:0; } }
.ut-over { position:absolute; inset:8%; width:84%; height:84%; pointer-events:none; overflow:visible; }
.ut-over path { stroke-width:2.2; }
.ut-over.draw path { animation-duration:.5s; }
.ut-over.draw-txt { display:grid; place-items:center; font:800 clamp(2.4rem,14vw,4.4rem)/1 var(--f-display); color:rgb(240 240 230 / .8); width:auto; height:auto; inset:0; }
.ut-tray { position:relative; width:min(92%,404px); height:16px; margin:-4px auto 0; border-radius:0 0 8px 8px;
  background: var(--wood), linear-gradient(180deg,#8a5a2c,#5a3214); box-shadow: 0 6px 10px rgb(0 0 0 / .25); }
.ut-tray .chalk { position:absolute; top:3px; height:7px; border-radius:3px; box-shadow:0 1px 1px rgb(0 0 0 / .3); }
.ut-tray .c0 { left:12%; width:42px; background:linear-gradient(#fff,#e2e2dc); transform:rotate(-3deg); }
.ut-tray .c1 { left:30%; width:30px; background:linear-gradient(#ffd0d0,#e59a9a); }
.ut-tray .c2 { left:42%; width:24px; background:linear-gradient(#cfe0ff,#93b2e8); transform:rotate(4deg); }
.ut-tray .sponge { position:absolute; right:10%; top:-4px; width:54px; height:14px; border-radius:4px; background:linear-gradient(#e9c46a 0 45%, #3b3b3b 45%); box-shadow:0 2px 2px rgb(0 0 0 / .35); }
@media (prefers-reduced-motion: reduce) { .ut-small.open { animation:none; } .ut-mark.draw path, .ut-over.draw path { animation:none; stroke-dashoffset:0; } }
.ut-art { display:grid; grid-template-columns:repeat(3,24px); gap:3px; padding:5px; background:var(--ink); border-radius:10px; }
.ut-art span { height:24px; background:var(--surface); border-radius:4px; display:grid; place-items:center; font:800 .9rem/1 var(--f-display); }
.ut-art span.hot { background:var(--sun); }
`,
};
