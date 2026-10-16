// Избира store: claude.ai (db/user/room) или локален (?store=local, за разработка и E2E).

import { createLocalStore } from './store-local.js';
import { createClaudeStore } from './store-claude.js';
/* global __SITE__ */
import { FIREBASE_CONFIG } from '../site-config.js';

export async function openStore() {
  const params = new URLSearchParams(location.search);
  // Собственият сайт: Firebase (анонимен вход, без регистрация).
  if (typeof __SITE__ !== 'undefined' && __SITE__ && params.get('store') !== 'local') {
    if (!FIREBASE_CONFIG) return null;
    const { createFirebaseStore } = await import('./store-firebase.js');
    return createFirebaseStore(FIREBASE_CONFIG).catch((e) => { console.warn('firebase', e); return null; });
  }
  if (params.get('store') !== 'local') {
    const s = await createClaudeStore().catch(() => null);
    if (s) return s;
    if (window.claude?.use) return null; // в claude.ai, но без достъп (не е влязъл / няма права)
  }
  let me = params.get('as');
  if (!me) {
    try {
      me = localStorage.getItem('megdan:me') || `u${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('megdan:me', me);
    } catch { me = `u${Math.random().toString(36).slice(2, 10)}`; }
  }
  let storage = null;
  try { storage = window.localStorage; } catch { /* без localStorage */ }
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('megdan') : null;
  return createLocalStore({ me, storage, channel, lagMs: Number(params.get('lag')) || 0 });
}
