// Не се сърди човече — 2–4 играчи, 40 полета, 4 фигури на играч.
// Позиция на фигура (спрямо собствения старт): -1 база, 0..39 по пътя, 40..43 къщичка.
// Шестица изкарва от базата и дава още хвърляне. Без фигури на пътя имаш 3 опита за шестица.

import { createRng } from '../core/rng.js';
import { dieEl } from '../ui/fx.js';

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
// Базите са в средата на цветния ъгъл (само за рисуване).
const BASES = [
  [[1, 1], [2, 1], [1, 2], [2, 2]],
  [[8, 1], [9, 1], [8, 2], [9, 2]],
  [[8, 8], [9, 8], [8, 9], [9, 9]],
  [[1, 8], [2, 8], [1, 9], [2, 9]],
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
          if (r >= 0 && r < TRACK && absOf(s.corners[other], r) === abs) { list[j] = -1; s.last.hit = other; s.last.hitPiece = j; }
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

    const fresh = Boolean(ctx.last?.fresh && s.last);
    const lm = fresh && s.last.kind === 'move' ? s.last : null;
    // Ключ на клетката, в която стои фигура k на мястото seat при позиция rel.
    const cellKey = (seat, rel, k) => {
      const corner = s.corners[seat];
      if (rel === -1) return `ld-b${corner}-${k}`;
      if (rel >= TRACK) return `ld-h${corner}-${rel - TRACK}`;
      return `ld-p${absOf(corner, rel)}`;
    };
    const board = make('div', 'ld');
    board.setAttribute('role', 'group');
    board.setAttribute('aria-label', 'Дъска');
    const place = (node, [c, r]) => { node.style.gridColumn = String(c + 1); node.style.gridRow = String(r + 1); board.append(node); };
    // Класическа дъска: цветни ъгли с „двор“ за базата и цветен център към къщичките.
    const seatOfCorner = (corner) => s.corners.indexOf(corner);
    const tintOf = (corner) => (seatOfCorner(corner) >= 0 ? `var(--seat-${seatOfCorner(corner) + 1})` : '#b9ad95');
    [[0, 0], [7, 0], [7, 7], [0, 7]].forEach(([c0, r0], corner) => {
      const q = make('span', 'ld-quad');
      q.style.gridColumn = `${c0 + 1} / span 4`; q.style.gridRow = `${r0 + 1} / span 4`;
      q.style.setProperty('--tint', tintOf(corner));
      board.append(q);
      const [bc, br] = BASES[corner][0];
      const yard = make('span', 'ld-yard');
      yard.style.gridColumn = `${bc + 1} / span 2`; yard.style.gridRow = `${br + 1} / span 2`;
      yard.style.setProperty('--tint', tintOf(corner));
      board.append(yard);
    });
    const mid = make('span', 'ld-mid');
    mid.style.gridColumn = '5 / span 3'; mid.style.gridRow = '5 / span 3';
    mid.style.setProperty('--t0', tintOf(0)); mid.style.setProperty('--t1', tintOf(1)); mid.style.setProperty('--t2', tintOf(2)); mid.style.setProperty('--t3', tintOf(3));
    board.append(mid);
    PATH.forEach((xy, i) => {
      const cell = make('span', 'ld-cell');
      cell.dataset.fx = `ld-p${i}`;
      const startCorner = i % 10 === 0 ? i / 10 : -1;
      const seat = s.corners.indexOf(startCorner);
      if (seat >= 0) cell.style.setProperty('--tint', `var(--seat-${seat + 1})`), cell.classList.add('start');
      if (startCorner >= 0) cell.style.setProperty('--rot', `${startCorner * 90}deg`);
      place(cell, xy);
    });
    s.corners.forEach((corner, seat) => {
      HOMES[corner].forEach((xy, j) => { const c = make('span', 'ld-cell home'); c.dataset.fx = `ld-h${corner}-${j}`; c.style.setProperty('--tint', `var(--seat-${seat + 1})`); place(c, xy); });
      BASES[corner].forEach((xy, j) => { const c = make('span', 'ld-cell base'); c.dataset.fx = `ld-b${corner}-${j}`; c.style.setProperty('--tint', `var(--seat-${seat + 1})`); place(c, xy); });
    });
    const dieCell = make('span', 'ld-center');
    const shownDie = s.die ?? s.last?.die;
    if (shownDie) {
      const d = dieEl(shownDie, { roll: fresh && s.last.kind === 'roll', cls: s.die ? '' : 'used' });
      d.style.setProperty('--die', 'color-mix(in srgb, var(--seat-' + ((s.last?.seat ?? 0) + 1) + ') 14%, #fff)');
      dieCell.append(d);
    }
    place(dieCell, [5, 5]);

    s.pieces.forEach((list, seat) => {
      const corner = s.corners[seat];
      list.forEach((rel, k) => {
        const xy = rel === -1 ? BASES[corner][k] : rel >= TRACK ? HOMES[corner][rel - TRACK] : PATH[absOf(corner, rel)];
        const can = seat === seatMe && legal.has(k);
        const pc = make(can ? 'button' : 'span', 'ld-piece' + (can ? ' can' : '') + (s.last?.seat === seat && s.last?.piece === k && s.last.kind === 'move' ? ' last' : ''));
        pc.style.setProperty('--p', `var(--seat-${seat + 1})`);
        // Фигурата подскача клетка по клетка; ударената се връща в базата след това.
        if (lm && lm.seat === seat && lm.piece === k) {
          const path = lm.from === -1 ? [cellKey(seat, -1, k)] : Array.from({ length: lm.to - lm.from }, (_, i) => cellKey(seat, lm.from + i, k));
          pc.dataset.fxPath = path.join(',');
        }
        if (lm && lm.hit === seat && lm.hitPiece === k) {
          pc.dataset.fxFrom = cellKey(lm.seat, lm.to, lm.piece);
          pc.dataset.fxDelay = String(260 + Math.max(1, lm.to - lm.from) * 170);
        }
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
.ld { position:relative; display:grid; grid-template-columns:repeat(11,minmax(0,1fr)); grid-template-rows:repeat(11,auto); gap:3px; width:min(100%,440px); margin-inline:auto;
  padding:12px; border-radius:18px; border:2px solid #3a200c;
  background: var(--grain), linear-gradient(160deg,#fbf0d9,#f0dcb4);
  box-shadow: inset 0 0 0 7px #b0753c, inset 0 0 0 9px #6b3d1b, inset 0 3px 10px rgb(80 45 10 / .25), 0 8px 0 #4a2810, 0 16px 26px rgb(40 20 5 / .3); }
.ld::before { content:''; position:absolute; inset:2px; border-radius:16px; background:var(--wood); opacity:.55; pointer-events:none; mask: linear-gradient(#000 0 0) exclude, linear-gradient(#000 0 0) content-box; padding:7px; }
/* Ъгъл в цвета на играча и бял двор за базата. */
.ld-quad { z-index:0; margin:-2px; border-radius:14px; background:
  radial-gradient(120% 120% at 30% 25%, color-mix(in srgb, var(--tint) 55%, #fff), color-mix(in srgb, var(--tint) 85%, #000));
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tint) 60%, #000), inset 0 2px 0 rgb(255 255 255 / .35); }
.ld-yard { z-index:0; margin:-5px; border-radius:50%; background:radial-gradient(circle at 45% 40%, #fffaf0, #efe2c4);
  box-shadow: inset 0 3px 6px rgb(60 30 0 / .3), 0 0 0 3px rgb(255 255 255 / .55); }
.ld-mid { z-index:0; margin:-1px; border-radius:6px; background: conic-gradient(from -45deg, var(--t1) 0 25%, var(--t2) 0 50%, var(--t3) 0 75%, var(--t0) 0);
  opacity:.55; box-shadow: inset 0 0 0 2px rgb(0 0 0 / .2); }
.ld > .ld-cell, .ld > .ld-piece, .ld > .ld-center { position:relative; z-index:1; }
.ld-cell.start::after { content:'›'; position:absolute; inset:0; display:grid; place-items:center; color:#fff; font:800 clamp(.8rem,4vw,1.2rem)/1 var(--f-display);
  transform:rotate(var(--rot)); text-shadow:0 1px 1px rgb(0 0 0 / .4); }
/* Клетки: вдлъбнати гнезда. */
.ld-cell { aspect-ratio:1; border-radius:50%; grid-area:auto; background:radial-gradient(circle at 50% 40%, #fffaf0, #eadbbd);
  box-shadow: inset 0 2px 3px rgb(80 50 10 / .3), inset 0 -1px 0 rgb(255 255 255 / .8), 0 0 0 1.5px rgb(120 80 30 / .35); }
.ld-cell.start, .ld-cell.home { background:radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--tint) 45%, #fff), color-mix(in srgb, var(--tint) 70%, #fff));
  box-shadow: inset 0 2px 3px rgb(0 0 0 / .25), 0 0 0 2px var(--tint); }
.ld-cell.base { background:radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--tint) 18%, #fff), color-mix(in srgb, var(--tint) 32%, #fff));
  box-shadow: inset 0 2px 3px rgb(0 0 0 / .2), 0 0 0 2px color-mix(in srgb, var(--tint) 60%, #fff); }
.ld-center { display:grid; place-items:center; --die-size:100%; }
.ld-center .die3d { width:92%; padding:12%; }
/* Пионка, гледана отгоре: основа, вдлъбнатина и глава. */
.ld-piece { --edge: color-mix(in srgb, var(--p) 50%, #000); z-index:2 !important; place-self:center; width:80%; aspect-ratio:1; border-radius:50%; padding:0; position:relative;
  border:1px solid rgb(0 0 0 / .5);
  background:
    radial-gradient(circle at 42% 36%, color-mix(in srgb, var(--p) 30%, #fff) 0 9%, color-mix(in srgb, var(--p) 85%, #fff) 16%, var(--p) 30%, color-mix(in srgb, var(--p) 65%, #000) 38%, transparent 40%),
    radial-gradient(circle at 40% 32%, color-mix(in srgb, var(--p) 55%, #fff) 0 18%, var(--p) 55%, color-mix(in srgb, var(--p) 70%, #000) 100%);
  box-shadow: 0 2px 0 var(--edge), 0 4px 5px rgb(0 0 0 / .35); transition: transform .2s cubic-bezier(.2,1.4,.4,1); }
.ld-piece.can { cursor:pointer; animation:ldpulse .8s ease-in-out infinite alternate; }
.ld-piece.last { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--edge), 0 2px 0 var(--edge), 0 4px 5px rgb(0 0 0 / .35); }
.ld-piece:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
/* Без transform: движещ се бутон е трудно докосваем (и нестабилен за тестовете). */
@keyframes ldpulse { from { box-shadow:0 0 0 3px var(--sun), 0 2px 0 var(--edge), 0 4px 5px rgb(0 0 0 / .35); }
  to { box-shadow:0 0 0 7px var(--sun), 0 2px 0 var(--edge), 0 4px 5px rgb(0 0 0 / .35); } }
.ld-art { display:grid; grid-template-columns:repeat(2,26px); gap:8px; padding:8px; border:2px solid var(--ink); border-radius:10px; background:var(--surface); }
.ld-art span { width:26px; height:26px; border-radius:50%; border:2px solid var(--ink); }
@media (prefers-reduced-motion: reduce) { .ld-piece.can { animation:none; } }
`,
};
