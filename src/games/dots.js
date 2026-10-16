// Точки и кутийки — 2–4 играчи. Затвориш ли кутийка, играеш пак.
// Линии: първо хоризонталните (R+1)×C, после вертикалните R×(C+1).

const sizeFor = (n, size) => (size && size !== 'auto' ? Number(size) : n <= 2 ? 4 : 5);

function geometry(R, C) {
  const H = (R + 1) * C;
  const h = (r, c) => r * C + c;
  const v = (r, c) => H + r * (C + 1) + c;
  const boxLines = (r, c) => [h(r, c), h(r + 1, c), v(r, c), v(r, c + 1)];
  const total = H + R * (C + 1);
  // кои кутийки граничат с линия
  const boxesOf = (line) => {
    if (line < H) {
      const r = Math.floor(line / C), c = line % C;
      return [[r - 1, c], [r, c]].filter(([y]) => y >= 0 && y < R);
    }
    const k = line - H, r = Math.floor(k / (C + 1)), c = k % (C + 1);
    return [[r, c - 1], [r, c]].filter(([, x]) => x >= 0 && x < C);
  };
  return { H, h, v, boxLines, total, boxesOf };
}

const sidesDrawn = (s, g, r, c) => g.boxLines(r, c).filter((l) => s.lines[l] !== null).length;

export default {
  id: 'dots',
  name: 'Точки и кутийки',
  icon: '▦',
  blurb: 'Тегли линии. Затвориш ли кутийка, играеш пак.',
  rules: ["На своя ход теглиш една линия между две съседни точки.", "Затвориш ли кутийка, тя е твоя и играеш пак.", "Печели който има най-много кутийки накрая.", "За двама дъската е 4×4, за трима и четирима е 5×5."],
  minPlayers: 2,
  maxPlayers: 4,
  moveSound: 'tap',

  options: [
    { id: 'size', label: 'Размер', default: 'auto', choices: [{ value: 'auto', label: 'Според играчите' }, { value: '3', label: '3×3' }, { value: '4', label: '4×4' }, { value: '5', label: '5×5' }, { value: '6', label: '6×6' }] },
  ],

  init(seed, players, opts = {}) {
    const R = sizeFor(players.length, opts.size), C = R;
    const g = geometry(R, C);
    return {
      players: players.slice(), R, C, turn: 0,
      lines: Array(g.total).fill(null), boxes: Array(R * C).fill(null),
      last: null, scores: players.map(() => 0),
    };
  },

  currentPlayer: (s) => s.players[s.turn],

  validateMove(s, move, p) {
    if (s.boxes.every((b) => b !== null)) return { ok: false, reason: 'over' };
    if (p !== s.players[s.turn]) return { ok: false, reason: 'not-your-turn' };
    if (!Number.isInteger(move?.line) || move.line < 0 || move.line >= s.lines.length) return { ok: false, reason: 'bad-line' };
    if (s.lines[move.line] !== null) return { ok: false, reason: 'line-taken' };
    return { ok: true };
  },

  applyMove(s, move) {
    const g = geometry(s.R, s.C);
    const next = { ...s, lines: s.lines.slice(), boxes: s.boxes.slice(), scores: s.scores.slice(), last: move.line };
    next.lines[move.line] = s.turn;
    let closed = 0;
    for (const [r, c] of g.boxesOf(move.line)) {
      if (sidesDrawn(next, g, r, c) === 4 && next.boxes[r * s.C + c] === null) {
        next.boxes[r * s.C + c] = s.turn;
        next.scores[s.turn] += 1;
        closed += 1;
      }
    }
    if (!closed) next.turn = (s.turn + 1) % s.players.length;
    return next;
  },

  // Автоматичен ход: затвори кутийка, ако може; иначе не давай трета страна; иначе случаен.
  autoMove(s, p, rng) {
    const g = geometry(s.R, s.C);
    const free = s.lines.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
    const after = (line) => g.boxesOf(line).map(([r, c]) => sidesDrawn(s, g, r, c) + 1);
    const closing = free.filter((l) => after(l).includes(4));
    if (closing.length) return { line: rng.pick(closing) };
    const safe = free.filter((l) => !after(l).includes(3));
    return { line: rng.pick(safe.length ? safe : free) };
  },

  isOver: (s) => s.boxes.every((b) => b !== null),

  placements(s) {
    const sorted = [...new Set(s.scores)].sort((a, b) => b - a);
    return Object.fromEntries(s.players.map((p, i) => [p, sorted.indexOf(s.scores[i]) + 1]));
  },

  winner(s) {
    const top = Math.max(...s.scores);
    const leaders = s.players.filter((_, i) => s.scores[i] === top);
    return leaders.length === 1 ? leaders[0] : 'draw';
  },

  render(el, s, ctx) {
    const g = geometry(s.R, s.C);
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
    grid.className = 'db';
    grid.style.setProperty('--cols', s.C);
    grid.style.gridTemplateColumns = `repeat(${s.C}, var(--dot) 1fr) var(--dot)`;
    grid.style.gridTemplateRows = `repeat(${s.R}, var(--dot) 1fr) var(--dot)`;
    grid.setAttribute('aria-label', 'Дъска с точки');
    const meSeat = s.players.indexOf(ctx.me);
    if (meSeat >= 0) grid.style.setProperty('--me', `var(--seat-${meSeat + 1})`);

    const fresh = Boolean(ctx.last?.fresh);
    const sc = ctx.scratch ?? {};
    const prevBoxes = sc.dbBoxes ?? s.boxes;
    sc.dbBoxes = s.boxes.slice();
    const lineBtn = (line, dir, label) => {
      const owner = s.lines[line];
      const b = document.createElement('button');
      b.className = `db-line ${dir}` + (owner !== null ? ' drawn' : '') + (line === s.last ? ' last' : '') + (fresh && line === s.last ? ' fresh' : '');
      if (owner !== null) b.style.setProperty('--stroke', `var(--seat-${owner + 1})`);
      b.disabled = owner !== null || !myTurn;
      b.setAttribute('aria-label', label + (owner !== null ? `, тегли ${ctx.nickOf(s.players[owner])}` : ''));
      b.addEventListener('click', () => ctx.onMove({ line }));
      return b;
    };

    for (let rr = 0; rr <= 2 * s.R; rr++) {
      for (let cc = 0; cc <= 2 * s.C; cc++) {
        const r = Math.floor(rr / 2), c = Math.floor(cc / 2);
        if (rr % 2 === 0 && cc % 2 === 0) {
          const d = document.createElement('span'); d.className = 'db-dot'; grid.append(d);
        } else if (rr % 2 === 0) {
          grid.append(lineBtn(g.h(r, c), 'hz', `Хоризонтална линия ред ${r + 1}, колона ${c + 1}`));
        } else if (cc % 2 === 0) {
          grid.append(lineBtn(g.v(r, c), 'vt', `Вертикална линия ред ${r + 1}, колона ${c + 1}`));
        } else {
          const owner = s.boxes[r * s.C + c];
          const box = document.createElement('span');
          const isNew = fresh && owner !== null && prevBoxes[r * s.C + c] === null;
          box.className = 'db-box' + (owner !== null ? ' owned' : '') + (isNew ? ' new' : '');
          if (owner !== null) {
            box.style.setProperty('--box', `var(--seat-${owner + 1})`);
            box.style.setProperty('--rot', `${(((r * 7 + c * 13) % 11) - 5) * 2}deg`);
            const stamp = document.createElement('span');
            stamp.className = 'db-stamp';
            stamp.textContent = ctx.nickOf(s.players[owner]).slice(0, 1).toUpperCase();
            box.append(stamp);
          }
          grid.append(box);
        }
      }
    }
    el.append(score, grid);
  },

  art() {
    const el = document.createElement('div');
    el.className = 'db-art';
    el.innerHTML = '<span></span><span class="o1"></span><span></span><span class="o2"></span>';
    return el;
  },

  css: `
/* Лист от тетрадка на квадратчета; линиите са като от химикал. */
.db { --dot: 12px; display:grid; width:min(100%,420px); aspect-ratio:1; margin-inline:auto; padding:12px; border-radius:6px;
  background:
    repeating-linear-gradient(0deg, transparent 0 13px, rgb(70 120 210 / .16) 13px 14px),
    repeating-linear-gradient(90deg, transparent 0 13px, rgb(70 120 210 / .16) 13px 14px),
    linear-gradient(170deg,#fffdf6,#f6f1e2);
  box-shadow: 0 1px 0 #e7e0cc, 0 3px 0 #ddd5bd, 0 5px 0 #d2c9ae, 0 10px 18px rgb(60 45 10 / .22); transform: rotate(-.6deg); }
.db-dot { border-radius:50%; position:relative; z-index:2; background:radial-gradient(circle at 35% 30%, #4a5366, #1b2333 70%); box-shadow:0 1px 1px rgb(0 0 0 / .3); }
.db-line { border:0; padding:0; background:transparent; position:relative; cursor:pointer; border-radius:6px; }
.db-line::before { content:""; position:absolute; border-radius:6px; background:rgb(27 35 51 / .14); }
.db-line.hz::before { left:-2px; right:-2px; top:50%; height:5px; transform:translateY(-50%); }
.db-line.vt::before { top:-2px; bottom:-2px; left:50%; width:5px; transform:translateX(-50%); }
.db-line::after { content:""; position:absolute; inset:-12px; }
.db-line.hz::after { left:4px; right:4px; }
.db-line.vt::after { top:4px; bottom:4px; }
.db-line:not(:disabled):hover::before, .db-line:focus-visible::before { background:color-mix(in srgb, var(--me, #1b2333) 55%, transparent); }
/* Дупки за класьор отляво. */
.db { position:relative; }
.db::before { content:''; position:absolute; left:-1px; top:12%; bottom:12%; width:9px; pointer-events:none;
  background: radial-gradient(circle at 50% 50%, var(--bg) 0 3.5px, rgb(0 0 0 / .18) 4px, transparent 5px) 0 0 / 9px 33.3% repeat-y; }
.db-line:disabled { cursor:default; }
.db-line.drawn::before { background:linear-gradient(var(--stroke), color-mix(in srgb, var(--stroke) 75%, #000)); box-shadow:0 1px 1px rgb(0 0 0 / .2); }
.db-line.last::before { outline:3px solid color-mix(in srgb, var(--sun) 70%, transparent); outline-offset:1px; }
/* Новата линия се изписва от единия край до другия. */
.db-line.hz.fresh::before { transform-origin:left center; animation: dbDrawH .35s ease-out; }
.db-line.vt.fresh::before { transform-origin:center top; animation: dbDrawV .35s ease-out; }
@keyframes dbDrawH { from { transform:translateY(-50%) scaleX(0); } to { transform:translateY(-50%) scaleX(1); } }
@keyframes dbDrawV { from { transform:translateX(-50%) scaleY(0); } to { transform:translateX(-50%) scaleY(1); } }
.db-box { display:grid; place-items:center; border-radius:3px; margin:4px; }
.db-box.owned { background:color-mix(in srgb, var(--box) 20%, transparent); }
/* Печат с буквата на играча. */
.db-stamp { display:grid; place-items:center; width:72%; aspect-ratio:1; border-radius:50%; border:2.5px solid var(--box); color:var(--box);
  font:800 clamp(.75rem,3.8vw,1.15rem)/1 var(--f-display); transform:rotate(var(--rot)); opacity:.9; box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--box) 20%, transparent); }
.db-box.new .db-stamp { animation: dbStamp .45s cubic-bezier(.2,1.5,.4,1) .3s backwards; }
@keyframes dbStamp { from { transform:rotate(calc(var(--rot) - 25deg)) scale(1.9); opacity:0; } }
.db-art { display:grid; grid-template-columns:repeat(2,34px); gap:6px; padding:8px; border:3px dotted var(--ink); border-radius:8px; }
.db-art span { height:34px; border:3px solid var(--ink); border-radius:3px; }
.db-art .o1 { background:var(--seat-1); }
.db-art .o2 { background:var(--seat-2); }
@media (prefers-reduced-motion: reduce) { .db-line.fresh::before, .db-box.new .db-stamp { animation:none; } }
`,
};
