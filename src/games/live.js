// Обща основа за игрите на живо (Понг, Въздушен хокей).
//
// В лога влиза само крайният резултат: { type: 'result', score: [a, b] }.
// Самата игра тече през присъствието в именувана стая (rt-КОД-рунд): всеки играч
// праща позицията на своята бухалка и последното събитие за топката. Който отговаря
// за дадена половина (нейният играч, а за бот: първият човек), решава какво става там.
// Така собствената бухалка няма закъснение, а забавянето на мрежата само забавя
// топката с няколко десети от секундата.

import { isBot } from '../core/bots.js';

export const FW = 1;
export const FH = 1.6;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round3 = (v) => Math.round(v * 1000) / 1000;

const TARGETS = [{ value: 5, label: 'До 5' }, { value: 7, label: 'До 7' }, { value: 11, label: 'До 11' }];
const KEY_SPEED = 1.6;

export function liveGame(def) {
  const { model, ...rest } = def;
  return {
    realtime: true,
    minPlayers: 2,
    maxPlayers: 2,
    moveSound: 'tap',
    options: [{ id: 'target', label: 'Точки за победа', default: 7, choices: TARGETS }],
    ...rest,

    init: (seed, players, opts = {}) => ({ players: players.slice(), target: opts.target ?? 7, score: [0, 0], phase: 'play' }),
    currentPlayer: () => null,
    waitingFor: () => [],

    validateMove(s, m, p) {
      if (s.phase === 'done') return { ok: false, reason: 'over' };
      if (!s.players.includes(p)) return { ok: false, reason: 'not-a-player' };
      if (m?.type !== 'result' || !Array.isArray(m.score) || m.score.length !== 2) return { ok: false, reason: 'bad-move' };
      const [a, b] = m.score;
      const okNum = (v) => Number.isInteger(v) && v >= 0 && v <= s.target;
      if (!okNum(a) || !okNum(b) || a === b || Math.max(a, b) !== s.target) return { ok: false, reason: 'bad-move' };
      return { ok: true };
    },
    applyMove: (s, m) => ({ ...s, score: m.score.slice(), phase: 'done' }),
    autoMove: () => null,
    bot: () => null,

    isOver: (s) => s.phase === 'done',
    winner: (s) => (s.score[0] === s.score[1] ? 'draw' : s.players[s.score[0] > s.score[1] ? 0 : 1]),
    status: (s) => (s.phase === 'play' ? `На живо, до ${s.target} точки` : null),

    render(el, s, ctx) { mountLive(el, s, ctx, model); },
  };
}

function colorsNow() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, f) => cs.getPropertyValue(n).trim() || f;
  return {
    ink: v('--ink', '#222'), ink2: v('--ink-2', '#666'), surface: v('--surface', '#fff'), surface2: v('--surface-2', '#eee'),
    line: v('--line', '#ccc'), seats: [v('--seat-1', '#e33'), v('--seat-2', '#36c')], accent: v('--accent', '#f60'),
  };
}

function mountLive(el, s, ctx, makeModel) {
  const sc = ctx.scratch ?? {};
  el.innerHTML = '';
  const rt = sc.rt;
  const waitingForLog = rt?.sentResult && s.phase === 'play' && ctx.over;
  if (s.phase === 'done' || (ctx.over && !waitingForLog)) {
    const score = s.phase === 'done' ? s.score : rt?.model.score ?? s.score;
    rt?.dispose();
    sc.rt = null;
    const card = document.createElement('div');
    card.className = 'lv-final';
    s.players.forEach((p, i) => {
      const row = document.createElement('div');
      row.className = 'lv-final-row';
      row.style.setProperty('--disc', `var(--seat-${i + 1})`);
      const name = document.createElement('span');
      name.textContent = ctx.nickOf(p);
      const num = document.createElement('b');
      num.textContent = String(score[i]);
      row.append(name, num);
      card.append(row);
    });
    el.append(card);
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.className = 'lv-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Игрище. Движи пръст или мишка, за да местиш бухалката. На клавиатура: стрелките.');
  canvas.tabIndex = 0;
  el.append(canvas);
  const first = !sc.rt;
  const live = sc.rt ?? (sc.rt = startLive(s, ctx, makeModel));
  // Цялото игрище да се вижда над долното меню.
  if (first) {
    setTimeout(() => {
      const c = sc.rt?.canvas;
      if (!c?.isConnected) return;
      const r = c.getBoundingClientRect();
      if (r.bottom > innerHeight - 90 || r.top < 0) c.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, 450);
  }
  sc.dispose = () => { sc.rt?.dispose(); sc.rt = null; };
  live.attach(canvas);
}

// Кой за какво отговаря: своята бухалка, а първият човек и за ботовете.
export function modelParams({ players, me, target, sound = null, botLevel = () => 'medium', nickOf = (id) => id }) {
  const seat = players.indexOf(me);
  const simId = players.find((p) => !isBot(p));
  const iSim = simId === me;
  return {
    players, seat, iSim, simId, target, sound, botLevel, nickOf,
    controls: (i) => i === seat || (iSim && isBot(players[i])),
  };
}

function startLive(s, ctx, makeModel) {
  const players = s.players;
  const humans = players.filter((p) => !isBot(p));
  const params = modelParams({
    players, me: ctx.me, target: s.target, sound: ctx.sound,
    botLevel: (id) => ctx.botLevel?.(id) ?? 'medium', nickOf: ctx.nickOf,
  });
  const { seat } = params;
  const flip = seat === 1;
  const model = makeModel(params);

  const rt = { model, dead: false, conn: null, peers: new Map(), canvas: null, sentResult: false, input: null, keys: new Set() };
  let last = performance.now();
  let colors = colorsNow();
  let colorsAt = last;
  let lastOut = '';
  let raf = 0;

  ctx.joinLive?.().then((conn) => {
    if (rt.dead) { conn.leave(); return; }
    rt.conn = conn;
    conn.onPeers((m) => { rt.peers = m; });
    lastOut = '';
  }).catch(() => { rt.noLive = true; });

  const toField = (e) => {
    const r = rt.canvas.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * FW;
    let y = ((e.clientY - r.top) / r.height) * FH;
    if (flip) { x = FW - x; y = FH - y; }
    return { x, y };
  };
  const onPointer = (e) => {
    if (seat === -1) return;
    if (e.pointerType !== 'mouse' && e.type === 'pointermove' && !e.buttons && !e.pressure) return;
    e.preventDefault();
    rt.input = toField(e);
  };
  const onKey = (e) => {
    if (seat === -1 || /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName ?? '')) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (e.type === 'keydown') rt.keys.add(e.key); else rt.keys.delete(e.key);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKey);

  const keyInput = (dt) => {
    if (!rt.keys.size) return;
    const cur = rt.input ?? model.myPos?.() ?? { x: 0.5, y: seat === 1 ? FH * 0.2 : FH * 0.8 };
    // Стрелките са спрямо екрана; при обърнат изглед посоките в полето са обратни.
    const sgn = flip ? -1 : 1;
    let { x, y } = cur;
    if (rt.keys.has('ArrowLeft')) x -= KEY_SPEED * dt * sgn;
    if (rt.keys.has('ArrowRight')) x += KEY_SPEED * dt * sgn;
    if (rt.keys.has('ArrowUp')) y -= KEY_SPEED * dt * sgn;
    if (rt.keys.has('ArrowDown')) y += KEY_SPEED * dt * sgn;
    rt.input = { x: clamp(x, 0, FW), y: clamp(y, 0, FH) };
  };

  const draw = () => {
    const c = rt.canvas;
    if (!c || !c.isConnected) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr);
    const hgt = Math.round(c.clientHeight * dpr);
    if (!w || !hgt) return;
    if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
    const g = c.getContext('2d');
    const k = w / FW;
    const T = {
      k,
      x: (x) => (flip ? FW - x : x) * k,
      y: (y) => (flip ? FH - y : y) * k,
      flip,
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, hgt);
    model.draw(g, T, colors, performance.now());
    const msg = model.message(performance.now(), { peers: rt.peers, noLive: rt.noLive });
    if (msg) {
      g.font = `800 ${Math.round(k * 0.07)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const tw = g.measureText(msg).width + k * 0.08;
      g.fillStyle = colors.surface;
      g.globalAlpha = 0.9;
      g.fillRect(w / 2 - tw / 2, hgt / 2 - k * 0.06, tw, k * 0.12);
      g.globalAlpha = 1;
      g.fillStyle = colors.ink;
      g.fillText(msg, w / 2, hgt / 2);
    }
  };

  const frame = (now) => {
    if (rt.dead) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (now - colorsAt > 1000) { colors = colorsNow(); colorsAt = now; }
    keyInput(dt);
    const present = humans.every((h) => h === ctx.me || rt.peers.has(h));
    model.step(dt, now, { peers: rt.peers, present, input: rt.input });
    if (rt.conn && seat !== -1) {
      const out = model.publish();
      const json = out && JSON.stringify(out);
      if (json && json !== lastOut) { lastOut = json; rt.conn.setPresence(out); }
    }
    if (model.final && !rt.sentResult && seat !== -1) {
      rt.sentResult = true;
      setTimeout(() => { if (!rt.dead) ctx.onMove({ type: 'result', score: model.final.slice() }); }, 900);
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  rt.attach = (canvas) => {
    rt.canvas = canvas;
    for (const t of ['pointerdown', 'pointermove']) canvas.addEventListener(t, onPointer);
    draw();
  };
  rt.dispose = () => {
    if (rt.dead) return;
    rt.dead = true;
    cancelAnimationFrame(raf);
    rt.conn?.leave();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('keyup', onKey);
  };
  return rt;
}

// Помощни функции за моделите.
export function newestBy(peers, field, key, extra = []) {
  let best = null;
  for (const p of [...peers.values(), ...extra]) {
    const v = p?.[field] ?? p;
    if (v && typeof v === 'object' && Number.isFinite(key(v)) && (!best || key(v) > key(best))) best = v;
  }
  return best;
}

export function waitingMessage({ players, simId, peers, nickOf, seat }) {
  const missing = players.filter((p, i) => !isBot(p) && i !== seat && !peers.has(p));
  if (missing.length) return `Чакаме ${missing.map(nickOf).join(' и ')}…`;
  if (!peers.has(simId) && seat === -1) return 'Чакаме играчите…';
  return null;
}

export const LIVE_CSS = `
.lv-canvas { display:block; width:min(100%, calc((100dvh - 190px) / 1.6)); aspect-ratio:1/1.6; margin-inline:auto; border-radius:var(--r-lg); scroll-margin:12px 0 96px;
  border:3px solid var(--ink); background:var(--surface-2); touch-action:none; user-select:none; -webkit-user-select:none; cursor:crosshair; }
@media (min-width: 720px) { .lv-canvas { width:min(100%, calc((100dvh - 130px) / 1.6)); scroll-margin:96px 0 16px; } }
/* По време на игра на живо чатът се мести горе, за да не пречи на бухалката. */
body:has(.lv-canvas) .chat-fab { bottom:auto; top:calc(84px + env(safe-area-inset-top, 0px)); transform:scale(.85); }
.lv-canvas:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
.lv-final { display:grid; gap:8px; width:min(100%,360px); margin-inline:auto; }
.lv-final-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 16px; border-radius:var(--r-md);
  border:2px solid var(--ink); background:var(--surface); box-shadow:inset 6px 0 0 var(--disc); font-weight:700; }
.lv-final-row b { font:800 1.8rem/1 var(--f-display); }
`;
