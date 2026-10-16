// Понг на живо — двама играчи (или срещу бот). Всеки вижда своята бухалка долу.
// Топката се движи по права между събитията; за удар или пропуск решава играчът,
// към чиято страна лети тя (за бот: първият човек в партидата).

import { isBot } from '../core/bots.js';
import { liveGame, FW, FH, clamp, round3, newestBy, waitingMessage, LIVE_CSS } from './live.js';
import { createFx, shadow, ball3d } from './live-fx.js';

const R = 0.022; // радиус на топката
const PW = 0.11; // половин ширина на бухалката
const PT = 0.024; // дебелина на бухалката
const PY = 0.075; // разстояние на бухалката от ръба
const SPEED0 = 0.85;
const SPEED_MAX = 2.3;
const LINE = [FH - PY - PT / 2 - R, PY + PT / 2 + R]; // линия на удара: място 0 долу, място 1 горе
const SERVE_WAIT = 1200;
const END_WAIT = 1e9;
const BOT = { easy: [0.55, 0.13], medium: [0.85, 0.07], hard: [1.3, 0.035] }; // скорост, грешка

function serveEvent(n, toward, score, end = false) {
  const ang = (Math.random() - 0.5) * 1.0;
  const dir = toward === 0 ? 1 : -1;
  return {
    n, kind: n === 1 ? 'start' : 'miss', x: 0.5, y: FH / 2,
    vx: round3(SPEED0 * Math.sin(ang)), vy: round3(dir * SPEED0 * Math.cos(ang)),
    score, wait: end ? END_WAIT : n === 1 ? 1500 : SERVE_WAIT, end,
  };
}

// Позиция на топката след el секунди от началото на движението (отскача от страничните стени).
export function ballPos(ev, el) {
  const span = FW - 2 * R;
  let u = (ev.x - R + ev.vx * el) % (2 * span);
  if (u < 0) u += 2 * span;
  if (u > span) u = 2 * span - u;
  return { x: R + u, y: ev.y + ev.vy * el };
}

export function pongModel({ players, seat, iSim, simId, controls, target, sound, botLevel, nickOf }) {
  const pad = [0.5, 0.5];
  let ev = null;
  let t0 = 0;
  let missAt = 0;
  let resolvedFor = 0;
  const botAim = {};
  const model = { final: null, score: [0, 0] };
  const fx = createFx();

  const adopt = (e, at) => {
    ev = e; t0 = at; missAt = 0;
    model.score = e.score.slice();
    if (e.end) model.final = e.score.slice();
  };
  const elapsed = (now) => (ev ? Math.max(0, now - t0 - ev.wait) / 1000 : 0);
  const sideOf = (e) => (e.vy > 0 ? 0 : 1);
  const lineTime = (e) => (LINE[sideOf(e)] - e.y) / e.vy;

  model.myPos = () => ({ x: pad[seat] ?? 0.5, y: seat === 1 ? PY : FH - PY });

  model.step = (dt, now, { peers, present, input }) => {
    // 1. Най-новото събитие от всички.
    const best = newestBy(peers, 'ev', (e) => e.n);
    if (best && (!ev || best.n > ev.n)) {
      if (best.kind === 'hit') { sound?.tap(); fx.sparkle(best.x, best.y, '#fff', now); } else if (ev) { sound?.drop(); fx.flash(now); fx.resetTrail(); }
      adopt(best, now);
    }
    // 2. Първият сервис: първият човек, щом всички са тук.
    if (!ev && iSim && present) adopt(serveEvent(1, Math.random() < 0.5 ? 0 : 1, [0, 0]), now);

    // 3. Бухалки.
    if (seat !== -1 && input) pad[seat] = clamp(input.x, PW, FW - PW);
    players.forEach((p, i) => {
      if (i === seat) return;
      if (controls(i)) { pad[i] = botPad(i, dt, now); return; }
      const src = isBot(p) ? peers.get(simId)?.bots?.[i] : peers.get(p)?.pad;
      if (typeof src === 'number') pad[i] += (clamp(src, PW, FW - PW) - pad[i]) * Math.min(1, dt * 18);
    });

    // 4. Удар или пропуск — само за страните, за които отговарям.
    if (!ev || ev.end || model.final) return;
    const side = sideOf(ev);
    if (!controls(side) || resolvedFor === ev.n) return;
    const el = elapsed(now);
    const tl = lineTime(ev);
    if (el < tl) return;
    const at = ballPos(ev, tl);
    if (!missAt && Math.abs(at.x - pad[side]) <= PW + R * 0.8) {
      resolvedFor = ev.n;
      const off = clamp((at.x - pad[side]) / (PW + R), -1, 1);
      const speed = Math.min(SPEED_MAX, Math.hypot(ev.vx, ev.vy) * 1.07);
      const ang = off * 1.0;
      const next = {
        n: ev.n + 1, kind: 'hit', x: round3(at.x), y: round3(LINE[side]),
        vx: round3(speed * Math.sin(ang)), vy: round3((side === 0 ? -1 : 1) * speed * Math.cos(ang)),
        score: ev.score.slice(), wait: 0, end: false,
      };
      sound?.tap();
      fx.sparkle(next.x, next.y, '#fff', now);
      adopt(next, now - (el - tl) * 1000);
      return;
    }
    if (!missAt) { missAt = now + 350; return; }
    if (now < missAt) return;
    resolvedFor = ev.n;
    const score = ev.score.slice();
    score[1 - side] += 1;
    sound?.drop();
    fx.flash(now); fx.resetTrail();
    adopt(serveEvent(ev.n + 1, side, score, score[1 - side] >= target), now);
  };

  function botPad(i, dt, now) {
    const [speed, err] = BOT[botLevel(players[i])] ?? BOT.medium;
    let goal = 0.5;
    if (ev && !ev.end && sideOf(ev) === i) {
      if (botAim[i]?.n !== ev.n) botAim[i] = { n: ev.n, err: (Math.random() * 2 - 1) * err * 2.2 };
      goal = ballPos(ev, lineTime(ev)).x + botAim[i].err;
    }
    goal = clamp(goal, PW, FW - PW);
    const d = goal - pad[i];
    return pad[i] + clamp(d, -speed * dt, speed * dt);
  }

  model.publish = () => {
    if (seat === -1) return null;
    const out = { pad: round3(pad[seat]) };
    if (ev) out.ev = ev;
    if (iSim) {
      const bots = {};
      players.forEach((p, i) => { if (isBot(p)) bots[i] = round3(pad[i]); });
      if (Object.keys(bots).length) out.bots = bots;
    }
    return out;
  };

  model.message = (now, { peers, noLive }) => {
    if (noLive) return 'Няма връзка за игра на живо';
    if (model.final) return seat === -1 ? 'Край!' : model.final[seat] === target ? 'Победа!' : 'Загуба';
    const wait = waitingMessage({ players, simId, peers, nickOf, seat });
    if (!ev) return wait ?? 'Готови…';
    if (wait && ev && sideOf(ev) !== seat) return wait;
    const left = t0 + ev.wait - now;
    if (left > 0) return ev.n === 1 ? `Започваме след ${Math.ceil(left / 1000)}` : 'Точка!';
    return null;
  };

  model.draw = (g, T, c, now) => {
    const { k } = T;
    const w = FW * k, h = FH * k;
    // Маса за тенис: синьо покритие с бели ръбове и мрежа по средата.
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#2c5f9e'); bg.addColorStop(0.5, '#214f88'); bg.addColorStop(1, '#1a4072');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const glow = g.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, h * 0.9);
    glow.addColorStop(0, 'rgb(255 255 255 / .14)'); glow.addColorStop(1, 'rgb(255 255 255 / 0)');
    g.fillStyle = glow; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgb(255 255 255 / .9)';
    g.lineWidth = Math.max(2, k * 0.012);
    g.strokeRect(k * 0.02, k * 0.02, w - k * 0.04, h - k * 0.04);
    g.lineWidth = Math.max(1, k * 0.005);
    g.beginPath(); g.moveTo(w / 2, k * 0.02); g.lineTo(w / 2, h - k * 0.02); g.stroke();
    // мрежа
    const ny = T.y(FH / 2);
    g.fillStyle = 'rgb(0 0 0 / .25)'; g.fillRect(0, ny - k * 0.004, w, k * 0.03);
    g.fillStyle = '#e9edf2'; g.fillRect(0, ny - k * 0.012, w, k * 0.016);
    g.fillStyle = 'rgb(20 30 50 / .55)';
    for (let x = 0; x < w; x += k * 0.02) g.fillRect(x, ny - k * 0.004, k * 0.004, k * 0.012);
    // резултат
    g.font = `800 ${Math.round(k * 0.22)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.2;
    g.fillStyle = '#fff';
    [0, 1].forEach((i) => g.fillText(String(model.score[i]), T.x(0.5), T.y(i === 0 ? FH * 0.72 : FH * 0.28)));
    g.globalAlpha = 1;
    // бухалки: гума в цвета на играча, сянка, отблясък
    [0, 1].forEach((i) => {
      const y = T.y(i === 0 ? FH - PY : PY);
      const x0 = Math.min(T.x(pad[i] - PW), T.x(pad[i] + PW));
      const pw = PW * 2 * k, ph = PT * k;
      g.fillStyle = 'rgb(0 0 0 / .3)';
      roundRect(g, x0 + k * 0.006, y - ph / 2 + k * 0.012, pw, ph, ph / 2); g.fill();
      const pg = g.createLinearGradient(0, y - ph / 2, 0, y + ph / 2);
      pg.addColorStop(0, '#fff'); pg.addColorStop(0.25, c.seats[i]); pg.addColorStop(1, c.seats[i]);
      g.fillStyle = pg;
      roundRect(g, x0, y - ph / 2, pw, ph, ph / 2); g.fill();
      // Бял кант, за да личи и синята бухалка върху синята маса.
      g.strokeStyle = 'rgb(255 255 255 / .9)'; g.lineWidth = Math.max(2, k * 0.01); g.stroke();
      g.strokeStyle = 'rgb(0 0 0 / .45)'; g.lineWidth = Math.max(1, k * 0.004); g.stroke();
    });
    // топка: следа, сянка, обем
    let b = { x: 0.5, y: FH / 2 };
    if (ev && !ev.end) {
      b = ballPos(ev, elapsed(now));
      const side = sideOf(ev);
      // Към чужда страна: топката чака на линията, докато дойде отговорът.
      if (!controls(side)) b.y = side === 0 ? Math.min(b.y, LINE[0]) : Math.max(b.y, LINE[1]);
      if (now - t0 > ev.wait) fx.track(b.x, b.y, now);
    }
    fx.drawTrail(g, T, R, '#ffd27a', now);
    const bx = T.x(b.x), by = T.y(b.y), br = R * k;
    shadow(g, bx, by, br, k);
    ball3d(g, bx, by, br, '#ffb347', '#fffaf0', 'rgb(120 50 0 / .55)');
    fx.drawSparks(g, T, now);
    fx.drawFlash(g, w, h, now);
  };

  return model;
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export default liveGame({
  id: 'pong',
  name: 'Понг',
  icon: '🏓',
  blurb: 'На живо: отбивай топката с бухалката си.',
  rules: [
    'Играе се на живо, двама души или срещу бот.',
    'Твоята бухалка е долу. Движи пръст по полето или мишката. На клавиатура: стрелките.',
    'Пропуснеш ли топката, противникът печели точка.',
    'Удариш ли топката с ръба на бухалката, тя излита под по-остър ъгъл. Всеки удар я ускорява.',
    'Печели първият, стигнал до избрания брой точки.',
  ],
  model: pongModel,
  art() {
    const el = document.createElement('div');
    el.className = 'pg-art';
    el.innerHTML = '<i></i><b></b><i></i>';
    return el;
  },
  css: `${LIVE_CSS}
.pg-art { position:relative; width:52px; height:70px; border-radius:10px; border:2px solid var(--ink); background:var(--surface); }
.pg-art i { position:absolute; left:12px; width:26px; height:6px; border-radius:3px; background:var(--seat-2); top:6px; }
.pg-art i:last-child { top:auto; bottom:6px; background:var(--seat-1); }
.pg-art b { position:absolute; left:28px; top:26px; width:10px; height:10px; border-radius:50%; background:var(--ink); }
`,
});
