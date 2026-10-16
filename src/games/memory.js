// Мемори двойки — 2–4 играчи, 36 карти (18 двойки). Намериш ли двойка, играеш пак.

import { createRng } from '../core/rng.js';

export const SYMBOLS = ['🍎', '🍋', '🍇', '🍉', '🍒', '🥝', '🍑', '🥕', '🌽', '🍄', '🐟', '🐞', '🦋', '🌻', '⚽', '🎈', '🎲', '⭐', '🚲', '🎸', '🐢', '🌙', '🍕', '🎁'];

export default {
  id: 'memory',
  name: 'Мемори',
  icon: '🍒',
  blurb: 'Обръщай по две карти. Запомни къде е всяка.',
  rules: [
    'Всички карти са с лицето надолу. На своя ход обръщаш две.',
    'Ако са еднакви, двойката е твоя и играеш пак.',
    'Ако са различни, всички ги виждат за кратко и редът минава нататък.',
    'Печели който има най-много двойки накрая.',
  ],
  minPlayers: 2,
  maxPlayers: 4,
  moveSound: 'flip',

  options: [
    { id: 'pairs', label: 'Двойки', default: 18, choices: [{ value: 12, label: '12' }, { value: 18, label: '18' }, { value: 24, label: '24' }] },
  ],

  init(seed, players, opts = {}) {
    const pairs = opts.pairs ?? 18;
    const deck = createRng(`${seed}:memory`).shuffle([...Array(pairs * 2).keys()].map((i) => i % pairs));
    return { players: players.slice(), deck, owner: Array(pairs * 2).fill(null), open: [], peek: [], turn: 0, scores: players.map(() => 0), seen: {} };
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.owner.every((o) => o !== null)) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(m?.card) || m.card < 0 || m.card >= s.deck.length) return { ok: false, reason: 'bad-card' };
    if (s.owner[m.card] !== null || s.open.includes(m.card)) return { ok: false, reason: 'card-open' };
    return { ok: true };
  },

  applyMove(s0, m) {
    // seen: кои карти някога са били обърнати (публично знание, ползва го ботът).
    const s = { ...s0, seen: { ...(s0.seen ?? {}), [m.card]: s0.deck[m.card] } };
    const open = [...s.open, m.card];
    if (open.length < 2) return { ...s, open, peek: [] };
    const [a, b] = open;
    if (s.deck[a] === s.deck[b]) {
      const owner = s.owner.slice();
      owner[a] = s.turn; owner[b] = s.turn;
      const scores = s.scores.slice();
      scores[s.turn] += 1;
      return { ...s, owner, scores, open: [], peek: [], lastPair: s.turn };
    }
    return { ...s, open: [], peek: [a, b], turn: (s.turn + 1) % s.players.length, lastPair: null };
  },

  // Хитър бот: помни всичко обърнато.
  botMove(s, p, rng, level = 'medium') {
    // Средният бот помни около половината обърнати карти, трудният помни всичко.
    const all = s.seen ?? {};
    const seen = level === 'hard' ? all : Object.fromEntries(Object.entries(all).filter(([i]) => createRng(`${i}:${s.scores.join()}`).next() < 0.5));
    const free = [...Array(s.deck.length).keys()].filter((i) => s.owner[i] === null && !s.open.includes(i));
    const unseen = free.filter((i) => seen[i] === undefined);
    if (s.open.length === 1) {
      const sym = s.deck[s.open[0]];
      const match = free.find((i) => seen[i] === sym);
      if (match !== undefined) return { card: match };
      return { card: rng.pick(unseen.length ? unseen : free) };
    }
    const bySym = new Map();
    for (const i of free) if (seen[i] !== undefined) bySym.set(seen[i], [...(bySym.get(seen[i]) ?? []), i]);
    for (const list of bySym.values()) if (list.length >= 2) return { card: list[0] };
    return { card: rng.pick(unseen.length ? unseen : free) };
  },

  autoMove(s, p, rng) {
    const free = [...Array(s.deck.length).keys()].filter((i) => s.owner[i] === null && !s.open.includes(i));
    return { card: rng.pick(free) };
  },

  isOver: (s) => s.owner.every((o) => o !== null),
  placements(s) {
    const sorted = [...new Set(s.scores)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(s.scores[i]) + 1]));
  },
  winner(s) {
    const top = Math.max(...s.scores);
    const lead = s.players.filter((_, i) => s.scores[i] === top);
    return lead.length === 1 ? lead[0] : 'draw';
  },

  render(el, s, ctx) {
    const myTurn = !ctx.over && ctx.me === s.players[s.turn];
    el.innerHTML = '';
    const score = document.createElement('div');
    score.className = 'rv-score';
    s.players.forEach((p, i) => {
      const item = document.createElement('span');
      item.className = 'rv-score-item';
      const dot = document.createElement('span');
      dot.className = 'disc-dot';
      dot.style.setProperty('--disc', `var(--seat-${i + 1})`);
      const txt = document.createElement('span');
      txt.textContent = `${ctx.nickOf(p)}: ${s.scores[i]}`;
      item.append(dot, txt);
      score.append(item);
    });
    const grid = document.createElement('div');
    grid.className = 'mm';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', 'Карти');
    grid.style.setProperty('--mm-cols', s.deck.length > 36 ? 8 : 6);
    // Обръщане: картите, които току-що са се обърнали (или са се върнали), се анимират от предишното си положение.
    const sc = ctx.scratch ?? {};
    const prevUp = sc.mmUp ?? null;
    const nowUp = new Set();
    const toggles = [];
    const fresh = Boolean(ctx.last?.fresh);
    for (let i = 0; i < s.deck.length; i++) {
      const owned = s.owner[i];
      const shown = owned !== null || s.open.includes(i) || s.peek.includes(i);
      if (shown) nowUp.add(i);
      const b = document.createElement('button');
      b.type = 'button';
      const wasUp = prevUp ? prevUp.has(i) : shown;
      const animate = fresh && prevUp && wasUp !== shown;
      b.className = 'mm-card' + ((animate ? wasUp : shown) ? ' up' : '') + (owned !== null ? ' owned' : '') + (s.peek.includes(i) ? ' peek' : '');
      if (fresh && owned !== null && s.lastPair === owned && prevUp && !(sc.mmOwned ?? []).includes(i)) b.classList.add('match');
      if (owned !== null) b.style.setProperty('--own', `var(--seat-${owned + 1})`);
      b.style.setProperty('--tilt', `${((i * 53) % 7) - 3}deg`);
      b.disabled = !myTurn || shown;
      b.setAttribute('aria-label', shown ? `Карта ${i + 1}: ${SYMBOLS[s.deck[i]]}` : `Карта ${i + 1}, обърната`);
      const inner = document.createElement('span');
      inner.className = 'mm-inner';
      const back = document.createElement('span');
      back.className = 'mm-back';
      const front = document.createElement('span');
      front.className = 'mm-front';
      front.textContent = shown || animate ? SYMBOLS[s.deck[i]] : '';
      inner.append(back, front);
      b.append(inner);
      if (animate) toggles.push([b, shown, wasUp && !shown ? 650 : 0]);
      b.addEventListener('click', () => ctx.onMove({ card: i }));
      grid.append(b);
    }
    sc.mmUp = nowUp;
    sc.mmOwned = s.owner.map((o, i) => (o !== null ? i : -1)).filter((i) => i >= 0);
    // Две рамки по-късно, за да тръгне преходът от старото положение.
    if (toggles.length) requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const [b, up, delay] of toggles) setTimeout(() => b.classList.toggle('up', up), delay);
    }));
    el.append(score, grid);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'mm-art';
    for (const t of ['🍒', '', '🍒', '']) {
      const s = document.createElement('span');
      s.textContent = t;
      if (!t) s.className = 'back';
      el.append(s);
    }
    return el;
  },

  css: `
.mm { display:grid; grid-template-columns:repeat(var(--mm-cols, 6),minmax(0,1fr)); gap:7px; width:min(100%,440px); margin-inline:auto; padding:10px; border-radius:18px;
  background: radial-gradient(120% 90% at 50% 30%, color-mix(in srgb, var(--felt) 88%, #fff), var(--felt) 60%, color-mix(in srgb, var(--felt) 72%, #000));
  box-shadow: inset 0 0 0 6px #6b3d1b, inset 0 0 0 8px #3a200c, inset 0 6px 16px rgb(0 0 0 / .3), 0 6px 0 #3a200c; }
.mm-card { aspect-ratio:3/4; border:0; padding:0; background:none; cursor:pointer; perspective:600px; transform:rotate(var(--tilt)); transition: transform .2s; }
.mm-card:not(:disabled):hover { transform:rotate(var(--tilt)) translateY(-3px); }
.mm-card:disabled { cursor:default; }
.mm-card:focus-visible { outline:3px solid var(--sun); outline-offset:2px; border-radius:9px; }
.mm-inner { position:relative; display:block; width:100%; height:100%; transform-style:preserve-3d; transition: transform .45s cubic-bezier(.3,1.3,.5,1); }
.mm-card.up .mm-inner { transform: rotateY(180deg); }
.mm-back, .mm-front { position:absolute; inset:0; border-radius:9px; backface-visibility:hidden; -webkit-backface-visibility:hidden; display:grid; place-items:center; }
/* Гръб: карирана шарка и ромб в средата, като колода карти. */
.mm-back { border:2px solid #fff;
  background:
    radial-gradient(circle at 50% 50%, #fff 0 9%, transparent 10%),
    conic-gradient(from 45deg at 50% 50%, transparent 0 25%, rgb(255 255 255 / .18) 0 50%, transparent 0 75%, rgb(255 255 255 / .18) 0) 0 0/10px 10px,
    linear-gradient(160deg, color-mix(in srgb, var(--accent) 85%, #fff), var(--accent) 50%, color-mix(in srgb, var(--accent) 70%, #000));
  box-shadow: 0 0 0 1px rgb(0 0 0 / .25), 0 3px 0 rgb(0 0 0 / .3), 0 5px 8px rgb(0 0 0 / .25); }
.mm-front { transform: rotateY(180deg); background:linear-gradient(160deg,#fff,#f3efe6); border:2px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / .2), 0 3px 0 rgb(0 0 0 / .25), 0 5px 8px rgb(0 0 0 / .2);
  font-size:clamp(1.2rem,6vw,1.9rem); line-height:1; }
.mm-card.peek .mm-front { box-shadow: 0 0 0 3px var(--sun), 0 3px 0 rgb(0 0 0 / .25); }
.mm-card.owned { transform: rotate(var(--tilt)) scale(.94); }
.mm-card.owned .mm-front { background:linear-gradient(160deg, color-mix(in srgb, var(--own) 22%, #fff), color-mix(in srgb, var(--own) 34%, #fff)); box-shadow: 0 0 0 2px var(--own), 0 2px 0 rgb(0 0 0 / .2); }
.mm-card.match { animation: mmMatch .7s cubic-bezier(.2,1.4,.4,1) .35s backwards; }
@keyframes mmMatch { 0% { transform:rotate(var(--tilt)) scale(1); } 40% { transform:rotate(0) scale(1.18); filter:brightness(1.15); } 100% { transform:rotate(var(--tilt)) scale(.94); } }
@media (prefers-reduced-motion: reduce) { .mm-inner { transition:none; } .mm-card.match { animation:none; } }
.mm-art { display:grid; grid-template-columns:repeat(2,34px); gap:6px; }
.mm-art span { height:44px; border-radius:7px; border:2px solid var(--ink); background:var(--surface); display:grid; place-items:center; font-size:1.3rem; }
.mm-art span.back { background:repeating-linear-gradient(45deg, var(--accent) 0 4px, color-mix(in srgb, var(--accent) 75%, #fff) 4px 7px); }
`,
};
