// Наблюдава последните ти стаи на заден план: кой е на ход, свършила ли е партидата.
// Захранва значката в менюто, екрана „Стаи“ и известието „Твой ход в …“.

import { replay } from '../core/engine.js';
import { gameById } from '../games/index.js';

const WATCH_MAX = 8;

export function createTurnWatcher(api) {
  const watched = new Map(); // code → { off, summary }
  const subs = new Set();
  const turnSubs = new Set();
  let codes = [];
  let ready = false;

  const summarize = (code, { room, log }) => {
    if (!room) return { code, gone: true };
    const game = gameById(room.playGameId ?? room.gameId);
    const s = { code, room, game, current: null, over: false, winner: null, playing: room.status === 'playing' };
    if (game && room.status === 'playing' && room.round) {
      const r = replay(game, {
        seed: room.seed, players: room.players, log, options: room.gameOptions, startedAt: room.startedAt, turnLimitMs: (room.timerSec || 0) * 1000,
      });
      Object.assign(s, { current: r.current, over: r.over, winner: r.winner, state: r.state });
    }
    s.myTurn = s.over ? false : game?.waitingFor && s.state ? game.waitingFor(s.state).includes(api.me) : s.current === api.me;
    s.inGame = Boolean(room.players?.includes(api.me));
    return s;
  };

  const list = () => codes.map((c) => watched.get(c)?.summary).filter(Boolean);
  const emit = () => { const l = list(); subs.forEach((fn) => fn(l, ready)); };

  const offMine = api.watchMyRooms((rooms) => {
    ready = true;
    codes = rooms.slice(0, WATCH_MAX).map((r) => r.code);
    for (const [c, w] of watched) if (!codes.includes(c)) { w.off(); watched.delete(c); }
    for (const c of codes) {
      if (watched.has(c)) continue;
      const w = { summary: null, off: null };
      watched.set(c, w);
      w.off = api.watchRoomLite(c, (v) => {
        const prev = w.summary;
        w.summary = summarize(c, v);
        // Стаята е изтрита: проверка с четене от сървъра (кешът може да закъснява), после махане от списъка.
        if (w.summary.gone && !w.checkedGone) {
          w.checkedGone = true;
          api.store.get(`rooms/${c}`).then((r) => { if (!r) api.removeMyRoom(c); else w.checkedGone = false; }).catch(() => { w.checkedGone = false; });
        }
        // Нов „твой ход“ (не при първото зареждане): известие.
        if (prev && !prev.myTurn && w.summary.myTurn) turnSubs.forEach((fn) => fn(w.summary));
        emit();
      });
    }
    emit();
  });

  return {
    subscribe(fn) { subs.add(fn); fn(list(), ready); return () => subs.delete(fn); },
    onTurn(fn) { turnSubs.add(fn); return () => turnSubs.delete(fn); },
    stop() { offMine(); for (const w of watched.values()) w.off(); watched.clear(); },
  };
}
