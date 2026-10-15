// Избира store: claude.ai (db/user/room) или локален (?store=local, за разработка и E2E).

import { createLocalStore } from './store-local.js';
import { createClaudeStore } from './store-claude.js';

export async function openStore() {
  const params = new URLSearchParams(location.search);
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
  return createLocalStore({ me, storage, channel });
}
