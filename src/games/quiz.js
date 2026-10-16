// Викторина — 2–6 играчи. Всички отговарят едновременно на един и същ въпрос.
// Въпросите ги създава Claude (през акаунта на първия играч) или идват от вградената банка.
// Верен отговор: 100 т. + до 50 т. за бързина. Печели най-много точки.

import { createRng } from '../core/rng.js';
import { BANK, TOPICS } from './quiz-bank.js';
import { SITE } from '../env.js';

export const QUESTION_MS = 20000;
const SKIP_GRACE_MS = 8000;
const LETTERS = ['А', 'Б', 'В', 'Г'];

export function bankQuestions(topic, count, seed) {
  const pool = BANK[topic] ?? BANK.general;
  const rng = createRng(`${seed}:bank`);
  return rng.shuffle(pool).slice(0, count).map(([q, a, c]) => {
    const order = rng.shuffle([0, 1, 2, 3]);
    return { q, a: order.map((k) => a[k]), c: order.indexOf(c) };
  });
}

export function cleanQuestions(raw, count) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const it of raw) {
    const q = typeof it?.q === 'string' ? it.q.trim().slice(0, 240) : '';
    const a = Array.isArray(it?.a) ? it.a.map((x) => String(x ?? '').trim().slice(0, 90)) : [];
    const c = Number(it?.c);
    if (!q || a.length !== 4 || a.some((x) => !x) || !Number.isInteger(c) || c < 0 || c > 3) continue;
    if (new Set(a).size !== 4) continue;
    out.push({ q, a, c });
    if (out.length >= count) break;
  }
  return out.length >= Math.min(3, count) ? out : null;
}

function promptFor(topicLabel, count, seed) {
  return `Създай ${count} въпроса за викторина на български език по тема „${topicLabel}“.
Изисквания: забавни въпроси за приятели; ясни, проверими факти без спорни отговори; кратки формулировки;
точно 4 кратки отговора, от които точно един е верен; без повтарящи се въпроси. Вариант: ${seed}.
Върни само JSON масив във вида: [{"q":"въпрос","a":["отговор 1","отговор 2","отговор 3","отговор 4"],"c":0}], където c е индексът на верния отговор.`;
}

const answeredBy = (s, q) => s.answers[q] ?? {};
const waiting = (s) => (s.phase === 'play' ? s.players.filter((p) => answeredBy(s, s.q)[p] === undefined) : []);

function advance(s) {
  // всички отговориха → точки и следващ въпрос
  const ans = answeredBy(s, s.q);
  const item = s.questions[s.q];
  const scores = s.scores.slice();
  s.players.forEach((p, i) => {
    const a = ans[p];
    if (a && a.choice === item.c) scores[i] += 100 + Math.round(50 * Math.max(0, 1 - Math.min(a.ms, QUESTION_MS) / QUESTION_MS));
  });
  s.scores = scores;
  s.reveal = { q: s.q, correct: item.c, right: s.players.filter((p) => ans[p]?.choice === item.c) };
  s.q += 1;
  if (s.q >= s.questions.length) s.phase = 'done';
}

export default {
  id: 'quiz',
  name: 'Викторина',
  icon: '❓',
  blurb: 'Claude измисля въпроси, всички отговарят едновременно.',
  rules: [
    'Всички виждат един и същ въпрос и избират отговор едновременно. Имате 20 секунди.',
    'Верен отговор носи 100 точки и до 50 точки бонус за бързина.',
    'Въпросите ги измисля Claude по избраната тема. Ако Claude не е достъпен, идват от вградените въпроси.',
    'Печели най-много точки накрая.',
  ],
  minPlayers: 2,
  maxPlayers: 6,
  moveSound: 'tap',
  options: [
    { id: 'topic', label: 'Тема', default: 'general', choices: TOPICS },
    { id: 'count', label: 'Въпроси', default: 10, choices: [{ value: 5, label: '5' }, { value: 10, label: '10' }] },
    // На собствения сайт няма Claude: въпросите са само вградените.
    ...(SITE ? [] : [{ id: 'source', label: 'Въпросите', default: 'claude', choices: [{ value: 'claude', label: 'От Claude' }, { value: 'bank', label: 'Вградени' }] }]),
  ],

  init: (seed, players, opts = {}) => ({
    seed: String(seed), players: players.slice(), topic: opts.topic ?? 'general', count: opts.count ?? 10, source: opts.source ?? (SITE ? 'bank' : 'claude'),
    phase: 'setup', questions: [], q: 0, answers: [], scores: players.map(() => 0), reveal: null, by: null,
  }),

  currentPlayer: (s) => (s.phase === 'setup' ? s.players[0] : waiting(s)[0] ?? s.players[0]),
  waitingFor: (s) => (s.phase === 'setup' ? [] : waiting(s)),

  validateMove(s, m, p) {
    if (s.phase === 'done') return { ok: false, reason: 'over' };
    if (!s.players.includes(p)) return { ok: false, reason: 'not-a-player' };
    if (m?.type === 'questions') {
      if (s.phase !== 'setup') return { ok: false, reason: 'already-set' };
      if (!cleanQuestions(m.items, 20)) return { ok: false, reason: 'bad-questions' };
      return { ok: true };
    }
    if (s.phase !== 'play') return { ok: false, reason: 'wait-questions' };
    if (m?.type === 'answer') {
      if (m.q !== s.q) return { ok: false, reason: 'old-question' };
      if (answeredBy(s, s.q)[p] !== undefined) return { ok: false, reason: 'answered' };
      if (!Number.isInteger(m.choice) || m.choice < -1 || m.choice > 3) return { ok: false, reason: 'bad-answer' };
      if (typeof m.ms !== 'number' || !(m.ms >= 0)) return { ok: false, reason: 'bad-answer' };
      return { ok: true };
    }
    if (m?.type === 'skip') {
      // Който вече е отговорил, може да пропусне закъснелите (клиентът го прави сам след времето).
      if (m.q !== s.q || answeredBy(s, s.q)[p] === undefined) return { ok: false, reason: 'answer-first' };
      return { ok: true };
    }
    return { ok: false, reason: 'bad-move' };
  },

  applyMove(s0, m, p) {
    const s = { ...s0, answers: s0.answers.map((x) => ({ ...x })), scores: s0.scores.slice() };
    if (m.type === 'questions') {
      s.questions = cleanQuestions(m.items, s.count);
      s.by = m.by ?? 'bank';
      s.phase = 'play';
      s.answers = s.questions.map(() => ({}));
      return s;
    }
    if (m.type === 'answer') s.answers[s.q][p] = { choice: m.choice, ms: Math.min(m.ms, QUESTION_MS) };
    if (m.type === 'skip') for (const w of waiting(s)) s.answers[s.q][w] = { choice: -1, ms: QUESTION_MS };
    if (!waiting(s).length) advance(s);
    return s;
  },

  autoMove(s) {
    if (s.phase === 'setup') return { type: 'questions', items: bankQuestions(s.topic, s.count, s.seed), by: 'bank' };
    return { type: 'answer', q: s.q, choice: -1, ms: QUESTION_MS };
  },

  // Бот: отговаря вярно с вероятност според нивото.
  bot(s, botId, rng, level) {
    if (s.phase === 'setup') return botId === s.players[0] ? { type: 'questions', items: bankQuestions(s.topic, s.count, s.seed), by: 'bank' } : null;
    if (s.phase !== 'play' || answeredBy(s, s.q)[botId] !== undefined) return null;
    const p = { easy: 0.4, medium: 0.65, hard: 0.85 }[level] ?? 0.65;
    const right = rng.next() < p;
    const wrong = [0, 1, 2, 3].filter((k) => k !== s.questions[s.q].c);
    return { type: 'answer', q: s.q, choice: right ? s.questions[s.q].c : rng.pick(wrong), ms: Math.round(3000 + rng.next() * 9000) };
  },

  // Първият играч подготвя въпросите: Claude или вградената банка.
  async onTurn(s, ctx) {
    if (s.phase !== 'setup') return null;
    if (ctx.me !== s.players[0]) {
      // Ако първият играч го няма, след 45 сек. някой друг пуска вградените въпроси.
      const waitMs = 45000 - (Date.now() - (ctx.startedAt ?? Date.now()));
      await new Promise((r) => setTimeout(r, Math.max(0, waitMs)));
      return { type: 'questions', items: bankQuestions(s.topic, s.count, s.seed), by: 'bank' };
    }
    const label = TOPICS.find((t) => t.value === s.topic)?.label ?? 'Обща култура';
    if (s.source === 'claude' && ctx.sample) {
      try {
        const raw = await ctx.sample.json(promptFor(label, s.count, s.seed), { modelTier: 'default' });
        const items = cleanQuestions(raw, s.count);
        if (items) {
          for (const it of items) {
            const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
            const a = order.map((k) => it.a[k]);
            it.c = order.indexOf(it.c);
            it.a = a;
          }
          return { type: 'questions', items, by: 'claude' };
        }
      } catch (e) {
        if (e?.code !== 'cancelled') ctx.toast?.('Claude не е достъпен. Ползвам вградените въпроси.');
      }
    }
    return { type: 'questions', items: bankQuestions(s.topic, s.count, s.seed), by: 'bank' };
  },

  isOver: (s) => s.phase === 'done',
  placements(s) {
    const sorted = [...new Set(s.scores)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(s.scores[i]) + 1]));
  },
  winner(s) {
    const top = Math.max(...s.scores);
    const lead = s.players.filter((_, i) => s.scores[i] === top);
    return lead.length === 1 ? lead[0] : 'draw';
  },
  status(s, me) {
    if (s.phase === 'setup') return s.source === 'claude' ? 'Claude подготвя въпросите…' : 'Подготвям въпросите…';
    if (s.phase === 'play') return waiting(s).includes(me) ? `Твой ход: въпрос ${s.q + 1} от ${s.questions.length}` : `Въпрос ${s.q + 1} от ${s.questions.length}: чакаме останалите`;
    return null;
  },

  render(el, s, ctx) {
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const sc = ctx.scratch ?? {};
    el.innerHTML = '';
    clearTimeout(sc.timer); clearTimeout(sc.skipTimer); clearInterval(sc.tick);

    const score = make('div', 'rv-score qz-score');
    s.players.forEach((p, i) => {
      const item = make('span', 'rv-score-item');
      const dot = make('span', 'disc-dot');
      dot.style.setProperty('--disc', `var(--seat-${i + 1})`);
      item.append(dot, make('span', 'num', `${ctx.nickOf(p)}: ${s.scores[i]}`));
      score.append(item);
    });
    el.append(score);

    if (s.phase === 'setup') {
      const box = make('div', 'qz-card qz-wait');
      box.append(make('p', 'qz-q', s.source === 'claude' ? 'Claude измисля въпросите…' : 'Подготвям въпросите…'),
        make('p', 'hint', s.source === 'claude' ? 'Може да отнеме до минута. Ако браузърът пита за Claude, разреши.' : ''));
      el.append(box);
      return;
    }

    // какво стана с предишния въпрос
    if (s.reveal) {
      const prev = s.questions[s.reveal.q];
      const iWasRight = s.reveal.right.includes(ctx.me);
      const played = s.players.includes(ctx.me);
      const r = make('div', `qz-reveal${ctx.last?.fresh ? ' fx-pop' : ''}${played ? (iWasRight ? ' right' : ' wrong') : ''}`);
      r.append(make('span', 'qz-reveal-mark', played ? (iWasRight ? '✓' : '✕') : '•'),
        make('div', null),
      );
      r.lastChild.append(make('p', null, `Отговор: ${LETTERS[s.reveal.correct]}. ${prev.a[s.reveal.correct]}`),
        make('p', 'qz-reveal-who', s.reveal.right.length ? `Познаха: ${s.reveal.right.map(ctx.nickOf).join(', ')}` : 'Никой не позна.'));
      el.append(r);
    }
    if (s.phase === 'done') return;

    const item = s.questions[s.q];
    const mine = answeredBy(s, s.q)[ctx.me];
    const canAnswer = !ctx.over && s.players.includes(ctx.me) && mine === undefined;
    sc.start ??= {};
    sc.start[s.q] ??= Date.now();
    const left = Math.max(0, QUESTION_MS - (Date.now() - sc.start[s.q]));

    // Студио: екран с въпроса, кръгъл таймер и прожектори.
    const stage = make('div', 'qz-stage');
    const card = make('div', 'qz-card');
    const head = make('div', 'qz-head');
    const NS = 'http://www.w3.org/2000/svg';
    const ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('viewBox', '0 0 40 40');
    ring.setAttribute('class', 'qz-ring');
    ring.innerHTML = '<circle cx="20" cy="20" r="17" class="bg"/><circle cx="20" cy="20" r="17" class="fg" pathLength="1"/>';
    const fg = ring.querySelector('.fg');
    fg.style.animationDuration = `${left}ms`;
    fg.style.strokeDashoffset = String(1 - left / QUESTION_MS);
    const secs = make('span', 'qz-secs num', String(Math.ceil(left / 1000)));
    const timer = make('div', 'qz-timer');
    timer.append(ring, secs);
    sc.tick = setInterval(() => {
      const l = Math.max(0, QUESTION_MS - (Date.now() - sc.start[s.q]));
      secs.textContent = String(Math.ceil(l / 1000));
      timer.classList.toggle('low', l < 5000);
      if (!secs.isConnected || l <= 0) clearInterval(sc.tick);
    }, 250);
    head.append(make('p', 'qz-n', `Въпрос ${s.q + 1} от ${s.questions.length}${s.by === 'claude' ? ', от Claude' : ''}`), timer);
    card.append(head, make('p', 'qz-q', item.q));
    const answers = make('div', 'qz-answers');
    item.a.forEach((txt, k) => {
      const b = make('button', `qz-a c${k}` + (mine?.choice === k ? ' picked' : ''));
      b.type = 'button';
      b.disabled = !canAnswer;
      b.append(make('span', 'qz-l', LETTERS[k]), make('span', null, txt));
      b.addEventListener('click', () => {
        clearTimeout(sc.timer);
        ctx.onMove({ type: 'answer', q: s.q, choice: k, ms: Date.now() - sc.start[s.q] });
      });
      answers.append(b);
    });
    card.append(answers);
    const n = Object.keys(answeredBy(s, s.q)).length;
    card.append(make('p', 'hint qz-hint', mine !== undefined ? `Отговори ${n} от ${s.players.length}. Чакаме останалите.` : `Отговорили: ${n} от ${s.players.length}.`));
    stage.append(card);
    el.append(stage);

    if (canAnswer) {
      sc.timer = setTimeout(() => ctx.onMove({ type: 'answer', q: s.q, choice: -1, ms: QUESTION_MS }), left + 50);
    } else if (mine !== undefined) {
      sc.skipTimer = setTimeout(() => ctx.onMove({ type: 'skip', q: s.q }), left + SKIP_GRACE_MS);
    }
  },

  art() {
    const el = document.createElement('div');
    el.className = 'qz-art';
    LETTERS.forEach((l, k) => { const b = document.createElement('span'); b.className = `c${k}`; b.textContent = l; el.append(b); });
    return el;
  },

  css: `
/* Студио: тъмна сцена с два прожектора и отражение на пода. */
.qz-stage { position:relative; width:min(100%,520px); margin-inline:auto; padding:22px 14px 26px; border-radius:22px; overflow:hidden; isolation:isolate;
  background: radial-gradient(80% 50% at 50% 100%, rgb(120 90 255 / .35), transparent 70%), linear-gradient(180deg,#141a35,#1d2450 60%,#10142b);
  box-shadow: inset 0 0 0 2px rgb(255 255 255 / .08), 0 10px 26px rgb(0 0 0 / .3); }
.qz-stage::before, .qz-stage::after { content:''; position:absolute; top:-30%; width:60%; height:140%; z-index:-1; filter:blur(6px); pointer-events:none;
  background: linear-gradient(180deg, rgb(255 240 200 / .32), rgb(255 240 200 / 0) 75%); animation: qzSpot 6s ease-in-out infinite alternate; }
.qz-stage::before { left:-14%; clip-path:polygon(40% 0, 60% 0, 100% 100%, 0 100%); transform-origin:50% 0; rotate:-16deg; }
.qz-stage::after { right:-14%; clip-path:polygon(40% 0, 60% 0, 100% 100%, 0 100%); transform-origin:50% 0; rotate:16deg; animation-delay:-3s; }
@keyframes qzSpot { from { translate:-6% 0; } to { translate:6% 0; } }
.qz-card { position:relative; display:grid; gap:12px; padding:16px; border-radius:16px; color:#eef1ff;
  background: linear-gradient(160deg, rgb(255 255 255 / .1), rgb(255 255 255 / .03)), #1a2148; border:2px solid rgb(160 170 255 / .35);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .18), 0 0 0 4px #0c1028, 0 0 30px rgb(110 120 255 / .25); }
.qz-wait { text-align:center; width:min(100%,480px); margin-inline:auto; color:var(--ink); background:var(--surface); border-color:var(--ink); }
.qz-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.qz-n { font-size:var(--step--1); color:#b9c0ff; font-weight:700; letter-spacing:.02em; }
.qz-q { font:700 var(--step-1)/1.3 var(--f-body); text-wrap:balance; text-shadow:0 1px 2px rgb(0 0 0 / .4); }
.qz-timer { position:relative; width:46px; height:46px; flex:none; display:grid; place-items:center; }
.qz-ring { position:absolute; inset:0; rotate:-90deg; }
.qz-ring circle { fill:none; stroke-width:4; }
.qz-ring .bg { stroke:rgb(255 255 255 / .15); }
.qz-ring .fg { stroke:#7ee0a6; stroke-linecap:round; stroke-dasharray:1; animation: qzRing linear forwards; }
@keyframes qzRing { to { stroke-dashoffset:1; } }
.qz-timer.low .qz-ring .fg { stroke:#ff6b5a; }
.qz-timer.low .qz-secs { color:#ffb0a6; animation: qzBeat .5s ease-in-out infinite alternate; }
@keyframes qzBeat { to { transform:scale(1.18); } }
.qz-secs { font:800 1rem/1 var(--f-display); color:#fff; }
.qz-answers { display:grid; grid-template-columns:1fr; gap:10px; }
@media (min-width:520px) { .qz-answers { grid-template-columns:1fr 1fr; } }
/* Отговорите: удължени шестоъгълници с гланц, като в телевизионно шоу. */
.qz-a { position:relative; display:flex; align-items:center; gap:10px; min-height:54px; padding:10px 22px; border:0; color:#fff; font-weight:700; text-align:left; cursor:pointer;
  clip-path: polygon(14px 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 14px 100%, 0 50%);
  background: linear-gradient(180deg, rgb(255 255 255 / .28), rgb(255 255 255 / 0) 48%, rgb(0 0 0 / .12)), var(--qa);
  transition: transform .15s cubic-bezier(.2,1.4,.4,1), filter .15s; }
.qz-a.c0 { --qa:var(--seat-1); } .qz-a.c1 { --qa:var(--seat-2); } .qz-a.c2 { --qa:#b07a14; } .qz-a.c3 { --qa:var(--seat-4); }
.qz-a:not(:disabled):hover { transform:scale(1.03); filter:brightness(1.1); }
.qz-a:disabled { cursor:default; filter:saturate(.35) brightness(.75); }
.qz-a.picked { filter:none; box-shadow:none; background: linear-gradient(180deg, rgb(255 255 255 / .4), rgb(255 255 255 / .05) 48%), var(--qa); animation: qzPick .5s cubic-bezier(.2,1.4,.4,1); }
.qz-a.picked::after { content:'✓'; margin-left:auto; font-size:1.1rem; }
@keyframes qzPick { 40% { transform:scale(1.07); } }
.qz-a:not(:disabled):active { transform:scale(.97); }
.qz-a:focus-visible { outline:3px solid var(--sun); outline-offset:3px; }
.qz-l { position:relative; display:grid; place-items:center; width:28px; height:28px; flex:none; isolation:isolate; }
.qz-l::before { content:''; position:absolute; inset:3px; rotate:45deg; border-radius:5px; z-index:-1; background:rgb(0 0 0 / .28); box-shadow: inset 0 0 0 2px rgb(255 255 255 / .5); }
.qz-hint { color:#b9c0ff; }
.qz-score { gap:8px; }
.qz-score .rv-score-item { padding:5px 12px 5px 8px; border-radius:999px; background:#141a35; color:#fff; box-shadow: inset 0 0 0 1px rgb(255 255 255 / .15), 0 3px 0 #0c1028; }
.qz-reveal { display:flex; align-items:center; gap:12px; width:min(100%,520px); margin:0 auto 12px; padding:10px 14px; border-radius:var(--r-md); background:var(--surface-2); font-weight:700; }
.qz-reveal.right { background: color-mix(in srgb, #1d9563 20%, var(--surface)); box-shadow: inset 0 0 0 2px #1d9563; }
.qz-reveal.wrong { background: color-mix(in srgb, var(--bad, #d93226) 14%, var(--surface)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--bad, #d93226) 70%, transparent); }
.qz-reveal-mark { display:grid; place-items:center; width:34px; height:34px; border-radius:50%; flex:none; font:800 1.1rem/1 var(--f-display); color:#fff; background:var(--ink-2); }
.qz-reveal.right .qz-reveal-mark { background:#1d9563; }
.qz-reveal.wrong .qz-reveal-mark { background:var(--bad, #d93226); }
.qz-reveal-who { font-weight:500; color:var(--ink-2); }
.qz-art { display:grid; grid-template-columns:repeat(2,30px); gap:5px; }
.qz-art span { height:30px; border-radius:7px; border:2px solid var(--ink); display:grid; place-items:center; color:#fff; font-weight:800; }
.qz-art .c0 { background:var(--seat-1); } .qz-art .c1 { background:var(--seat-2); } .qz-art .c2 { background:#b07a14; } .qz-art .c3 { background:var(--seat-4); }
@media (prefers-reduced-motion: reduce) { .qz-stage::before, .qz-stage::after, .qz-secs { animation:none !important; } .qz-ring .fg { animation-timing-function:steps(4); } }
`,
};
