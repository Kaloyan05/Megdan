// Цветна осмица — собствена игра с карти за 2–6 играчи.
// Тесте: 4 цвята × 16 = 64 карти. Във всеки цвят: 1–7 и 9 (по една), две осмици (жокер, сменя цвета),
// две „Пропусни“, две „Обратно“, две „+2“.
// Ход: изиграй карта със същия цвят или стойност, или осмица (избираш цвят). Иначе тегли една;
// изтеглената можеш да изиграеш веднага, иначе пропускаш. Първият без карти печели.

import { createRng } from '../core/rng.js';

export const COLORS = ['червено', 'синьо', 'жълто', 'зелено'];
const KINDS = ['1', '2', '3', '4', '5', '6', '7', '9', '8', '8', 'skip', 'skip', 'rev', 'rev', 'plus2', 'plus2'];
const LABEL = { skip: '⊘', rev: '⇄', plus2: '+2' };
const NAME = { skip: 'Пропусни', rev: 'Обратно', plus2: '+2' };

export const card = (id) => ({ id, color: Math.floor(id / 16), kind: KINDS[id % 16] });
const isWild = (id) => card(id).kind === '8';
const top = (s) => s.discard[s.discard.length - 1];

export function canPlay(s, id) {
  if (isWild(id)) return true;
  const c = card(id), t = card(top(s));
  return c.color === s.color || c.kind === t.kind;
}

function nextSeat(s, from, steps = 1) {
  const n = s.players.length;
  return (((from + s.dir * steps) % n) + n) % n;
}

// Тегли count карти за играч seat; при празно тесте разбърква изхвърлените (без горната).
function drawCards(s, seat, count) {
  const drawn = [];
  for (let k = 0; k < count; k++) {
    if (!s.draw.length) {
      if (s.discard.length <= 1) break;
      const keep = s.discard.pop();
      s.reshuffles += 1;
      s.draw = createRng(`${s.seed}:${s.reshuffles}`).shuffle(s.discard);
      s.discard = [keep];
    }
    const id = s.draw.pop();
    s.hands[seat].push(id);
    drawn.push(id);
  }
  return drawn;
}

const canDrawAny = (s) => s.draw.length + s.discard.length - 1 > 0;
const clone = (s) => ({ ...s, hands: s.hands.map((h) => h.slice()), draw: s.draw.slice(), discard: s.discard.slice() });

export default {
  id: 'color8',
  name: 'Цветна осмица',
  icon: '🃏',
  blurb: 'Карти с цветове. Осмицата сменя цвета.',
  minPlayers: 2,
  maxPlayers: 6,
  moveSound: 'card',

  init(seed, players) {
    const rng = createRng(`${seed}:deck`);
    const deck = rng.shuffle([...Array(64).keys()]);
    const hands = players.map(() => []);
    for (let k = 0; k < 7; k++) for (let p = 0; p < players.length; p++) hands[p].push(deck.pop());
    // Първата карта е число (не осмица и не специална).
    let i = deck.length - 1;
    while (!/^[1-79]$/.test(card(deck[i]).kind)) i -= 1;
    const first = deck.splice(i, 1)[0];
    return {
      seed: String(seed), players: players.slice(), hands, draw: deck, discard: [first],
      color: card(first).color, dir: 1, turn: 0, pending: null, winner: null, reshuffles: 0,
      last: null, // { seat, kind, drew } за съобщението над масата
    };
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.winner !== null) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    const hand = s.hands[s.turn];
    if (m?.type === 'play') {
      if (!hand.includes(m.card)) return { ok: false, reason: 'not-in-hand' };
      if (s.pending !== null && m.card !== s.pending) return { ok: false, reason: 'only-drawn' };
      if (!canPlay(s, m.card)) return { ok: false, reason: 'no-match' };
      if (isWild(m.card) && !(Number.isInteger(m.color) && m.color >= 0 && m.color < 4)) return { ok: false, reason: 'pick-color' };
      return { ok: true };
    }
    if (m?.type === 'draw') {
      if (s.pending !== null) return { ok: false, reason: 'already-drew' };
      if (!canDrawAny(s)) return { ok: false, reason: 'deck-empty' };
      return { ok: true };
    }
    if (m?.type === 'pass') {
      if (s.pending !== null) return { ok: true };
      if (!canDrawAny(s) && !hand.some((id) => canPlay(s, id))) return { ok: true };
      return { ok: false, reason: 'draw-first' };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m) {
    const s = clone(s0);
    const seat = s.turn;
    if (m.type === 'draw') {
      const [id] = drawCards(s, seat, 1);
      s.last = { seat, kind: 'draw' };
      if (id !== undefined && canPlay(s, id)) { s.pending = id; return s; }
      s.pending = null;
      s.turn = nextSeat(s, seat);
      return s;
    }
    if (m.type === 'pass') {
      s.pending = null;
      s.last = { seat, kind: 'pass' };
      s.turn = nextSeat(s, seat);
      return s;
    }
    // play
    s.hands[seat] = s.hands[seat].filter((id) => id !== m.card);
    s.discard.push(m.card);
    s.pending = null;
    const c = card(m.card);
    s.color = isWild(m.card) ? m.color : c.color;
    s.last = { seat, kind: c.kind, color: s.color };
    if (!s.hands[seat].length) { s.winner = seat; return s; }
    const n = s.players.length;
    if (c.kind === 'rev') {
      if (n === 2) { s.turn = seat; return s; } // при двама действа като „Пропусни“
      s.dir = -s.dir;
      s.turn = nextSeat(s, seat);
    } else if (c.kind === 'skip') {
      s.last.target = nextSeat(s, seat);
      s.turn = nextSeat(s, seat, 2);
    } else if (c.kind === 'plus2') {
      const victim = nextSeat(s, seat);
      s.last.target = victim;
      s.last.drew = drawCards(s, victim, 2).length;
      s.turn = nextSeat(s, seat, 2);
    } else {
      s.turn = nextSeat(s, seat);
    }
    return s;
  },

  autoMove(s, p, rng) {
    const hand = s.hands[s.turn];
    if (s.pending !== null) return canPlay(s, s.pending) ? this.playWithColor(s, s.pending) : { type: 'pass' };
    const playable = hand.filter((id) => canPlay(s, id));
    const plain = playable.filter((id) => !isWild(id));
    if (plain.length) return { type: 'play', card: rng.pick(plain) };
    if (playable.length) return this.playWithColor(s, playable[0]);
    return canDrawAny(s) ? { type: 'draw' } : { type: 'pass' };
  },

  // Осмица: избира най-честия цвят в ръката.
  playWithColor(s, id) {
    if (!isWild(id)) return { type: 'play', card: id };
    const counts = [0, 0, 0, 0];
    for (const x of s.hands[s.turn]) if (!isWild(x)) counts[card(x).color] += 1;
    return { type: 'play', card: id, color: counts.indexOf(Math.max(...counts)) };
  },

  isOver: (s) => s.winner !== null,
  winner: (s) => (s.winner === null ? null : s.players[s.winner]),
  placements(s) {
    const counts = s.hands.map((h) => h.length);
    const sorted = [...new Set(counts)].sort((a, b) => a - b);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(counts[i]) + 1]));
  },

  render(el, s, ctx) {
    const meSeat = s.players.indexOf(ctx.me);
    const myTurn = !ctx.over && meSeat === s.turn;
    el.innerHTML = '';
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

    // съперници
    const opp = make('div', 'c8-opps');
    s.players.forEach((p, i) => {
      if (i === meSeat) return;
      const o = make('div', 'c8-opp' + (i === s.turn && !ctx.over ? ' turn' : ''));
      o.append(make('span', 'c8-opp-name', ctx.nickOf(p)));
      const fan = make('span', 'c8-fan');
      for (let k = 0; k < Math.min(s.hands[i].length, 8); k++) fan.append(make('i'));
      o.append(fan, make('span', 'c8-count', s.hands[i].length === 1 ? '1 карта!' : `${s.hands[i].length} карти`));
      opp.append(o);
    });

    // маса
    const table = make('div', 'c8-table');
    const drawBtn = make('button', 'c8-pile');
    drawBtn.type = 'button';
    drawBtn.disabled = !myTurn || s.pending !== null || !canDrawAny(s);
    drawBtn.setAttribute('aria-label', `Тегли карта. В тестето има ${s.draw.length}`);
    drawBtn.append(make('span', 'c8-back'), make('span', 'c8-pile-n', String(s.draw.length)));
    drawBtn.addEventListener('click', () => ctx.onMove({ type: 'draw' }));
    const topCard = cardEl(top(s), make);
    topCard.classList.add('c8-top');
    topCard.setAttribute('aria-label', `Горна карта: ${describe(top(s))}. Цвят: ${COLORS[s.color]}`);
    const ring = make('div', 'c8-color');
    ring.style.setProperty('--c', `var(--seat-${[1, 2, 3, 4][s.color]})`);
    ring.append(make('span', null, COLORS[s.color]));
    table.append(drawBtn, topCard, ring);

    // съобщение
    const msg = make('p', 'c8-msg', lastText(s, ctx));

    // моята ръка
    const handWrap = make('div', 'c8-hand-wrap');
    if (meSeat >= 0) {
      const hand = make('div', 'c8-hand' + (myTurn ? ' my-turn' : ''));
      hand.setAttribute('aria-label', 'Твоите карти');
      const sorted = s.hands[meSeat].slice().sort((a, b) => card(a).color - card(b).color || KINDS.indexOf(card(a).kind) - KINDS.indexOf(card(b).kind));
      for (const id of sorted) {
        const playable = myTurn && (s.pending === null || s.pending === id) && canPlay(s, id);
        const b = cardEl(id, make, 'button');
        b.type = 'button';
        b.classList.add('c8-in-hand');
        if (playable) b.classList.add('playable');
        if (id === s.pending) b.classList.add('drawn');
        b.disabled = !playable;
        b.setAttribute('aria-label', describe(id) + (playable ? ', изиграй' : ''));
        b.addEventListener('click', () => {
          if (isWild(id)) openPicker(id); else ctx.onMove({ type: 'play', card: id });
        });
        hand.append(b);
      }
      handWrap.append(hand);
      if (myTurn && s.pending !== null) {
        const pass = make('button', 'btn btn-small', 'Пропусни');
        pass.type = 'button';
        pass.addEventListener('click', () => ctx.onMove({ type: 'pass' }));
        const row = make('div', 'c8-after-draw');
        row.append(make('span', null, 'Изтегли карта, която става. Изиграй я или пропусни.'), pass);
        handWrap.append(row);
      } else if (myTurn && !canDrawAny(s) && !s.hands[meSeat].some((id) => canPlay(s, id))) {
        const pass = make('button', 'btn btn-small', 'Пропусни');
        pass.type = 'button';
        pass.addEventListener('click', () => ctx.onMove({ type: 'pass' }));
        handWrap.append(pass);
      }
    }

    // избор на цвят за осмица
    const picker = make('div', 'c8-picker');
    picker.hidden = true;
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-label', 'Избери цвят');
    const openPicker = (id) => {
      picker.replaceChildren(make('p', 'c8-picker-title', 'Избери цвят'));
      const row = make('div', 'c8-picker-row');
      COLORS.forEach((name, ci) => {
        const b = make('button', 'c8-swatch', name);
        b.type = 'button';
        b.style.setProperty('--c', `var(--seat-${ci + 1})`);
        b.addEventListener('click', () => { picker.hidden = true; ctx.onMove({ type: 'play', card: id, color: ci }); });
        row.append(b);
      });
      const cancel = make('button', 'btn btn-small btn-quiet', 'Отказ');
      cancel.type = 'button';
      cancel.addEventListener('click', () => { picker.hidden = true; });
      picker.append(row, cancel);
      picker.hidden = false;
      row.querySelector('button')?.focus();
    };

    el.append(opp, table, msg, handWrap, picker);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'c8-art';
    for (const [c, t] of [[1, '7'], [2, '+2'], [0, '8']]) {
      const k = document.createElement('span');
      k.textContent = t;
      if (c) k.style.setProperty('--c', `var(--seat-${c})`); else k.className = 'wild';
      el.append(k);
    }
    return el;
  },

  css: `
.c8-opps { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; width:100%; }
.c8-opp { display:grid; justify-items:center; gap:2px; padding:8px 12px; border-radius:var(--r-md); background:var(--surface); border:2px solid var(--line); min-width:0; }
.c8-opp.turn { border-color:var(--ink); box-shadow:0 3px 0 var(--ink); }
.c8-opp-name { font-weight:700; max-width:10ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.c8-fan { display:flex; height:26px; }
.c8-fan i { width:16px; height:24px; margin-left:-7px; border-radius:4px; background:var(--board); border:2px solid var(--surface); }
.c8-fan i:first-child { margin-left:0; }
.c8-count { font-size:var(--step--1); color:var(--ink-2); font-variant-numeric:tabular-nums; }
.c8-table { display:flex; align-items:center; justify-content:center; gap:16px; padding:18px 12px; margin-block:12px;
  background:var(--felt); border-radius:var(--r-lg); width:100%; }
.c8-pile { position:relative; border:0; padding:0; background:none; cursor:pointer; }
.c8-pile:disabled { cursor:default; opacity:.85; }
.c8-back { display:block; width:64px; height:92px; border-radius:10px; border:3px solid #fff;
  background:repeating-linear-gradient(45deg, var(--board) 0 6px, color-mix(in srgb, var(--board) 70%, #fff) 6px 9px); box-shadow:0 4px 0 rgb(0 0 0 / .3); }
.c8-pile:not(:disabled):hover .c8-back { transform:translateY(-3px); }
.c8-pile-n { position:absolute; right:-6px; top:-6px; background:var(--surface); color:var(--ink); border:2px solid var(--ink); border-radius:999px; font-size:.75rem; font-weight:700; padding:0 6px; font-variant-numeric:tabular-nums; }
.c8-card { --c: var(--seat-1); width:64px; height:92px; flex:none; border-radius:10px; border:3px solid #fff; background:var(--c); color:#fff;
  display:grid; place-items:center; font:800 1.6rem/1 var(--f-display); text-shadow:0 2px 0 rgb(0 0 0 / .25); box-shadow:0 4px 0 rgb(0 0 0 / .25); position:relative; }
.c8-card .corner { position:absolute; top:5px; left:7px; font-size:.75rem; }
.c8-card.light { color:#1b2333; text-shadow:none; }
.c8-card.wild { background:conic-gradient(var(--seat-1) 0 25%, var(--seat-2) 0 50%, var(--seat-3) 0 75%, var(--seat-4) 0); }
.c8-card.wild .val { background:#fff; color:#1b2333; width:40px; height:40px; border-radius:50%; display:grid; place-items:center; text-shadow:none; }
.c8-top { width:76px; height:108px; font-size:2rem; animation:c8in .25s ease-out; }
@keyframes c8in { from { transform:translateY(-14px) rotate(-8deg); opacity:.4; } }
.c8-color { display:grid; place-items:center; width:64px; height:64px; border-radius:50%; background:var(--c); color:#fff; font-weight:700; font-size:.75rem; box-shadow:inset 0 0 0 4px rgb(255 255 255 / .6); text-shadow:0 1px 0 rgb(0 0 0 / .3); }
.c8-msg { text-align:center; min-height:1.5em; color:var(--ink-2); font-weight:500; }
.c8-hand-wrap { width:100%; display:grid; gap:10px; justify-items:center; }
.c8-hand { display:flex; overflow-x:auto; max-width:100%; padding:18px 6px 10px; scroll-snap-type:x proximity; }
.c8-in-hand { cursor:pointer; scroll-snap-align:center; transition:transform .12s ease; }
.c8-in-hand + .c8-in-hand { margin-left:-22px; }
.c8-in-hand:disabled { cursor:default; }
.c8-hand.my-turn .c8-in-hand:disabled { filter:saturate(.4) brightness(.9); }
.c8-in-hand.playable { transform:translateY(-12px); }
.c8-in-hand.playable:hover { transform:translateY(-16px); }
.c8-in-hand.drawn { outline:3px solid var(--sun); outline-offset:2px; }
.c8-in-hand:focus-visible { outline:3px solid var(--focus); outline-offset:2px; }
.c8-after-draw { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:center; text-align:center; }
.c8-picker { position:fixed; z-index:20; left:50%; bottom:calc(16px + env(safe-area-inset-bottom, 0px)); transform:translateX(-50%);
  width:min(92vw,380px); background:var(--surface); border:2px solid var(--ink); border-radius:var(--r-lg); box-shadow:0 6px 0 var(--ink); padding:14px; display:grid; gap:10px; justify-items:center; }
.c8-picker-title { font-weight:700; }
.c8-picker-row { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; width:100%; }
.c8-swatch { min-height:52px; border-radius:var(--r-md); border:2px solid var(--ink); background:var(--c); color:#fff; font-weight:700; text-shadow:0 1px 0 rgb(0 0 0 / .3); cursor:pointer; }
.c8-art { display:flex; }
.c8-art span { width:40px; height:56px; margin-left:-10px; border-radius:7px; border:2px solid #fff; background:var(--c); color:#fff; display:grid; place-items:center;
  font:800 1rem/1 var(--f-display); box-shadow:0 3px 0 rgb(0 0 0 / .2); transform:rotate(calc((var(--i, 0) - 1) * 8deg)); }
.c8-art span:first-child { margin-left:0; transform:rotate(-8deg); }
.c8-art span:last-child { transform:rotate(8deg); }
.c8-art .wild { background:conic-gradient(var(--seat-1) 0 25%, var(--seat-2) 0 50%, var(--seat-3) 0 75%, var(--seat-4) 0); }
@media (prefers-reduced-motion: reduce) { .c8-top { animation:none; } .c8-in-hand { transition:none; } }
`,
};

function describe(id) {
  const c = card(id);
  if (c.kind === '8') return 'Осмица, сменя цвета';
  return `${NAME[c.kind] ?? c.kind}, ${COLORS[c.color]}`;
}

function cardEl(id, make, tag = 'div') {
  const c = card(id);
  const el = make(tag, 'c8-card' + (c.kind === '8' ? ' wild' : ''));
  if (c.kind !== '8') el.style.setProperty('--c', `var(--seat-${c.color + 1})`);
  if (c.color === 2 && c.kind !== '8') el.classList.add('light');
  const label = LABEL[c.kind] ?? c.kind;
  el.append(make('span', 'corner', label), make('span', 'val', label));
  return el;
}

function lastText(s, ctx) {
  const l = s.last;
  if (!l) return `Започва ${ctx.nickOf(s.players[0])}.`;
  const who = ctx.nickOf(s.players[l.seat]);
  if (l.kind === 'draw') return `${who} тегли карта.`;
  if (l.kind === 'pass') return `${who} пропусна.`;
  if (l.kind === '8') return `${who} изигра осмица. Цветът е ${COLORS[l.color]}.`;
  if (l.kind === 'skip') return `${who} изигра „Пропусни“. ${ctx.nickOf(s.players[l.target])} пропуска.`;
  if (l.kind === 'rev') return s.players.length === 2 ? `${who} изигра „Обратно“ и играе пак.` : `${who} обърна посоката.`;
  if (l.kind === 'plus2') return `${ctx.nickOf(s.players[l.target])} тегли ${l.drew} и пропуска.`;
  return `${who} изигра ${l.kind}.`;
}
