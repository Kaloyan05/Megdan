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

// Общи стилове: обемни фигури, зар, анимации.
export const FX_CSS = `
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
