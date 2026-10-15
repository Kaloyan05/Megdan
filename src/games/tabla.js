// Табла — 2 играчи, 15 пула всеки, без куб за удвояване.
// points[i] > 0: пулове на играч 0; < 0: на играч 1. Играч 0 върви от 23 към 0 (дом 0..5),
// играч 1 от 0 към 23 (дом 18..23). В „перспектива“ p всеки върви надолу към 0.
// Ход: хвърляне, после стъпки една по една ({ from: 'bar' | индекс, die }).
// Правило: трябва да се използват колкото може повече зарове; ако може само един от два различни, по-големият.

import { createRng } from '../core/rng.js';

const persp = (seat, idx) => (seat === 0 ? idx : 23 - idx);
const absIdx = (seat, p) => (seat === 0 ? p : 23 - p);
const own = (s, seat, idx) => (seat === 0 ? Math.max(s.points[idx], 0) : Math.max(-s.points[idx], 0));
const opp = (s, seat, idx) => own(s, 1 - seat, idx);

function allHome(s, seat) {
  if (s.bar[seat]) return false;
  for (let idx = 0; idx < 24; idx++) if (own(s, seat, idx) && persp(seat, idx) > 5) return false;
  return true;
}

// Възможни единични стъпки за даден зар.
function stepsFor(s, seat, die) {
  const out = [];
  if (s.bar[seat] > 0) {
    const idx = absIdx(seat, 24 - die);
    if (opp(s, seat, idx) <= 1) out.push({ from: 'bar', to: idx, die });
    return out;
  }
  const home = allHome(s, seat);
  for (let idx = 0; idx < 24; idx++) {
    if (!own(s, seat, idx)) continue;
    const p = persp(seat, idx);
    const np = p - die;
    if (np >= 0) {
      const to = absIdx(seat, np);
      if (opp(s, seat, to) <= 1) out.push({ from: idx, to, die });
    } else if (home) {
      if (np === -1) out.push({ from: idx, to: 'off', die });
      else {
        let higher = false;
        for (let q = p + 1; q <= 5; q++) if (own(s, seat, absIdx(seat, q))) { higher = true; break; }
        if (!higher) out.push({ from: idx, to: 'off', die });
      }
    }
  }
  return out;
}

function applyStep(s, seat, st) {
  const n = { ...s, points: s.points.slice(), bar: s.bar.slice(), off: s.off.slice() };
  const sign = seat === 0 ? 1 : -1;
  if (st.from === 'bar') n.bar[seat] -= 1; else n.points[st.from] -= sign;
  let hit = false;
  if (st.to === 'off') n.off[seat] += 1;
  else {
    if (opp(n, seat, st.to) === 1) { n.points[st.to] = 0; n.bar[1 - seat] += 1; hit = true; }
    n.points[st.to] += sign;
  }
  return { n, hit };
}

const removeOne = (arr, v) => { const i = arr.indexOf(v); return i < 0 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)]; };

function maxUse(s, seat, dice, memo) {
  if (!dice.length) return 0;
  const key = `${s.points.join(',')}|${s.bar}|${s.off}|${dice.join('')}`;
  if (memo.has(key)) return memo.get(key);
  let best = 0;
  for (const d of new Set(dice)) {
    for (const st of stepsFor(s, seat, d)) {
      best = Math.max(best, 1 + maxUse(applyStep(s, seat, st).n, seat, removeOne(dice, d), memo));
      if (best === dice.length) break;
    }
    if (best === dice.length) break;
  }
  memo.set(key, best);
  return best;
}

export function legalSteps(s) {
  if (s.phase !== 'move' || !s.dice.length) return [];
  const seat = s.turn;
  const memo = new Map();
  const best = maxUse(s, seat, s.dice, memo);
  if (!best) return [];
  let out = [];
  for (const d of new Set(s.dice)) {
    for (const st of stepsFor(s, seat, d)) {
      if (1 + maxUse(applyStep(s, seat, st).n, seat, removeOne(s.dice, d), memo) === best) out.push(st);
    }
  }
  if (best === 1 && s.dice.length === 2 && s.dice[0] !== s.dice[1]) {
    const big = Math.max(...s.dice);
    if (out.some((st) => st.die === big)) out = out.filter((st) => st.die === big);
  }
  return out;
}

const START = (() => {
  const p = Array(24).fill(0);
  p[23] = 2; p[12] = 5; p[7] = 3; p[5] = 5;
  p[0] = -2; p[11] = -5; p[16] = -3; p[18] = -5;
  return p;
})();

export default {
  id: 'tabla',
  name: 'Табла',
  icon: '⚪',
  blurb: 'Класическата табла. Удряй, бягай, изнасяй.',
  rules: [
    'Всеки има 15 пула и ги кара около дъската към своя дом (6-те полета в дясно: долу за червените, горе за сините).',
    'Хвърляш два зара и местиш пул по веднъж за всеки зар. Чифт се играе 4 пъти.',
    'Не можеш да кацнеш на поле с 2 или повече чужди пула. Кацнеш ли на самотен чужд пул, той отива на средата (бара).',
    'Пул на бара трябва да влезе първи, в дома на противника.',
    'Когато всичките ти пулове са в дома, ги изнасяш. Печели първият, изнесъл всички 15.',
    'Трябва да изиграеш колкото може повече зарове. Ако може само единият, играеш по-големия.',
  ],
  minPlayers: 2,
  maxPlayers: 2,
  moveSound: 'drop',

  init: (seed, players) => ({
    seed: String(seed), players: players.slice(), points: START.slice(), bar: [0, 0], off: [0, 0],
    turn: 0, phase: 'roll', dice: [], rolled: null, rollNo: 0, winner: null, last: null,
  }),

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (m?.type === 'roll') return s.phase === 'roll' ? { ok: true } : { ok: false, reason: 'move-first' };
    if (m?.type === 'step') {
      if (s.phase !== 'move') return { ok: false, reason: 'roll-first' };
      const ok = legalSteps(s).some((st) => st.from === m.from && st.die === m.die);
      return ok ? { ok: true } : { ok: false, reason: 'bad-step' };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m) {
    let s = { ...s0 };
    const endTurn = () => { s.turn = 1 - s.turn; s.phase = 'roll'; s.dice = []; };
    if (m.type === 'roll') {
      const rng = createRng(`${s.seed}:${s.rollNo}`);
      const a = 1 + rng.int(6), b = 1 + rng.int(6);
      s.rollNo += 1;
      s.rolled = [a, b];
      s.dice = a === b ? [a, a, a, a] : [a, b];
      s.phase = 'move';
      s.last = { seat: s.turn, kind: 'roll', dice: [a, b] };
      if (!legalSteps(s).length) { s.last.stuck = true; endTurn(); }
      return s;
    }
    const seat = s.turn;
    const st = legalSteps(s).find((x) => x.from === m.from && x.die === m.die);
    const { n, hit } = applyStep(s, seat, st);
    s = { ...n, dice: removeOne(s.dice, m.die) };
    s.last = { seat, kind: 'step', from: st.from, to: st.to, die: st.die, hit };
    if (s.off[seat] === 15) { s.winner = seat; s.phase = 'done'; s.dice = []; return s; }
    if (!s.dice.length || !legalSteps(s).length) endTurn();
    return s;
  },

  autoMove(s, p, rng) {
    if (s.phase === 'roll') return { type: 'roll' };
    const steps = legalSteps(s);
    const pick = steps.find((x) => x.to === 'off') ?? rng.pick(steps);
    return { type: 'step', from: pick.from, die: pick.die };
  },

  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.players[s.winner]),

  render(el, s, ctx) {
    const seatMe = s.players.indexOf(ctx.me);
    const myTurn = !ctx.over && seatMe === s.turn && s.phase === 'move';
    const steps = myTurn ? legalSteps(s) : [];
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    let selected = null;

    const draw = () => {
      el.innerHTML = '';
      const sources = new Set(steps.map((st) => st.from));
      const targets = new Map(selected === null ? [] : steps.filter((st) => st.from === selected).map((st) => [st.to, st]));

      // горна лента: зарове и бутон
      const bar = make('div', 'ld-bar');
      const diceBox = make('div', 'tb-dice');
      let faces = [];
      if ((s.phase === 'move' || s.phase === 'done') && s.rolled) {
        const [a, b] = s.rolled;
        faces = a === b ? [a, a, a, a].map((v, i) => ({ v, used: i >= s.dice.length })) : [{ v: a, used: !s.dice.includes(a) }, { v: b, used: !s.dice.includes(b) }];
      } else if (s.last?.kind === 'roll' && s.last.stuck) faces = s.last.dice.map((v) => ({ v, used: true }));
      faces.forEach(({ v, used }) => {
        const d = make('span', `dp-face f${v}${used ? ' used' : ''}`);
        for (let k = 0; k < v; k++) d.append(make('i'));
        diceBox.append(d);
      });
      const roll = make('button', 'btn btn-primary', 'Хвърли');
      roll.type = 'button';
      roll.disabled = ctx.over || seatMe !== s.turn || s.phase !== 'roll';
      roll.addEventListener('click', () => ctx.onMove({ type: 'roll' }));
      let tip = '';
      if (s.last?.kind === 'roll' && s.last.stuck) tip = `${ctx.nickOf(s.players[s.last.seat])} хвърли ${s.last.dice.join(' и ')} и няма ход.`;
      if (myTurn) tip = selected === null ? `Остават: ${s.dice.join(', ')}. Избери пул.` : 'Избери къде да отиде. Докосни пула пак за отказ.';
      bar.append(diceBox, roll, make('p', 'hint', tip));

      // дъска
      const board = make('div', 'tb');
      board.setAttribute('role', 'group');
      board.setAttribute('aria-label', 'Табла');
      const pointEl = (idx, top) => {
        const v = s.points[idx];
        const seat = v > 0 ? 0 : v < 0 ? 1 : null;
        const count = Math.abs(v);
        const isSrc = sources.has(idx);
        const isTgt = targets.has(idx);
        const btn = make('button', `tb-pt ${top ? 'top' : 'bottom'} ${idx % 2 ? 'odd' : 'even'}` + (isSrc ? ' src' : '') + (isTgt ? ' tgt' : '') + (selected === idx ? ' sel' : ''));
        btn.type = 'button';
        btn.disabled = !(isSrc || isTgt);
        btn.setAttribute('aria-label', `Поле ${persp(seatMe < 0 ? 0 : seatMe, idx) + 1}${count ? `, ${count} ${seat === seatMe ? 'твои' : 'чужди'}` : ''}${isTgt ? ', премести тук' : isSrc ? ', избери' : ''}`);
        btn.addEventListener('click', () => click(idx));
        const stack = make('span', 'tb-stack');
        for (let k = 0; k < Math.min(count, 5); k++) {
          const c = make('span', 'tb-ch');
          c.style.setProperty('--p', `var(--seat-${seat + 1})`);
          if (k === 4 && count > 5) c.textContent = String(count);
          stack.append(c);
        }
        btn.append(stack);
        return btn;
      };
      const barEl = (top) => {
        const seat = top ? 1 : 0; // бар: сините горе, червените долу
        const isSrc = sources.has('bar') && seatMe === seat;
        const b = make('button', 'tb-barcol' + (isSrc ? ' src' : '') + (selected === 'bar' && seatMe === seat ? ' sel' : ''));
        b.type = 'button';
        b.disabled = !isSrc;
        b.setAttribute('aria-label', `Бар: ${s.bar[seat]}${isSrc ? ', влез оттук' : ''}`);
        b.addEventListener('click', () => click('bar'));
        for (let k = 0; k < Math.min(s.bar[seat], 4); k++) {
          const c = make('span', 'tb-ch');
          c.style.setProperty('--p', `var(--seat-${seat + 1})`);
          if (k === 3 && s.bar[seat] > 4) c.textContent = String(s.bar[seat]);
          b.append(c);
        }
        return b;
      };
      const topIdx = [12, 13, 14, 15, 16, 17, 'bar', 18, 19, 20, 21, 22, 23];
      const botIdx = [11, 10, 9, 8, 7, 6, 'bar', 5, 4, 3, 2, 1, 0];
      for (const i of topIdx) board.append(i === 'bar' ? barEl(true) : pointEl(i, true));
      for (const i of botIdx) board.append(i === 'bar' ? barEl(false) : pointEl(i, false));

      // изнесени
      const offRow = make('div', 'tb-off');
      [0, 1].forEach((seat) => {
        const isTgt = targets.has('off') && seat === seatMe;
        const o = make('button', 'tb-offbox' + (isTgt ? ' tgt' : ''));
        o.type = 'button';
        o.disabled = !isTgt;
        o.style.setProperty('--p', `var(--seat-${seat + 1})`);
        o.setAttribute('aria-label', `Изнесени на ${ctx.nickOf(s.players[seat])}: ${s.off[seat]}${isTgt ? ', изнеси тук' : ''}`);
        o.append(make('span', 'tb-ch'), make('span', 'num', `${ctx.nickOf(s.players[seat])}: ${s.off[seat]}/15`));
        o.addEventListener('click', () => click('off'));
        offRow.append(o);
      });
      el.append(bar, board, offRow);
    };

    const click = (where) => {
      if (selected !== null && isTarget(where)) {
        const st = steps.find((x) => x.from === selected && x.to === where);
        selected = null;
        ctx.onMove({ type: 'step', from: st.from, die: st.die });
        return;
      }
      if (where === selected) { selected = null; draw(); return; }
      if (steps.some((x) => x.from === where)) {
        const opts = steps.filter((x) => x.from === where);
        // един вариант → играй веднага
        if (opts.length === 1 || new Set(opts.map((o) => o.to)).size === 1) { ctx.onMove({ type: 'step', from: where, die: opts[0].die }); return; }
        selected = where; draw();
      }
    };
    const isTarget = (where) => steps.some((x) => x.from === selected && x.to === where);
    draw();
  },

  art() {
    const el = document.createElement('div');
    el.className = 'tb-art';
    for (let i = 0; i < 6; i++) { const t = document.createElement('span'); el.append(t); }
    return el;
  },

  css: `
.tb-dice { display:flex; gap:6px; }
.tb-dice .dp-face { width:38px; height:38px; background:#fff; border:2px solid var(--ink); border-radius:8px; padding:4px; }
.tb-dice .dp-face.used { opacity:.35; }
.tb { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)) minmax(0,.8fr) repeat(6,minmax(0,1fr)); grid-template-rows:auto auto;
  width:min(100%,520px); margin-inline:auto; padding:6px; gap:0 2px; background:var(--wood, #b07a45); border:3px solid var(--ink); border-radius:var(--r-lg); box-shadow:var(--shadow-pop); }
.tb-pt { position:relative; height:clamp(120px,34vw,170px); border:0; padding:0; background:none; cursor:default; display:flex; }
.tb-pt::before { content:""; position:absolute; inset:0; background:var(--tri); clip-path:polygon(0 0,100% 0,50% 88%); }
.tb-pt.bottom::before { clip-path:polygon(50% 12%,100% 100%,0 100%); }
.tb-pt.even { --tri: color-mix(in srgb, var(--accent) 80%, #fff); }
.tb-pt.odd { --tri: #f6ecd8; }
.tb-pt.top { flex-direction:column; }
.tb-pt.bottom { flex-direction:column-reverse; }
.tb-stack { position:relative; z-index:1; display:flex; flex-direction:inherit; align-items:center; width:100%; }
.tb-ch { width:min(100%,26px); aspect-ratio:1; border-radius:50%; background:var(--p); border:2px solid var(--ink); display:grid; place-items:center;
  color:#fff; font:800 .7rem/1 var(--f-body); box-shadow:inset 0 -2px 0 rgb(0 0 0 / .25); flex:none; }
.tb-pt.src { cursor:pointer; }
.tb-pt.src .tb-stack > :last-child { box-shadow:0 0 0 3px var(--sun); }
.tb-pt.sel .tb-stack > :last-child { box-shadow:0 0 0 4px var(--focus); }
.tb-pt.tgt { cursor:pointer; }
.tb-pt.tgt::after { content:""; position:absolute; left:50%; width:16px; height:16px; margin-left:-8px; border-radius:50%; background:var(--sun); border:2px solid var(--ink); z-index:2; }
.tb-pt.top.tgt::after { bottom:14%; }
.tb-pt.bottom.tgt::after { top:14%; }
.tb-pt:focus-visible, .tb-barcol:focus-visible, .tb-offbox:focus-visible { outline:3px solid var(--focus); outline-offset:-3px; }
.tb-barcol { grid-row:auto; border:0; padding:4px 0; background:color-mix(in srgb, var(--ink) 75%, var(--wood, #b07a45)); display:flex; flex-direction:column; align-items:center; gap:2px; cursor:default; }
.tb-barcol.src { cursor:pointer; box-shadow:inset 0 0 0 3px var(--sun); }
.tb-off { display:flex; gap:10px; justify-content:center; margin-top:10px; flex-wrap:wrap; }
.tb-offbox { display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:var(--r-pill); border:2px solid var(--line); background:var(--surface); font-weight:700; cursor:default; }
.tb-offbox .tb-ch { width:18px; }
.tb-offbox.tgt { border-color:var(--ink); background:var(--sun); color:#1b2333; cursor:pointer; box-shadow:0 3px 0 var(--ink); }
.tb-art { display:grid; grid-template-columns:repeat(6,12px); gap:2px; padding:6px; background:#b07a45; border:2px solid var(--ink); border-radius:8px; }
.tb-art span { height:44px; background:#f6ecd8; clip-path:polygon(0 0,100% 0,50% 90%); }
.tb-art span:nth-child(odd) { background:var(--accent); }
`,
};
