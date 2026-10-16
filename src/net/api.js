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
import { nextHost, optionsFor } from '../core/engine.js';
import { isBot, makeBot } from '../core/bots.js';

export const ROOM_CAP = 6;
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CHAT_KEEP = 30;
const PLAYED_KEEP = 40;
const MY_ROOMS_KEEP = 12;

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
  const myRoomsPath = `data/users/${me}/myrooms`;
  const ownMoves = new Map(); // `${code}:${round}` → масив от мои ходове

  const api = {
    me,
    store,

    // ---- профил и статистика ----
    getProfile: (id = me) => store.get(`profiles/${id}`),
    saveProfile: (p) => store.set(`profiles/${me}`, { nick: p.nick, avatar: p.avatar, color: p.color, updatedAt: now() }),
    getStats: async (id = me) => (await store.get(`stats/${id}`)) ?? { rating: START_RATING, w: 0, l: 0, d: 0, games: {}, played: [] },

    // ---- стаи ----
    async createRoom({ gameId, timerSec = 0, profile, bots = [], options = {} }) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode(rand);
        if (await store.get(roomPath(code))) continue;
        await store.set(roomPath(code), {
          code, gameId, timerSec, hostId: me, status: 'lobby', round: 0,
          seed: null, players: [], ratings: {}, startedAt: null, createdAt: now(), bots,
          options: { [gameId]: options },
        });
        await api.joinRoom(code, profile);
        return code;
      }
      throw new Error('no-free-code');
    },

    // Игра срещу компютъра: стая с ботове, стартира веднага.
    async playVsBots({ game, timerSec = 0, profile, count = 1, level = 'medium', options = {} }) {
      const bots = [];
      for (let k = 0; k < count; k++) bots.push(makeBot(bots, level));
      const code = await api.createRoom({ gameId: game.id, timerSec, profile, bots, options });
      const room = await store.get(roomPath(code));
      const members = await store.list(`${roomPath(code)}/members`);
      await api.startGame(code, room, members, game);
      return code;
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
      api.addMyRoom(code).catch(() => {});
      return { ok: true, room };
    },

    // ---- моите стаи: личен списък в data/users/{me} (никой друг не го вижда) ----
    async addMyRoom(code) {
      const cur = (await store.get(myRoomsPath))?.rooms ?? [];
      const rooms = [{ code, at: now() }, ...cur.filter((r) => r.code !== code)].slice(0, MY_ROOMS_KEEP);
      await store.set(myRoomsPath, { rooms });
    },
    async removeMyRoom(code) {
      const cur = (await store.get(myRoomsPath))?.rooms ?? [];
      await store.set(myRoomsPath, { rooms: cur.filter((r) => r.code !== code) });
    },
    watchMyRooms: (cb) => store.watchDoc(myRoomsPath, (d) => cb(d?.rooms ?? [])),

    // Лек наблюдател: само документът на стаята и ходовете от текущия рунд.
    watchRoomLite(code, cb) {
      let room, log = [], round = null, offRound = null;
      const emit = () => { if (room !== undefined) cb({ room, log }); };
      const offRoom = store.watchDoc(roomPath(code), (r) => {
        room = r;
        const next = r && r.status !== 'lobby' ? r.round : null;
        if (next !== round) {
          offRound?.(); offRound = null; log = []; round = next;
          if (next) {
            offRound = store.watchCol(`${roomPath(code)}/r${next}`, (docs) => {
              log = docs.flatMap((d) => (d.data?.moves ?? []).map((x) => ({ ...x, p: d.id })));
              emit();
            });
          }
        }
        emit();
      });
      return () => { offRoom(); offRound?.(); };
    },

    async leaveRoom(code, room, members) {
      const path = `${roomPath(code)}/members/${me}`;
      const cur = members.find((m) => m.id === me);
      if (cur) await store.set(path, { ...cur.data, left: true, readyFor: 0 });
      api.removeMyRoom(code).catch(() => {});
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

    // ---- ботове (само домакинът) ----
    async addBot(code, room, members, level = 'medium') {
      const bots = room.bots ?? [];
      if (activeMembers(members).length + bots.length >= ROOM_CAP) return { ok: false, reason: 'full' };
      await store.update(roomPath(code), { bots: [...bots, makeBot(bots, level)] });
      return { ok: true };
    },
    removeBot: (code, room, id) => store.update(roomPath(code), { bots: (room.bots ?? []).filter((b) => b.id !== id) }),

    // Ход на бот: всеки клиент би записал същото (ходът е детерминистичен).
    async sendBotMove(code, round, botId, log, move, nextIndex) {
      const prev = log.filter((x) => x.p === botId).map(({ i, t, m }) => ({ i, t, m }));
      if (prev.some((x) => x.i === nextIndex)) return;
      await store.set(`${roomPath(code)}/r${round}/${botId}`, { moves: [...prev, { i: nextIndex, t: now(), m: move }] });
    },
    setTimer: (code, timerSec) => store.update(roomPath(code), { timerSec }),
    // Вариации на правилата: пазят се по игра, важат от следващия старт.
    setOptions: (code, room, gameId, opts) => store.update(roomPath(code), { options: { ...(room.options ?? {}), [gameId]: opts } }),

    // Домакинът стартира: играчите са присъстващите, готови членове по ред на влизане.
    // players: изричен списък (реванш); иначе домакинът + готовите.
    async startGame(code, room, members, game, chosen = null) {
      if (room.hostId !== me) return { ok: false, reason: 'not-host' };
      const ready = activeMembers(members).filter((m) => (chosen ? chosen.includes(m.id) : m.id === me || m.data.readyFor === room.round + 1));
      const bots = (room.bots ?? []).filter((b) => !chosen || chosen.includes(b.id));
      const players = [...ready.map((m) => m.id), ...bots.map((b) => b.id)];
      if (players.length < game.minPlayers) return { ok: false, reason: 'too-few' };
      if (players.length > game.maxPlayers) return { ok: false, reason: 'too-many' };
      const ratings = {};
      for (const p of players) ratings[p] = isBot(p) ? START_RATING : (await api.getStats(p)).rating ?? START_RATING;
      await store.update(roomPath(code), {
        status: 'playing', round: room.round + 1, seed: newSeed(),
        players, ratings, startedAt: now(), gameId: game.id,
        gameOptions: optionsFor(game, room.options?.[game.id]),
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
            .sort((a, b) => a.t - b.t || a.p.localeCompare(b.p));
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
      // Срещу бот: не влияе на рейтинга и класацията, брои се отделно.
      if (room.players.some(isBot)) {
        const bot = { w: 0, l: 0, d: 0, ...(stats.bot ?? {}) };
        bot[outcome] += 1;
        await store.set(`stats/${me}`, { ...stats, bot, played: [...(stats.played ?? []), key].slice(-PLAYED_KEEP), updatedAt: now() });
        return { outcome, delta: 0, vsBot: true };
      }
      const g = { w: 0, l: 0, d: 0, ...(stats.games?.[gameId] ?? {}) };
      g[outcome] += 1;
      // Глава до глава: сравнение на местата с всеки друг човек в партидата.
      const h2h = { ...(stats.h2h ?? {}) };
      for (const other of room.players) {
        if (other === me) continue;
        const res = myPlace < result.placements[other] ? 'w' : myPlace > result.placements[other] ? 'l' : 'd';
        const rec = { all: { w: 0, l: 0, d: 0 }, ...(h2h[other] ?? {}) };
        rec.all = { ...rec.all, [res]: (rec.all[res] ?? 0) + 1 };
        const pg = { w: 0, l: 0, d: 0, ...(rec[gameId] ?? {}) };
        pg[res] += 1;
        h2h[other] = { ...rec, [gameId]: pg };
      }
      const next = {
        ...stats,
        rating: (stats.rating ?? START_RATING) + (deltas[me] ?? 0),
        w: (stats.w ?? 0) + (outcome === 'w'),
        l: (stats.l ?? 0) + (outcome === 'l'),
        d: (stats.d ?? 0) + (outcome === 'd'),
        games: { ...(stats.games ?? {}), [gameId]: g },
        h2h,
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
