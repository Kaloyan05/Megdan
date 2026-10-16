// Локален store: документи в памет (+ localStorage) и синхронизация между табове
// чрез BroadcastChannel. Ползва се за разработка, E2E и unit тестове.
// Същата API като store-claude.js.

const PREFIX = 'megdan:';

export function createLocalStore({ me, storage = null, channel = null, lagMs = 0 } = {}) {
  const docs = new Map();
  const docSubs = new Map(); // path → Set(cb)
  const colSubs = new Map(); // collectionPath → Set(cb)
  const peers = new Map(); // roomName → Map(id → lastSeen)
  const peerSubs = new Map(); // roomName → Set(cb)
  const rtRooms = new Map(); // име → { peers: Map(id → presence), subs: Set(cb) }
  const rtRoom = (name) => {
    if (!rtRooms.has(name)) rtRooms.set(name, { peers: new Map(), subs: new Set() });
    return rtRooms.get(name);
  };
  const rtEmit = (name) => { const r = rtRoom(name); for (const cb of r.subs) cb(new Map(r.peers)); };

  if (storage) {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k?.startsWith(PREFIX)) docs.set(k.slice(PREFIX.length), JSON.parse(storage.getItem(k)));
    }
  }

  const parentOf = (path) => path.split('/').slice(0, -1).join('/');
  const colDocs = (col) => {
    const depth = col.split('/').length + 1;
    const out = [];
    for (const [p, data] of docs) {
      if (p.startsWith(col + '/') && p.split('/').length === depth) out.push({ id: p.split('/').at(-1), data });
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };

  const notify = (path) => {
    const data = docs.get(path) ?? null;
    for (const cb of docSubs.get(path) ?? []) cb(data);
    const col = parentOf(path);
    for (const cb of colSubs.get(col) ?? []) cb(colDocs(col));
  };

  const write = (path, data, broadcast = true) => {
    if (data === null) docs.delete(path); else docs.set(path, data);
    if (storage) {
      if (data === null) storage.removeItem(PREFIX + path);
      else storage.setItem(PREFIX + path, JSON.stringify(data));
    }
    if (broadcast) channel?.postMessage({ kind: 'doc', path, data });
    // асинхронно, като при истинската база
    queueMicrotask(() => notify(path));
  };

  const emitPeers = (name) => {
    const now = Date.now();
    const ids = [...(peers.get(name) ?? new Map())].filter(([, t]) => now - t < 8000).map(([id]) => id);
    for (const cb of peerSubs.get(name) ?? []) cb(new Set(ids));
  };

  if (channel) {
    channel.onmessage = ({ data: msg }) => {
      if (msg.kind === 'doc') write(msg.path, msg.data, false);
      if (msg.kind === 'here') {
        if (!peers.has(msg.room)) peers.set(msg.room, new Map());
        if (msg.gone) peers.get(msg.room).delete(msg.id); else peers.get(msg.room).set(msg.id, Date.now());
        emitPeers(msg.room);
      }
      if (msg.kind === 'rt') {
        const run = () => {
          const r = rtRoom(msg.room);
          if (msg.data === null) r.peers.delete(msg.id); else r.peers.set(msg.id, msg.data);
          rtEmit(msg.room);
        };
        if (lagMs) setTimeout(run, lagMs); else run();
      }
    };
  }

  const clone = (x) => (x == null ? null : structuredClone(x));

  return {
    kind: 'local',
    me,
    canWrite: true,

    async get(path) { return clone(docs.get(path)); },
    async set(path, data) { write(path, clone(data)); },
    async update(path, patch) {
      const cur = docs.get(path);
      if (!cur) throw Object.assign(new Error('missing'), { code: 'invalid_argument' });
      write(path, { ...cur, ...clone(patch) });
    },
    async del(path) { write(path, null); },
    async list(col) { return clone(colDocs(col)); },

    watchDoc(path, cb) {
      if (!docSubs.has(path)) docSubs.set(path, new Set());
      const fn = (d) => cb(clone(d));
      docSubs.get(path).add(fn);
      queueMicrotask(() => fn(docs.get(path) ?? null));
      return () => docSubs.get(path)?.delete(fn);
    },

    watchCol(col, cb) {
      if (!colSubs.has(col)) colSubs.set(col, new Set());
      const fn = (list) => cb(clone(list));
      colSubs.get(col).add(fn);
      queueMicrotask(() => fn(colDocs(col)));
      return () => colSubs.get(col)?.delete(fn);
    },

    // Присъствие: кой е отворил стаята сега. cb(Set от id-та).
    async joinPresence(name, cb) {
      if (!peers.has(name)) peers.set(name, new Map());
      if (!peerSubs.has(name)) peerSubs.set(name, new Set());
      peerSubs.get(name).add(cb);
      const beat = () => {
        peers.get(name).set(me, Date.now());
        channel?.postMessage({ kind: 'here', room: name, id: me });
        emitPeers(name);
      };
      beat();
      const timer = setInterval(beat, 2000);
      return {
        leave() {
          clearInterval(timer);
          peerSubs.get(name)?.delete(cb);
          channel?.postMessage({ kind: 'here', room: name, id: me, gone: true });
        },
      };
    },

    // Игри на живо: всеки държи един обект (присъствие), който другите виждат почти веднага.
    // cb(Map id → обект). Изпраща се най-много ~30 пъти в секунда, като в claude.ai.
    async joinRealtime(name) {
      const r = rtRoom(name);
      let mine = {};
      let timer = null;
      let lastSent = 0;
      const flush = () => {
        timer = null; lastSent = Date.now();
        channel?.postMessage({ kind: 'rt', room: name, id: me, data: mine });
      };
      // Повтаря се, за да го видят и влезлите по-късно.
      const keep = setInterval(() => channel?.postMessage({ kind: 'rt', room: name, id: me, data: mine }), 1000);
      return {
        setPresence(patch) {
          mine = { ...mine, ...patch };
          for (const k of Object.keys(patch)) if (patch[k] === null) delete mine[k];
          r.peers.set(me, mine);
          if (!timer) timer = setTimeout(flush, Math.max(0, 33 - (Date.now() - lastSent)));
        },
        onPeers(cb) { r.subs.add(cb); queueMicrotask(() => cb(new Map(r.peers))); return () => r.subs.delete(cb); },
        leave() {
          clearTimeout(timer); clearInterval(keep);
          r.peers.delete(me); r.subs.clear();
          channel?.postMessage({ kind: 'rt', room: name, id: me, data: null });
        },
      };
    },
  };
}
