// Store върху Firebase за собствения сайт (без вход в claude.ai):
// анонимен вход → постоянен uid на устройството; Firestore → документите (стаи, ходове, чат, профили);
// Realtime Database → присъствие и игрите на живо (бързи, временни, изчезват при излизане).
// Същата API като store-claude.js и store-local.js.

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import {
  initializeFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot,
} from 'firebase/firestore';
import {
  getDatabase, ref, set, onValue, onDisconnect, remove, serverTimestamp,
} from 'firebase/database';

// Firestore не позволява масив директно в масив: [[1,2],[3]] → [{__a:[1,2]},{__a:[3]}].
export function enc(v, inArray = false) {
  if (Array.isArray(v)) {
    const arr = v.map((x) => enc(x, true));
    return inArray ? { __a: arr } : arr;
  }
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = enc(x);
    return out;
  }
  return v;
}
export function dec(v) {
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === '__a' && Array.isArray(v.__a)) return v.__a.map(dec);
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = dec(x);
    return out;
  }
  return v;
}

// Realtime Database пази масивите като обекти с номерирани ключове и губи празните; връщам ги обратно.
function fromRtdb(v) {
  if (Array.isArray(v)) return v.map(fromRtdb);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = fromRtdb(x);
    return out;
  }
  return v;
}

const waitUser = (auth) => new Promise((resolve) => {
  const off = onAuthStateChanged(auth, (u) => { off(); resolve(u); });
});

export async function createFirebaseStore(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  let user = await waitUser(auth);
  if (!user) user = (await signInAnonymously(auth)).user;
  const me = user.uid;
  const fs = initializeFirestore(app, { ignoreUndefinedProperties: true });
  const rtdb = getDatabase(app);

  const plain = (snap) => (snap.exists() ? dec(snap.data()) : null);

  // Един запис наведнъж на документ, за да не се изпреварват.
  const queues = new Map();
  const serial = (path, fn) => {
    const prev = queues.get(path) ?? Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    queues.set(path, next);
    return next;
  };
  const sortById = (docs) => docs.sort((a, b) => a.id.localeCompare(b.id));

  return {
    kind: 'firebase',
    sample: null,
    me,
    canWrite: true,
    user: null,

    async get(path) { return plain(await getDoc(doc(fs, path))); },
    set: (path, data) => serial(path, () => setDoc(doc(fs, path), enc(data))),
    // Като в claude.ai: вложените обекти се сливат, масивите се заменят.
    update: (path, patch) => serial(path, () => setDoc(doc(fs, path), enc(patch), { merge: true })),
    del: (path) => serial(path, () => deleteDoc(doc(fs, path))),
    async list(col) {
      const snap = await getDocs(collection(fs, col));
      return sortById(snap.docs.map((d) => ({ id: d.id, data: dec(d.data()) })));
    },

    watchDoc(path, cb, onError) {
      return onSnapshot(doc(fs, path), (s) => cb(plain(s)), (e) => onError?.(e));
    },
    watchCol(col, cb, onError) {
      return onSnapshot(collection(fs, col),
        (s) => cb(sortById(s.docs.map((d) => ({ id: d.id, data: dec(d.data()) })))),
        (e) => onError?.(e));
    },

    // Кой е отворил стаята сега. cb(Set от id-та).
    async joinPresence(name, cb) {
      const mine = ref(rtdb, `presence/${name}/${me}`);
      const all = ref(rtdb, `presence/${name}`);
      const beat = () => set(mine, { t: serverTimestamp() }).catch(() => {});
      onDisconnect(mine).remove().catch(() => {});
      beat();
      const timer = setInterval(beat, 30000);
      const off = onValue(all, (snap) => cb(new Set(Object.keys(snap.val() ?? {}))), () => {});
      return {
        leave() { clearInterval(timer); off(); remove(mine).catch(() => {}); },
      };
    },

    // Игри на живо: всеки държи един обект, другите го виждат почти веднага. Най-много ~30 пъти в секунда.
    async joinRealtime(name) {
      const mineRef = ref(rtdb, `live/${name}/${me}`);
      const allRef = ref(rtdb, `live/${name}`);
      onDisconnect(mineRef).remove().catch(() => {});
      let mine = { id: me };
      let timer = null;
      let lastSent = 0;
      const subs = new Set();
      let latest = new Map();
      const flush = () => { timer = null; lastSent = Date.now(); set(mineRef, mine).catch(() => {}); };
      flush();
      const off = onValue(allRef, (snap) => {
        const val = snap.val() ?? {};
        latest = new Map(Object.entries(val).map(([id, p]) => [id, fromRtdb(p)]));
        subs.forEach((cb) => cb(latest));
      }, () => {});
      return {
        setPresence(patch) {
          mine = { ...mine, ...patch };
          for (const k of Object.keys(patch)) if (patch[k] === null) delete mine[k];
          if (!timer) timer = setTimeout(flush, Math.max(0, 33 - (Date.now() - lastSent)));
        },
        onPeers(cb) { subs.add(cb); queueMicrotask(() => cb(latest)); return () => subs.delete(cb); },
        leave() { clearTimeout(timer); off(); subs.clear(); remove(mineRef).catch(() => {}); },
      };
    },
  };
}
