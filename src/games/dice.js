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

  // Хитър бот: записва добра комбинация, иначе задържа най-честата стойност (или кентата).
  botMove(s) {
    if (s.rolls === 0) return { type: 'roll' };
    const sheet = s.sheets[s.turn];
    const open = CATS.filter((c) => sheet[c.id] === undefined);
    const best = open.reduce((b, c) => (scoreFor(c.id, s.dice) > scoreFor(b.id, s.dice) ? c : b), open[0]);
    const special = ['poker', 'large', 'full', 'small'];
    if (s.rolls < 3) {
      if (special.includes(best.id) && scoreFor(best.id, s.dice) > 0) return { type: 'score', cat: best.id };
      const c = counts(s.dice);
      const wantRun = (sheet.large === undefined || sheet.small === undefined) && hasRun(s.dice, 3) && Math.max(...c) < 3;
      let hold;
      if (wantRun) {
        const keep = new Set();
        hold = s.dice.map((d) => { if (keep.has(d)) return false; keep.add(d); return true; });
      } else {
        let target = 6;
        for (let v = 6; v >= 1; v--) if (c[v] > c[target]) target = v;
        hold = s.dice.map((d) => d === target);
      }
      return { type: 'roll', hold };
    }
    if (scoreFor(best.id, s.dice) > 0) return { type: 'score', cat: best.id };
    const sacrifice = ['c1', 'c2', 'poker', 'c3', 'large', 'four', 'c4', 'small', 'full', 'three', 'c5', 'c6', 'chance'];
    return { type: 'score', cat: sacrifice.find((id) => sheet[id] === undefined) };
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
    const lm = ctx.last?.fresh ? ctx.last.move : null;
    const rolled = lm?.type === 'roll' ? s.dice.map((_, i) => !(lm.hold?.[i])) : null;
    let rollNo = 0;

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
      if (rolled?.[i] && s.rolls > 0) { b.classList.add('fx-roll'); b.style.animationDelay = `${rollNo++ * 60}ms`; }
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
        if (v !== undefined) {
          td.textContent = String(v);
          if (lm?.type === 'score' && s.lastScore?.seat === i && s.lastScore.cat === cat.id) td.classList.add('dp-new');
        }
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
.dp-tray { display:grid; justify-items:center; gap:12px; width:100%; padding:18px 12px; border-radius:20px;
  background: var(--felt-tex), radial-gradient(120% 90% at 50% 40%, color-mix(in srgb, var(--felt) 88%, #fff), var(--felt) 60%, color-mix(in srgb, var(--felt) 70%, #000));
  box-shadow: inset 0 0 0 7px #6b3d1b, inset 0 0 0 9px #3a200c, inset 0 6px 18px rgb(0 0 0 / .35), 0 6px 0 #3a200c; }
.dp-tray .hint { color:#fff; opacity:.92; text-align:center; text-shadow:0 1px 2px rgb(0 0 0 / .4); }
.dp-dice { display:flex; gap:10px; justify-content:center; flex-wrap:wrap; }
/* Зар: заоблен куб от слонова кост с вдлъбнати точки. */
.dp-die { width:clamp(48px,14vw,60px); aspect-ratio:1; border-radius:22%; border:1.5px solid rgb(40 35 25 / .4); padding:7px; cursor:pointer;
  background:radial-gradient(120% 120% at 30% 25%, #fff 0 30%, #fbfaf6 60%, #ddd8cc 100%);
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / .12), inset 0 2px 0 rgb(255 255 255 / .9), 0 4px 0 rgb(40 35 25 / .45), 0 8px 12px rgb(0 0 0 / .25);
  transition: transform .2s cubic-bezier(.2,1.4,.4,1), box-shadow .2s; }
.dp-die.blank { background:rgb(255 255 255 / .35); box-shadow:inset 0 0 0 2px rgb(255 255 255 / .4); border-style:dashed; }
.dp-die:disabled { cursor:default; }
.dp-die.held { transform:translateY(-8px); outline:3px solid var(--sun); outline-offset:2px;
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / .12), inset 0 2px 0 rgb(255 255 255 / .9), 0 4px 0 rgb(40 35 25 / .45), 0 16px 14px rgb(0 0 0 / .3); }
.dp-die.fx-roll { animation: dieRoll .75s cubic-bezier(.2,.7,.25,1) backwards; }
.dp-die:focus-visible { outline:3px solid var(--sun); outline-offset:2px; }
.dp-new { animation: dpNew 1.4s ease-out; border-radius:6px; }
@keyframes dpNew { 0%, 30% { background:var(--sun); color:#1b2333; } 100% { background:transparent; } }
@media (prefers-reduced-motion: reduce) { .dp-die.fx-roll, .dp-new { animation:none; } }
.dp-face { display:grid; grid-template-columns:repeat(3,1fr); grid-template-rows:repeat(3,1fr); width:100%; height:100%; }
.dp-face i { width:72%; aspect-ratio:1; border-radius:50%; background:radial-gradient(circle at 35% 35%, #4a5366, #1b2333 70%); box-shadow:inset 0 1px 1px rgb(0 0 0 / .5); place-self:center; }
.dp-face.f1 i:nth-child(1) { grid-area:2/2; }
.dp-face.f2 i:nth-child(1) { grid-area:1/1; } .dp-face.f2 i:nth-child(2) { grid-area:3/3; }
.dp-face.f3 i:nth-child(1) { grid-area:1/1; } .dp-face.f3 i:nth-child(2) { grid-area:2/2; } .dp-face.f3 i:nth-child(3) { grid-area:3/3; }
.dp-face.f4 i:nth-child(1) { grid-area:1/1; } .dp-face.f4 i:nth-child(2) { grid-area:1/3; } .dp-face.f4 i:nth-child(3) { grid-area:3/1; } .dp-face.f4 i:nth-child(4) { grid-area:3/3; }
.dp-face.f5 i:nth-child(1) { grid-area:1/1; } .dp-face.f5 i:nth-child(2) { grid-area:1/3; } .dp-face.f5 i:nth-child(3) { grid-area:2/2; } .dp-face.f5 i:nth-child(4) { grid-area:3/1; } .dp-face.f5 i:nth-child(5) { grid-area:3/3; }
.dp-face.f6 i:nth-child(1) { grid-area:1/1; } .dp-face.f6 i:nth-child(2) { grid-area:2/1; } .dp-face.f6 i:nth-child(3) { grid-area:3/1; } .dp-face.f6 i:nth-child(4) { grid-area:1/3; } .dp-face.f6 i:nth-child(5) { grid-area:2/3; } .dp-face.f6 i:nth-child(6) { grid-area:3/3; }
.board-wrap .table-wrap { width:100%; }
/* Резултатите като в тефтер: линии, червено поле вляво, леко завъртян лист. */
.board-wrap .table-wrap:has(.dp-sheet) { padding:14px 12px 10px 30px; margin-top:6px; border-radius:4px; transform:rotate(-.4deg);
  background: linear-gradient(90deg, transparent 22px, rgb(220 60 50 / .45) 22px 24px, transparent 24px), linear-gradient(#fffdf5, #f7f0dc);
  box-shadow: 0 1px 0 #e7e0cc, 0 3px 0 #ddd5bd, 0 10px 18px rgb(60 45 10 / .18); color:#1b2333; }
.board-wrap .table-wrap:has(.dp-sheet) .dp-sheet th, .board-wrap .table-wrap:has(.dp-sheet) .dp-sheet td { border-bottom-color: rgb(70 120 210 / .3); color:#1b2333; }
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
