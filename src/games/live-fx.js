// Ефекти за игрите на живо (канвас): следа, искри, обемни кръгове, сенки.
// Само за показване — не влияят на играта.

import { reducedMotion } from '../ui/fx.js';

export function createFx() {
  const calm = reducedMotion();
  const trail = [];
  const sparks = [];
  let flash = 0;
  return {
    // Следа на топката/шайбата: последните позиции.
    track(x, y, now) {
      if (calm) return;
      const last = trail.at(-1);
      if (last && Math.hypot(last.x - x, last.y - y) < 0.002) return;
      trail.push({ x, y, t: now });
      while (trail.length > 14) trail.shift();
    },
    resetTrail() { trail.length = 0; },
    sparkle(x, y, color, now, n = 10, speed = 0.6) {
      if (calm) return;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.8);
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: now, color });
      }
    },
    flash(now) { flash = now; },
    drawTrail(g, T, r, color, now) {
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        const age = (now - p.t) / 220;
        if (age > 1) continue;
        const f = (i + 1) / trail.length;
        g.globalAlpha = 0.28 * f * (1 - age);
        g.fillStyle = color;
        g.beginPath(); g.arc(T.x(p.x), T.y(p.y), r * T.k * (0.45 + 0.55 * f), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    },
    drawSparks(g, T, now) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = (now - s.t) / 450;
        if (age > 1) { sparks.splice(i, 1); continue; }
        const x = s.x + s.vx * age * 0.25;
        const y = s.y + s.vy * age * 0.25;
        g.globalAlpha = 1 - age;
        g.fillStyle = s.color;
        g.beginPath(); g.arc(T.x(x), T.y(y), T.k * 0.008 * (1.6 - age), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    },
    // Бял проблясък на целия екран при точка/гол.
    drawFlash(g, w, h, now) {
      const age = (now - flash) / 380;
      if (calm || age < 0 || age > 1) return;
      g.globalAlpha = 0.35 * (1 - age);
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.globalAlpha = 1;
    },
  };
}

// Сянка под предмет (елипса, леко отместена).
export function shadow(g, x, y, r, k, lift = 1) {
  g.fillStyle = 'rgb(0 0 0 / .28)';
  g.beginPath(); g.ellipse(x + r * 0.25 * lift, y + r * 0.45 * lift, r * 1.02, r * 0.78, 0, 0, Math.PI * 2); g.fill();
}

// Обемен кръг: светло петно горе вляво и потъмнял ръб.
export function ball3d(g, x, y, r, base, light = '#fff', dark = 'rgb(0 0 0 / .45)') {
  const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
  gr.addColorStop(0, light);
  gr.addColorStop(0.35, base);
  gr.addColorStop(1, base);
  g.fillStyle = gr;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  const edge = g.createRadialGradient(x, y, r * 0.55, x, y, r);
  edge.addColorStop(0, 'rgb(0 0 0 / 0)');
  edge.addColorStop(1, dark);
  g.fillStyle = edge;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
