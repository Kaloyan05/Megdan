// Ботове: изкуствени играчи в стаята. Id-то им започва с „bot-“.
// Ходът на бота е детерминистичен (seed на партидата + индекс на хода), затова няма значение
// кой клиент го запише: всички биха записали същото.

import { createRng } from './rng.js';

export const BOT_NAMES = ['Бобо', 'Цеца', 'Пешо', 'Мара', 'Гошо'];
export const BOT_LEVELS = [
  { value: 'easy', label: 'Лесен', hint: 'Играе наслуки' },
  { value: 'medium', label: 'Среден', hint: 'Мисли за хода' },
  { value: 'hard', label: 'Труден', hint: 'Смята напред' },
];
export const isBot = (id) => typeof id === 'string' && id.startsWith('bot-');

export function makeBot(existing, level = 'medium') {
  const used = new Set(existing.map((b) => b.id));
  let n = 1;
  while (used.has(`bot-${n}`)) n++;
  const colors = [5, 6, 4, 3, 2, 1];
  return { id: `bot-${n}`, nick: `${BOT_NAMES[(n - 1) % BOT_NAMES.length]} (бот)`, avatar: '🤖', color: colors[(n - 1) % colors.length], level };
}

// Връща хода на бота или null, ако сега не е негов ред.
export async function botMove(game, state, botId, { seed, index, level = 'medium' }) {
  const rng = createRng(`${seed}:bot:${botId}:${index}`);
  if (game.bot) return game.bot(state, botId, rng, level, { seed });
  if (game.isOver(state) || game.currentPlayer(state) !== botId) return null;
  if (level !== 'easy' && game.botMove) return game.botMove(state, botId, rng, level);
  return game.autoMove(state, botId, rng);
}

// Подрежда по оценка, без да вика rng в сравняващата функция (за еднакъв резултат навсякъде).
export function bestBy(items, score) {
  const scored = items.map((x) => ({ x, s: score(x) }));
  let best = scored[0];
  for (const it of scored) if (it.s > best.s) best = it;
  return best?.x;
}
