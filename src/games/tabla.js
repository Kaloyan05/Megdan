// Табла — 2 играчи, 15 пула всеки, без куб за удвояване.
// points[i] > 0: пулове на играч 0; < 0: на играч 1. Играч 0 върви от 23 към 0 (дом 0..5),
// играч 1 от 0 към 23 (дом 18..23). В „перспектива“ p всеки върви надолу към 0.
// Ход: хвърляне, после стъпки една по една ({ from: 'bar' | индекс, die }).
// Правило: трябва да се използват колкото може повече зарове; ако може само един от два различни, по-големият.

import { createRng } from '../core/rng.js';
import { bestBy } from '../core/bots.js';
import { dieEl } from '../ui/fx.js';

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

  // Хитър бот: изнася, удря, прави врати, не оставя самотни пулове.
  botMove(s, p, rng) {
    if (s.phase === 'roll') return { type: 'roll' };
    const seat = s.turn;
    const steps = legalSteps(s);
    const noise = steps.map(() => rng.next());
    const score = (st) => {
      const { n, hit } = applyStep(s, seat, st);
      let v = noise[steps.indexOf(st)];
      if (st.to === 'off') v += 50;
      if (hit) v += 30;
      if (st.to !== 'off') {
        const there = own(n, seat, st.to);
        if (there === 2) v += 14;
        if (there === 1) v -= 8;
        v += (23 - persp(seat, st.to)) * 0.2;
      }
      if (st.from !== 'bar' && own(n, seat, st.from) === 1) v -= 8;
      return v;
    };
    const pick = bestBy(steps, score);
    return { type: 'step', from: pick.from, die: pick.die };
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
    const fresh = Boolean(ctx.last?.fresh && s.last);
    const lastStep = fresh && s.last.kind === 'step' ? s.last : null;
    const lastRoll = fresh && s.last.kind === 'roll';

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
      faces.forEach(({ v, used }, k) => diceBox.append(dieEl(v, { cls: used ? 'used' : '', roll: lastRoll && !selected, delay: k * 70 })));
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
        const shown = Math.min(count, 5);
        for (let k = 0; k < shown; k++) {
          const c = make('span', 'tb-ch');
          c.style.setProperty('--p', `var(--seat-${seat + 1})`);
          if (k === 4 && count > 5) c.textContent = String(count);
          // Последният преместен пул тръгва от старото си място.
          if (lastStep && lastStep.to === idx && k === shown - 1) { c.dataset.fx = 'tb-dst'; c.dataset.fxFrom = 'tb-src'; }
          stack.append(c);
        }
        if (lastStep && lastStep.from === idx && shown < 5) { const g = make('span', 'tb-ch tb-slot'); g.dataset.fx = 'tb-src'; stack.append(g); }
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
        const shown = Math.min(s.bar[seat], 4);
        for (let k = 0; k < shown; k++) {
          const c = make('span', 'tb-ch');
          c.style.setProperty('--p', `var(--seat-${seat + 1})`);
          if (k === 3 && s.bar[seat] > 4) c.textContent = String(s.bar[seat]);
          // Ударен пул: отлита от полето към бара.
          if (lastStep?.hit && seat !== lastStep.seat && k === shown - 1) { c.dataset.fxFrom = 'tb-dst'; c.dataset.fxDelay = '280'; }
          b.append(c);
        }
        if (lastStep?.from === 'bar' && seat === lastStep.seat && shown < 4) { const g = make('span', 'tb-ch tb-slot'); g.dataset.fx = 'tb-src'; b.append(g); }
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
        const chip = make('span', 'tb-ch');
        if (lastStep?.to === 'off' && seat === lastStep.seat) chip.dataset.fxFrom = 'tb-src';
        o.append(chip, make('span', 'num', `${ctx.nickOf(s.players[seat])}: ${s.off[seat]}/15`));
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
.tb-dice { display:flex; gap:8px; min-height:44px; --die-size:40px; }
/* Дъска: рамка от орех, игрално поле от светло дърво, триъгълници в бордо и слонова кост. */
.tb { position:relative; display:grid; grid-template-columns:repeat(6,minmax(0,1fr)) minmax(0,.8fr) repeat(6,minmax(0,1fr)); grid-template-rows:auto auto;
  width:min(100%,520px); margin-inline:auto; padding:10px 8px; gap:0 2px; border-radius:16px; border:2px solid #3a200c;
  background:
    repeating-linear-gradient(92deg, rgb(120 70 20 / .08) 0 2px, transparent 2px 11px),
    linear-gradient(180deg,#e2b97f,#d3a466 50%,#e2b97f);
  box-shadow: inset 0 0 0 7px #6b3d1b, inset 0 0 0 9px #3a200c, inset 0 4px 14px rgb(60 30 5 / .35), 0 8px 0 #2f1a0a, 0 16px 26px rgb(40 20 5 / .35); }
.tb-pt { position:relative; height:clamp(120px,34vw,170px); border:0; padding:0; background:none; cursor:default; display:flex; }
.tb-pt::before { content:""; position:absolute; inset:0; background:var(--tri); clip-path:polygon(0 0,100% 0,50% 88%);
  filter: drop-shadow(0 1px 0 rgb(0 0 0 / .2)); }
.tb-pt.bottom::before { clip-path:polygon(50% 12%,100% 100%,0 100%); }
.tb-pt.even { --tri: linear-gradient(180deg,#a8322a,#7c1e19); }
.tb-pt.bottom.even { --tri: linear-gradient(0deg,#a8322a,#7c1e19); }
.tb-pt.odd { --tri: linear-gradient(180deg,#fbf2df,#e9d7b2); }
.tb-pt.bottom.odd { --tri: linear-gradient(0deg,#fbf2df,#e9d7b2); }
.tb-pt.top { flex-direction:column; }
.tb-pt.bottom { flex-direction:column-reverse; }
.tb-stack { position:relative; z-index:1; display:flex; flex-direction:inherit; align-items:center; width:100%; }
/* Пул: обемен диск с вдлъбнат център. */
.tb-ch { --edge: color-mix(in srgb, var(--p) 50%, #000); position:relative; width:min(100%,27px); aspect-ratio:1; border-radius:50%; flex:none;
  background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--p) 80%, #000) 0 22%, transparent 24%),
    radial-gradient(circle at 34% 28%, color-mix(in srgb, var(--p) 45%, #fff) 0 12%, var(--p) 50%, color-mix(in srgb, var(--p) 72%, #000) 100%);
  border:1px solid rgb(0 0 0 / .45); display:grid; place-items:center; color:#fff; font:800 .7rem/1 var(--f-body); text-shadow:0 1px 1px rgb(0 0 0 / .6);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--p) 70%, #fff), 0 2px 0 var(--edge), 0 3px 4px rgb(0 0 0 / .3); }
.tb-ch.tb-slot { visibility:hidden; }
.tb-pt.src { cursor:pointer; }
.tb-pt.src .tb-stack > .tb-ch:not(.tb-slot):last-of-type { outline:3px solid var(--sun); outline-offset:1px; }
.tb-pt.sel .tb-stack > .tb-ch:not(.tb-slot):last-of-type { outline:3px solid var(--focus); outline-offset:1px; transform:scale(1.12); }
.tb-pt.tgt { cursor:pointer; }
.tb-pt.tgt::after { content:""; position:absolute; left:50%; width:16px; height:16px; margin-left:-8px; border-radius:50%; background:var(--sun); border:2px solid #3a200c; z-index:2;
  animation: tbTgt 1.3s ease-out infinite; }
@keyframes tbTgt { 0% { box-shadow:0 0 0 0 rgb(255 199 67 / .7); } 70%, 100% { box-shadow:0 0 0 10px rgb(255 199 67 / 0); } }
.tb-pt.top.tgt::after { bottom:14%; }
.tb-pt.bottom.tgt::after { top:14%; }
.tb-pt:focus-visible, .tb-barcol:focus-visible, .tb-offbox:focus-visible { outline:3px solid var(--focus); outline-offset:-3px; }
.tb-barcol { grid-row:auto; border:0; padding:4px 0; display:flex; flex-direction:column; align-items:center; gap:2px; cursor:default;
  background: repeating-linear-gradient(92deg, rgb(0 0 0 / .1) 0 2px, transparent 2px 8px), linear-gradient(90deg,#4a2810,#6b3d1b 50%,#4a2810);
  box-shadow: inset 0 0 6px rgb(0 0 0 / .4); }
.tb-barcol.src { cursor:pointer; box-shadow:inset 0 0 0 3px var(--sun); }
.tb-off { display:flex; gap:10px; justify-content:center; margin-top:14px; flex-wrap:wrap; }
.tb-offbox { display:flex; align-items:center; gap:8px; padding:6px 12px; border-radius:var(--r-pill); border:2px solid var(--line); background:var(--surface); font-weight:700; cursor:default; }
.tb-offbox .tb-ch { width:20px; }
.tb-offbox.tgt { border-color:var(--ink); background:var(--sun); color:#1b2333; cursor:pointer; box-shadow:0 3px 0 var(--ink); }
@media (prefers-reduced-motion: reduce) { .tb-pt.tgt::after { animation:none; } }
.tb-art { display:grid; grid-template-columns:repeat(6,12px); gap:2px; padding:6px; background:#b07a45; border:2px solid var(--ink); border-radius:8px; }
.tb-art span { height:44px; background:#f6ecd8; clip-path:polygon(0 0,100% 0,50% 90%); }
.tb-art span:nth-child(odd) { background:var(--accent); }
`,
};
