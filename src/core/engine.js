// Възстановява състоянието на партида от append-only лог с ходове.
//
// Запис в лога: { i: индекс, p: id на играча, t: време (ms), m: ход }
// Специален ход { type: 'timeout' } може да бъде записан от всеки играч,
// когато времето на текущия играч изтече. Тогава играта прави автоматичен ход вместо него.
//
// Невалидни записи (ход извън ред, непознат играч, невъзможен ход, дубликат)
// се игнорират — всеки клиент стига до същото състояние.

import { createRng, hashSeed } from './rng.js';

export const TIMEOUT_TOLERANCE_MS = 2000;

export function sortLog(log) {
  return log.slice().sort(
    (a, b) => a.i - b.i || a.t - b.t || String(a.p).localeCompare(String(b.p)),
  );
}

// Настройките на играта: стойностите по подразбиране + избраните в стаята.
export function optionsFor(game, chosen = {}) {
  const out = {};
  for (const o of game.options ?? []) {
    const v = chosen?.[o.id];
    out[o.id] = o.choices.some((c) => c.value === v) ? v : o.default;
  }
  // Версия на правилата, замразена при старта. Без нея (стари партиди) играта ползва версия 1.
  if (Number.isInteger(chosen?._v)) out._v = chosen._v;
  return out;
}

// Настройките, които се записват в стаята при старт: избраните + текущата версия на играта.
export function freezeOptions(game, chosen = {}) {
  const out = optionsFor(game, chosen);
  if (game.version) out._v = game.version; else delete out._v;
  return out;
}

export function replay(game, { seed, players, log = [], startedAt = 0, turnLimitMs = 0, options = {} }) {
  let state = game.init(seed, players, optionsFor(game, options));
  let turnStartedAt = startedAt;
  let resigned = null;
  const accepted = [];
  const rejected = [];

  for (const rec of sortLog(log)) {
    const reject = (reason) => rejected.push({ ...rec, reason });

    if (resigned || game.isOver(state)) { reject('over'); continue; }
    if (!players.includes(rec.p)) { reject('not-a-player'); continue; }

    let move = rec.m;
    let actor = rec.p;

    if (move && move.type === 'resign') {
      resigned = actor;
      accepted.push({ ...rec, actor, applied: move });
      continue;
    }

    if (move && move.type === 'timeout') {
      if (!turnLimitMs) { reject('no-timer'); continue; }
      if (rec.t - turnStartedAt < turnLimitMs - TIMEOUT_TOLERANCE_MS) { reject('too-early'); continue; }
      actor = game.currentPlayer(state);
      const rng = createRng(hashSeed(`${seed}:${rec.i}`));
      move = game.autoMove(state, actor, rng);
      if (!move) { reject('no-auto-move'); continue; }
    }

    const check = game.validateMove(state, move, actor);
    if (!check.ok) { reject(check.reason || 'invalid'); continue; }

    state = game.applyMove(state, move, actor);
    turnStartedAt = Math.max(turnStartedAt, rec.t);
    accepted.push({ ...rec, actor, applied: move });
  }

  const over = Boolean(resigned) || game.isOver(state);
  const placements = over ? placementsOf(game, state, players, resigned) : null;
  const firsts = placements ? players.filter((p) => placements[p] === 1) : [];
  return {
    state,
    accepted,
    rejected,
    turnStartedAt,
    over,
    resigned,
    placements,
    winner: !over ? null : firsts.length === 1 ? firsts[0] : 'draw',
    current: over ? null : game.currentPlayer(state),
    nextIndex: log.reduce((max, r) => Math.max(max, r.i + 1), 0),
  };
}

// Класиране след края: { playerId: място } (1 = най-добро, равни места са възможни).
// Предалият се е последен; при двама другият печели.
export function placementsOf(game, state, players, resigned = null) {
  const out = {};
  if (resigned) {
    const rest = players.filter((p) => p !== resigned);
    const base = rest.length > 1 && game.placements ? game.placements(state) : {};
    const ranks = [...new Set(rest.map((p) => base[p] ?? 1))].sort((a, b) => a - b);
    for (const p of rest) out[p] = ranks.indexOf(base[p] ?? 1) + 1;
    const last = Math.max(1, ...Object.values(out)) + 1;
    out[resigned] = last;
    return out;
  }
  if (game.placements) return game.placements(state);
  const w = game.winner(state);
  for (const p of players) out[p] = w === 'draw' ? 1 : p === w ? 1 : 2;
  return out;
}

// Нов домакин: първият останал играч по ред на влизане.
export function nextHost(members, leavingId) {
  const left = members.filter((m) => m.id !== leavingId).sort((a, b) => a.joinedAt - b.joinedAt);
  return left.length ? left[0].id : null;
}
