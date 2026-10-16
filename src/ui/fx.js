// Движение на дъските. Игрите само слагат атрибути при рендер, а стаята вика playFx() след монтиране:
//   data-fx="ключ"              — място (клетка, купчина, ръка), от което нещо може да тръгне
//   data-fx-from="ключ"         — този елемент се плъзга от мястото „ключ“ до своето
//   data-fx-path="к1,к2,к3"     — същото, но през няколко места (скок по пътя, верига от вземания)
//   data-fx-delay="ms"          — изчакване преди тръгване
// Ефектите, които не зависят от друго място (хвърляне на зар, изчезване на взета фигура),
// са CSS класове с анимация, която тръгва при вмъкване на елемента.

export const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

const EASE = 'cubic-bezier(.2,.8,.2,1)';

function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function playFx(root) {
  if (!root || reducedMotion()) return;
  const spots = new Map();
  for (const el of root.querySelectorAll('[data-fx]')) spots.set(el.dataset.fx, el);
  for (const el of root.querySelectorAll('[data-fx-from], [data-fx-path]')) {
    const keys = (el.dataset.fxPath ?? el.dataset.fxFrom).split(',').filter(Boolean);
    const pts = keys.map((k) => spots.get(k)).filter(Boolean).map(center);
    if (!pts.length) continue;
    const end = center(el);
    pts.push(end);
    const frames = pts.map((p, i) => {
      const t = `translate(${p.x - end.x}px, ${p.y - end.y}px)`;
      // По пътя фигурата леко „подскача“ и расте, за да личи всеки скок.
      const lift = i > 0 && i < pts.length - 1 ? ' scale(1.12)' : '';
      return { transform: t + lift, offset: i / (pts.length - 1) };
    });
    const steps = pts.length - 1;
    const duration = Math.min(1600, 260 + steps * 170);
    el.style.zIndex = '5';
    el.style.position ||= 'relative';
    el.animate(frames, { duration, easing: steps > 1 ? 'linear' : EASE, delay: Number(el.dataset.fxDelay) || 0, fill: 'backwards' })
      .finished.then(() => { el.style.zIndex = ''; }).catch(() => {});
  }
}

// Рисува зар с точки (1–6) като елемент. cls: допълнителни класове (напр. 'fx-roll').
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
export function dieEl(value, { cls = '', roll = false, label = null, delay = 0 } = {}) {
  const d = document.createElement('span');
  d.className = `die3d${roll && !reducedMotion() ? ' fx-roll' : ''}${cls ? ` ${cls}` : ''}`;
  if (delay) d.style.animationDelay = `${delay}ms`;
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', label ?? `Зар ${value}`);
  for (let i = 1; i <= 9; i++) {
    const p = document.createElement('i');
    if ((PIPS[value] ?? []).includes(i)) p.className = 'on';
    d.append(p);
  }
  return d;
}

// Конфети над елемент (при победа).
export function confetti(host, { count = 34, spread = 300 } = {}) {
  if (!host || reducedMotion()) return;
  const box = document.createElement('div');
  box.className = 'fx-confetti';
  for (let k = 0; k < count; k++) {
    const c = document.createElement('i');
    c.style.setProperty('--x', `${(Math.random() - 0.5) * spread}px`);
    c.style.setProperty('--y', `${-90 - Math.random() * 170}px`);
    c.style.setProperty('--r', `${Math.random() * 900 - 450}deg`);
    c.style.background = `var(--seat-${1 + (k % 6)})`;
    if (k % 3 === 0) c.style.borderRadius = '50%';
    c.style.animationDelay = `${Math.random() * 160}ms`;
    box.append(c);
  }
  host.append(box);
  setTimeout(() => box.remove(), 2000);
}

// Зърно и шарка на дърво като SVG шум (без файлове).
const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
const GRAIN = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .2 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>");
const WOOD = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='.012 .32' numOctaves='3' seed='4' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .25  0 0 0 0 .12  0 0 0 0 .02  0 0 0 .55 -.12'/></filter><rect width='100%' height='100%' filter='url(#w)'/></svg>");
const WOOD_V = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='w'><feTurbulence type='fractalNoise' baseFrequency='.32 .012' numOctaves='3' seed='7' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .25  0 0 0 0 .12  0 0 0 0 .02  0 0 0 .55 -.12'/></filter><rect width='100%' height='100%' filter='url(#w)'/></svg>");
const FELT = svgUrl("<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='f'><feTurbulence type='turbulence' baseFrequency='1.6' numOctaves='1' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .09 0'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>");

// Общи стилове: обемни фигури, зар, анимации.
export const FX_CSS = `
:root { --grain: ${GRAIN}; --wood: ${WOOD}; --wood-v: ${WOOD_V}; --felt-tex: ${FELT}; }
.board-wrap.shake { animation: fxShake .42s cubic-bezier(.36,.07,.19,.97); }
@keyframes fxShake { 15%, 85% { transform:translateX(-2px); } 30%, 70% { transform:translateX(5px); } 45%, 55% { transform:translateX(-7px); } }
.board-wrap.won { animation: fxWon 1.6s ease-out; }
@keyframes fxWon { 0% { box-shadow:0 0 0 0 rgb(255 199 67 / .9); } 40% { box-shadow:0 0 0 14px rgb(255 199 67 / .35); } 100% { box-shadow:0 0 0 0 rgb(255 199 67 / 0); } }
.board-wrap.lost > * { animation: fxLost 1.4s ease-out; }
@keyframes fxLost { 30% { filter: grayscale(.7) brightness(.92); } }
.fx-confetti { position:absolute; left:50%; top:30%; width:0; height:0; pointer-events:none; z-index:30; }
.fx-confetti i { position:absolute; width:8px; height:13px; border-radius:2px; animation: fxConf 1.7s cubic-bezier(.2,.6,.4,1) forwards; }
@keyframes fxConf { 0% { transform:translate(0,0) rotate(0); opacity:1; } 65% { opacity:1; } 100% { transform:translate(var(--x), calc(var(--y) + 300px)) rotate(var(--r)); opacity:0; } }
@media (prefers-reduced-motion: reduce) { .board-wrap.shake, .board-wrap.won, .board-wrap.lost > * { animation:none; } }
.die3d { --die:#fbfaf6; --pip:#1d2433; position:relative; display:inline-grid; grid-template:repeat(3,1fr)/repeat(3,1fr); gap:2px;
  width:var(--die-size,44px); aspect-ratio:1; padding:calc(var(--die-size,44px) * .14); border-radius:22%;
  background:radial-gradient(120% 120% at 30% 25%, #fff 0 30%, var(--die) 60%, #ddd8cc 100%);
  box-shadow: inset 0 -3px 0 rgb(0 0 0 / .12), inset 0 2px 0 rgb(255 255 255 / .9), 0 3px 0 rgb(40 35 25 / .35), 0 6px 10px rgb(40 35 25 / .18);
  border:1.5px solid rgb(40 35 25 / .35); }
.die3d i { border-radius:50%; }
.die3d i.on { background:radial-gradient(circle at 35% 35%, #4a5366, var(--pip) 70%); box-shadow: inset 0 1px 1px rgb(0 0 0 / .5); }
.die3d.used { opacity:.38; filter:saturate(.4); }
.die3d.fx-roll { animation: dieRoll .75s cubic-bezier(.2,.7,.25,1) backwards; }
@keyframes dieRoll {
  0% { transform: translate(-60px,-46px) rotate(-260deg) scale(.7); opacity:0; }
  45% { transform: translate(8px,6px) rotate(40deg) scale(1.08); opacity:1; }
  65% { transform: translate(-4px,-6px) rotate(-14deg); }
  82% { transform: translate(2px,0) rotate(6deg); }
  100% { transform: none; }
}
.fx-vanish { animation: fxVanish .55s ease-in forwards; pointer-events:none; }
@keyframes fxVanish { 0% { transform:scale(1); opacity:1; } 40% { transform:scale(1.18); opacity:.9; } 100% { transform:scale(.2) rotate(25deg); opacity:0; } }
.fx-pop { animation: fxPop .42s cubic-bezier(.2,1.6,.4,1) backwards; }
@keyframes fxPop { from { transform:scale(.3); opacity:0; } }
.fx-last { position:relative; }
.fx-last::after { content:''; position:absolute; inset:8%; border-radius:50%; border:3px solid var(--sun); pointer-events:none;
  animation: fxRing 1.1s ease-out 2; opacity:.0; }
@keyframes fxRing { 0% { transform:scale(.6); opacity:.95; } 100% { transform:scale(1.35); opacity:0; } }
@media (prefers-reduced-motion: reduce) {
  .die3d.fx-roll, .fx-pop, .fx-last::after { animation:none; }
  .fx-vanish { animation:none; opacity:0; }
}
`;
