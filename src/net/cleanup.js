// Почистване: базата побира 25 000 документа, затова стаи без активност от 30 дни се трият.
// Всеки клиент го прави най-много веднъж на ден, за малко стаи наведнъж.

export const MAX_AGE_MS = 30 * 24 * 3600 * 1000;
const PER_RUN = 20;

const lastT = (docs, pick) => docs.reduce((m, d) => Math.max(m, ...pick(d.data ?? {})), 0);

// Последна активност в стая: създаване, старт, влизане, ход в текущия рунд, съобщение.
export async function lastActivity(store, code, room) {
  const base = `rooms/${code}`;
  const [members, chat, moves] = await Promise.all([
    store.list(`${base}/members`),
    store.list(`${base}/chat`),
    room.round ? store.list(`${base}/r${room.round}`) : Promise.resolve([]),
  ]);
  return Math.max(
    room.createdAt ?? 0,
    room.startedAt ?? 0,
    lastT(members, (d) => [d.joinedAt ?? 0]),
    lastT(chat, (d) => (d.msgs ?? []).map((m) => m.t ?? 0)),
    lastT(moves, (d) => (d.moves ?? []).map((m) => m.t ?? 0)),
  );
}

export async function deleteRoom(store, code, room) {
  const base = `rooms/${code}`;
  const cols = ['members', 'chat', 'reveal'];
  for (let k = 1; k <= (room?.round ?? 0); k++) cols.push(`r${k}`);
  for (const col of cols) {
    const docs = await store.list(`${base}/${col}`).catch(() => []);
    for (const d of docs) await store.del(`${base}/${col}/${d.id}`).catch(() => {});
  }
  await store.del(base);
}

// Трие стари стаи. Връща кодовете на изтритите.
export async function sweepRooms(store, { now = Date.now(), maxAgeMs = MAX_AGE_MS, perRun = PER_RUN } = {}) {
  const cutoff = now - maxAgeMs;
  const rooms = await store.list('rooms');
  const candidates = rooms
    .filter((r) => r.data && Math.max(r.data.createdAt ?? 0, r.data.startedAt ?? 0) < cutoff)
    .slice(0, perRun);
  const deleted = [];
  for (const r of candidates) {
    if ((await lastActivity(store, r.id, r.data)) >= cutoff) continue;
    await deleteRoom(store, r.id, r.data);
    deleted.push(r.id);
  }
  return deleted;
}

// Трие личните тайни (напр. флот) за стаи, които ги няма или са в по-нов рунд.
export async function sweepMySecrets(store, me) {
  const docs = await store.list(`data/users/${me}`).catch(() => []);
  let n = 0;
  for (const d of docs) {
    const m = /^secret-([A-Z]{4})-r(\d+)$/.exec(d.id);
    if (!m) continue;
    const room = await store.get(`rooms/${m[1]}`).catch(() => null);
    if (!room || Number(m[2]) < room.round) { await store.del(`data/users/${me}/${d.id}`).catch(() => {}); n++; }
  }
  return n;
}
