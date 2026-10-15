// Покер със зарове — 2–6 играчи. На ход: до 3 хвърляния, задържаш зарове, после записваш в празна графа.
// Заровете идват от seed + номер на хода + номер на хвърлянето.

import { createRng } from '../core/rng.js';

export const CATS = [
  { id: 'c1', name: 'Единици', upper: 1 }, { id: 'c2', name: 'Двойки', upper: 2 }, { id: 'c3', name: 'Тройки', upper: 3 },
  { id: 'c4', name: 'Четворки', upper: 4 }, { id: 'c5', name: 'Петици', upper: 5 }, { id: 'c6', name: 'Шестици', upper: 6 },
  { id: 'three', name: 'Тройка' }, { id: 'four', name: 'Каре' }, { id: 'full', name: 'Фул' },
  { id: 'small', name: 'Малка кента' }, { id: 'large', name: 'Голяма кента' }, { id: 'poker', name: 'Покер' }, { id: 'chance', name: 'Шанс' },
];
const BONUS_AT = 63;
const BONUS = 35;

const counts = (dice) => { const c = [0, 0, 0, 0, 0, 0, 0]; for (const d of dice) c[d] += 1; return c; };
const sum = (dice) => dice.reduce((a, b) => a + b, 0);
const hasRun = (dice, len) => {
  const set = new Set(dice);
  for (let start = 1; start + len - 1 <= 6; start++) {
    let ok = true;
    for (let k = start; k < start + len; k++) if (!set.has(k)) { ok = false; break; }
    if (ok) return true;
  }
  return false;
};

export function scoreFor(cat, dice) {
  const c = counts(dice);
  const def = CATS.find((x) => x.id === cat);
  if (def?.upper) return c[def.upper] * def.upper;
  switch (cat) {
    case 'three': return c.some((n) => n >= 3) ? sum(dice) : 0;
    case 'four': return c.some((n) => n >= 4) ? sum(dice) : 0;
    case 'full': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'small': return hasRun(dice, 4) ? 30 : 0;
    case 'large': return hasRun(dice, 5) ? 40 : 0;
    case 'poker': return c.includes(5) ? 50 : 0;
    case 'chance': return sum(dice);
    default: return 0;
  }
}

export function totals(sheet) {
  const upper = CATS.filter((c) => c.upper).reduce((a, c) => a + (sheet[c.id] ?? 0), 0);
  const lower = CATS.filter((c) => !c.upper).reduce((a, c) => a + (sheet[c.id] ?? 0), 0);
  const bonus = upper >= BONUS_AT ? BONUS : 0;
  return { upper, bonus, lower, total: upper + bonus + lower };
}

export default {
  id: 'dice',
  name: 'Покер със зарове',
  icon: '🎲',
  blurb: 'Пет зара, три хвърляния, една графа на ход.',
  rules: [
    'На своя ход хвърляш 5 зара до 3 пъти. Между хвърлянията докосни зар, за да го задържиш.',
    'После записваш резултата в една празна графа. Може и нула.',
    'Горе: сборът на съответните числа. 63 или повече горе дава бонус 35.',
    'Долу: тройка и каре (сбор), фул 25, малка кента 30, голяма кента 40, покер 50, шанс (сбор).',
    'След 13 рунда печели най-високият резултат.',
  ],
  minPlayers: 2,
  maxPlayers: 6,
  moveSound: 'tap',

  init: (seed, players) => ({
    seed: String(seed), players: players.slice(), sheets: players.map(() => ({})),
    turn: 0, turnNo: 0, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false], rolls: 0, over: false, lastScore: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.over) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (m?.type === 'roll') {
      if (s.rolls >= 3) return { ok: false, reason: 'no-rolls' };
      if (s.rolls > 0 && !(Array.isArray(m.hold) && m.hold.length === 5)) return { ok: false, reason: 'bad-hold' };
      return { ok: true };
    }
    if (m?.type === 'score') {
      if (s.rolls === 0) return { ok: false, reason: 'roll-first' };
      if (!CATS.some((c) => c.id === m.cat)) return { ok: false, reason: 'bad-cat' };
      if (s.sheets[s.turn][m.cat] !== undefined) return { ok: false, reason: 'cat-used' };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s, m) {
    if (m.type === 'roll') {
      const held = s.rolls === 0 ? [false, false, false, false, false] : m.hold.map(Boolean);
      const rng = createRng(`${s.seed}:${s.turnNo}:${s.rolls}`);
      const dice = s.dice.map((d, i) => (held[i] ? d : 1 + rng.int(6)));
      return { ...s, dice, held, rolls: s.rolls + 1 };
    }
    const sheets = s.sheets.map((x) => ({ ...x }));
    const pts = scoreFor(m.cat, s.dice);
    sheets[s.turn][m.cat] = pts;
    const n = s.players.length;
    const turnNo = s.turnNo + 1;
    const over = turnNo >= n * CATS.length;
    return {
      ...s, sheets, turnNo, over, turn: (s.turn + 1) % n, rolls: 0,
      held: [false, false, false, false, false], lastScore: { seat: s.turn, cat: m.cat, pts },
    };
  },

  autoMove(s) {
    if (s.rolls === 0) return { type: 'roll' };
    const open = CATS.filter((c) => s.sheets[s.turn][c.id] === undefined);
    open.sort((a, b) => scoreFor(b.id, s.dice) - scoreFor(a.id, s.dice));
    return { type: 'score', cat: open[0].id };
  },

  isOver: (s) => s.over,
  placements(s) {
    const t = s.sheets.map((x) => totals(x).total);
    const sorted = [...new Set(t)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(t[i]) + 1]));
  },
  winner(s) {
    const t = s.sheets.map((x) => totals(x).total);
    const top = Math.max(...t);
    const lead = s.players.filter((_, i) => t[i] === top);
    return lead.length === 1 ? lead[0] : 'draw';
  },

  render(el, s, ctx) {
    const meSeat = s.players.indexOf(ctx.me);
    const myTurn = !ctx.over && meSeat === s.turn;
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    el.innerHTML = '';
    const local = { held: s.held.slice() };

    // зарове
    const tray = make('div', 'dp-tray');
    const diceRow = make('div', 'dp-dice');
    diceRow.setAttribute('role', 'group');
    diceRow.setAttribute('aria-label', 'Зарове');
    const pips = (n) => { const d = make('span', `dp-face f${n}`); for (let k = 0; k < n; k++) d.append(make('i')); return d; };
    s.dice.forEach((v, i) => {
      const b = make('button', 'dp-die' + (s.held[i] ? ' held' : '') + (s.rolls === 0 ? ' blank' : ''));
      b.type = 'button';
      b.disabled = !myTurn || s.rolls === 0 || s.rolls >= 3;
      b.setAttribute('aria-pressed', String(s.held[i]));
      b.setAttribute('aria-label', s.rolls === 0 ? 'Зар, още не е хвърлен' : `Зар ${v}${s.held[i] ? ', задържан' : ''}`);
      if (s.rolls > 0) b.append(pips(v));
      b.addEventListener('click', () => {
        local.held[i] = !local.held[i];
        b.classList.toggle('held', local.held[i]);
        b.setAttribute('aria-pressed', String(local.held[i]));
        ctx.sound?.tap?.();
      });
      diceRow.append(b);
    });
    const rollBtn = make('button', 'btn btn-primary', s.rolls === 0 ? 'Хвърли' : `Хвърли пак (${3 - s.rolls})`);
    rollBtn.type = 'button';
    rollBtn.disabled = !myTurn || s.rolls >= 3;
    rollBtn.addEventListener('click', () => ctx.onMove(s.rolls === 0 ? { type: 'roll' } : { type: 'roll', hold: local.held }));
    const tip = make('p', 'hint', myTurn
      ? (s.rolls === 0 ? 'Хвърли заровете.' : s.rolls < 3 ? 'Докосни зар, за да го задържиш, или избери графа долу.' : 'Избери графа долу.')
      : `Хвърля ${ctx.nickOf(s.players[s.turn])}. Рунд ${Math.floor(s.turnNo / s.players.length) + 1} от 13.`);
    tray.append(diceRow, rollBtn, tip);

    // таблица
    const wrap = make('div', 'table-wrap');
    const t = make('table', 'dp-sheet');
    const head = make('tr');
    head.append(make('th', null, ''));
    s.players.forEach((p, i) => { const th = make('th', 'r' + (i === s.turn && !ctx.over ? ' now' : ''), ctx.nickOf(p)); head.append(th); });
    const thead = make('thead'); thead.append(head); t.append(thead);
    const tb = make('tbody');
    const row = (label, cells, cls = '') => { const tr = make('tr', cls); tr.append(make('th', null, label)); cells.forEach((c) => tr.append(c)); tb.append(tr); };
    for (const cat of CATS) {
      row(cat.name, s.players.map((p, i) => {
        const td = make('td', 'r num');
        const v = s.sheets[i][cat.id];
        if (v !== undefined) td.textContent = String(v);
        else if (i === meSeat && myTurn && s.rolls > 0) {
          const b = make('button', 'dp-pick', String(scoreFor(cat.id, s.dice)));
          b.type = 'button';
          b.setAttribute('aria-label', `Запиши ${scoreFor(cat.id, s.dice)} в ${cat.name}`);
          b.addEventListener('click', () => ctx.onMove({ type: 'score', cat: cat.id }));
          td.append(b);
        }
        return td;
      }), cat.id === 'c6' ? 'sep' : '');
      if (cat.id === 'c6') row('Бонус', s.players.map((p, i) => make('td', 'r num muted', String(totals(s.sheets[i]).bonus || ''))), 'sub');
    }
    row('Общо', s.players.map((p, i) => make('td', 'r num total', String(totals(s.sheets[i]).total))), 'tot');
    t.append(tb);
    wrap.append(t);

    const last = s.lastScore;
    const msg = make('p', 'c8-msg', last ? `${ctx.nickOf(s.players[last.seat])} записа ${last.pts} в „${CATS.find((c) => c.id === last.cat).name}“.` : '');
    el.append(tray, msg, wrap);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'dp-art';
    for (const n of [5, 3, 6]) {
      const d = document.createElement('span');
      d.className = `dp-face f${n}`;
      for (let k = 0; k < n; k++) d.append(document.createElement('i'));
      el.append(d);
    }
    return el;
  },

  css: `
.dp-tray { display:grid; justify-items:center; gap:12px; width:100%; padding:16px 10px; background:var(--felt); border-radius:var(--r-lg); }
.dp-tray .hint { color:#fff; opacity:.9; text-align:center; }
.dp-dice { display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
.dp-die { width:clamp(48px,14vw,60px); aspect-ratio:1; border-radius:12px; border:3px solid transparent; background:#fff; padding:6px; cursor:pointer;
  box-shadow:0 4px 0 rgb(0 0 0 / .3); transition:transform .1s ease; }
.dp-die.blank { background:rgb(255 255 255 / .55); }
.dp-die:disabled { cursor:default; }
.dp-die.held { border-color:var(--sun); transform:translateY(-6px); box-shadow:0 10px 0 rgb(0 0 0 / .3); }
.dp-die:focus-visible { outline:3px solid var(--sun); outline-offset:2px; }
.dp-face { display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); width:100%; height:100%; }
.dp-face i { width:72%; aspect-ratio:1; border-radius:50%; background:#1b2333; place-self:center; }
.dp-face.f1 i:nth-child(1) { grid-area:2/2; }
.dp-face.f2 i:nth-child(1) { grid-area:1/1; } .dp-face.f2 i:nth-child(2) { grid-area:3/3; }
.dp-face.f3 i:nth-child(1) { grid-area:1/1; } .dp-face.f3 i:nth-child(2) { grid-area:2/2; } .dp-face.f3 i:nth-child(3) { grid-area:3/3; }
.dp-face.f4 i:nth-child(1) { grid-area:1/1; } .dp-face.f4 i:nth-child(2) { grid-area:1/3; } .dp-face.f4 i:nth-child(3) { grid-area:3/1; } .dp-face.f4 i:nth-child(4) { grid-area:3/3; }
.dp-face.f5 i:nth-child(1) { grid-area:1/1; } .dp-face.f5 i:nth-child(2) { grid-area:1/3; } .dp-face.f5 i:nth-child(3) { grid-area:2/2; } .dp-face.f5 i:nth-child(4) { grid-area:3/1; } .dp-face.f5 i:nth-child(5) { grid-area:3/3; }
.dp-face.f6 i:nth-child(1) { grid-area:1/1; } .dp-face.f6 i:nth-child(2) { grid-area:2/1; } .dp-face.f6 i:nth-child(3) { grid-area:3/1; } .dp-face.f6 i:nth-child(4) { grid-area:1/3; } .dp-face.f6 i:nth-child(5) { grid-area:2/3; } .dp-face.f6 i:nth-child(6) { grid-area:3/3; }
.board-wrap .table-wrap { width:100%; }
.dp-sheet { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; font-size:.92rem; }
.dp-sheet th, .dp-sheet td { padding:5px 8px; border-bottom:1px solid var(--line); text-align:left; }
.dp-sheet .r { text-align:right; }
.dp-sheet thead th { font-weight:700; max-width:7ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dp-sheet thead th.now { color:var(--accent); }
.dp-sheet tbody th { font-weight:500; white-space:nowrap; }
.dp-sheet tr.sep td, .dp-sheet tr.sep th { border-bottom:2px solid var(--ink-2); }
.dp-sheet tr.tot th, .dp-sheet tr.tot td { font-weight:800; border-bottom:0; font-size:1rem; }
.dp-pick { min-width:44px; min-height:34px; border-radius:var(--r-pill); border:2px dashed var(--accent); background:transparent; color:var(--accent); font-weight:800; cursor:pointer; }
.dp-pick:hover, .dp-pick:focus-visible { background:var(--accent); color:var(--accent-ink); }
.dp-art { display:flex; gap:6px; }
.dp-art .dp-face { width:34px; height:34px; background:#fff; border-radius:8px; padding:4px; box-shadow:0 3px 0 rgb(0 0 0 / .2); border:2px solid var(--ink); }
`,
};
