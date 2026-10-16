// Въздушен хокей на живо — двама играчи (или срещу бот). Твоята врата е долу.
// Шайбата се смята от играча, в чиято половина е тя: така собственият стик е без закъснение.
// Когато шайбата мине средата, той я „предава“ на другия с последното ѝ положение и скорост.

import { isBot } from '../core/bots.js';
import { liveGame, FW, FH, clamp, round3, newestBy, waitingMessage } from './live.js';

const RM = 0.068; // стик
const RP = 0.042; // шайба
const MOUTH = [0.32, 0.68]; // отвор на вратата
const E = 0.9; // отскок
const FRICTION = 0.45; // загуба на скорост за секунда (експоненциално)
const PUCK_MAX = 2.7;
const MALLET_MAX = 5;
const SUBSTEPS = 4;
const BOT = { easy: [0.9, 0.12], medium: [1.35, 0.05], hard: [2.1, 0.02] }; // скорост, грешка
const MID = FH / 2;
const STILL_MS = 8000;

// Позволената зона за стика на дадено място (0 долу, 1 горе); не стига до средата.
export function zone(i) {
  const gap = RM + RP + 0.01;
  return i === 0
    ? { x0: RM, x1: FW - RM, y0: MID + gap, y1: FH - RM }
    : { x0: RM, x1: FW - RM, y0: RM, y1: MID - gap };
}
const clampZone = (i, p) => { const z = zone(i); return { x: clamp(p.x, z.x0, z.x1), y: clamp(p.y, z.y0, z.y1) }; };
const home = (i) => ({ x: 0.5, y: i === 0 ? FH - 0.14 : 0.14 });
const inHalf = (i, y) => (i === 0 ? y >= MID : y < MID);
const key = (p) => p.n * 1e6 + p.k;

// Стени: страничните и крайната стена на половината `side` (с отвор за вратата).
// Връща 'goal', ако шайбата е влязла изцяло във вратата.
export function walls(pk, side) {
  if (pk.x < RP) { pk.x = RP; pk.vx = Math.abs(pk.vx) * E; }
  if (pk.x > FW - RP) { pk.x = FW - RP; pk.vx = -Math.abs(pk.vx) * E; }
  const inMouth = pk.x > MOUTH[0] && pk.x < MOUTH[1];
  if (side === 0) {
    if (pk.y > FH - RP && !inMouth && pk.y < FH + RP * 0.2) { pk.y = FH - RP; pk.vy = -Math.abs(pk.vy) * E; }
    if (pk.y > FH - RP && inMouth) pk.x = clamp(pk.x, MOUTH[0] + 0.001, MOUTH[1] - 0.001);
    if (pk.y > FH + RP) return 'goal';
  } else {
    if (pk.y < RP && !inMouth && pk.y > -RP * 0.2) { pk.y = RP; pk.vy = Math.abs(pk.vy) * E; }
    if (pk.y < RP && inMouth) pk.x = clamp(pk.x, MOUTH[0] + 0.001, MOUTH[1] - 0.001);
    if (pk.y < -RP) return 'goal';
  }
  return null;
}

// Удар стик–шайба (стикът е безкрайно тежък). vm: скорост на стика.
export function collide(pk, m, vm) {
  const dx = pk.x - m.x;
  const dy = pk.y - m.y;
  const d = Math.hypot(dx, dy);
  if (d >= RM + RP || d === 0) return false;
  const nx = dx / d;
  const ny = dy / d;
  const vn = (pk.vx - vm.x) * nx + (pk.vy - vm.y) * ny;
  if (vn < 0) { pk.vx -= (1 + E) * vn * nx; pk.vy -= (1 + E) * vn * ny; }
  pk.x = m.x + nx * (RM + RP + 0.001);
  pk.y = m.y + ny * (RM + RP + 0.001);
  const sp = Math.hypot(pk.vx, pk.vy);
  if (sp > PUCK_MAX) { pk.vx *= PUCK_MAX / sp; pk.vy *= PUCK_MAX / sp; }
  return true;
}

export function hockeyModel({ players, seat, iSim, simId, controls, target, sound, botLevel, nickOf }) {
  const mal = [home(0), home(1)];
  const prevMal = [home(0), home(1)];
  let pk = null; // шайбата, както я виждам (собствена симулация или последното получено + екстраполация)
  let lastKey = -1;
  let goalAt = 0;
  let stillSince = 0;
  const botErr = {};
  const model = { final: null, score: [0, 0] };

  const adopt = (p, now) => {
    stillSince = now;
    if (pk && p.n > pk.n && p.kind === 'goal') { goalAt = now; sound?.drop(); }
    pk = { ...p };
    lastKey = key(p);
    model.score = p.score.slice();
    if (p.end) model.final = p.score.slice();
  };

  model.myPos = () => mal[seat] ?? home(0);
  model.debugPuck = () => pk;
  model.passes = 0;

  const startPuck = (n, own, score, end = false) => ({
    n, k: 0, own, kind: n === 1 ? 'start' : 'goal', x: 0.5, y: own === 0 ? FH * 0.72 : FH * 0.28, vx: 0, vy: 0, score, end,
  });

  model.step = (dt, now, { peers, present, input }) => {
    // 1. Получена шайба (по-нова от моята).
    const best = newestBy(peers, 'pk', key);
    if (best && key(best) > lastKey) {
      // Докато я смятам аз, приемам само по-нов номер (предаване или гол).
      if (!pk || !controls(pk.own) || best.n > pk.n) adopt(best, now);
    }
    if (!pk && iSim && present) adopt(startPuck(1, Math.random() < 0.5 ? 0 : 1, [0, 0]), now);

    // 2. Стикове.
    for (let i = 0; i < 2; i++) prevMal[i] = { ...mal[i] };
    if (seat !== -1 && input) moveToward(seat, clampZone(seat, input), MALLET_MAX, dt);
    players.forEach((p, i) => {
      if (i === seat) return;
      if (controls(i)) { botStep(i, dt); return; }
      const src = isBot(p) ? peers.get(simId)?.bots?.[i] : peers.get(p)?.m;
      if (Array.isArray(src)) {
        const t = clampZone(i, { x: src[0], y: src[1] });
        const a = Math.min(1, dt * 18);
        mal[i] = { x: mal[i].x + (t.x - mal[i].x) * a, y: mal[i].y + (t.y - mal[i].y) * a };
      }
    });

    if (!pk || pk.end || model.final) return;

    // 3. Физика.
    if (controls(pk.own)) simulate(dt, now);
    else extrapolate(dt);
  };

  function moveToward(i, t, max, dt) {
    const dx = t.x - mal[i].x;
    const dy = t.y - mal[i].y;
    const d = Math.hypot(dx, dy);
    const step = max * dt;
    mal[i] = d <= step ? { x: t.x, y: t.y } : { x: mal[i].x + (dx / d) * step, y: mal[i].y + (dy / d) * step };
  }

  function simulate(dt, now) {
    const own = pk.own;
    const vm = dt > 0 ? { x: (mal[own].x - prevMal[own].x) / dt, y: (mal[own].y - prevMal[own].y) / dt } : { x: 0, y: 0 };
    const h = dt / SUBSTEPS;
    const before = JSON.stringify([pk.x, pk.y, pk.vx, pk.vy]);
    let hit = false;
    for (let s = 1; s <= SUBSTEPS; s++) {
      pk.x += pk.vx * h;
      pk.y += pk.vy * h;
      const f = s / SUBSTEPS;
      const m = { x: prevMal[own].x + (mal[own].x - prevMal[own].x) * f, y: prevMal[own].y + (mal[own].y - prevMal[own].y) * f };
      if (collide(pk, m, vm)) hit = true;
      if (walls(pk, own) === 'goal') {
        const score = pk.score.slice();
        score[1 - own] += 1;
        const end = score[1 - own] >= target;
        adopt({ ...startPuck(pk.n + 1, own, score, end), kind: 'goal' }, now);
        return;
      }
      if (!inHalf(own, pk.y)) {
        // Предаване на другата половина.
        model.passes += 1;
        adopt({ ...pk, n: pk.n + 1, k: 0, own: 1 - own, kind: 'pass', ...rounded(pk) }, now);
        return;
      }
    }
    const fr = Math.exp(-FRICTION * dt);
    pk.vx *= fr; pk.vy *= fr;
    if (Math.hypot(pk.vx, pk.vy) < 0.004) { pk.vx = 0; pk.vy = 0; }
    if (hit) sound?.tap();
    // Правило за 8-те секунди: шайбата не може да стои вечно в една половина.
    if (now - stillSince > STILL_MS) {
      model.passes += 1;
      adopt({ ...startPuck(pk.n + 1, 1 - own, pk.score.slice()), kind: 'pass' }, now);
      return;
    }
    if (JSON.stringify([pk.x, pk.y, pk.vx, pk.vy]) !== before) {
      Object.assign(pk, rounded(pk), { k: pk.k + 1, kind: 'move' });
      lastKey = key(pk);
    }
  }

  function extrapolate(dt) {
    pk.x += pk.vx * dt;
    pk.y += pk.vy * dt;
    walls(pk, pk.own);
    // Не я пускам в другата половина, докато не дойде предаването.
    pk.y = pk.own === 0 ? Math.max(pk.y, MID) : Math.min(pk.y, MID);
    const fr = Math.exp(-FRICTION * dt);
    pk.vx *= fr; pk.vy *= fr;
  }

  function botStep(i, dt) {
    const [speed, err] = BOT[botLevel(players[i])] ?? BOT.medium;
    let t = home(i);
    if (pk && !pk.end) {
      if (pk.own === i) {
        if (botErr[i]?.n !== pk.n) botErr[i] = { n: pk.n, dx: (Math.random() * 2 - 1) * err };
        // Застава зад шайбата спрямо чуждата врата и я удря към нея.
        const goal = { x: 0.5 + botErr[i].dx * 3, y: i === 0 ? 0 : FH };
        let dx = pk.x - goal.x;
        let dy = pk.y - goal.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d; dy /= d;
        const behind = { x: pk.x + dx * (RM + RP) * 1.2, y: pk.y + dy * (RM + RP) * 1.2 };
        const rel = (mal[i].x - pk.x) * dx + (mal[i].y - pk.y) * dy;
        t = rel > (RM + RP) * 0.6 ? { x: pk.x - dx * 0.06, y: pk.y - dy * 0.06 } : behind;
      } else {
        // Пази вратата: следи шайбата по хоризонтала.
        t = { x: 0.5 + (pk.x - 0.5) * 0.6 + (botErr[i]?.dx ?? 0), y: home(i).y };
      }
    }
    moveToward(i, clampZone(i, t), speed, dt);
  }

  model.publish = () => {
    if (seat === -1) return null;
    const out = { m: [round3(mal[seat].x), round3(mal[seat].y)] };
    if (pk) out.pk = pk;
    if (iSim) {
      const bots = {};
      players.forEach((p, i) => { if (isBot(p)) bots[i] = [round3(mal[i].x), round3(mal[i].y)]; });
      if (Object.keys(bots).length) out.bots = bots;
    }
    return out;
  };

  model.message = (now, { peers, noLive }) => {
    if (noLive) return 'Няма връзка за игра на живо';
    if (model.final) return seat === -1 ? 'Край!' : model.final[seat] === target ? 'Победа!' : 'Загуба';
    const wait = waitingMessage({ players, simId, peers, nickOf, seat });
    if (!pk) return wait ?? 'Готови…';
    if (wait) return wait;
    if (now - goalAt < 1200) return 'Гол!';
    if (pk.own === seat && now - stillSince > STILL_MS - 3000) return `Удряй! ${Math.max(1, Math.ceil((STILL_MS - (now - stillSince)) / 1000))}`;
    return null;
  };

  model.draw = (g, T, c) => {
    const { k } = T;
    g.fillStyle = c.surface;
    g.fillRect(0, 0, FW * k, FH * k);
    // маркировка
    g.strokeStyle = c.line;
    g.lineWidth = Math.max(2, k * 0.008);
    g.beginPath(); g.moveTo(0, T.y(MID)); g.lineTo(FW * k, T.y(MID)); g.stroke();
    g.beginPath(); g.arc(T.x(0.5), T.y(MID), 0.14 * k, 0, Math.PI * 2); g.stroke();
    // врати
    [0, 1].forEach((i) => {
      g.fillStyle = c.seats[i];
      const y = i === 0 ? FH : 0;
      const x0 = Math.min(T.x(MOUTH[0]), T.x(MOUTH[1]));
      g.fillRect(x0, T.y(y) - k * 0.012, (MOUTH[1] - MOUTH[0]) * k, k * 0.024);
      g.globalAlpha = 0.12;
      g.beginPath(); g.arc(T.x(0.5), T.y(y), 0.2 * k, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    });
    // резултат
    g.font = `800 ${Math.round(k * 0.22)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.globalAlpha = 0.14;
    [0, 1].forEach((i) => {
      g.fillStyle = c.seats[i];
      g.fillText(String(model.score[i]), T.x(0.5), T.y(i === 0 ? FH * 0.62 : FH * 0.38));
    });
    g.globalAlpha = 1;
    // шайба
    if (pk && !pk.end) {
      g.fillStyle = c.ink;
      g.beginPath(); g.arc(T.x(pk.x), T.y(pk.y), RP * k, 0, Math.PI * 2); g.fill();
    }
    // стикове
    [0, 1].forEach((i) => {
      const x = T.x(mal[i].x);
      const y = T.y(mal[i].y);
      g.fillStyle = c.seats[i];
      g.strokeStyle = c.ink;
      g.lineWidth = Math.max(1.5, k * 0.006);
      g.beginPath(); g.arc(x, y, RM * k, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(x, y, RM * k * 0.45, 0, Math.PI * 2); g.stroke();
    });
  };

  return model;
}

const rounded = (p) => ({ x: round3(p.x), y: round3(p.y), vx: round3(p.vx), vy: round3(p.vy) });

export default liveGame({
  id: 'hockey',
  name: 'Въздушен хокей',
  icon: '🥅',
  blurb: 'На живо: вкарай шайбата във вратата на другия.',
  rules: [
    'Играе се на живо, двама души или срещу бот.',
    'Твоят стик и твоята врата са долу. Движи пръст или мишката. На клавиатура: стрелките.',
    'Стикът не може да мине средната линия.',
    'Удряй шайбата към вратата отгоре. Колкото по-бързо движиш стика, толкова по-силен е ударът.',
    'Влезе ли шайбата във вратата ти, точката е за противника, а шайбата остава при теб.',
    'Шайбата може да стои в твоята половина най-много 8 секунди. После отива при противника.',
    'Печели първият, стигнал до избрания брой голове.',
  ],
  model: hockeyModel,
  art() {
    const el = document.createElement('div');
    el.className = 'hk-art';
    el.innerHTML = '<i></i><b></b><i></i>';
    return el;
  },
  css: `
.hk-art { position:relative; width:52px; height:70px; border-radius:12px; border:2px solid var(--ink); background:var(--surface); overflow:hidden; }
.hk-art::before { content:''; position:absolute; left:0; right:0; top:33px; border-top:2px solid var(--line); }
.hk-art i { position:absolute; left:16px; top:6px; width:18px; height:18px; border-radius:50%; border:2px solid var(--ink); background:var(--seat-2); }
.hk-art i:last-child { top:auto; bottom:6px; background:var(--seat-1); }
.hk-art b { position:absolute; left:30px; top:38px; width:10px; height:10px; border-radius:50%; background:var(--ink); }
`,
});
