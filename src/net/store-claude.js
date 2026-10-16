// Store върху runtime възможностите на артефакта: db (данни), user (id), room (присъствие).

export async function createClaudeStore() {
  if (!window.claude?.use) return null;
  const [db, user, room, sample] = await Promise.all([
    window.claude.use('db'),
    window.claude.use('user'),
    window.claude.use('room'),
    window.claude.use('sample').catch(() => null),
  ]);
  if (!db || !user) return null;
  const me = await user.id();
  if (!me) return null;
  const canWrite = await user.can('data.write'); // true | false | null (= не знаем)

  const retry = async (fn) => {
    try { return await fn(); } catch (e) {
      if (e?.code !== 'unavailable') throw e;
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
      return fn();
    }
  };

  // Един запис наведнъж на документ (изискване на db).
  const queues = new Map();
  const serial = (path, fn) => {
    const prev = queues.get(path) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(() => retry(fn));
    queues.set(path, next);
    return next;
  };

  const plain = (snap) => (snap.exists ? structuredClone(snap.data()) : null);

  return {
    kind: 'claude',
    sample, // null, ако Claude не е достъпен от страницата
    me,
    canWrite,
    user,

    async get(path) { return plain(await retry(() => db.doc(path).get())); },
    set: (path, data) => serial(path, () => db.doc(path).set(data)),
    update: (path, patch) => serial(path, () => db.doc(path).update(patch)),
    del: (path) => serial(path, () => db.doc(path).delete()),
    async list(col) {
      const snap = await retry(() => db.collection(col).get());
      return snap.docs.map((d) => ({ id: d.id, data: plain(d) }));
    },

    watchDoc(path, cb, onError) {
      return db.doc(path).onSnapshot((s) => cb(plain(s)), (e) => onError?.(e));
    },
    watchCol(col, cb, onError) {
      return db.collection(col).onSnapshot(
        (s) => cb(s.docs.map((d) => ({ id: d.id, data: plain(d) }))),
        (e) => onError?.(e),
      );
    },

    async joinPresence(name, cb) {
      if (!room) return { leave() {} };
      try {
        const r = await room.join(name);
        r.presence({ id: me }).catch(() => {});
        const emit = (peers) => cb(new Set(peers.map((p) => p.by || p.presence?.id).filter(Boolean)));
        const off = r.onPeers((c) => emit(c.peers), () => {});
        return { leave() { off(); r.leave().catch(() => {}); } };
      } catch {
        return { leave() {} };
      }
    },

    // Игри на живо: именувана стая; всеки играч държи един обект в присъствието си.
    async joinRealtime(name) {
      if (!room) throw Object.assign(new Error('no room'), { code: 'not_permitted' });
      const r = await room.join(name);
      const subs = new Set();
      const toMap = (peers) => {
        const m = new Map();
        for (const p of [...peers].sort((a, b) => a.updatedAt - b.updatedAt)) {
          const id = p.by || p.presence?.id;
          if (id) m.set(id, p.presence);
        }
        return m;
      };
      const off = r.onPeers((c) => { const m = toMap(c.peers); subs.forEach((cb) => cb(m)); }, () => {});
      r.presence({ id: me }).catch(() => {});
      return {
        setPresence(patch) { r.presence(patch).catch(() => {}); },
        onPeers(cb) { subs.add(cb); queueMicrotask(() => cb(toMap(r.peers()))); return () => subs.delete(cb); },
        leave() { off(); subs.clear(); r.leave().catch(() => {}); },
      };
    },
  };
}
