// Синтезирани звуци (Web Audio), без аудио файлове. Звукът тръгва след първото докосване.

import { storageGet, storageSet } from './dom.js';

let ctx = null;
let muted = storageGet('muted', false);
const listeners = new Set();

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, { at = 0, dur = 0.12, type = 'sine', gain = 0.18, slide = 0 } = {}) {
  const a = audio();
  if (!a || muted) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sound = {
  tap: () => tone(520, { dur: 0.06, type: 'triangle', gain: 0.12 }),
  drop: () => { tone(300, { dur: 0.12, type: 'triangle', slide: -140 }); tone(140, { at: 0.1, dur: 0.08, type: 'square', gain: 0.06 }); },
  flip: () => tone(660, { dur: 0.08, type: 'triangle', slide: 220, gain: 0.1 }),
  card: () => tone(880, { dur: 0.05, type: 'square', gain: 0.05 }),
  turn: () => { tone(660, { dur: 0.09 }); tone(880, { at: 0.09, dur: 0.12 }); },
  msg: () => tone(990, { dur: 0.07, type: 'sine', gain: 0.08 }),
  bad: () => tone(180, { dur: 0.18, type: 'sawtooth', gain: 0.06 }),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, { at: i * 0.11, dur: 0.18, type: 'triangle' })),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, { at: i * 0.14, dur: 0.2, type: 'triangle', gain: 0.12 })),
  isMuted: () => muted,
  setMuted(v) {
    muted = Boolean(v);
    storageSet('muted', muted);
    listeners.forEach((fn) => fn(muted));
    if (!muted) sound.tap();
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
