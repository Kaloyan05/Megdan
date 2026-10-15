// Регистър на игрите. Всяка игра следва общия интерфейс (виж SPEC.md).

import connect4 from './connect4.js';
import reversi from './reversi.js';
import dots from './dots.js';
import color8 from './color8.js';
import uttt from './uttt.js';
import dice from './dice.js';
import memory from './memory.js';
import ludo from './ludo.js';
import tabla from './tabla.js';
import battleship from './battleship.js';

export const GAMES = [connect4, reversi, dots, color8, uttt, dice, memory, ludo, tabla, battleship];
export const gameById = (id) => GAMES.find((g) => g.id === id) ?? null;

let injected = false;
export function injectGameCss() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.textContent = GAMES.map((g) => g.css ?? '').join('\n');
  document.head.append(style);
}

export function playersLabel(g) {
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} играчи` : `${g.minPlayers}-${g.maxPlayers} играчи`;
}
