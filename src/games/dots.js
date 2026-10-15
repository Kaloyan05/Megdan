// Точки и кутийки — 2–4 играчи. Затвориш ли кутийка, играеш пак.
// Линии: първо хоризонталните (R+1)×C, после вертикалните R×(C+1).

const sizeFor = (n) => (n <= 2 ? 4 : 5);

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

  init(seed, players) {
    const R = sizeFor(players.length), C = R;
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

    const lineBtn = (line, dir, label) => {
      const owner = s.lines[line];
      const b = document.createElement('button');
      b.className = `db-line ${dir}` + (owner !== null ? ' drawn' : '') + (line === s.last ? ' last' : '');
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
          box.className = 'db-box' + (owner !== null ? ' owned' : '');
          if (owner !== null) {
            box.style.setProperty('--box', `var(--seat-${owner + 1})`);
            box.textContent = ctx.nickOf(s.players[owner]).slice(0, 1).toUpperCase();
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
.db { --dot: 12px; display:grid; width:min(100%,420px); aspect-ratio:1; margin-inline:auto; padding:10px;
  background:var(--surface); border:2px solid var(--line); border-radius:var(--r-lg); }
.db-dot { background:var(--ink); border-radius:50%; position:relative; z-index:2; }
.db-line { border:0; padding:0; background:transparent; position:relative; cursor:pointer; border-radius:6px; }
.db-line::before { content:""; position:absolute; border-radius:6px; background:var(--line); opacity:.55; }
.db-line.hz::before { left:0; right:0; top:50%; height:6px; transform:translateY(-50%); }
.db-line.vt::before { top:0; bottom:0; left:50%; width:6px; transform:translateX(-50%); }
.db-line::after { content:""; position:absolute; inset:-12px; }
.db-line.hz::after { left:4px; right:4px; }
.db-line.vt::after { top:4px; bottom:4px; }
.db-line:not(:disabled):hover::before, .db-line:focus-visible::before { background:var(--ink-2); opacity:1; }
.db-line:disabled { cursor:default; }
.db-line.drawn::before { background:var(--stroke); opacity:1; }
.db-line.last::before { box-shadow:0 0 0 3px var(--sun); }
.db-box { display:grid; place-items:center; font:800 clamp(.8rem,4vw,1.2rem)/1 var(--f-display); color:var(--ink); border-radius:4px; margin:3px; }
.db-box.owned { background:color-mix(in srgb, var(--box) 35%, var(--surface)); animation:dbpop .25s ease-out; }
@keyframes dbpop { from { transform:scale(.6); } }
.db-art { display:grid; grid-template-columns:repeat(2,34px); gap:6px; padding:8px; border:3px dotted var(--ink); border-radius:8px; }
.db-art span { height:34px; border:3px solid var(--ink); border-radius:3px; }
.db-art .o1 { background:var(--seat-1); }
.db-art .o2 { background:var(--seat-2); }
@media (prefers-reduced-motion: reduce) { .db-box.owned { animation:none; } }
`,
};
