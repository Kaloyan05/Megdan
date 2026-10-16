// Мини голф — 2–4 играчи, 3 писти, удари на ред. По-малко удари печели.
// Физиката е детерминистична: само + − × ÷ и закръгляне на всяка стъпка, без sin/cos,
// затова всяко устройство изчислява един и същ път на топката.

const W = 100, H = 150, R = 2;
const FRICTION = 0.975, SAND = 0.9, BOUNCE = 0.7;
const MAXV = 4.5;
const HOLE_R2 = 3.2 * 3.2, CAPTURE2 = 2.6 * 2.6, STOP2 = 0.0025;
const MAX_STROKES = 8;

export const COURSES = [
  { name: 'Правата', par: 2, tee: [50, 135], hole: [50, 20], walls: [[35, 70, 65, 80]], sand: [] },
  { name: 'Завоят', par: 3, tee: [20, 135], hole: [80, 18], walls: [[0, 0, 60, 90]], sand: [[62, 95, 100, 115]] },
  { name: 'Пясъкът', par: 3, tee: [50, 140], hole: [50, 15], walls: [[0, 100, 40, 108], [60, 40, 100, 48]], sand: [[20, 55, 80, 85]] },
];

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const r3 = (v) => Math.round(v * 1e3) / 1e3;
const inRect = (x, y, [x0, y0, x1, y1], pad = 0) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad;

function blocked(course, x, y) {
  if (x < R || x > W - R || y < R || y > H - R) return true;
  return course.walls.some((w) => inRect(x, y, w, R));
}

// Симулира удар. Връща крайната позиция, дали е в дупката, и път за анимация.
export function simulate(course, from, dx, dy, power) {
  let [x, y] = from;
  let vx = r4(dx * power * MAXV), vy = r4(dy * power * MAXV);
  const path = [[x, y]];
  let holed = false;
  for (let step = 0; step < 3000; step++) {
    const nx = r4(x + vx);
    if (blocked(course, nx, y)) vx = r4(-vx * BOUNCE); else x = nx;
    const ny = r4(y + vy);
    if (blocked(course, x, ny)) vy = r4(-vy * BOUNCE); else y = ny;
    const f = course.sand.some((s) => inRect(x, y, s)) ? SAND : FRICTION;
    vx = r4(vx * f); vy = r4(vy * f);
    const hx = x - course.hole[0], hy = y - course.hole[1];
    const sp = vx * vx + vy * vy;
    if (hx * hx + hy * hy < HOLE_R2 && sp < CAPTURE2) { holed = true; [x, y] = course.hole; path.push([x, y]); break; }
    if (sp < STOP2) break;
    if (step % 3 === 0) path.push([x, y]);
  }
  path.push([x, y]);
  return { x, y, holed, path };
}

const freshBalls = (s, holeIdx) => s.players.map(() => ({ x: COURSES[holeIdx].tee[0], y: COURSES[holeIdx].tee[1], done: false, holed: false, strokes: 0 }));

function nextSeat(balls, from) {
  for (let k = 1; k <= balls.length; k++) {
    const i = (from + k) % balls.length;
    if (!balls[i].done) return i;
  }
  return -1;
}

export default {
  id: 'golf',
  name: 'Мини голф',
  icon: '⛳',
  blurb: 'Три писти, удари на ред. По-малко удари печели.',
  rules: [
    'Играете три писти. На своя ред удряш топката веднъж.',
    'Дръпни назад от топката като прашка: посоката е обратна, а колкото по-далеч дърпаш, толкова по-силно. Може и с плъзгачите отдолу.',
    'Стените отблъскват, пясъкът спира топката по-бързо. Твърде бърза топка прескача дупката.',
    `Пистата свършва, когато всички вкарат или стигнат ${MAX_STROKES} удара.`,
    'Печели който има най-малко удари общо.',
  ],
  minPlayers: 2,
  maxPlayers: 4,
  moveSound: 'tap',

  init(seed, players) {
    const s = { players: players.slice(), hole: 0, turn: 0, scores: players.map(() => []), last: null, over: false };
    s.balls = freshBalls(s, 0);
    return s;
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, m, p) {
    if (s.over) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    const ok = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
    if (!ok(m?.dx, -1, 1) || !ok(m?.dy, -1, 1) || !ok(m?.power, 0.05, 1)) return { ok: false, reason: 'bad-shot' };
    const len = m.dx * m.dx + m.dy * m.dy;
    if (len < 0.95 || len > 1.05) return { ok: false, reason: 'bad-shot' };
    return { ok: true };
  },

  applyMove(s0, m) {
    const s = { ...s0, balls: s0.balls.map((b) => ({ ...b })), scores: s0.scores.map((x) => x.slice()) };
    const seat = s.turn;
    const course = COURSES[s.hole];
    const ball = s.balls[seat];
    const res = simulate(course, [ball.x, ball.y], r3(m.dx), r3(m.dy), r3(m.power));
    ball.x = res.x; ball.y = res.y; ball.strokes += 1;
    if (res.holed) { ball.holed = true; ball.done = true; }
    else if (ball.strokes >= MAX_STROKES) ball.done = true;
    s.last = { seat, hole: s.hole, path: res.path, holed: res.holed, strokes: ball.strokes, n: (s0.last?.n ?? 0) + 1 };
    const next = nextSeat(s.balls, seat);
    if (next !== -1) { s.turn = next; return s; }
    // пистата свърши
    s.balls.forEach((b, i) => s.scores[i].push(b.strokes));
    if (s.hole + 1 >= COURSES.length) { s.over = true; return s; }
    s.hole += 1;
    s.balls = freshBalls(s, s.hole);
    s.turn = s.hole % s.players.length;
    return s;
  },

  botMove(s, p, rng, level = 'medium') {
    const course = COURSES[s.hole];
    const b = s.balls[s.turn];
    let best = null;
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const dx = r3(Math.sin(rad)), dy = r3(-Math.cos(rad));
      for (let pw = 0.08; pw <= 1.001; pw += 0.06) {
        const power = r3(pw);
        const res = simulate(course, [b.x, b.y], dx, dy, power);
        const d = res.holed ? 0 : Math.hypot(res.x - course.hole[0], res.y - course.hole[1]);
        if (!best || d < best.d) best = { d, dx, dy, power };
      }
    }
    // малка грешка, за да не е съвършен
    const jitter = (rng.next() - 0.5) * (level === 'hard' ? 0.01 : 0.12);
    const len = Math.hypot(best.dx + jitter, best.dy) || 1;
    return { dx: r3((best.dx + jitter) / len), dy: r3(best.dy / len), power: best.power };
  },

  autoMove(s, p, rng) {
    const course = COURSES[s.hole];
    const b = s.balls[s.turn];
    let dx = course.hole[0] - b.x, dy = course.hole[1] - b.y;
    dx += (rng.next() - 0.5) * 20; dy += (rng.next() - 0.5) * 20;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: r3(dx / len), dy: r3(dy / len), power: r3(0.3 + rng.next() * 0.6) };
  },

  isOver: (s) => s.over,
  placements(s) {
    const t = s.scores.map((x) => x.reduce((a, b) => a + b, 0));
    const sorted = [...new Set(t)].sort((a, b) => a - b);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(t[i]) + 1]));
  },
  winner(s) {
    const t = s.scores.map((x) => x.reduce((a, b) => a + b, 0));
    const best = Math.min(...t);
    const lead = s.players.filter((_, i) => t[i] === best);
    return lead.length === 1 ? lead[0] : 'draw';
  },
  status(s, me, nickOf) {
    if (s.over) return null;
    return s.players[s.turn] === me ? 'Твой удар' : `Удря ${nickOf(s.players[s.turn])}`;
  },

  render(el, s, ctx) {
    const NS = 'http://www.w3.org/2000/svg';
    const seat = s.players.indexOf(ctx.me);
    const myTurn = !ctx.over && seat === s.turn;
    const course = COURSES[Math.min(s.hole, COURSES.length - 1)];
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    el.innerHTML = '';

    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'gf', role: 'img', 'aria-label': `Писта ${course.name}` });
    svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 4, class: 'gf-green' }));
    course.sand.forEach(([x0, y0, x1, y1]) => svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, class: 'gf-sand' })));
    course.walls.forEach(([x0, y0, x1, y1]) => svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 1.5, class: 'gf-wall' })));
    svg.append(svgEl('circle', { cx: course.tee[0], cy: course.tee[1], r: 3.5, class: 'gf-tee' }));
    svg.append(svgEl('circle', { cx: course.hole[0], cy: course.hole[1], r: 3.2, class: 'gf-hole' }));
    svg.append(svgEl('line', { x1: course.hole[0], y1: course.hole[1], x2: course.hole[0], y2: course.hole[1] - 12, class: 'gf-pole' }));
    svg.append(svgEl('path', { d: `M${course.hole[0]} ${course.hole[1] - 12} l7 2.5 l-7 2.5 z`, class: 'gf-flag' }));
    const aim = svgEl('line', { class: 'gf-aim', x1: 0, y1: 0, x2: 0, y2: 0, visibility: 'hidden' });
    svg.append(aim);

    const ballEls = s.balls.map((b, i) => {
      const c = svgEl('circle', { cx: b.x, cy: b.y, r: R, class: 'gf-ball' + (i === s.turn && !s.over ? ' now' : ''), style: `--p: var(--seat-${i + 1})` });
      if (b.holed) c.setAttribute('visibility', 'hidden');
      svg.append(c);
      return c;
    });

    // анимация на последния удар (веднъж)
    const l = s.last;
    const animKey = l ? `${l.n}` : '';
    if (l && l.hole === s.hole && ctx.scratch && ctx.scratch.golfAnim !== animKey && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      ctx.scratch.golfAnim = animKey;
      const c = ballEls[l.seat];
      const end = [Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))];
      c.removeAttribute('visibility');
      let i = 0;
      const tick = () => {
        if (!c.isConnected) return;
        const [x, y] = l.path[Math.min(i, l.path.length - 1)];
        c.setAttribute('cx', x); c.setAttribute('cy', y);
        i += 1;
        if (i < l.path.length) requestAnimationFrame(tick);
        else { c.setAttribute('cx', end[0]); c.setAttribute('cy', end[1]); if (l.holed) c.setAttribute('visibility', 'hidden'); }
      };
      tick();
    } else if (ctx.scratch && l) ctx.scratch.golfAnim = animKey;

    // прицел: плъзгане като прашка + плъзгачи
    const shot = { dx: 0, dy: -1, power: 0.5 };
    const me = seat >= 0 ? s.balls[seat] : null;
    const drawAim = () => {
      if (!me) return;
      aim.setAttribute('x1', me.x); aim.setAttribute('y1', me.y);
      aim.setAttribute('x2', me.x + shot.dx * (8 + shot.power * 40)); aim.setAttribute('y2', me.y + shot.dy * (8 + shot.power * 40));
      aim.setAttribute('visibility', 'visible');
    };
    const fire = () => {
      const len = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy) || 1;
      ctx.onMove({ dx: r3(shot.dx / len), dy: r3(shot.dy / len), power: r3(Math.max(0.05, Math.min(1, shot.power))) });
    };
    if (myTurn && me) {
      svg.classList.add('can');
      const toSvg = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
      let dragging = false;
      svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
      svg.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const p = toSvg(e);
        const vx = me.x - p.x, vy = me.y - p.y;
        const len = Math.sqrt(vx * vx + vy * vy);
        if (len < 1) return;
        shot.dx = vx / len; shot.dy = vy / len; shot.power = Math.min(1, len / 45);
        syncSliders(); drawAim();
      });
      svg.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; if (shot.power >= 0.05) fire(); });
      svg.addEventListener('pointercancel', () => { dragging = false; });
    }

    const controls = make('div', 'gf-controls');
    const angle = make('input'); angle.type = 'range'; angle.min = '0'; angle.max = '359'; angle.id = 'gf-angle';
    const power = make('input'); power.type = 'range'; power.min = '5'; power.max = '100'; power.id = 'gf-power';
    const syncSliders = () => {
      // ъгъл от вектора (само за показване; ударът ползва вектора)
      angle.value = String(Math.round(((Math.atan2(shot.dx, -shot.dy) * 180) / Math.PI + 360) % 360));
      power.value = String(Math.round(shot.power * 100));
    };
    const fromSliders = () => {
      const a = (Number(angle.value) * Math.PI) / 180;
      shot.dx = Math.sin(a); shot.dy = -Math.cos(a); shot.power = Number(power.value) / 100;
      drawAim();
    };
    angle.addEventListener('input', fromSliders);
    power.addEventListener('input', fromSliders);
    const hitBtn = make('button', 'btn btn-primary', 'Удари');
    hitBtn.type = 'button';
    hitBtn.addEventListener('click', fire);
    [angle, power, hitBtn].forEach((x) => { x.disabled = !myTurn; });
    if (me && myTurn) {
      const dx = course.hole[0] - me.x, dy = course.hole[1] - me.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      shot.dx = dx / len; shot.dy = dy / len; syncSliders(); drawAim();
    }
    const lab = (forId, text) => { const x = make('label', 'gf-label', text); x.htmlFor = forId; return x; };
    controls.append(lab('gf-angle', 'Посока'), angle, lab('gf-power', 'Сила'), power, hitBtn);

    // резултати
    const wrap = make('div', 'table-wrap');
    const t = make('table', 'dp-sheet');
    const hr = make('tr'); hr.append(make('th', null, 'Писта'));
    s.players.forEach((p) => hr.append(make('th', 'r', ctx.nickOf(p))));
    const thead = make('thead'); thead.append(hr); t.append(thead);
    const tb = make('tbody');
    COURSES.forEach((c, h) => {
      const tr = make('tr'); tr.append(make('th', null, `${h + 1}. ${c.name} (пар ${c.par})`));
      s.players.forEach((p, i) => tr.append(make('td', 'r num', h < s.scores[i].length ? String(s.scores[i][h]) : h === s.hole && !s.over ? `${s.balls[i].strokes}${s.balls[i].holed ? ' ✓' : ''}` : '')));
      tb.append(tr);
    });
    const tot = make('tr', 'tot'); tot.append(make('th', null, 'Общо'));
    s.players.forEach((p, i) => tot.append(make('td', 'r num', String(s.scores[i].reduce((a, b) => a + b, 0) + (s.over ? 0 : s.balls[i].strokes)))));
    tb.append(tot); t.append(tb); wrap.append(t);

    const info = `Писта ${Math.min(s.hole, COURSES.length - 1) + 1} от ${COURSES.length}: ${course.name}, пар ${course.par}. `;
    const msg = make('p', 'c8-msg', info + (l ? (l.holed ? `${ctx.nickOf(s.players[l.seat])} вкара с ${l.strokes} ${l.strokes === 1 ? 'удар' : 'удара'}!` : `${ctx.nickOf(s.players[l.seat])} удари (${l.strokes}).`) : 'Първи удар.'));
    el.append(msg, svg, controls, wrap);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'gf-art';
    el.innerHTML = '<i class="h"></i><i class="b"></i>';
    return el;
  },

  css: `
.gf { width:min(100%,360px,calc(58vh * 2 / 3)); height:auto; display:block; margin-inline:auto; border-radius:var(--r-lg); border:3px solid var(--ink); box-shadow:var(--shadow-pop); touch-action:none; background:var(--felt-edge); }
.gf.can { cursor:crosshair; }
.gf-green { fill:var(--felt); }
.gf-sand { fill:#e9d39b; }
.gf-wall { fill:#8a5a2c; stroke:var(--ink); stroke-width:.6; }
.gf-tee { fill:none; stroke:rgb(255 255 255 / .5); stroke-width:.6; stroke-dasharray:1.5 1.5; }
.gf-hole { fill:#0e1420; stroke:#fff; stroke-width:.6; }
.gf-pole { stroke:#fff; stroke-width:.6; }
.gf-flag { fill:var(--accent); }
.gf-ball { fill:var(--p); stroke:#fff; stroke-width:.7; }
.gf-ball.now { stroke:var(--sun); stroke-width:1; }
.gf-aim { stroke:#fff; stroke-width:.9; stroke-dasharray:2 1.5; stroke-linecap:round; }
.gf-controls { display:grid; grid-template-columns:auto 1fr; gap:8px 12px; align-items:center; width:min(100%,360px); margin:12px auto; }
.gf-controls .btn { grid-column:1 / -1; justify-self:center; }
.gf-controls input[type=range] { width:100%; accent-color:var(--accent); min-height:32px; }
.gf-label { font-weight:700; font-size:var(--step--1); }
.gf-art { position:relative; width:90px; height:60px; border-radius:10px; background:var(--felt); border:2px solid var(--ink); }
.gf-art .h { position:absolute; right:16px; top:14px; width:12px; height:12px; border-radius:50%; background:#0e1420; border:2px solid #fff; }
.gf-art .b { position:absolute; left:18px; bottom:12px; width:10px; height:10px; border-radius:50%; background:#fff; }
`,
};
