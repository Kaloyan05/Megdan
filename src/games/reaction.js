// Реакция-рали — 2–6 играчи, 5 рунда. Всеки чака зеленото и докосва възможно най-бързо.
// Времето се мери на устройството на играча, затова интернетът не влияе. Подранилият губи рунда.

import { createRng } from '../core/rng.js';

const ROUNDS = 5;
const LATE_MS = 3000;
const FALSE = 9999;
const SKIP_GRACE_MS = 5000;

const tapsOf = (s) => s.taps[s.r] ?? {};
const waiting = (s) => (s.phase === 'play' ? s.players.filter((p) => tapsOf(s)[p] === undefined) : []);

function finishRound(s) {
  const taps = tapsOf(s);
  const valid = s.players.filter((p) => taps[p] >= 0 && taps[p] < FALSE);
  const best = valid.length ? Math.min(...valid.map((p) => taps[p])) : null;
  const winners = best === null ? [] : valid.filter((p) => taps[p] === best);
  s.wins = s.wins.map((w, i) => w + (winners.includes(s.players[i]) ? 1 : 0));
  s.last = { r: s.r, taps: { ...taps }, winners };
  s.r += 1;
  if (s.r >= s.rounds) s.phase = 'done';
}

export default {
  id: 'reaction',
  name: 'Реакция-рали',
  icon: '⚡',
  blurb: 'Чакай зеленото и докосни пръв. Пет рунда.',
  rules: [
    'Всички виждат червено поле. След няколко секунди то става зелено.',
    'Докосни възможно най-бързо, щом стане зелено. Най-бързият печели рунда.',
    'Докоснеш ли преди зеленото, губиш рунда.',
    'Времето се мери на твоето устройство, затова бавният интернет не пречи.',
    'Печели който вземе най-много рундове от пет.',
  ],
  minPlayers: 2,
  maxPlayers: 6,
  moveSound: 'tap',

  init: (seed, players) => {
    const rng = createRng(`${seed}:reaction`);
    return {
      players: players.slice(), rounds: ROUNDS, r: 0, phase: 'play',
      delays: [...Array(ROUNDS)].map(() => 1500 + Math.floor(rng.next() * 3000)),
      taps: [...Array(ROUNDS)].map(() => ({})), wins: players.map(() => 0), last: null,
    };
  },

  currentPlayer: (s) => waiting(s)[0] ?? s.players[0],
  waitingFor: (s) => waiting(s),

  validateMove(s, m, p) {
    if (s.phase === 'done') return { ok: false, reason: 'over' };
    if (!s.players.includes(p)) return { ok: false, reason: 'not-a-player' };
    if (m?.r !== s.r) return { ok: false, reason: 'old-round' };
    if (m.type === 'tap') {
      if (tapsOf(s)[p] !== undefined) return { ok: false, reason: 'answered' };
      if (typeof m.ms !== 'number' || !(m.ms >= -1)) return { ok: false, reason: 'bad-move' };
      return { ok: true };
    }
    if (m.type === 'skip') return tapsOf(s)[p] === undefined ? { ok: false, reason: 'answer-first' } : { ok: true };
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m, p) {
    const s = { ...s0, taps: s0.taps.map((t) => ({ ...t })), wins: s0.wins.slice() };
    if (m.type === 'tap') s.taps[s.r][p] = m.ms < 0 ? FALSE : Math.min(Math.round(m.ms), LATE_MS);
    if (m.type === 'skip') for (const w of waiting(s)) s.taps[s.r][w] = LATE_MS;
    if (!waiting(s).length) finishRound(s);
    return s;
  },

  autoMove: (s) => ({ type: 'tap', r: s.r, ms: LATE_MS }),

  bot(s, botId, rng, level) {
    if (s.phase !== 'play' || tapsOf(s)[botId] !== undefined) return null;
    const [lo, hi, early] = { easy: [380, 620, 0.12], medium: [260, 420, 0.05], hard: [190, 290, 0.02] }[level] ?? [260, 420, 0.05];
    if (rng.next() < early) return { type: 'tap', r: s.r, ms: -1 };
    return { type: 'tap', r: s.r, ms: Math.round(lo + rng.next() * (hi - lo)) };
  },

  isOver: (s) => s.phase === 'done',
  placements(s) {
    const sorted = [...new Set(s.wins)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(s.wins[i]) + 1]));
  },
  winner(s) {
    const top = Math.max(...s.wins);
    const lead = s.players.filter((_, i) => s.wins[i] === top);
    return lead.length === 1 ? lead[0] : 'draw';
  },
  status(s, me) {
    if (s.phase !== 'play') return null;
    return waiting(s).includes(me) ? `Твой ход: рунд ${s.r + 1} от ${s.rounds}` : `Рунд ${s.r + 1} от ${s.rounds}: чакаме останалите`;
  },

  render(el, s, ctx) {
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const sc = ctx.scratch ?? {};
    clearTimeout(sc.goTimer); clearTimeout(sc.lateTimer); clearTimeout(sc.skipTimer);
    el.innerHTML = '';

    const score = make('div', 'rv-score');
    s.players.forEach((p, i) => {
      const item = make('span', 'rv-score-item');
      const dot = make('span', 'disc-dot');
      dot.style.setProperty('--disc', `var(--seat-${i + 1})`);
      item.append(dot, make('span', 'num', `${ctx.nickOf(p)}: ${s.wins[i]}`));
      score.append(item);
    });
    el.append(score);

    if (s.last) {
      const lines = s.players.map((p) => {
        const v = s.last.taps[p];
        return `${ctx.nickOf(p)}: ${v === FALSE ? 'подрани' : `${v} мс`}`;
      });
      el.append(make('p', 'qz-reveal', `Рунд ${s.last.r + 1}: ${s.last.winners.length ? `печели ${s.last.winners.map(ctx.nickOf).join(' и ')}` : 'никой'}. ${lines.join(', ')}.`));
    }
    if (s.phase === 'done') return;

    const mine = tapsOf(s)[ctx.me];
    const canTap = !ctx.over && s.players.includes(ctx.me) && mine === undefined;
    sc.start ??= {};
    sc.start[s.r] ??= performance.now();
    const goAt = sc.start[s.r] + s.delays[s.r];
    const pad = make('button', 'rx-pad');
    pad.type = 'button';
    const label = make('span', 'rx-label');
    pad.append(label);
    const n = Object.keys(tapsOf(s)).length;
    const info = make('p', 'hint', `Рунд ${s.r + 1} от ${s.rounds}. Докоснали: ${n} от ${s.players.length}.`);

    if (!canTap) {
      pad.disabled = true;
      pad.classList.add('done');
      label.textContent = mine === undefined ? 'Гледаш' : mine === FALSE ? 'Подрани!' : `${mine} мс`;
      el.append(pad, info);
      if (mine !== undefined) sc.skipTimer = setTimeout(() => ctx.onMove({ type: 'skip', r: s.r }), Math.max(0, goAt + LATE_MS + SKIP_GRACE_MS - performance.now()));
      return;
    }

    let sent = false;
    const send = (ms) => { if (sent) return; sent = true; clearTimeout(sc.goTimer); clearTimeout(sc.lateTimer); ctx.onMove({ type: 'tap', r: s.r, ms }); };
    const setGo = () => { pad.classList.add('go'); label.textContent = 'СЕГА!'; };
    if (performance.now() >= goAt) setGo(); else { label.textContent = 'Чакай зеленото…'; sc.goTimer = setTimeout(setGo, goAt - performance.now()); }
    sc.lateTimer = setTimeout(() => send(LATE_MS), Math.max(0, goAt + LATE_MS - performance.now()));
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      if (now < goAt) { pad.classList.add('early'); label.textContent = 'Подрани!'; send(-1); return; }
      label.textContent = `${Math.round(now - goAt)} мс`;
      send(now - goAt);
    });
    pad.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); pad.dispatchEvent(new PointerEvent('pointerdown')); } });
    el.append(pad, info);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'rx-art';
    el.textContent = '⚡';
    return el;
  },

  css: `
/* Светофар: тъмен корпус, голяма леща, която свети червено и после зелено. */
.rx-pad { position:relative; display:grid; place-items:center; width:min(100%,420px); aspect-ratio:4/3; margin-inline:auto; border-radius:28px; isolation:isolate;
  border:0; cursor:pointer; touch-action:manipulation; user-select:none; color:#fff;
  background: var(--grain), linear-gradient(180deg,#2b3242,#161b26);
  box-shadow: inset 0 2px 0 rgb(255 255 255 / .12), inset 0 -4px 0 rgb(0 0 0 / .4), 0 8px 0 #0b0e15, 0 18px 30px rgb(0 0 0 / .3); }
.rx-pad::before { content:''; position:absolute; width:62%; aspect-ratio:1; border-radius:50%; z-index:-1;
  background: radial-gradient(circle at 38% 32%, #ffb4a8 0 6%, #ff4a36 30%, #a8180c 72%, #4a0904 100%);
  box-shadow: 0 0 0 8px #0d1118, 0 0 0 10px #3a4252, 0 0 50px 8px rgb(255 60 40 / .45); transition: background .08s, box-shadow .08s; }
.rx-pad::after { content:''; position:absolute; width:62%; aspect-ratio:1; border-radius:50%; z-index:-1; pointer-events:none;
  background: radial-gradient(60% 40% at 40% 22%, rgb(255 255 255 / .45), transparent 70%), repeating-radial-gradient(circle at 50% 50%, rgb(255 255 255 / .05) 0 3px, transparent 3px 7px); }
.rx-pad.go::before { background: radial-gradient(circle at 38% 32%, #d4ffd6 0 6%, #3ee06a 30%, #108a35 72%, #03300f 100%);
  box-shadow: 0 0 0 8px #0d1118, 0 0 0 10px #3a4252, 0 0 70px 16px rgb(60 230 110 / .6); }
.rx-pad.early::before { background: radial-gradient(circle at 38% 32%, #b8bfcc 0 6%, #6b7383 40%, #2a303c 100%); box-shadow: 0 0 0 8px #0d1118, 0 0 0 10px #3a4252; }
.rx-pad.early { animation: fxShake .42s; }
.rx-pad.done { cursor:default; }
.rx-pad.done::before { background: radial-gradient(circle at 38% 32%, #e8ecf3 0 6%, #9aa4b5 45%, #4a5263 100%); box-shadow: 0 0 0 8px #0d1118, 0 0 0 10px #3a4252; }
.rx-label { font:800 clamp(1.3rem,6.5vw,2.2rem)/1.1 var(--f-display); text-align:center; padding:12px; text-shadow: 0 2px 4px rgb(0 0 0 / .6); max-width:60%; }
.rx-pad:focus-visible { outline:3px solid var(--focus); outline-offset:4px; }
.rx-art { width:70px; height:56px; border-radius:12px; border:2px solid var(--ink); background:var(--seat-4); display:grid; place-items:center; font-size:1.8rem; }
`,
};
