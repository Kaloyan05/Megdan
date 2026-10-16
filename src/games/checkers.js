// Дама (руски правила) — 8×8, 2 играчи. Играе се само по тъмните полета.
// Поле: null или число = играч + (дама ? 2 : 0). Играч 0 започва отдолу и върви нагоре.
// Вземането е задължително; многократно вземане става на стъпки ({from, to}), с една и съща фигура.
// Взетите фигури остават на дъската до края на поредицата (не могат да се прескочат два пъти).
// Пул, стигнал последния ред по време на вземане, става дама и продължава като дама.

import { bestBy } from '../core/bots.js';

const N = 8;
const DIRS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const QUIET_LIMIT = 30; // хода подред само с дами без вземане → реми
const PLY_LIMIT = 400;

const xy = (i) => [i % N, Math.floor(i / N)];
const idx = (x, y) => (x < 0 || x >= N || y < 0 || y >= N ? -1 : y * N + x);
const ownerOf = (v) => (v === null ? null : v % 2);
const isKing = (v) => v !== null && v >= 2;
const forward = (seat) => (seat === 0 ? -1 : 1);

function captureSteps(s, from) {
  const v = s.board[from];
  const seat = ownerOf(v);
  const [x, y] = xy(from);
  const taken = new Set(s.taken);
  const out = [];
  for (const [dx, dy] of DIRS) {
    if (!isKing(v)) {
      if (!s.back && dy !== forward(seat)) continue;
      const over = idx(x + dx, y + dy), land = idx(x + 2 * dx, y + 2 * dy);
      if (over < 0 || land < 0) continue;
      const ov = s.board[over];
      if (ov !== null && ownerOf(ov) !== seat && !taken.has(over) && s.board[land] === null) out.push({ from, to: land, over });
      continue;
    }
    // дама
    let cx = x + dx, cy = y + dy;
    if (s.flying) while (idx(cx, cy) >= 0 && s.board[idx(cx, cy)] === null) { cx += dx; cy += dy; }
    const over = idx(cx, cy);
    if (over < 0) continue;
    const ov = s.board[over];
    if (ov === null || ownerOf(ov) === seat || taken.has(over)) continue;
    let lx = cx + dx, ly = cy + dy;
    while (idx(lx, ly) >= 0 && s.board[idx(lx, ly)] === null) {
      out.push({ from, to: idx(lx, ly), over });
      if (!s.flying) break;
      lx += dx; ly += dy;
    }
  }
  return out;
}

function quietSteps(s, from) {
  const v = s.board[from];
  const seat = ownerOf(v);
  const [x, y] = xy(from);
  const out = [];
  for (const [dx, dy] of DIRS) {
    if (!isKing(v) && dy !== forward(seat)) continue;
    let cx = x + dx, cy = y + dy;
    while (idx(cx, cy) >= 0 && s.board[idx(cx, cy)] === null) {
      out.push({ from, to: idx(cx, cy), over: null });
      if (!isKing(v) || !s.flying) break;
      cx += dx; cy += dy;
    }
  }
  return out;
}

export function legalSteps(s) {
  if (s.winner !== null) return [];
  if (s.chain !== null) return captureSteps(s, s.chain);
  const mine = [];
  for (let i = 0; i < N * N; i++) if (ownerOf(s.board[i]) === s.turn) mine.push(i);
  const caps = mine.flatMap((i) => captureSteps(s, i));
  if (caps.length) return caps;
  return mine.flatMap((i) => quietSteps(s, i));
}

function startBoard() {
  const b = Array(N * N).fill(null);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if ((x + y) % 2 !== 1) continue;
    if (y <= 2) b[idx(x, y)] = 1;
    if (y >= 5) b[idx(x, y)] = 0;
  }
  return b;
}

function step(s0, st) {
  const s = { ...s0, board: s0.board.slice(), taken: s0.taken.slice() };
  const seat = s.turn;
  let v = s.board[st.from];
  s.board[st.from] = null;
  const [, ty] = xy(st.to);
  const promote = !isKing(v) && ty === (seat === 0 ? 0 : N - 1);
  if (promote) v += 2;
  s.board[st.to] = v;
  s.ply += 1;
  s.last = { from: st.from, to: st.to, seat, capture: st.over !== null, promoted: promote };
  if (st.over !== null) {
    s.taken.push(st.over);
    s.quiet = 0;
    const more = captureSteps({ ...s, chain: st.to }, st.to);
    if (more.length) { s.chain = st.to; return s; }
    for (const t of s.taken) s.board[t] = null;
    s.taken = [];
  } else {
    s.quiet = isKing(s0.board[st.from]) ? s.quiet + 1 : 0;
  }
  s.chain = null;
  s.turn = 1 - seat;
  if (!legalSteps(s).length) s.winner = seat;
  else if (s.quiet >= QUIET_LIMIT || s.ply >= PLY_LIMIT) s.winner = 'draw';
  return s;
}

// Оценка за бота: материал + напредване + центъра.
function evaluate(s, seat) {
  let v = 0;
  for (let i = 0; i < N * N; i++) {
    const p = s.board[i];
    if (p === null || s.taken.includes(i)) continue;
    const [x, y] = xy(i);
    let w = isKing(p) ? 3.2 : 1 + (ownerOf(p) === 0 ? (7 - y) : y) * 0.06;
    if (x >= 2 && x <= 5 && y >= 2 && y <= 5) w += 0.08;
    v += ownerOf(p) === seat ? w : -w;
  }
  return v;
}

function search(s, seat, depth, alpha, beta) {
  if (s.winner !== null) return s.winner === 'draw' ? 0 : s.winner === seat ? 1000 + depth : -1000 - depth;
  if (depth === 0) return evaluate(s, seat);
  const steps = legalSteps(s);
  const maximize = s.turn === seat;
  let best = maximize ? -Infinity : Infinity;
  for (const st of steps) {
    const v = search(step(s, st), seat, depth - 1, alpha, beta);
    if (maximize) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

export default {
  id: 'checkers',
  name: 'Дама',
  icon: '⛀',
  blurb: 'Руска дама: задължително вземане и летящи дами.',
  rules: [
    'Играе се само по тъмните полета. Пулът се мести по диагонал напред с едно поле.',
    'Вземането е задължително: прескачаш чужда фигура на празното поле зад нея. Ако можеш да вземеш пак, продължаваш със същата фигура.',
    'Пулът взема напред и назад. Ако има няколко възможности, избираш коя.',
    'Пул, стигнал последния ред, става дама. Дамата се движи и взема по цял диагонал.',
    'Губи този, който няма фигури или не може да направи ход. 30 хода подред само с дами и без вземане са реми.',
  ],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'tap',
  options: [
    { id: 'flying', label: 'Летяща дама', default: true, choices: [{ value: true, label: 'Да' }, { value: false, label: 'Не, по едно поле' }] },
    { id: 'back', label: 'Пулът взема назад', default: true, choices: [{ value: true, label: 'Да' }, { value: false, label: 'Не' }] },
  ],

  init: (seed, players, opts = {}) => ({
    players: players.slice(), board: startBoard(), turn: 0, chain: null, taken: [],
    flying: opts.flying ?? true, back: opts.back ?? true, quiet: 0, ply: 0, winner: null, last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(m?.from) || !Number.isInteger(m?.to)) return { ok: false, reason: 'bad-move' };
    const steps = legalSteps(s);
    if (steps.some((x) => x.from === m.from && x.to === m.to)) return { ok: true };
    if (s.chain !== null && m.from !== s.chain) return { ok: false, reason: 'continue-capture' };
    if (steps.some((x) => x.over !== null)) return { ok: false, reason: 'must-capture' };
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s, m) {
    const st = legalSteps(s).find((x) => x.from === m.from && x.to === m.to);
    return step(s, st);
  },

  autoMove(s, p, rng) {
    const st = rng.pick(legalSteps(s));
    return { from: st.from, to: st.to };
  },

  botMove(s, p, rng, level = 'medium') {
    const seat = s.turn;
    const steps = legalSteps(s);
    const depth = level === 'hard' ? 5 : 2;
    const noise = steps.map(() => rng.next() * (level === 'hard' ? 0.01 : 0.3));
    const pick = bestBy(steps, (st) => search(step(s, st), seat, depth - 1, -Infinity, Infinity) + noise[steps.indexOf(st)]);
    return { from: pick.from, to: pick.to };
  },

  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.winner === 'draw' ? 'draw' : s.players[s.winner]),
  status(s, me, nickOf) {
    if (s.winner !== null) return null;
    const mine = s.players[s.turn] === me;
    if (s.chain !== null) return mine ? 'Твой ход: вземи пак' : `${nickOf(s.players[s.turn])} взема пак`;
    return null;
  },

  render(el, s, ctx) {
    const seatMe = s.players.indexOf(ctx.me);
    const flip = seatMe === 1;
    const myTurn = !ctx.over && seatMe === s.turn;
    const steps = myTurn ? legalSteps(s) : [];
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const sel = ctx.scratch ?? {};
    if (sel.ply !== s.ply) { sel.ply = s.ply; sel.from = s.chain; }
    const mustCapture = steps.some((x) => x.over !== null);

    const draw = () => {
      el.innerHTML = '';
      const sources = new Set(steps.map((x) => x.from));
      const targets = new Map(sel.from === null ? [] : steps.filter((x) => x.from === sel.from).map((x) => [x.to, x]));
      const counts = [0, 1].map((seat) => s.board.filter((v, i) => ownerOf(v) === seat && !s.taken.includes(i)).length);
      const top = make('div', 'rv-score');
      s.players.forEach((pl, i) => {
        const item = make('span', 'rv-score-item');
        const dot = make('span', 'disc-dot');
        dot.style.setProperty('--disc', `var(--seat-${i + 1})`);
        item.append(dot, make('span', null, `${ctx.nickOf(pl)}: ${counts[i]}`));
        top.append(item);
      });
      if (myTurn && mustCapture) top.append(make('span', 'rv-note', s.chain !== null ? 'Продължи вземането със същата фигура.' : 'Има задължително вземане.'));
      const board = make('div', 'ck');
      board.setAttribute('role', 'group');
      board.setAttribute('aria-label', 'Дъска за дама');
      for (let vi = 0; vi < N * N; vi++) {
        const i = flip ? N * N - 1 - vi : vi;
        const [x, y] = xy(i);
        const dark = (x + y) % 2 === 1;
        const cell = make(dark ? 'button' : 'span', `ck-cell ${dark ? 'dark' : 'light'}`);
        if (dark) {
          cell.type = 'button';
          const v = s.board[i];
          const isSrc = sources.has(i), isTgt = targets.has(i);
          cell.disabled = !(isSrc || isTgt);
          if (isSrc) cell.classList.add('src');
          if (isTgt) cell.classList.add('tgt');
          if (sel.from === i) cell.classList.add('sel');
          if (s.last && (s.last.from === i || s.last.to === i)) cell.classList.add('last');
          const name = `${'abcdefgh'[x]}${N - y}`;
          cell.setAttribute('aria-label', `${name}${v !== null ? `, ${isKing(v) ? 'дама' : 'пул'} на ${ctx.nickOf(s.players[ownerOf(v)])}` : ''}${isTgt ? ', премести тук' : isSrc ? ', избери' : ''}`);
          if (v !== null) {
            const pc = make('span', 'ck-piece' + (isKing(v) ? ' king' : '') + (s.taken.includes(i) ? ' taken' : ''));
            pc.style.setProperty('--p', `var(--seat-${ownerOf(v) + 1})`);
            if (isKing(v)) pc.textContent = '♛';
            cell.append(pc);
          }
          cell.addEventListener('click', () => {
            if (isTgt) { const st = targets.get(i); sel.from = null; ctx.onMove({ from: st.from, to: st.to }); return; }
            if (s.chain !== null) return;
            sel.from = sel.from === i ? null : i;
            ctx.sound?.tap?.();
            draw();
          });
        }
        board.append(cell);
      }
      el.append(top, board);
    };
    draw();
  },

  art() {
    const el = document.createElement('div');
    el.className = 'ck-art';
    const layout = ['.1.1', '1.1.', '.0.0', '0.0.'];
    for (const row of layout) for (const ch of row) {
      const c = document.createElement('span');
      c.className = ch === '.' ? 'l' : 'd';
      if (ch !== '.') { const p = document.createElement('i'); p.style.background = `var(--seat-${Number(ch) + 1})`; c.append(p); }
      el.append(c);
    }
    return el;
  },

  css: `
.ck { display:grid; grid-template-columns:repeat(8,minmax(0,1fr)); width:min(100%,440px); margin-inline:auto; border:3px solid var(--ink);
  border-radius:var(--r-md); overflow:hidden; box-shadow:var(--shadow-pop); }
.ck-cell { aspect-ratio:1; display:grid; place-items:center; border:0; padding:0; }
.ck-cell.light { background:#f3e3c3; }
.ck-cell.dark { background:#8a5a2c; cursor:default; }
.ck-cell.dark.last { background:#a06c38; }
.ck-cell.src { cursor:pointer; }
.ck-cell.src .ck-piece { box-shadow:0 0 0 3px var(--sun), inset 0 -3px 0 rgb(0 0 0 / .25); }
.ck-cell.sel .ck-piece { box-shadow:0 0 0 4px var(--focus), inset 0 -3px 0 rgb(0 0 0 / .25); }
.ck-cell.tgt { cursor:pointer; }
.ck-cell.tgt::after { content:""; width:30%; height:30%; border-radius:50%; background:var(--sun); border:2px solid var(--ink); }
.ck-cell:focus-visible { outline:3px solid var(--focus); outline-offset:-3px; }
.ck-piece { width:78%; aspect-ratio:1; border-radius:50%; background:var(--p); border:2px solid var(--ink); display:grid; place-items:center;
  color:#fff; font-size:clamp(.9rem,4vw,1.3rem); line-height:1; box-shadow:inset 0 -3px 0 rgb(0 0 0 / .25); text-shadow:0 1px 0 rgb(0 0 0 / .4); }
.ck-piece.taken { opacity:.35; }
.ck-art { display:grid; grid-template-columns:repeat(4,22px); border:2px solid var(--ink); border-radius:6px; overflow:hidden; }
.ck-art span { height:22px; display:grid; place-items:center; }
.ck-art .l { background:#f3e3c3; }
.ck-art .d { background:#8a5a2c; }
.ck-art i { width:16px; height:16px; border-radius:50%; border:2px solid var(--ink); }
`,
};
