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
  { name: 'Зигзагът', par: 4, tee: [15, 140], hole: [85, 15], walls: [[0, 95, 70, 103], [30, 50, 100, 58]], sand: [[72, 60, 100, 75]] },
  { name: 'Вратата', par: 3, tee: [50, 140], hole: [50, 32], walls: [[0, 60, 44, 66], [56, 60, 100, 66]], sand: [[25, 12, 75, 22]] },
  // Версия 2: склонове (ускорение за стъпка) и вода (връща топката с наказателен удар).
  { name: 'Хълмът', par: 3, tee: [50, 140], hole: [50, 20], walls: [[42, 42, 58, 47]], sand: [],
    slopes: [[0, 62, 100, 98, 0, 0.012]] },
  { name: 'Езерото', par: 4, tee: [18, 140], hole: [76, 24], walls: [], sand: [[60, 6, 94, 13]],
    water: [[40, 58, 100, 96]] },
  { name: 'Долината', par: 4, tee: [84, 140], hole: [22, 20], walls: [[40, 86, 100, 93]], sand: [[0, 100, 22, 116]],
    slopes: [[0, 38, 64, 80, 0.01, 0]], water: [[72, 30, 100, 62]] },
  { name: 'Мостът', par: 3, tee: [50, 140], hole: [50, 18], walls: [[18, 32, 40, 36], [60, 32, 82, 36], [45, 44, 55, 48]], sand: [],
    water: [[0, 62, 39, 92], [61, 62, 100, 92]], slopes: [[39, 62, 61, 92, 0, -0.004]] },
];
// Кои писти се играят: по версия на правилата и брой писти.
const SETS = { 1: { 3: [0, 1, 2], 5: [0, 1, 2, 3, 4] }, 2: { 3: [0, 5, 6], 5: [0, 1, 5, 6, 8], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8] } };
const courseOf = (s, h = s.hole) => COURSES[s.courses[Math.min(h, s.courses.length - 1)]];

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

const PULL = 0.005, PULL_R2 = 18;

// Версия 2: всяка стъпка в пътя (за плавна анимация), склонове, придърпване към дупката и вода.
export function simulate2(course, from, dx, dy, power, record = true) {
  let [x, y] = from;
  let vx = r4(dx * power * MAXV), vy = r4(dy * power * MAXV);
  const path = record ? [[x, y]] : null;
  let holed = false, water = false;
  const slopes = course.slopes ?? [];
  const pools = course.water ?? [];
  for (let step = 0; step < 3000; step++) {
    const nx = r4(x + vx);
    if (blocked(course, nx, y)) vx = r4(-vx * BOUNCE); else x = nx;
    const ny = r4(y + vy);
    if (blocked(course, x, ny)) vy = r4(-vy * BOUNCE); else y = ny;
    if (pools.some((w) => inRect(x, y, w))) { water = true; if (record) path.push([x, y]); break; }
    const f = course.sand.some((sd) => inRect(x, y, sd)) ? SAND : FRICTION;
    vx = r4(vx * f); vy = r4(vy * f);
    let onSlope = false;
    for (const sl of slopes) if (inRect(x, y, sl)) { vx = r4(vx + sl[4]); vy = r4(vy + sl[5]); onSlope = true; }
    const hx = x - course.hole[0], hy = y - course.hole[1];
    const d2 = hx * hx + hy * hy;
    // Ръбът на дупката леко завива бавната топка навътре.
    if (d2 < PULL_R2 && d2 > 0.01) { vx = r4(vx - hx * PULL); vy = r4(vy - hy * PULL); }
    const sp = vx * vx + vy * vy;
    if (d2 < HOLE_R2 && sp < CAPTURE2) { holed = true; [x, y] = course.hole; if (record) path.push([x, y]); break; }
    // На склон топката не спира: търкаля се надолу, докато излезе от него.
    if (sp < STOP2 && !onSlope) break;
    if (record) path.push([x, y]);
  }
  if (record) path.push([x, y]);
  return { x, y, holed, water, path };
}

const freshBalls = (s, holeIdx) => s.players.map(() => ({ x: courseOf(s, holeIdx).tee[0], y: courseOf(s, holeIdx).tee[1], done: false, holed: false, strokes: 0 }));

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
  blurb: 'Писти с препятствия, удари на ред. По-малко удари печели.',
  rules: [
    'Играете 3 или 5 писти. На своя ред удряш топката веднъж.',
    'Дръпни назад от топката като прашка: посоката е обратна, а колкото по-далеч дърпаш, толкова по-силно. Може и с плъзгачите отдолу.',
    'Стените отблъскват, пясъкът спира топката по-бързо. Твърде бърза топка прескача дупката.',
    `Пистата свършва, когато всички вкарат или стигнат ${MAX_STROKES} удара.`,
    'Печели който има най-малко удари общо.',
  ],
  minPlayers: 2,
  maxPlayers: 4,
  moveSound: 'tap',
  version: 2,

  options: [
    { id: 'holes', label: 'Писти', default: 3, choices: [{ value: 3, label: '3' }, { value: 5, label: '5' }, { value: 9, label: '9' }] },
  ],

  init(seed, players, opts = {}) {
    const v = opts._v === 2 ? 2 : 1;
    const courses = (SETS[v][opts.holes ?? 3] ?? SETS[v][3]).slice();
    const s = { players: players.slice(), courses, hole: 0, turn: 0, scores: players.map(() => []), last: null, over: false };
    if (v === 2) s.v = 2;
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
    const course = courseOf(s);
    const ball = s.balls[seat];
    const v2 = s.v === 2;
    const from = [ball.x, ball.y];
    const res = v2 ? simulate2(course, from, r3(m.dx), r3(m.dy), r3(m.power)) : simulate(course, from, r3(m.dx), r3(m.dy), r3(m.power));
    ball.strokes += 1;
    // Вода: топката се връща на мястото на удара и се добавя наказателен удар.
    if (res.water) { ball.strokes = Math.min(MAX_STROKES, ball.strokes + 1); } else { ball.x = res.x; ball.y = res.y; }
    if (res.holed) { ball.holed = true; ball.done = true; }
    else if (ball.strokes >= MAX_STROKES) ball.done = true;
    s.last = { seat, hole: s.hole, path: res.path, holed: res.holed, strokes: ball.strokes, n: (s0.last?.n ?? 0) + 1 };
    if (v2) Object.assign(s.last, { v: 2, water: res.water, from, par: course.par });
    const next = nextSeat(s.balls, seat);
    if (next !== -1) { s.turn = next; return s; }
    // пистата свърши
    s.balls.forEach((b, i) => s.scores[i].push(b.strokes));
    if (s.hole + 1 >= s.courses.length) { s.over = true; return s; }
    s.hole += 1;
    s.balls = freshBalls(s, s.hole);
    s.turn = s.hole % s.players.length;
    return s;
  },

  botMove(s, p, rng, level = 'medium') {
    const course = courseOf(s);
    const b = s.balls[s.turn];
    const [aErr, pErr] = { easy: [0.2, 0.2], medium: [0.08, 0.09], hard: [0.03, 0.035] }[level] ?? [0.08, 0.09];
    const sim = (dx, dy, power) => (s.v === 2 ? simulate2(course, [b.x, b.y], dx, dy, power, false) : simulate(course, [b.x, b.y], dx, dy, power));
    const dist = (res) => (res.holed ? 0 : res.water ? 60 : Math.hypot(res.x - course.hole[0], res.y - course.hole[1]));
    const cands = [];
    for (let a = 0; a < 360; a += 5) {
      const rad = (a * Math.PI) / 180;
      const dx = r3(Math.sin(rad)), dy = r3(-Math.cos(rad));
      for (let pw = 0.08; pw <= 1.001; pw += 0.06) {
        const power = r3(pw);
        cands.push({ d: dist(sim(dx, dy, power)), dx, dy, power });
      }
    }
    cands.sort((x, y) => x.d - y.d);
    // Сигурен удар: от най-добрите избира този, който издържа на собствената си неточност (без вода).
    let best = cands[0];
    if (s.v === 2) {
      let bestScore = Infinity;
      for (const c of cands.slice(0, 12)) {
        let sum = c.d;
        for (const [ka, kp] of [[-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]]) {
          const ang = Math.atan2(c.dx, -c.dy) + ka * aErr;
          sum += dist(sim(r3(Math.sin(ang)), r3(-Math.cos(ang)), r3(Math.max(0.05, Math.min(1, c.power * (1 + kp * pErr))))));
        }
        if (sum < bestScore) { bestScore = sum; best = c; }
      }
    }
    // Грешка в посоката и силата според нивото, за да не е съвършен.
    const jx = (rng.next() - 0.5) * 2 * aErr, jy = (rng.next() - 0.5) * 2 * aErr;
    const len = Math.hypot(best.dx + jx, best.dy + jy) || 1;
    const power = Math.max(0.05, Math.min(1, best.power * (1 + (rng.next() - 0.5) * 2 * pErr)));
    return { dx: r3((best.dx + jx) / len), dy: r3((best.dy + jy) / len), power: r3(power) };
  },

  autoMove(s, p, rng) {
    const course = courseOf(s);
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
    const course = courseOf(s);
    const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const svgEl = (tag, attrs = {}, kids = []) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); e.append(...kids); return e; };
    const reduced = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
    const sc = ctx.scratch ?? {};
    const BR = 2.3; // видим радиус на топката
    el.innerHTML = '';

    // ---- пистата ----
    const svg = svgEl('svg', { viewBox: '-5 -5 110 160', class: 'gf', role: 'img', 'aria-label': `Писта ${course.name}, пар ${course.par}` });
    const stop = (offset, color, op = 1) => svgEl('stop', { offset, style: `stop-color:${color};stop-opacity:${op}` });
    const defs = svgEl('defs', {}, [
      svgEl('pattern', { id: 'gf-mow', width: 100, height: 16, patternUnits: 'userSpaceOnUse' }, [
        svgEl('rect', { width: 100, height: 8, fill: '#62b24f' }), svgEl('rect', { y: 8, width: 100, height: 8, fill: '#58a646' }),
      ]),
      svgEl('radialGradient', { id: 'gf-light', cx: '35%', cy: '25%', r: '85%' }, [stop('0', '#fff', 0.18), stop('1', '#000', 0.12)]),
      svgEl('linearGradient', { id: 'gf-wood', x1: 0, y1: 0, x2: 0, y2: 1 }, [stop('0', '#b07a45'), stop('.5', '#8a5a2c'), stop('1', '#6b4220')]),
      svgEl('linearGradient', { id: 'gf-rail', x1: 0, y1: 0, x2: 1, y2: 1 }, [stop('0', '#8a5a2c'), stop('.5', '#6b3d1b'), stop('1', '#4a2810')]),
      svgEl('radialGradient', { id: 'gf-sandg', cx: '50%', cy: '45%', r: '65%' }, [stop('0', '#f4e3b0'), stop('.75', '#e6cc88'), stop('1', '#cfae62')]),
      svgEl('pattern', { id: 'gf-grain', width: 3, height: 3, patternUnits: 'userSpaceOnUse' }, [
        svgEl('circle', { cx: .7, cy: .8, r: .22, fill: '#b8955a', opacity: .6 }), svgEl('circle', { cx: 2.2, cy: 2.1, r: .18, fill: '#fff8de', opacity: .7 }),
      ]),
      svgEl('linearGradient', { id: 'gf-water', x1: 0, y1: 0, x2: 1, y2: 1 }, [stop('0', '#5fb7e8'), stop('.6', '#2f86c6'), stop('1', '#1f6aa6')]),
      svgEl('linearGradient', { id: 'gf-steel', x1: 0, y1: 0, x2: 1, y2: 0 }, [stop('0', '#6b7685'), stop('.45', '#e8edf3'), stop('1', '#8893a2')]),
      svgEl('radialGradient', { id: 'gf-cup', cx: '50%', cy: '40%', r: '60%' }, [stop('0', '#020502'), stop('.8', '#0d1a0d'), stop('1', '#24361f')]),
      svgEl('filter', { id: 'gf-shadow', x: '-30%', y: '-30%', width: '160%', height: '160%' }, [
        svgEl('feDropShadow', { dx: .5, dy: 1, stdDeviation: .55, 'flood-color': '#0b2208', 'flood-opacity': .45 }),
      ]),
      ...s.players.map((_, i) => svgEl('radialGradient', { id: `gf-ball-${i}`, cx: '35%', cy: '30%', r: '75%' }, [
        stop('0', '#fff'), stop('.25', `color-mix(in srgb, var(--seat-${i + 1}) 35%, #fff)`), stop('.8', `var(--seat-${i + 1})`),
        stop('1', `color-mix(in srgb, var(--seat-${i + 1}) 65%, #000)`),
      ])),
    ]);
    svg.append(defs);
    // дървен борд, окосена трева, светлина отгоре
    svg.append(svgEl('rect', { x: -5, y: -5, width: 110, height: 160, rx: 7, fill: 'url(#gf-rail)' }));
    svg.append(svgEl('rect', { x: -2.2, y: -2.2, width: 104.4, height: 154.4, rx: 4.5, fill: 'none', stroke: 'rgb(255 220 170 / .35)', 'stroke-width': .6 }));
    svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 3, fill: 'url(#gf-mow)' }));
    svg.append(svgEl('rect', { x: 0, y: 0, width: W, height: H, rx: 3, fill: 'url(#gf-light)' }));
    svg.append(svgEl('rect', { x: .4, y: .4, width: W - .8, height: H - .8, rx: 3, fill: 'none', stroke: 'rgb(10 40 5 / .35)', 'stroke-width': 1.4 }));
    // склонове: по-светло в горния край и стрелки надолу по наклона
    (course.slopes ?? []).forEach(([x0, y0, x1, y1, ax, ay], k) => {
      const len = Math.hypot(ax, ay) || 1;
      const id = `gf-slope-${k}`;
      defs.append(
        svgEl('linearGradient', { id, x1: .5 - ax / len / 2, y1: .5 - ay / len / 2, x2: .5 + ax / len / 2, y2: .5 + ay / len / 2 }, [stop('0', '#fff', .16), stop('1', '#0b2208', .22)]),
        svgEl('pattern', { id: `${id}-a`, width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${(Math.atan2(ay, ax) * 180) / Math.PI - 90})` }, [
          svgEl('path', { d: 'M2 3 L4 5 L6 3', fill: 'none', stroke: '#fff', 'stroke-width': .5, 'stroke-linecap': 'round', opacity: .55 }),
        ]),
      );
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: `url(#${id})` }));
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, fill: `url(#${id}-a)`, class: 'gf-slope-arrows' }));
    });
    // вода с вълнички
    (course.water ?? []).forEach(([x0, y0, x1, y1]) => {
      svg.append(svgEl('rect', { x: x0 - .8, y: y0 - .8, width: x1 - x0 + 1.6, height: y1 - y0 + 1.6, rx: 4, fill: '#3f7a2e', opacity: .55 }));
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 3.5, fill: 'url(#gf-water)' }));
      for (let yy = y0 + 6; yy < y1 - 3; yy += 9) {
        let d = `M${x0 + 3} ${yy}`;
        for (let xx = x0 + 3; xx < x1 - 6; xx += 6) d += ` q1.5 -1.4 3 0 t3 0`;
        svg.append(svgEl('path', { d, class: 'gf-wave', fill: 'none', stroke: '#fff', 'stroke-width': .45, opacity: .55 }));
      }
    });
    // бункери
    course.sand.forEach(([x0, y0, x1, y1]) => {
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, fill: 'url(#gf-sandg)', stroke: '#c9a75c', 'stroke-width': .5 }));
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 6, fill: 'url(#gf-grain)' }));
    });
    // място за начален удар
    const [tx, ty] = course.tee;
    svg.append(svgEl('rect', { x: tx - 7, y: ty - 4, width: 14, height: 8, rx: 1.5, fill: '#3f8f3a', stroke: 'rgb(255 255 255 / .35)', 'stroke-width': .4 }));
    svg.append(svgEl('circle', { cx: tx - 5, cy: ty, r: .9, fill: '#fff' }), svgEl('circle', { cx: tx + 5, cy: ty, r: .9, fill: '#fff' }));
    // бордове с обем и сянка
    course.walls.forEach(([x0, y0, x1, y1]) => {
      svg.append(svgEl('rect', { x: x0, y: y0, width: x1 - x0, height: y1 - y0, rx: 1.4, fill: 'url(#gf-wood)', filter: 'url(#gf-shadow)' }));
      svg.append(svgEl('rect', { x: x0 + .4, y: y0 + .3, width: Math.max(0, x1 - x0 - .8), height: .6, rx: .3, fill: 'rgb(255 230 190 / .55)' }));
    });
    // дупка и флаг
    const [hx, hy] = course.hole;
    svg.append(svgEl('circle', { cx: hx, cy: hy + .3, r: 3.6, fill: 'rgb(255 255 255 / .35)' }));
    svg.append(svgEl('circle', { cx: hx, cy: hy, r: 3.2, fill: 'url(#gf-cup)' }));
    svg.append(svgEl('line', { x1: hx, y1: hy, x2: hx + 7, y2: hy + 4, stroke: 'rgb(10 30 5 / .3)', 'stroke-width': .8, 'stroke-linecap': 'round' }));
    svg.append(svgEl('line', { x1: hx, y1: hy, x2: hx, y2: hy - 13, stroke: '#f2f2f2', 'stroke-width': .7, 'stroke-linecap': 'round' }));
    svg.append(svgEl('path', { d: `M${hx} ${hy - 13} q4 1.2 8 .3 q-1 1.8 0 3.4 q-4 .8 -8 -.7 z`, class: 'gf-flag', fill: 'var(--accent)' }));

    // прицел и стик (само за моя удар)
    const aimG = svgEl('g', { class: 'gf-aimg', visibility: 'hidden' });
    const putter = svgEl('g', { class: 'gf-putter', visibility: 'hidden' }, [
      svgEl('line', { x1: 0, y1: 0, x2: -16, y2: 2.5, stroke: '#c9ced6', 'stroke-width': .6, 'stroke-linecap': 'round' }),
      svgEl('line', { x1: -11, y1: 1.7, x2: -16, y2: 2.5, stroke: '#1d2433', 'stroke-width': 1.1, 'stroke-linecap': 'round' }),
      svgEl('rect', { x: -.8, y: -3.2, width: 1.8, height: 6.4, rx: .7, fill: 'url(#gf-steel)', stroke: '#3a4250', 'stroke-width': .25 }),
    ]);
    svg.append(aimG, putter);

    // топки: сянка, тяло, ивица (върти се при търкаляне), отблясък
    const balls = s.balls.map((b, i) => {
      const spin = svgEl('g', {}, [svgEl('path', { d: `M${-BR} 0 A${BR} ${BR * .45} 0 0 0 ${BR} 0`, fill: 'none', stroke: 'rgb(255 255 255 / .5)', 'stroke-width': .3 })]);
      const body = svgEl('circle', { r: BR, fill: `url(#gf-ball-${i})`, stroke: 'rgb(0 0 0 / .35)', 'stroke-width': .3, class: 'gf-ball' + (i === s.turn && !s.over ? ' now' : '') });
      const g = svgEl('g', { class: 'gf-ballg', transform: `translate(${b.x} ${b.y})` }, [
        svgEl('ellipse', { cx: .7, cy: 1.2, rx: BR * .95, ry: BR * .6, fill: 'rgb(10 30 5 / .35)' }),
        i === s.turn && !s.over ? svgEl('circle', { r: BR + 1.6, class: 'gf-now-ring' }) : null,
        body, spin,
        svgEl('circle', { cx: -.75, cy: -.85, r: .6, fill: '#fff', opacity: .85 }),
      ].filter(Boolean));
      if (b.holed) g.setAttribute('visibility', 'hidden');
      svg.append(g);
      return { g, spin, x: b.x, y: b.y, roll: 0 };
    });
    const place = (o, x, y) => {
      o.roll += Math.hypot(x - o.x, y - o.y) * 55;
      o.x = x; o.y = y;
      o.g.setAttribute('transform', `translate(${x} ${y})`);
      o.spin.setAttribute('transform', `rotate(${o.roll % 360})`);
    };

    const stage = make('div', 'gf-stage');
    stage.append(svg);
    const banner = (text, cls = '') => {
      const b = make('div', `gf-banner fx-pop ${cls}`, text);
      stage.append(b);
      setTimeout(() => b.remove(), 2400);
      return b;
    };
    const confetti = () => {
      if (reduced) return;
      const box = make('div', 'gf-confetti');
      for (let k = 0; k < 26; k++) {
        const c = make('i');
        c.style.setProperty('--x', `${(Math.random() - .5) * 260}px`);
        c.style.setProperty('--y', `${-80 - Math.random() * 160}px`);
        c.style.setProperty('--r', `${Math.random() * 720 - 360}deg`);
        c.style.background = `var(--seat-${1 + (k % 6)})`;
        c.style.animationDelay = `${Math.random() * 120}ms`;
        box.append(c);
      }
      stage.append(box);
      setTimeout(() => box.remove(), 1800);
    };
    const scoreName = (strokes, par) => {
      if (strokes === 1) return ['Хол-ин-уан!', 'gold'];
      const d = strokes - par;
      if (d <= -2) return ['Игъл!', 'gold'];
      if (d === -1) return ['Бърди!', 'good'];
      if (d === 0) return ['Пар', ''];
      if (d === 1) return ['Боги', 'meh'];
      if (d === 2) return ['Дабъл боги', 'meh'];
      return [`+${d}`, 'meh'];
    };

    // ---- анимация на последния удар ----
    const l = s.last;
    const finish = () => {
      if (!l) return;
      if (l.water) { banner('Във водата! +1 удар', 'water'); ctx.sound?.bad?.(); }
      if (l.holed) {
        const par = l.par ?? COURSES[s.courses[l.hole]]?.par ?? 3;
        const [txt, cls] = scoreName(l.strokes, par);
        banner(`${l.seat === seat ? '' : `${ctx.nickOf(s.players[l.seat])}: `}${txt}`, cls);
        if (cls === 'gold' || cls === 'good') confetti();
        ctx.sound?.drop?.();
      }
    };
    if (l) {
      if (!sc.golfAnim || sc.golfAnim.n !== l.n) sc.golfAnim = { n: l.n, start: ctx.last?.fresh && !reduced ? performance.now() : -1e9, done: !ctx.last?.fresh };
      const anim = sc.golfAnim;
      const per = l.v === 2 ? Math.min(1000 / 60, 4200 / Math.max(1, l.path.length - 1)) : 50;
      const dur = (l.path.length - 1) * per;
      const o = balls[l.seat];
      if (l.hole === s.hole && performance.now() - anim.start < dur) {
        const end = [o.x, o.y];
        o.g.removeAttribute('visibility');
        const tick = () => {
          if (!o.g.isConnected) return;
          const t = (performance.now() - anim.start) / per;
          const i = Math.min(l.path.length - 1, Math.floor(t));
          const f = Math.min(1, t - i);
          const [x0, y0] = l.path[i];
          const [x1, y1] = l.path[Math.min(l.path.length - 1, i + 1)];
          place(o, x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
          if (t < l.path.length - 1) { requestAnimationFrame(tick); return; }
          if (l.holed) o.g.classList.add('gf-sink');
          if (l.water) {
            const [wx, wy] = l.path.at(-1);
            svg.append(svgEl('circle', { cx: wx, cy: wy, r: 2, class: 'gf-splash' }), svgEl('circle', { cx: wx, cy: wy, r: 2, class: 'gf-splash late' }));
            o.g.setAttribute('visibility', 'hidden');
            setTimeout(() => { if (!o.g.isConnected) return; place(o, end[0], end[1]); o.g.removeAttribute('visibility'); o.g.classList.add('fx-pop'); }, 650);
          } else place(o, end[0], end[1]);
          if (!anim.done) { anim.done = true; finish(); }
        };
        tick();
      } else if (!anim.done) { anim.done = true; setTimeout(finish, 50); }
    }

    // ---- прицел: дърпане като прашка, плъзгачи, стик ----
    const shot = { dx: 0, dy: -1, power: 0.5 };
    const me = seat >= 0 ? s.balls[seat] : null;
    const powerBar = make('div', 'gf-power');
    const powerFill = make('span');
    powerBar.append(powerFill);
    const drawAim = () => {
      if (!me) return;
      const n = Math.round(3 + shot.power * 11);
      aimG.replaceChildren(...Array.from({ length: n }, (_, k) => svgEl('circle', {
        cx: me.x + shot.dx * (BR + 2.5 + k * 3.1), cy: me.y + shot.dy * (BR + 2.5 + k * 3.1), r: .75 - k * .025,
        fill: `hsl(${120 - shot.power * 120} 90% 60%)`, stroke: 'rgb(0 0 0 / .35)', 'stroke-width': .2,
      })));
      aimG.setAttribute('visibility', 'visible');
      const back = BR + 1.2 + shot.power * 9;
      const ang = (Math.atan2(shot.dy, shot.dx) * 180) / Math.PI;
      putter.setAttribute('transform', `translate(${me.x - shot.dx * back} ${me.y - shot.dy * back}) rotate(${ang})`);
      putter.setAttribute('visibility', 'visible');
      powerFill.style.width = `${Math.round(shot.power * 100)}%`;
      powerFill.style.background = `hsl(${120 - shot.power * 120} 75% 45%)`;
    };
    let fired = false;
    const fire = () => {
      if (fired) return;
      fired = true;
      const len = Math.sqrt(shot.dx * shot.dx + shot.dy * shot.dy) || 1;
      const move = { dx: r3(shot.dx / len), dy: r3(shot.dy / len), power: r3(Math.max(0.05, Math.min(1, shot.power))) };
      aimG.setAttribute('visibility', 'hidden');
      // Замах: стикът стига топката, после тръгва ударът.
      const ang = (Math.atan2(shot.dy, shot.dx) * 180) / Math.PI;
      putter.classList.add('swing');
      putter.setAttribute('transform', `translate(${me.x - shot.dx * (BR + .9)} ${me.y - shot.dy * (BR + .9)}) rotate(${ang})`);
      setTimeout(() => ctx.onMove(move), reduced ? 0 : 150);
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
    controls.append(lab('gf-angle', 'Посока'), angle, lab('gf-power', 'Сила'), power, make('span', 'gf-label', ''), powerBar, hitBtn);

    // ---- карта с резултати: кръг под пар, квадрат над пар ----
    const wrap = make('div', 'table-wrap');
    const t = make('table', 'dp-sheet gf-card');
    const hr = make('tr'); hr.append(make('th', null, 'Писта'));
    s.players.forEach((p) => hr.append(make('th', 'r', ctx.nickOf(p))));
    const thead = make('thead'); thead.append(hr); t.append(thead);
    const tb = make('tbody');
    s.courses.map((i) => COURSES[i]).forEach((c, h) => {
      const tr = make('tr', h === s.hole && !s.over ? 'now' : ''); tr.append(make('th', null, `${h + 1}. ${c.name} (пар ${c.par})`));
      s.players.forEach((p, i) => {
        const td = make('td', 'r num');
        if (h < s.scores[i].length) {
          const v = s.scores[i][h];
          const mark = make('span', v < c.par ? 'gf-under' : v > c.par ? 'gf-over' : 'gf-par', String(v));
          td.append(mark);
        } else if (h === s.hole && !s.over) td.textContent = `${s.balls[i].strokes}${s.balls[i].holed ? ' ✓' : ''}`;
        tr.append(td);
      });
      tb.append(tr);
    });
    const parTotal = s.courses.reduce((a, i) => a + COURSES[i].par, 0);
    const tot = make('tr', 'tot'); tot.append(make('th', null, `Общо (пар ${parTotal})`));
    s.players.forEach((p, i) => tot.append(make('td', 'r num', String(s.scores[i].reduce((a, b) => a + b, 0) + (s.over ? 0 : s.balls[i].strokes)))));
    tb.append(tot); t.append(tb); wrap.append(t);

    const info = make('div', 'gf-info');
    info.append(
      make('span', 'gf-hole-no num', `${Math.min(s.hole, s.courses.length - 1) + 1}/${s.courses.length}`),
      make('span', 'gf-hole-name', course.name),
      make('span', 'gf-par', `пар ${course.par}`),
    );
    const msg = make('p', 'c8-msg', l ? (l.water ? `${ctx.nickOf(s.players[l.seat])} цопна във водата (${l.strokes}).` : l.holed ? `${ctx.nickOf(s.players[l.seat])} вкара с ${l.strokes} ${l.strokes === 1 ? 'удар' : 'удара'}!` : `${ctx.nickOf(s.players[l.seat])} удари (${l.strokes}).`) : 'Първи удар.');
    if (l && l.hole !== s.hole && ctx.last?.fresh) setTimeout(() => banner(`Писта ${s.hole + 1}: ${course.name}`, 'intro'), 2300);
    el.append(info, msg, stage, controls, wrap);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'gf-art';
    el.innerHTML = '<i class="h"></i><i class="f"></i><i class="b"></i>';
    return el;
  },

  css: `
.gf-stage { position:relative; width:min(100%,380px,calc(60vh * 110 / 160)); margin-inline:auto; }
.gf { width:100%; height:auto; display:block; touch-action:none; border-radius:16px; filter: drop-shadow(0 8px 0 #3a200c) drop-shadow(0 14px 14px rgb(30 15 0 / .3)); }
.gf.can { cursor:crosshair; }
.gf-wave { stroke-dasharray:3 2; animation: gfWave 3s linear infinite; }
@keyframes gfWave { to { stroke-dashoffset:-20; } }
.gf-flag { transform-box: fill-box; transform-origin: 0% 50%; animation: gfFlag 1.6s ease-in-out infinite alternate; }
@keyframes gfFlag { from { transform: skewY(-6deg) scaleX(.92); } to { transform: skewY(5deg) scaleX(1.04); } }
.gf-now-ring { fill:none; stroke:var(--sun); stroke-width:.7; transform-box: fill-box; transform-origin:center; animation: gfRing 1.4s ease-out infinite; }
@keyframes gfRing { from { transform:scale(.7); opacity:1; } to { transform:scale(1.5); opacity:0; } }
.gf-putter { transition: transform .14s cubic-bezier(.5,0,.9,.4); }
.gf-putter:not(.swing) { transition: none; }
.gf-ballg.gf-sink { animation: gfSink .45s ease-in forwards; transform-box: fill-box; }
@keyframes gfSink { to { opacity:0; } }
.gf-splash { fill:none; stroke:#fff; stroke-width:.7; transform-box: fill-box; transform-origin:center; animation: gfSplash .8s ease-out forwards; }
.gf-splash.late { animation-delay:.18s; }
@keyframes gfSplash { from { transform:scale(.3); opacity:1; } to { transform:scale(3.2); opacity:0; } }
.gf-ballg.fx-pop { transform-box: fill-box; }
.gf-banner { position:absolute; left:50%; top:42%; translate:-50% -50%; z-index:3; pointer-events:none; white-space:nowrap;
  padding:10px 20px; border-radius:999px; border:3px solid var(--ink); background:var(--surface); color:var(--ink);
  font:800 clamp(1.3rem,6vw,1.9rem)/1 var(--f-display); box-shadow:0 5px 0 var(--ink), 0 14px 28px rgb(0 0 0 / .25); }
.gf-banner.gold { background:linear-gradient(180deg,#ffe27a,#f5b82e); color:#3a2600; }
.gf-banner.good { background:#3fc386; color:#062b17; }
.gf-banner.meh { background:var(--surface-2); }
.gf-banner.water { background:#2f86c6; color:#fff; }
.gf-banner.intro { top:12%; font-size:clamp(1.05rem,5vw,1.4rem); background:#1d2433; color:#fff; }
.gf-confetti { position:absolute; left:50%; top:42%; pointer-events:none; z-index:4; }
.gf-confetti i { position:absolute; width:8px; height:12px; border-radius:2px; animation: gfConf 1.5s cubic-bezier(.2,.6,.4,1) forwards; }
@keyframes gfConf { 0% { transform:translate(0,0) rotate(0); opacity:1; } 60% { opacity:1; } 100% { transform:translate(var(--x), calc(var(--y) + 260px)) rotate(var(--r)); opacity:0; } }
.gf-info { display:flex; align-items:baseline; justify-content:center; gap:10px; flex-wrap:wrap; }
.gf-hole-no { font:800 var(--step-0)/1 var(--f-display); padding:4px 10px; border-radius:999px; background:#1d2433; color:#fff; }
.gf-hole-name { font:800 var(--step-1)/1.1 var(--f-display); }
.gf-par { color:var(--ink-2); font-weight:700; }
.gf-controls { display:grid; grid-template-columns:auto 1fr; gap:8px 12px; align-items:center; width:min(100%,380px); margin:16px auto 12px; }
.gf-controls .btn { grid-column:1 / -1; justify-self:center; }
.gf-controls input[type=range] { width:100%; accent-color:var(--accent); min-height:32px; }
.gf-label { font-weight:700; font-size:var(--step--1); }
.gf-power { height:10px; border-radius:999px; background:var(--surface-2); box-shadow:inset 0 1px 2px rgb(0 0 0 / .2); overflow:hidden; }
.gf-power span { display:block; height:100%; width:50%; border-radius:999px; transition: width .08s; }
.gf-card tr.now th { color:var(--accent); }
.gf-under, .gf-over, .gf-par { display:inline-grid; place-items:center; min-width:1.7em; height:1.7em; padding:0 .2em; }
.gf-under { border:2px solid #1d9563; border-radius:50%; color:#1d9563; font-weight:800; }
.gf-over { border:2px solid var(--ink-2); border-radius:3px; }
.gf-art { position:relative; width:90px; height:60px; border-radius:10px; border:2px solid #3a200c;
  background: repeating-linear-gradient(0deg, #62b24f 0 8px, #58a646 8px 16px); box-shadow: inset 0 0 0 3px #6b3d1b; }
.gf-art .h { position:absolute; right:18px; top:20px; width:12px; height:12px; border-radius:50%; background:#0e1420; box-shadow:0 0 0 2px rgb(255 255 255 / .4); }
.gf-art .f { position:absolute; right:23px; top:4px; width:12px; height:9px; background:var(--accent); clip-path:polygon(0 0,100% 40%,0 90%); border-left:2px solid #fff; }
.gf-art .b { position:absolute; left:18px; bottom:12px; width:10px; height:10px; border-radius:50%; background:radial-gradient(circle at 35% 30%, #fff, #ddd 70%, #aaa); }
@media (prefers-reduced-motion: reduce) { .gf-wave, .gf-flag, .gf-now-ring, .gf-splash { animation:none; } .gf-splash { opacity:0; } }
`,
};
