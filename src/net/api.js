// Домейн операции върху store (local или claude).
//
// Модел на данните (виж SPEC.md):
//   rooms/{CODE}                      — пише домакинът: игра, статус, рунд, seed, играчи, рейтинги
//   rooms/{CODE}/members/{uid}        — пише всеки за себе си: влизане, готовност, ник/аватар
//   rooms/{CODE}/r{N}/{uid}           — пише всеки за себе си: { moves: [{ i, t, m }] }
//   rooms/{CODE}/chat/{uid}           — пише всеки за себе си: { msgs: [{ t, text | emoji }] }
//   profiles/{uid}, stats/{uid}       — пише само собственикът

import { newSeed } from '../core/rng.js';
import { eloDeltas, START_RATING } from '../core/elo.js';
import { nextHost } from '../core/engine.js';

export const ROOM_CAP = 6;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAT_KEEP = 30;
const PLAYED_KEEP = 40;

// Кирилица със същия вид → латиница, за да работи въвеждане от българска клавиатура.
const LOOKALIKE = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', У: 'Y' };

export function normalizeCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[А-ЯЁ]/g, (ch) => LOOKALIKE[ch] ?? '')
    .replace(/[^A-Z]/g, '')
    .slice(0, 4);
}

export function randomCode(rand = Math.random) {
  let code = '';
  for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(rand() * CODE_ALPHABET.length)];
  return code;
}

export const activeMembers = (members) =>
  members.filter((m) => !m.data.left).sort((a, b) => a.data.joinedAt - b.data.joinedAt);

export function createApi(store, { now = () => Date.now(), rand = Math.random } = {}) {
  const me = store.me;
  const roomPath = (code) => `rooms/${code}`;
  const ownMoves = new Map(); // `${code}:${round}` → масив от мои ходове

  const api = {
    me,
    store,

    // ---- профил и статистика ----
    getProfile: (id = me) => store.get(`profiles/${id}`),
    saveProfile: (p) => store.set(`profiles/${me}`, { nick: p.nick, avatar: p.avatar, color: p.color, updatedAt: now() }),
    getStats: async (id = me) => (await store.get(`stats/${id}`)) ?? { rating: START_RATING, w: 0, l: 0, d: 0, games: {}, played: [] },

    // ---- стаи ----
    async createRoom({ gameId, timerSec = 0, profile }) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode(rand);
        if (await store.get(roomPath(code))) continue;
        await store.set(roomPath(code), {
          code, gameId, timerSec, hostId: me, status: 'lobby', round: 0,
          seed: null, players: [], ratings: {}, startedAt: null, createdAt: now(),
        });
        await api.joinRoom(code, profile);
        return code;
      }
      throw new Error('no-free-code');
    },

    async joinRoom(code, profile) {
      const room = await store.get(roomPath(code));
      if (!room) return { ok: false, reason: 'not-found' };
      const members = await store.list(`${roomPath(code)}/members`);
      const mine = members.find((m) => m.id === me);
      if (!mine && activeMembers(members).length >= ROOM_CAP) return { ok: false, reason: 'full' };
      await store.set(`${roomPath(code)}/members/${me}`, {
        joinedAt: mine && !mine.data.left ? mine.data.joinedAt : now(),
        readyFor: mine?.data.readyFor ?? 0,
        left: false,
        nick: profile?.nick ?? '',
        avatar: profile?.avatar ?? '🙂',
        color: profile?.color ?? 1,
      });
      return { ok: true, room };
    },

    async leaveRoom(code, room, members) {
      const path = `${roomPath(code)}/members/${me}`;
      const cur = members.find((m) => m.id === me);
      if (cur) await store.set(path, { ...cur.data, left: true, readyFor: 0 });
      if (room.hostId === me) {
        const host = nextHost(activeMembers(members).map((m) => ({ id: m.id, joinedAt: m.data.joinedAt })), me);
        if (host) await store.update(roomPath(code), { hostId: host });
      }
    },

    // Поемане на домакинството, когато домакинът го няма (не е в стаята).
    claimHost: (code) => store.update(roomPath(code), { hostId: me }),

    async setReady(code, room, members, ready) {
      const cur = members.find((m) => m.id === me);
      if (!cur) return;
      await store.set(`${roomPath(code)}/members/${me}`, { ...cur.data, readyFor: ready ? room.round + 1 : 0 });
    },

    setGame: (code, gameId) => store.update(roomPath(code), { gameId }),
    setTimer: (code, timerSec) => store.update(roomPath(code), { timerSec }),

    // Домакинът стартира: играчите са присъстващите, готови членове по ред на влизане.
    async startGame(code, room, members, game) {
      if (room.hostId !== me) return { ok: false, reason: 'not-host' };
      const ready = activeMembers(members).filter((m) => m.id === me || m.data.readyFor === room.round + 1);
      const players = ready.map((m) => m.id);
      if (players.length < game.minPlayers) return { ok: false, reason: 'too-few' };
      if (players.length > game.maxPlayers) return { ok: false, reason: 'too-many' };
      const ratings = {};
      for (const p of players) ratings[p] = (await api.getStats(p)).rating ?? START_RATING;
      await store.update(roomPath(code), {
        status: 'playing', round: room.round + 1, seed: newSeed(),
        players, ratings, startedAt: now(), gameId: game.id,
      });
      return { ok: true };
    },

    // ---- ходове ----
    async sendMove(code, round, move, nextIndex) {
      const key = `${code}:${round}`;
      const list = (ownMoves.get(key) ?? []).concat({ i: nextIndex, t: now(), m: move });
      ownMoves.set(key, list);
      await store.set(`${roomPath(code)}/r${round}/${me}`, { moves: list });
      if (list.length === 1 && round > 1) store.del(`${roomPath(code)}/r${round - 1}/${me}`).catch(() => {});
    },

    // ---- чат ----
    async sendChat(code, chatDocs, msg) {
      const mine = chatDocs.find((d) => d.id === me)?.data.msgs ?? [];
      const text = msg.text ? String(msg.text).trim().slice(0, 200) : undefined;
      if (!text && !msg.emoji) return;
      const entry = text ? { t: now(), text } : { t: now(), emoji: msg.emoji };
      await store.set(`${roomPath(code)}/chat/${me}`, { msgs: [...mine, entry].slice(-CHAT_KEEP) });
    },

    // ---- наблюдение на стая: room + members + текущ рунд + чат ----
    watchRoom(code, cb) {
      const view = { room: undefined, members: [], log: [], chat: [] };
      let roundUnsub = null;
      let watchedRound = null;
      const emit = () => { if (view.room !== undefined) cb({ ...view }); };

      const watchRound = (round) => {
        if (round === watchedRound) return;
        roundUnsub?.();
        watchedRound = round;
        view.log = [];
        if (!round) { roundUnsub = null; return; }
        roundUnsub = store.watchCol(`${roomPath(code)}/r${round}`, (docs) => {
          view.log = docs.flatMap((d) => (d.data?.moves ?? []).map((x) => ({ ...x, p: d.id })));
          const mine = docs.find((d) => d.id === me);
          if (mine) {
            const key = `${code}:${round}`;
            const known = ownMoves.get(key) ?? [];
            if ((mine.data.moves?.length ?? 0) >= known.length) ownMoves.set(key, mine.data.moves);
          }
          emit();
        });
      };

      const unsubs = [
        store.watchDoc(roomPath(code), (room) => {
          view.room = room;
          watchRound(room?.status === 'lobby' ? null : room?.round);
          emit();
        }),
        store.watchCol(`${roomPath(code)}/members`, (docs) => { view.members = docs; emit(); }),
        store.watchCol(`${roomPath(code)}/chat`, (docs) => {
          view.chatDocs = docs;
          view.chat = docs
            .flatMap((d) => (d.data?.msgs ?? []).map((m) => ({ ...m, p: d.id })))
            .sort((a, b) => a.t - b.t);
          emit();
        }),
      ];
      return () => { unsubs.forEach((u) => u()); roundUnsub?.(); };
    },

    // ---- резултат: всеки записва само своята статистика, веднъж на рунд ----
    async recordResult(code, room, result, gameId) {
      if (!room.players.includes(me) || !result.over || !result.placements) return null;
      const key = `${code}:${room.round}`;
      const stats = await api.getStats(me);
      if (stats.played?.includes(key)) return null;
      const deltas = eloDeltas(room.ratings, result.placements);
      const places = Object.values(result.placements);
      const myPlace = result.placements[me];
      const allTied = places.every((x) => x === places[0]);
      const outcome = allTied ? 'd' : myPlace === 1 ? 'w' : 'l';
      const g = { w: 0, l: 0, d: 0, ...(stats.games?.[gameId] ?? {}) };
      g[outcome] += 1;
      const next = {
        rating: (stats.rating ?? START_RATING) + (deltas[me] ?? 0),
        w: (stats.w ?? 0) + (outcome === 'w'),
        l: (stats.l ?? 0) + (outcome === 'l'),
        d: (stats.d ?? 0) + (outcome === 'd'),
        games: { ...(stats.games ?? {}), [gameId]: g },
        played: [...(stats.played ?? []), key].slice(-PLAYED_KEEP),
        updatedAt: now(),
      };
      await store.set(`stats/${me}`, next);
      return { outcome, delta: deltas[me] ?? 0 };
    },

    // Всички статистики (за класацията).
    listStats: () => store.list('stats'),
    listProfiles: () => store.list('profiles'),
  };
  return api;
}
