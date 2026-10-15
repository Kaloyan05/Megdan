// Морски бой — 2 играчи, 10×10, флот: 4, 3, 3, 2, 2, 2, 1, 1, 1, 1 (корабите не се допират).
// Корабите са скрити: всеки пази флота си в личното си пространство, а в лога записва само
// хеш (SHA-256 на флота + сол). Изстрел → клиентът на защитника отговаря „попадение“/„пропуск“.
// Попадение дава още изстрел. Накрая флотовете се разкриват и хешовете се проверяват.

import { createRng, newSeed } from '../core/rng.js';

const N = 10;
export const FLEET = [4, 3, 3, 2, 2, 2, 1, 1, 1, 1];
export const TOTAL = FLEET.reduce((a, b) => a + b, 0); // 20
const LETTERS = 'АБВГДЕЖЗИК';
const cellName = (i) => `${LETTERS[i % N]}${Math.floor(i / N) + 1}`;

const neighbors = (i) => {
  const x = i % N, y = Math.floor(i / N), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const nx = x + dx, ny = y + dy;
    if ((dx || dy) && nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
  }
  return out;
};

export function randomFleet(seed = newSeed()) {
  const rng = createRng(`${seed}:fleet`);
  for (;;) {
    const taken = new Set();
    const blocked = new Set();
    const ships = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horiz = rng.next() < 0.5;
        const x = rng.int(horiz ? N - len + 1 : N), y = rng.int(horiz ? N : N - len + 1);
        const cells = [...Array(len).keys()].map((k) => (horiz ? y * N + x + k : (y + k) * N + x));
        if (cells.some((c) => blocked.has(c))) continue;
        ships.push(cells);
        for (const c of cells) { taken.add(c); blocked.add(c); neighbors(c).forEach((n) => blocked.add(n)); }
        placed = true;
      }
      if (!placed) { ok = false; break; }
    }
    if (ok) return ships;
  }
}

export function validFleet(ships) {
  if (!Array.isArray(ships) || ships.length !== FLEET.length) return false;
  const lens = ships.map((s) => s.length).sort((a, b) => b - a);
  if (lens.join() !== FLEET.join()) return false;
  const owner = new Map();
  for (let k = 0; k < ships.length; k++) {
    const cells = ships[k].slice().sort((a, b) => a - b);
    if (cells.some((c) => !Number.isInteger(c) || c < 0 || c >= N * N)) return false;
    const row = cells.every((c) => Math.floor(c / N) === Math.floor(cells[0] / N)) && cells.every((c, i) => c === cells[0] + i);
    const col = cells.every((c, i) => c === cells[0] + i * N);
    if (!row && !col) return false;
    for (const c of cells) { if (owner.has(c)) return false; owner.set(c, k); }
  }
  for (const [c, k] of owner) for (const n of neighbors(c)) if (owner.has(n) && owner.get(n) !== k) return false;
  return true;
}

export async function commitOf(ships, salt) {
  const bytes = new TextEncoder().encode(JSON.stringify({ ships, salt }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Отговор на изстрел от собствения флот.
export function answerFor(ships, cell, shotsAtMe) {
  const ship = ships.find((s) => s.includes(cell));
  if (!ship) return { type: 'answer', hit: false };
  const hitSet = new Set([...shotsAtMe.filter((x) => x.hit).map((x) => x.cell), cell]);
  const sunk = ship.every((c) => hitSet.has(c));
  return { type: 'answer', hit: true, sunk: sunk ? ship.slice().sort((a, b) => a - b) : null };
}

export default {
  id: 'battleship',
  name: 'Морски бой',
  icon: '🚢',
  blurb: 'Скрий флота си и потопи чуждия. Никой не може да надникне.',
  rules: [
    'Всеки има флот: един кораб от 4, два от 3, три от 2 и четири от 1. Корабите не се допират.',
    'Разбъркай разположението, докато ти хареса, и натисни „Готово“. Никой не вижда твоите кораби.',
    'Стреляте на ред по полето на противника. Попадение дава още изстрел.',
    'Потопен кораб се показва целият, а полетата около него се отбелязват.',
    'Печели първият, който потопи всички 20 полета. Накрая флотовете се разкриват и се проверяват.',
  ],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'drop',
  usesSecret: true,

  init: (seed, players) => ({
    players: players.slice(), phase: 'place', commits: [null, null], shots: [[], []], turn: 0,
    pending: null, hits: [0, 0], winner: null, last: null,
  }),

  currentPlayer(s) {
    if (s.phase === 'place') return s.players[s.commits.findIndex((c) => c === null)];
    if (s.phase === 'await') return s.players[1 - s.turn];
    return s.players[s.turn];
  },

  validateMove(s, m, p) {
    const seat = s.players.indexOf(p);
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (m?.type === 'place') {
      if (s.phase !== 'place') return { ok: false, reason: 'already-placed' };
      if (s.commits[seat] !== null) return { ok: false, reason: 'already-placed' };
      if (typeof m.commit !== 'string' || !/^[0-9a-f]{64}$/.test(m.commit)) return { ok: false, reason: 'bad-commit' };
      return { ok: true };
    }
    if (m?.type === 'shot') {
      if (s.phase !== 'shoot') return { ok: false, reason: s.phase === 'place' ? 'wait-place' : 'wait-answer' };
      if (seat !== s.turn) return { ok: false, reason: 'not-your-turn' };
      if (!Number.isInteger(m.cell) || m.cell < 0 || m.cell >= N * N) return { ok: false, reason: 'bad-cell' };
      if (s.shots[seat].some((x) => x.cell === m.cell)) return { ok: false, reason: 'shot-twice' };
      return { ok: true };
    }
    if (m?.type === 'answer') {
      if (s.phase !== 'await' || seat !== 1 - s.turn) return { ok: false, reason: 'not-your-turn' };
      if (typeof m.hit !== 'boolean') return { ok: false, reason: 'bad-answer' };
      if (m.sunk != null && !(Array.isArray(m.sunk) && m.sunk.includes(s.pending) && m.hit)) return { ok: false, reason: 'bad-answer' };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m, p) {
    const s = { ...s0, commits: s0.commits.slice(), shots: s0.shots.map((x) => x.slice()), hits: s0.hits.slice() };
    const seat = s.players.indexOf(p);
    if (m.type === 'place') {
      s.commits[seat] = m.commit;
      if (s.commits.every(Boolean)) s.phase = 'shoot';
      s.last = { kind: 'place', seat };
      return s;
    }
    if (m.type === 'shot') {
      s.pending = m.cell;
      s.phase = 'await';
      s.last = { kind: 'shot', seat, cell: m.cell };
      return s;
    }
    const shooter = s.turn;
    s.shots[shooter].push({ cell: s.pending, hit: m.hit, sunk: m.sunk ?? null });
    s.last = { kind: 'answer', seat: shooter, cell: s.pending, hit: m.hit, sunk: Boolean(m.sunk) };
    s.pending = null;
    if (m.hit) {
      s.hits[shooter] += 1;
      if (s.hits[shooter] >= TOTAL) { s.winner = shooter; s.phase = 'done'; return s; }
      s.phase = 'shoot';
    } else {
      s.turn = 1 - shooter;
      s.phase = 'shoot';
    }
    return s;
  },

  // Таймер: стрелящият стреля случайно; поставяне и отговор изискват флота, затова няма автоматичен ход.
  autoMove(s, p, rng) {
    if (s.phase !== 'shoot') return null;
    const done = new Set(s.shots[s.turn].map((x) => x.cell));
    const free = [...Array(N * N).keys()].filter((c) => !done.has(c));
    return { type: 'shot', cell: rng.pick(free) };
  },

  // Клиентът на защитника отговаря сам, щом има изстрел към него.
  async onTurn(s, ctx) {
    const seat = s.players.indexOf(ctx.me);
    if (s.phase !== 'await' || seat !== 1 - s.turn) return null;
    const secret = await ctx.secret.load();
    if (!secret?.ships) return null;
    return answerFor(secret.ships, s.pending, s.shots[s.turn]);
  },

  status(s, me, nickOf) {
    const seat = s.players.indexOf(me);
    if (s.phase === 'place') return seat >= 0 && !s.commits[seat] ? 'Разположи флота си' : 'Чакаме флотовете';
    if (s.phase === 'await') return 'Отговор...';
    return null;
  },

  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.players[s.winner]),

  render(el, s, ctx) {
    const seat = s.players.indexOf(ctx.me);
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    el.innerHTML = '';
    const secret = ctx.secret?.data;

    // ---- разполагане ----
    if (s.phase === 'place') {
      const wrap = make('div', 'bs-place');
      if (seat < 0) { wrap.append(make('p', 'muted', 'Играчите разполагат корабите си.')); el.append(wrap); return; }
      if (s.commits[seat]) {
        wrap.append(make('p', 'hint', `Флотът ти е готов. Чакаме ${ctx.nickOf(s.players[1 - seat])}.`), gridOf(secret?.ships ?? [], [], make, 'Твоят флот'));
        el.append(wrap);
        return;
      }
      let ships = ctx.scratch.draft ?? randomFleet();
      ctx.scratch.draft = ships;
      const area = make('div', 'bs-board-wrap');
      const paint = () => area.replaceChildren(gridOf(ships, [], make, 'Твоят флот'));
      paint();
      const shuffle = make('button', 'btn', 'Разбъркай');
      shuffle.type = 'button';
      shuffle.addEventListener('click', () => { ships = randomFleet(); ctx.scratch.draft = ships; paint(); ctx.sound?.tap?.(); });
      const ready = make('button', 'btn btn-primary', 'Готово');
      ready.type = 'button';
      ready.addEventListener('click', async () => {
        ready.disabled = true;
        const salt = newSeed() + newSeed();
        try {
          await ctx.secret.save({ ships, salt });
          ctx.onMove({ type: 'place', commit: await commitOf(ships, salt) });
        } catch { ready.disabled = false; ctx.toast?.('Не успях да скрия флота. Опитай пак.'); }
      });
      const actions = make('div', 'actions');
      actions.append(shuffle, ready);
      wrap.append(make('p', 'hint', 'Разбъркай, докато ти хареса разположението. После натисни „Готово“.'), area, actions);
      el.append(wrap);
      return;
    }

    // ---- стрелба ----
    const mySeat = seat < 0 ? 0 : seat;
    const myTurn = !ctx.over && seat === s.turn && s.phase === 'shoot';
    const target = targetGrid(s.shots[mySeat], myTurn, (cell) => ctx.onMove({ type: 'shot', cell }), make,
      seat < 0 ? `Изстрели на ${ctx.nickOf(s.players[0])}` : 'Флотът на противника', s.pending !== null && s.turn === mySeat ? s.pending : null);
    const msg = make('p', 'c8-msg', lastText(s, ctx, seat));
    const score = make('p', 'bs-score num', s.players.map((p, i) => `${ctx.nickOf(p)}: ${s.hits[i]}/${TOTAL}`).join('   '));
    el.append(score, msg, target);
    if (seat >= 0) {
      const incoming = s.shots[1 - seat];
      el.append(make('h3', 'bs-h', 'Твоят флот'), gridOf(secret?.ships ?? [], incoming, make, 'Твоят флот', true, s.pending !== null && s.turn !== seat ? s.pending : null));
    }

    // ---- проверка накрая ----
    if (s.winner !== null && ctx.reveals) {
      const box = make('p', 'bs-verify hint', 'Проверявам флотовете...');
      el.append(box);
      verifyAll(s, ctx.reveals).then((res) => {
        box.textContent = res.map((r, i) => `${ctx.nickOf(s.players[i])}: ${r === true ? 'флотът съвпада ✓' : r === false ? 'флотът НЕ съвпада с отговорите ✗' : 'още не е разкрит'}`).join('. ');
      });
    }
  },

  art() {
    const el = document.createElement('div');
    el.className = 'bs-art';
    const marks = ['', 'x', '', '', 's', 's', 's', '', '', 'o', '', '', '', '', 'x', ''];
    for (const m of marks) { const c = document.createElement('span'); if (m) c.className = m; el.append(c); }
    return el;
  },

  css: `
.bs-place { display:grid; gap:12px; justify-items:center; width:100%; }
.bs-board-wrap { width:100%; }
.bs-grid { display:grid; grid-template-columns:repeat(10,minmax(0,1fr)); gap:2px; width:min(100%,400px); margin-inline:auto; padding:5px;
  background:color-mix(in srgb, var(--focus) 55%, var(--ink)); border-radius:var(--r-md); }
.bs-grid.small { width:min(100%,280px); }
.bs-cell { aspect-ratio:1; border:0; padding:0; border-radius:3px; background:color-mix(in srgb, var(--focus) 22%, var(--surface)); display:grid; place-items:center;
  font:800 .8rem/1 var(--f-body); color:var(--ink); }
.bs-cell.ship { background:var(--ink-2); }
.bs-cell.hit { background:var(--accent); color:#fff; }
.bs-cell.hit::after { content:"✕"; }
.bs-cell.miss::after { content:""; width:28%; height:28%; border-radius:50%; background:var(--ink-2); }
.bs-cell.near { background:color-mix(in srgb, var(--focus) 10%, var(--surface)); }
.bs-cell.sunk { background:var(--ink); color:#fff; }
.bs-cell.sunk::after { content:"✕"; }
.bs-cell.pending { box-shadow:inset 0 0 0 3px var(--sun); }
button.bs-cell { cursor:pointer; }
button.bs-cell:disabled { cursor:default; }
button.bs-cell:not(:disabled):hover { background:var(--sun); }
.bs-cell:focus-visible { outline:3px solid var(--sun); outline-offset:-2px; }
.bs-score { text-align:center; font-weight:700; white-space:pre; }
.bs-h { font-size:1rem; text-align:center; margin-top:14px; }
.bs-verify { text-align:center; }
.bs-art { display:grid; grid-template-columns:repeat(4,20px); gap:2px; padding:4px; background:color-mix(in srgb, var(--focus) 55%, var(--ink)); border-radius:8px; }
.bs-art span { height:20px; border-radius:3px; background:color-mix(in srgb, var(--focus) 22%, var(--surface)); }
.bs-art .s { background:var(--ink-2); }
.bs-art .x { background:var(--accent); }
.bs-art .o { background:var(--surface); box-shadow:inset 0 0 0 6px color-mix(in srgb, var(--focus) 22%, var(--surface)); }
`,
};

function gridOf(ships, incoming, make, label, small = false, pending = null) {
  const own = new Set(ships.flat());
  const hits = new Map(incoming.map((x) => [x.cell, x.hit]));
  const g = make('div', 'bs-grid' + (small ? ' small' : ''));
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  for (let i = 0; i < N * N; i++) {
    const c = make('span', 'bs-cell');
    if (own.has(i)) c.classList.add('ship');
    if (hits.get(i) === true) c.classList.add('hit');
    else if (hits.has(i)) c.classList.add('miss');
    if (i === pending) c.classList.add('pending');
    g.append(c);
  }
  return g;
}

function targetGrid(myShots, canShoot, onShot, make, label, pending) {
  const known = new Map(myShots.map((x) => [x.cell, x]));
  const sunkCells = new Set(myShots.flatMap((x) => x.sunk ?? []));
  const near = new Set();
  for (const c of sunkCells) for (const n of neighbors(c)) if (!sunkCells.has(n)) near.add(n);
  const g = make('div', 'bs-grid');
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', label);
  for (let i = 0; i < N * N; i++) {
    const shot = known.get(i);
    const b = make('button', 'bs-cell');
    b.type = 'button';
    if (sunkCells.has(i)) b.classList.add('sunk');
    else if (shot?.hit) b.classList.add('hit');
    else if (shot) b.classList.add('miss');
    else if (near.has(i)) b.classList.add('near');
    if (i === pending) b.classList.add('pending');
    b.disabled = !canShoot || Boolean(shot) || i === pending;
    b.setAttribute('aria-label', `${cellName(i)}${sunkCells.has(i) ? ', потопен' : shot?.hit ? ', попадение' : shot ? ', пропуск' : ''}`);
    b.addEventListener('click', () => onShot(i));
    g.append(b);
  }
  return g;
}

function lastText(s, ctx, seat) {
  const l = s.last;
  if (s.phase === 'await') return s.turn === seat ? `Стреля по ${cellName(s.pending)}...` : `${ctx.nickOf(s.players[s.turn])} стреля по ${cellName(s.pending)}.`;
  if (!l || l.kind !== 'answer') return 'Флотовете са готови. Огън!';
  const who = ctx.nickOf(s.players[l.seat]);
  if (l.sunk) return `${who}: ${cellName(l.cell)}. Потопен кораб!`;
  if (l.hit) return `${who}: ${cellName(l.cell)}. Попадение! Стреля пак.`;
  return `${who}: ${cellName(l.cell)}. Пропуск.`;
}

// Разкрит флот: хешът съвпада ли и отговорите честни ли са.
async function verifyAll(s, reveals) {
  return Promise.all(s.players.map(async (p, seat) => {
    const r = reveals[p];
    if (!r?.ships) return null;
    if (!validFleet(r.ships) || (await commitOf(r.ships, r.salt)) !== s.commits[seat]) return false;
    const own = new Set(r.ships.flat());
    return s.shots[1 - seat].every((x) => own.has(x.cell) === x.hit);
  }));
}

export { verifyAll };
