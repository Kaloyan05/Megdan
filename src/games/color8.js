// Цветна осмица — собствена игра с карти за 2–6 играчи.
// Тесте: 4 цвята × 16 = 64 карти + 4 жокера „+4“ = 68. Във всеки цвят: 1–7 и 9 (по една), две осмици (жокер, сменя цвета),
// две „Пропусни“, две „Обратно“, две „+2“.
// Ход: изиграй карта със същия цвят или стойност, или осмица (избираш цвят). Иначе тегли една;
// изтеглената можеш да изиграеш веднага, иначе пропускаш. Първият без карти печели.

import { createRng } from '../core/rng.js';

export const COLORS = ['червено', 'синьо', 'жълто', 'зелено'];
const KINDS = ['1', '2', '3', '4', '5', '6', '7', '9', '8', '8', 'skip', 'skip', 'rev', 'rev', 'plus2', 'plus2'];
const LABEL = { skip: '⊘', rev: '⇄', plus2: '+2', w4: '+4' };
const NAME = { skip: 'Пропусни', rev: 'Обратно', plus2: '+2' };
const DECK_SIZE = 68;
const LAST_CARD_PENALTY = 2;

export const card = (id) => (id >= 64 ? { id, color: -1, kind: 'w4' } : { id, color: Math.floor(id / 16), kind: KINDS[id % 16] });
const isWild = (id) => { const k = card(id).kind; return k === '8' || k === 'w4'; };
const top = (s) => s.discard[s.discard.length - 1];

// Може ли картата сега: при натрупано „+“ само +2/+4 върху него.
export function canPlayNow(s, id) {
  if (s.owed) return (card(id).kind === 'plus2' || card(id).kind === 'w4') && canPlay(s, id);
  return canPlay(s, id);
}

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
  blurb: 'Карти с цветове, жокери и +4. Не забравяй „Последна карта!“.',
  rules: ["Всеки започва със 7 карти (или 5, 9 по избор). Играеш карта със същия цвят или стойност като горната.", "Осмицата е жокер: играеш я винаги и избираш новия цвят. Жокерът +4 също сменя цвета, а следващият тегли 4 и пропуска.", "„Пропусни“ прескача следващия, „Обратно“ обръща посоката, „+2“ кара следващия да тегли две и да пропусне. С правилото „+2 върху +2“ той може да отговори със свое +2 или +4 и дългът се трупа.", "Нямаш ход? Тегли карта. Ако става, можеш да я изиграеш веднага.", "Преди да изиграеш предпоследната си карта, натисни „Последна карта!“. Иначе теглиш 2.", "Печели първият, който остане без карти."],
  minPlayers: 2,
  maxPlayers: 6,
  moveSound: 'card',
  options: [
    { id: 'hand', label: 'Карти в ръка', default: 7, choices: [{ value: 5, label: '5' }, { value: 7, label: '7' }, { value: 9, label: '9' }] },
    { id: 'stack', label: '+2 върху +2', default: false, choices: [{ value: false, label: 'Не' }, { value: true, label: 'Да, трупат се' }] },
  ],

  init(seed, players, opts = {}) {
    const handSize = opts.hand ?? 7;
    const rng = createRng(`${seed}:deck`);
    const deck = rng.shuffle([...Array(DECK_SIZE).keys()]);
    const hands = players.map(() => []);
    for (let k = 0; k < handSize; k++) for (let p = 0; p < players.length; p++) hands[p].push(deck.pop());
    // Първата карта е число (не осмица и не специална).
    let i = deck.length - 1;
    while (!/^[1-79]$/.test(card(deck[i]).kind)) i -= 1;
    const first = deck.splice(i, 1)[0];
    return {
      seed: String(seed), players: players.slice(), hands, draw: deck, discard: [first],
      color: card(first).color, dir: 1, turn: 0, pending: null, winner: null, reshuffles: 0,
      stack: Boolean(opts.stack), owed: 0,
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
      if (!canPlayNow(s, m.card)) return { ok: false, reason: s.owed ? 'must-stack' : 'no-match' };
      if (isWild(m.card) && !(Number.isInteger(m.color) && m.color >= 0 && m.color < 4)) return { ok: false, reason: 'pick-color' };
      return { ok: true };
    }
    if (m?.type === 'draw') {
      if (s.pending !== null) return { ok: false, reason: 'already-drew' };
      if (!s.owed && !canDrawAny(s)) return { ok: false, reason: 'deck-empty' };
      return { ok: true };
    }
    if (m?.type === 'pass') {
      if (s.owed) return { ok: false, reason: 'draw-first' };
      if (s.pending !== null) return { ok: true };
      if (!canDrawAny(s) && !hand.some((id) => canPlay(s, id))) return { ok: true };
      return { ok: false, reason: 'draw-first' };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m) {
    const s = clone(s0);
    const seat = s.turn;
    if (m.type === 'draw' && s.owed) {
      s.last = { seat, kind: 'owed', drew: drawCards(s, seat, s.owed).length };
      s.owed = 0;
      s.turn = nextSeat(s, seat);
      return s;
    }
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
    // „Последна карта!“: остане ли ти една карта без обявяване, теглиш наказателни.
    if (s.hands[seat].length === 1) {
      if (m.call) s.last.called = true;
      else s.last.penalty = drawCards(s, seat, LAST_CARD_PENALTY).length;
    }
    const n = s.players.length;
    if (c.kind === 'rev') {
      if (n === 2) { s.turn = seat; return s; } // при двама действа като „Пропусни“
      s.dir = -s.dir;
      s.turn = nextSeat(s, seat);
    } else if (c.kind === 'skip') {
      s.last.target = nextSeat(s, seat);
      s.turn = nextSeat(s, seat, 2);
    } else if ((c.kind === 'plus2' || c.kind === 'w4') && s.stack) {
      // Трупане: следващият може да сложи свое +2/+4 или да тегли всичко.
      s.owed += c.kind === 'w4' ? 4 : 2;
      s.last.target = nextSeat(s, seat);
      s.last.owed = s.owed;
      s.turn = nextSeat(s, seat);
    } else if (c.kind === 'plus2' || c.kind === 'w4') {
      const victim = nextSeat(s, seat);
      s.last.target = victim;
      s.last.drew = drawCards(s, victim, c.kind === 'w4' ? 4 : 2).length;
      s.turn = nextSeat(s, seat, 2);
    } else {
      s.turn = nextSeat(s, seat);
    }
    return s;
  },

  autoMove(s, p, rng) {
    const hand = s.hands[s.turn];
    if (s.pending !== null) return canPlay(s, s.pending) ? this.playWithColor(s, s.pending) : { type: 'pass' };
    if (s.owed) {
      const stackers = hand.filter((id) => canPlayNow(s, id));
      return stackers.length ? this.playWithColor(s, stackers[0]) : { type: 'draw' };
    }
    const playable = hand.filter((id) => canPlay(s, id));
    const plain = playable.filter((id) => !isWild(id));
    if (plain.length) return { type: 'play', card: rng.pick(plain), call: hand.length === 2 };
    if (playable.length) return this.playWithColor(s, playable[0]);
    return canDrawAny(s) ? { type: 'draw' } : { type: 'pass' };
  },

  // Осмица: избира най-честия цвят в ръката.
  playWithColor(s, id) {
    const call = s.hands[s.turn].length === 2;
    if (!isWild(id)) return { type: 'play', card: id, call };
    const counts = [0, 0, 0, 0];
    for (const x of s.hands[s.turn]) if (!isWild(x)) counts[card(x).color] += 1;
    return { type: 'play', card: id, color: counts.indexOf(Math.max(...counts)), call };
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
    const lm = ctx.last?.fresh ? ctx.last : null;
    const actorSeat = lm ? s.players.indexOf(lm.actor) : -1;
    const fromOf = (seat) => (seat === meSeat ? 'c8-hand' : `c8-opp-${seat}`);
    // Кои карти са нови в ръката ми (изтеглени): сравнявам с предишния рендер.
    const sc = ctx.scratch ?? {};
    const myHand = meSeat >= 0 ? s.hands[meSeat] : [];
    const newIds = new Set(lm && sc.prevHand ? myHand.filter((id) => !sc.prevHand.includes(id)) : []);
    const prevCounts = sc.prevCounts ?? s.hands.map((h) => h.length);
    sc.prevHand = myHand.slice();
    sc.prevCounts = s.hands.map((h) => h.length);

    // съперници
    const opp = make('div', 'c8-opps');
    s.players.forEach((p, i) => {
      if (i === meSeat) return;
      const o = make('div', 'c8-opp' + (i === s.turn && !ctx.over ? ' turn' : ''));
      o.dataset.fx = `c8-opp-${i}`;
      o.style.setProperty('--seat', `var(--seat-${i + 1})`);
      o.append(make('span', 'c8-opp-name', ctx.nickOf(p)));
      const fan = make('span', 'c8-fan');
      const shown = Math.min(s.hands[i].length, 8);
      const gained = lm ? Math.max(0, s.hands[i].length - (prevCounts[i] ?? s.hands[i].length)) : 0;
      for (let k = 0; k < shown; k++) {
        const card = make('i');
        // Изтеглени карти: летят от тестето към съперника.
        if (k >= shown - gained) { card.dataset.fxFrom = 'c8-pile'; card.dataset.fxDelay = String((k - (shown - gained)) * 90); }
        fan.append(card);
      }
      o.append(fan, make('span', 'c8-count', s.hands[i].length === 1 ? '1 карта!' : `${s.hands[i].length} карти`));
      opp.append(o);
    });

    // маса
    const table = make('div', 'c8-table');
    const drawBtn = make('button', 'c8-pile');
    drawBtn.type = 'button';
    drawBtn.dataset.fx = 'c8-pile';
    drawBtn.disabled = !myTurn || s.pending !== null || (!s.owed && !canDrawAny(s));
    drawBtn.setAttribute('aria-label', s.owed ? `Тегли ${s.owed} карти` : `Тегли карта. В тестето има ${s.draw.length}`);
    drawBtn.append(make('span', 'c8-back'), make('span', 'c8-pile-n', s.owed ? `+${s.owed}` : String(s.draw.length)));
    drawBtn.addEventListener('click', () => ctx.onMove({ type: 'draw' }));
    const topCard = cardEl(top(s), make);
    topCard.classList.add('c8-top');
    // Малко наклон, като истинска купчина; изиграната карта долита от ръката на играча.
    topCard.style.setProperty('--tilt', `${((top(s) * 37) % 13) - 6}deg`);
    const under = make('span', 'c8-under');
    const discardWrap = make('span', 'c8-discard');
    discardWrap.append(under, topCard);
    if (lm?.move?.type === 'play' && actorSeat >= 0) { topCard.dataset.fxFrom = fromOf(actorSeat); topCard.classList.add('c8-landed'); }
    topCard.setAttribute('aria-label', `Горна карта: ${describe(top(s))}. Цвят: ${COLORS[s.color]}`);
    const ring = make('div', 'c8-color');
    ring.style.setProperty('--c', `var(--seat-${[1, 2, 3, 4][s.color]})`);
    ring.append(make('span', null, COLORS[s.color]));
    table.append(drawBtn, discardWrap, ring);

    // съобщение
    const msg = make('p', 'c8-msg', lastText(s, ctx));

    // моята ръка
    const handWrap = make('div', 'c8-hand-wrap');
    let called = false;
    if (meSeat >= 0) {
      const hand = make('div', 'c8-hand' + (myTurn ? ' my-turn' : ''));
      hand.dataset.fx = 'c8-hand';
      hand.setAttribute('aria-label', 'Твоите карти');
      const sorted = s.hands[meSeat].slice().sort((a, b) => card(a).color - card(b).color || KINDS.indexOf(card(a).kind) - KINDS.indexOf(card(b).kind));
      const mid = (sorted.length - 1) / 2;
      for (const [k, id] of sorted.entries()) {
        const playable = myTurn && (s.pending === null || s.pending === id) && canPlayNow(s, id);
        const b = cardEl(id, make, 'button');
        b.type = 'button';
        b.classList.add('c8-in-hand');
        // Ветрило: картите леко се завъртат около долния си край.
        const off = sorted.length > 1 ? (k - mid) / Math.max(mid, 1) : 0;
        b.style.setProperty('--fan', `${off * Math.min(14, sorted.length * 2)}deg`);
        b.style.setProperty('--drop', `${Math.abs(off) * Math.min(14, sorted.length * 1.6)}px`);
        if (playable) b.classList.add('playable');
        if (id === s.pending) b.classList.add('drawn');
        if (newIds.has(id)) { b.dataset.fxFrom = 'c8-pile'; b.dataset.fxDelay = String([...newIds].indexOf(id) * 90); }
        b.disabled = !playable;
        b.setAttribute('aria-label', describe(id) + (playable ? ', изиграй' : ''));
        b.addEventListener('click', () => {
          if (isWild(id)) openPicker(id); else ctx.onMove({ type: 'play', card: id, call: called });
        });
        hand.append(b);
      }
      handWrap.append(hand);
      if (myTurn && s.hands[meSeat].length === 2) {
        const callBtn = make('button', 'btn btn-small btn-sun c8-call', 'Последна карта!');
        callBtn.type = 'button';
        callBtn.setAttribute('aria-pressed', 'false');
        callBtn.addEventListener('click', () => {
          called = !called;
          callBtn.setAttribute('aria-pressed', String(called));
          callBtn.textContent = called ? 'Обявено: последна карта' : 'Последна карта!';
          ctx.sound?.tap?.();
        });
        handWrap.append(callBtn, make('p', 'hint', `Натисни преди да изиграеш предпоследната си карта, иначе теглиш ${LAST_CARD_PENALTY}.`));
      }
      if (myTurn && s.pending !== null) {
        const pass = make('button', 'btn btn-small', 'Пропусни');
        pass.type = 'button';
        pass.addEventListener('click', () => ctx.onMove({ type: 'pass' }));
        const row = make('div', 'c8-after-draw');
        row.append(make('span', null, 'Изтегли карта, която става. Изиграй я или пропусни.'), pass);
        handWrap.append(row);
      } else if (myTurn && s.owed) {
        handWrap.append(make('p', 'hint c8-owed', `Сложи +2 или +4, или докосни тестето и тегли ${s.owed}.`));
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
        b.addEventListener('click', () => { picker.hidden = true; ctx.onMove({ type: 'play', card: id, color: ci, call: called }); });
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
.c8-opp { transition: transform .25s cubic-bezier(.2,1.4,.4,1), border-color .25s, background-color .25s; }
.c8-opp.turn { border-color:var(--seat); background:color-mix(in srgb, var(--seat) 14%, var(--surface)); box-shadow:0 0 0 3px color-mix(in srgb, var(--seat) 28%, transparent), 0 3px 0 var(--seat); transform:translateY(-2px); }
.c8-discard { position:relative; display:grid; }
.c8-discard > * { grid-area:1/1; }
.c8-under { width:76px; height:108px; border-radius:10px; background:#fff; transform:rotate(7deg) translate(4px,2px); box-shadow:0 2px 6px rgb(0 0 0 / .25), -3px -2px 0 -1px #e9e4d8; }
.c8-top { transform:rotate(var(--tilt, 0deg)); box-shadow:0 3px 0 rgb(0 0 0 / .18), 0 10px 18px rgb(0 0 0 / .3); }
.c8-top.c8-landed { animation: c8land .5s cubic-bezier(.2,1.3,.4,1) .05s backwards; }
@keyframes c8land { from { rotate: 18deg; scale: 1.15; } }
.c8-opp-name { font-weight:700; max-width:10ch; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.c8-fan { display:flex; height:26px; }
.c8-fan i { width:16px; height:24px; margin-left:-7px; border-radius:4px; background:var(--board); border:2px solid var(--surface); }
.c8-fan i:first-child { margin-left:0; }
.c8-count { font-size:var(--step--1); color:var(--ink-2); font-variant-numeric:tabular-nums; }
.c8-table { display:flex; align-items:center; justify-content:center; gap:16px; padding:20px 12px; margin-block:12px; border-radius:22px; width:100%;
  background: var(--felt-tex), radial-gradient(120% 90% at 50% 35%, color-mix(in srgb, var(--felt) 85%, #fff), var(--felt) 55%, color-mix(in srgb, var(--felt) 72%, #000));
  box-shadow: inset 0 0 0 7px #6b3d1b, inset 0 0 0 9px #3a200c, inset 0 6px 18px rgb(0 0 0 / .35), 0 6px 0 #3a200c; }
.c8-pile { position:relative; border:0; padding:0; background:none; cursor:pointer; }
.c8-pile:disabled { cursor:default; opacity:.85; }
.c8-back { position:relative; display:block; width:64px; height:92px; border-radius:10px; border:3px solid #fff;
  background:
    radial-gradient(ellipse 34% 24% at 50% 50%, #fff 0 92%, transparent 96%),
    repeating-linear-gradient(45deg, rgb(255 255 255 / .16) 0 2px, transparent 2px 7px),
    repeating-linear-gradient(-45deg, rgb(255 255 255 / .16) 0 2px, transparent 2px 7px),
    linear-gradient(160deg, color-mix(in srgb, var(--board) 80%, #fff), var(--board));
  /* Дебелина на тестето: ръбовете на картите отдолу. */
  box-shadow: 1px 1px 0 #e9e4d8, 2px 2px 0 #c9c2b0, 3px 3px 0 #ece7db, 4px 4px 0 #bdb5a2, 5px 5px 0 #e6e0d2, 6px 7px 8px rgb(0 0 0 / .35); }
.c8-back::after { content:'М'; position:absolute; inset:0; display:grid; place-items:center; font:800 1.25rem/1 var(--f-display); color:var(--board); }
.c8-pile:not(:disabled):hover .c8-back { transform:translateY(-3px); }
.c8-pile-n { position:absolute; right:-6px; top:-6px; background:var(--surface); color:var(--ink); border:2px solid var(--ink); border-radius:999px; font-size:.75rem; font-weight:700; padding:0 6px; font-variant-numeric:tabular-nums; }
.c8-card { --c: var(--seat-1); width:64px; height:92px; flex:none; border-radius:10px; border:3px solid #fff; background:var(--c); color:#fff;
  display:grid; place-items:center; font:800 1.6rem/1 var(--f-display); text-shadow:0 2px 0 rgb(0 0 0 / .25); box-shadow:0 4px 0 rgb(0 0 0 / .25); position:relative; }
.c8-card .corner { position:absolute; top:5px; left:7px; font-size:.75rem; z-index:1; }
.c8-card .corner.br { top:auto; left:auto; bottom:5px; right:7px; transform:rotate(180deg); }
.c8-card .oval { position:absolute; inset:18% 8%; border-radius:50%; background:#fff; transform:rotate(-28deg); box-shadow: inset 0 0 0 2px rgb(0 0 0 / .06); }
.c8-card .val { position:relative; z-index:1; color:var(--c);
  text-shadow: -1.5px -1.5px 0 #1b2333, 1.5px -1.5px 0 #1b2333, -1.5px 1.5px 0 #1b2333, 1.5px 1.5px 0 #1b2333, 0 3px 0 #1b2333; }
.c8-card.light .val { text-shadow: -1.5px -1.5px 0 #1b2333, 1.5px -1.5px 0 #1b2333, -1.5px 1.5px 0 #1b2333, 1.5px 1.5px 0 #1b2333, 0 3px 0 #1b2333; }
.c8-card.wild .oval { background:#1b2333; }
.c8-card::before { content:''; position:absolute; inset:0; border-radius:7px; pointer-events:none;
  background:linear-gradient(140deg, rgb(255 255 255 / .32), rgb(255 255 255 / 0) 38%, rgb(0 0 0 / 0) 70%, rgb(0 0 0 / .12)); }
.c8-card.light { color:#1b2333; text-shadow:none; }
.c8-card.wild { background:conic-gradient(var(--seat-1) 0 25%, var(--seat-2) 0 50%, var(--seat-3) 0 75%, var(--seat-4) 0); }
.c8-card.wild .val { background:#fff; color:#1b2333; width:40px; height:40px; border-radius:50%; display:grid; place-items:center; text-shadow:none; box-shadow:0 2px 0 rgb(0 0 0 / .3); }
.c8-top { width:76px; height:108px; font-size:2rem; }
@keyframes c8in { from { transform:translateY(-14px) rotate(-8deg); opacity:.4; } }
.c8-color { display:grid; place-items:center; width:64px; height:64px; border-radius:50%; background:var(--c); color:#fff; font-weight:700; font-size:.75rem; box-shadow:inset 0 0 0 4px rgb(255 255 255 / .6); text-shadow:0 1px 0 rgb(0 0 0 / .3); }
.c8-msg { text-align:center; min-height:1.5em; color:var(--ink-2); font-weight:500; }
.c8-hand-wrap { width:100%; display:grid; gap:10px; justify-items:center; }
.c8-hand { display:flex; overflow-x:auto; max-width:100%; padding:26px 16px 30px; scroll-snap-type:x proximity; }
.c8-in-hand { cursor:pointer; scroll-snap-align:center; transition:transform .16s cubic-bezier(.2,1.3,.4,1); transform-origin:50% 120%;
  transform: rotate(var(--fan, 0deg)) translateY(calc(var(--drop, 0px) + var(--lift, 0px))); }
.c8-in-hand + .c8-in-hand { margin-left:-22px; }
.c8-in-hand:disabled { cursor:default; }
.c8-hand.my-turn .c8-in-hand:disabled { filter:saturate(.4) brightness(.9); }
.c8-in-hand.playable { --lift:-12px; }
.c8-in-hand.playable:hover { --lift:-20px; }
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
@media (prefers-reduced-motion: reduce) { .c8-top { animation:none !important; } .c8-in-hand { transition:none; } }
`,
};

function describe(id) {
  const c = card(id);
  if (c.kind === '8') return 'Осмица, сменя цвета';
  if (c.kind === 'w4') return 'Жокер +4, сменя цвета';
  return `${NAME[c.kind] ?? c.kind}, ${COLORS[c.color]}`;
}

function cardEl(id, make, tag = 'div') {
  const c = card(id);
  const el = make(tag, 'c8-card' + (c.kind === '8' || c.kind === 'w4' ? ' wild' : ''));
  if (c.color >= 0 && c.kind !== '8') el.style.setProperty('--c', `var(--seat-${c.color + 1})`);
  if (c.color === 2 && c.kind !== '8') el.classList.add('light');
  const label = LABEL[c.kind] ?? c.kind;
  // Като истинска карта: индекс в два ъгъла и наклонен овал в средата.
  el.append(make('span', 'oval'), make('span', 'corner', label), make('span', 'corner br', label), make('span', 'val', label));
  return el;
}

function lastText(s, ctx) {
  const l = s.last;
  if (!l) return `Започва ${ctx.nickOf(s.players[0])}.`;
  const who = ctx.nickOf(s.players[l.seat]);
  let t;
  if (l.kind === 'draw') return `${who} тегли карта.`;
  if (l.kind === 'pass') return `${who} пропусна.`;
  if (l.kind === 'owed') return `${who} тегли ${l.drew} и пропуска.`;
  if (l.kind === '8') t = `${who} изигра осмица. Цветът е ${COLORS[l.color]}.`;
  else if (l.kind === 'w4' && l.owed) t = `${who} изигра +4. Цветът е ${COLORS[l.color]}. ${ctx.nickOf(s.players[l.target])} дължи ${l.owed}.`;
  else if (l.kind === 'plus2' && l.owed) t = `${who} изигра +2. ${ctx.nickOf(s.players[l.target])} дължи ${l.owed}.`;
  else if (l.kind === 'w4') t = `${who} изигра +4. Цветът е ${COLORS[l.color]}. ${ctx.nickOf(s.players[l.target])} тегли ${l.drew} и пропуска.`;
  else if (l.kind === 'skip') t = `${who} изигра „Пропусни“. ${ctx.nickOf(s.players[l.target])} пропуска.`;
  else if (l.kind === 'rev') t = s.players.length === 2 ? `${who} изигра „Обратно“ и играе пак.` : `${who} обърна посоката.`;
  else if (l.kind === 'plus2') t = `${ctx.nickOf(s.players[l.target])} тегли ${l.drew} и пропуска.`;
  else t = `${who} изигра ${l.kind}.`;
  if (l.called) t += ` ${who}: „Последна карта!“`;
  if (l.penalty) t += ` ${who} не обяви последна карта и тегли ${l.penalty}.`;
  return t;
}
