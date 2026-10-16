// Мемори двойки — 2–4 играчи, 36 карти (18 двойки). Намериш ли двойка, играеш пак.

import { createRng } from '../core/rng.js';

export const SYMBOLS = ['🍎', '🍋', '🍇', '🍉', '🍒', '🥝', '🍑', '🥕', '🌽', '🍄', '🐟', '🐞', '🦋', '🌻', '⚽', '🎈', '🎲', '⭐'];
const N = 36;

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

  init(seed, players) {
    const deck = createRng(`${seed}:memory`).shuffle([...Array(N).keys()].map((i) => i % 18));
    return { players: players.slice(), deck, owner: Array(N).fill(null), open: [], peek: [], turn: 0, scores: players.map(() => 0), seen: {} };
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.owner.every((o) => o !== null)) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(m?.card) || m.card < 0 || m.card >= N) return { ok: false, reason: 'bad-card' };
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
  botMove(s, p, rng) {
    const seen = s.seen ?? {};
    const free = [...Array(N).keys()].filter((i) => s.owner[i] === null && !s.open.includes(i));
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
    const free = [...Array(N).keys()].filter((i) => s.owner[i] === null && !s.open.includes(i));
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
    for (let i = 0; i < N; i++) {
      const owned = s.owner[i];
      const shown = owned !== null || s.open.includes(i) || s.peek.includes(i);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mm-card' + (shown ? ' up' : '') + (owned !== null ? ' owned' : '') + (s.peek.includes(i) ? ' peek' : '');
      if (owned !== null) b.style.setProperty('--own', `var(--seat-${owned + 1})`);
      b.disabled = !myTurn || shown;
      b.setAttribute('aria-label', shown ? `Карта ${i + 1}: ${SYMBOLS[s.deck[i]]}` : `Карта ${i + 1}, обърната`);
      const face = document.createElement('span');
      face.className = 'mm-face';
      face.textContent = shown ? SYMBOLS[s.deck[i]] : '';
      b.append(face);
      b.addEventListener('click', () => ctx.onMove({ card: i }));
      grid.append(b);
    }
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
.mm { display:grid; grid-template-columns:repeat(6,1fr); gap:6px; width:min(100%,440px); margin-inline:auto; }
.mm-card { aspect-ratio:3/4; border-radius:10px; border:2px solid var(--ink); padding:0; cursor:pointer;
  background:repeating-linear-gradient(45deg, var(--accent) 0 5px, color-mix(in srgb, var(--accent) 75%, #fff) 5px 8px);
  box-shadow:0 3px 0 var(--ink); display:grid; place-items:center; transition:transform .15s ease; }
.mm-card:not(:disabled):hover { transform:translateY(-2px); }
.mm-card:disabled { cursor:default; }
.mm-card.up { background:var(--surface); animation:mmflip .25s ease-out; }
.mm-card.owned { background:color-mix(in srgb, var(--own) 22%, var(--surface)); border-color:var(--own); box-shadow:none; animation:none; }
.mm-card.peek { box-shadow:0 0 0 3px var(--sun); }
.mm-face { font-size:clamp(1.2rem,6vw,1.9rem); line-height:1; }
@keyframes mmflip { from { transform:rotateY(90deg); } }
.mm-art { display:grid; grid-template-columns:repeat(2,34px); gap:6px; }
.mm-art span { height:44px; border-radius:7px; border:2px solid var(--ink); background:var(--surface); display:grid; place-items:center; font-size:1.3rem; }
.mm-art span.back { background:repeating-linear-gradient(45deg, var(--accent) 0 4px, color-mix(in srgb, var(--accent) 75%, #fff) 4px 7px); }
@media (prefers-reduced-motion: reduce) { .mm-card.up { animation:none; } }
`,
};
