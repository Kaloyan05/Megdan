// Не се сърди човече — 2–4 играчи, 40 полета, 4 фигури на играч.
// Позиция на фигура (спрямо собствения старт): -1 база, 0..39 по пътя, 40..43 къщичка.
// Шестица изкарва от базата и дава още хвърляне. Без фигури на пътя имаш 3 опита за шестица.

import { createRng } from '../core/rng.js';

const TRACK = 40;
const HOME = 4;
const LAST = TRACK + HOME - 1; // 43

// Път на дъска 11×11 (колона, ред), започва от старта на ъгъл 0.
export const PATH = [
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
  [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10],
  [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5],
];
const HOMES = [
  [[1, 5], [2, 5], [3, 5], [4, 5]],
  [[5, 1], [5, 2], [5, 3], [5, 4]],
  [[9, 5], [8, 5], [7, 5], [6, 5]],
  [[5, 9], [5, 8], [5, 7], [5, 6]],
];
const BASES = [
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[9, 0], [10, 0], [9, 1], [10, 1]],
  [[9, 9], [10, 9], [9, 10], [10, 10]],
  [[0, 9], [1, 9], [0, 10], [1, 10]],
];
const cornersFor = (n) => (n === 2 ? [0, 2] : [0, 1, 2, 3].slice(0, n));
const absOf = (corner, rel) => (corner * 10 + rel) % TRACK;

function onTrack(s, seat) { return s.pieces[seat].some((r) => r >= 0 && r < TRACK); }

export function legalPieces(s) {
  if (s.phase !== 'move') return [];
  const seat = s.turn, die = s.die, mine = s.pieces[seat];
  const out = [];
  mine.forEach((rel, k) => {
    let target;
    if (rel === -1) { if (die !== 6) return; target = 0; }
    else if (rel >= LAST) return;
    else target = rel + die;
    if (target > LAST) return;
    if (mine.some((r, j) => j !== k && r === target)) return; // свое поле е заето
    if (target >= TRACK) {
      // в къщичката не се прескачат собствени фигури
      for (let x = Math.max(rel + 1, TRACK); x < target; x++) if (mine.includes(x)) return;
    }
    out.push(k);
  });
  return out;
}

const finished = (pieces) => pieces.every((r) => r >= TRACK);

export default {
  id: 'ludo',
  name: 'Не се сърди човече',
  icon: '🎯',
  blurb: 'Хвърли, тичай около дъската и чупи фигурите на другите.',
  rules: [
    'Всеки има 4 фигури в базата (или 2-3 при бърза игра). С шестица изкарваш фигура на старта.',
    'Хвърляш зар и местиш една фигура толкова полета. Шестица дава още хвърляне.',
    'Ако нямаш фигура на пътя, имаш 3 опита да хвърлиш шестица.',
    'Стъпиш ли върху чужда фигура, тя се връща в базата. Не се сърди!',
    'Печели първият, който прибере всичките си фигури в къщичката.',
  ],
  minPlayers: 2,
  maxPlayers: 4,
  moveSound: 'tap',

  options: [
    { id: 'pieces', label: 'Фигури', default: 4, choices: [{ value: 2, label: '2 (бърза игра)' }, { value: 3, label: '3' }, { value: 4, label: '4' }] },
  ],

  init: (seed, players, opts = {}) => ({
    seed: String(seed), players: players.slice(), corners: cornersFor(players.length),
    pieces: players.map(() => Array(opts.pieces ?? 4).fill(-1)), turn: 0, phase: 'roll', die: null, tries: 3, rollNo: 0,
    winner: null, last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (m?.type === 'roll') return s.phase === 'roll' ? { ok: true } : { ok: false, reason: 'move-first' };
    if (m?.type === 'move') {
      if (s.phase !== 'move') return { ok: false, reason: 'roll-first' };
      if (!legalPieces(s).includes(m.piece)) return { ok: false, reason: 'piece-blocked' };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m) {
    const s = { ...s0, pieces: s0.pieces.map((x) => x.slice()) };
    const n = s.players.length;
    const nextTurn = () => {
      s.turn = (s.turn + 1) % n;
      s.phase = 'roll'; s.die = null;
      s.tries = onTrack(s, s.turn) ? 1 : 3;
    };
    if (m.type === 'roll') {
      s.die = 1 + createRng(`${s.seed}:${s.rollNo}`).int(6);
      s.rollNo += 1;
      s.phase = 'move';
      s.last = { seat: s.turn, kind: 'roll', die: s.die };
      if (!legalPieces(s).length) {
        s.tries -= 1;
        if (s.die === 6 || s.tries <= 0) nextTurn();
        else { s.phase = 'roll'; }
        s.last.stuck = true;
      }
      return s;
    }
    const seat = s.turn;
    const rel = s.pieces[seat][m.piece];
    const target = rel === -1 ? 0 : rel + s.die;
    s.pieces[seat][m.piece] = target;
    s.last = { seat, kind: 'move', die: s.die, piece: m.piece, from: rel, to: target };
    if (target < TRACK) {
      const abs = absOf(s.corners[seat], target);
      s.pieces.forEach((list, other) => {
        if (other === seat) return;
        list.forEach((r, j) => {
          if (r >= 0 && r < TRACK && absOf(s.corners[other], r) === abs) { list[j] = -1; s.last.hit = other; }
        });
      });
    }
    if (finished(s.pieces[seat])) { s.winner = seat; s.phase = 'done'; return s; }
    if (s.die === 6) { s.phase = 'roll'; s.die = null; s.tries = 1; }
    else nextTurn();
    return s;
  },

  autoMove(s) {
    if (s.phase === 'roll') return { type: 'roll' };
    const legal = legalPieces(s);
    const seat = s.turn;
    const score = (k) => {
      const rel = s.pieces[seat][k];
      const target = rel === -1 ? 0 : rel + s.die;
      let v = rel === -1 ? 50 : target;
      if (target < TRACK) {
        const abs = absOf(s.corners[seat], target);
        if (s.pieces.some((list, o) => o !== seat && list.some((r) => r >= 0 && r < TRACK && absOf(s.corners[o], r) === abs))) v += 100;
      }
      return v;
    };
    return { type: 'move', piece: legal.slice().sort((a, b) => score(b) - score(a))[0] };
  },

  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.players[s.winner]),
  placements(s) {
    const prog = s.pieces.map((list, i) => (i === s.winner ? Infinity : list.reduce((a, r) => a + (r + 1), 0)));
    const sorted = [...new Set(prog)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(prog[i]) + 1]));
  },

  render(el, s, ctx) {
    const seatMe = s.players.indexOf(ctx.me);
    const myTurn = !ctx.over && seatMe === s.turn;
    const legal = new Set(myTurn ? legalPieces(s) : []);
    el.innerHTML = '';
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    const board = make('div', 'ld');
    board.setAttribute('role', 'group');
    board.setAttribute('aria-label', 'Дъска');
    const place = (node, [c, r]) => { node.style.gridColumn = String(c + 1); node.style.gridRow = String(r + 1); board.append(node); };
    PATH.forEach((xy, i) => {
      const cell = make('span', 'ld-cell');
      const startCorner = i % 10 === 0 ? i / 10 : -1;
      const seat = s.corners.indexOf(startCorner);
      if (seat >= 0) cell.style.setProperty('--tint', `var(--seat-${seat + 1})`), cell.classList.add('start');
      place(cell, xy);
    });
    s.corners.forEach((corner, seat) => {
      HOMES[corner].forEach((xy) => { const c = make('span', 'ld-cell home'); c.style.setProperty('--tint', `var(--seat-${seat + 1})`); place(c, xy); });
      BASES[corner].forEach((xy) => { const c = make('span', 'ld-cell base'); c.style.setProperty('--tint', `var(--seat-${seat + 1})`); place(c, xy); });
    });
    const dieCell = make('span', 'ld-center');
    if (s.die) dieCell.append(make('span', `dp-face f${s.die}`), ...[]);
    if (s.die) for (let k = 0; k < s.die; k++) dieCell.firstChild.append(make('i'));
    place(dieCell, [5, 5]);

    s.pieces.forEach((list, seat) => {
      const corner = s.corners[seat];
      list.forEach((rel, k) => {
        const xy = rel === -1 ? BASES[corner][k] : rel >= TRACK ? HOMES[corner][rel - TRACK] : PATH[absOf(corner, rel)];
        const can = seat === seatMe && legal.has(k);
        const pc = make(can ? 'button' : 'span', 'ld-piece' + (can ? ' can' : '') + (s.last?.seat === seat && s.last?.piece === k && s.last.kind === 'move' ? ' last' : ''));
        pc.style.setProperty('--p', `var(--seat-${seat + 1})`);
        if (can) {
          pc.type = 'button';
          pc.setAttribute('aria-label', `Фигура ${k + 1}${rel === -1 ? ' от базата' : ''}, премести`);
          pc.addEventListener('click', () => ctx.onMove({ type: 'move', piece: k }));
        } else pc.setAttribute('aria-hidden', 'true');
        place(pc, xy);
      });
    });

    const bar = make('div', 'ld-bar');
    const roll = make('button', 'btn btn-primary', 'Хвърли');
    roll.type = 'button';
    roll.disabled = !myTurn || s.phase !== 'roll';
    roll.addEventListener('click', () => ctx.onMove({ type: 'roll' }));
    let tip = '';
    const l = s.last;
    if (l?.kind === 'roll' && l.stuck) tip = `${ctx.nickOf(s.players[l.seat])} хвърли ${l.die} и няма ход.`;
    else if (l?.kind === 'move' && l.hit !== undefined) tip = `${ctx.nickOf(s.players[l.seat])} счупи ${ctx.nickOf(s.players[l.hit])}. Не се сърди!`;
    if (myTurn && s.phase === 'move') tip = `Хвърли ${s.die}. Докосни светещата фигура.`;
    else if (myTurn && s.phase === 'roll' && s.tries > 1) tip = `Опити за шестица: ${s.tries}.`;
    bar.append(roll, make('p', 'hint', tip));
    el.append(bar, board);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'ld-art';
    [1, 2, 3, 4].forEach((n) => { const s = document.createElement('span'); s.style.background = `var(--seat-${n})`; el.append(s); });
    return el;
  },

  css: `
.ld-bar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; justify-content:center; margin-bottom:10px; }
.ld-bar .hint { min-height:1.4em; }
.ld { display:grid; grid-template-columns:repeat(11,minmax(0,1fr)); grid-template-rows:repeat(11,auto); gap:3px; width:min(100%,440px); margin-inline:auto;
  padding:8px; background:var(--surface); border:2px solid var(--ink); border-radius:var(--r-lg); box-shadow:var(--shadow-pop); }
.ld-cell { aspect-ratio:1; border-radius:50%; background:var(--surface-2); box-shadow:inset 0 0 0 2px var(--line); grid-area:auto; }
.ld-cell.start, .ld-cell.home { background:color-mix(in srgb, var(--tint) 40%, var(--surface)); box-shadow:inset 0 0 0 2px var(--tint); }
.ld-cell.base { background:color-mix(in srgb, var(--tint) 18%, var(--surface)); box-shadow:inset 0 0 0 2px color-mix(in srgb, var(--tint) 60%, var(--surface)); }
.ld-center { display:grid; place-items:center; }
.ld-center .dp-face { width:100%; aspect-ratio:1; background:#fff; border:2px solid var(--ink); border-radius:6px; padding:2px; }
.ld-piece { z-index:1; place-self:center; width:76%; aspect-ratio:1; border-radius:50%; background:var(--p); border:2px solid var(--ink);
  box-shadow:inset 0 -3px 0 rgb(0 0 0 / .25); padding:0; }
.ld-piece.can { cursor:pointer; animation:ldpulse .8s ease-in-out infinite alternate; box-shadow:0 0 0 3px var(--sun), inset 0 -3px 0 rgb(0 0 0 / .25); }
.ld-piece.last { outline:2px solid var(--ink); outline-offset:1px; }
.ld-piece:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
@keyframes ldpulse { to { box-shadow:0 0 0 6px var(--sun), inset 0 -3px 0 rgb(0 0 0 / .25); } }
.ld-art { display:grid; grid-template-columns:repeat(2,26px); gap:8px; padding:8px; border:2px solid var(--ink); border-radius:10px; background:var(--surface); }
.ld-art span { width:26px; height:26px; border-radius:50%; border:2px solid var(--ink); }
@media (prefers-reduced-motion: reduce) { .ld-piece.can { animation:none; } }
`,
};
