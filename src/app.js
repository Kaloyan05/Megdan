// Входна точка: избира store, зарежда профила и превключва екраните по #хеш.
//   (празно)   → игри (лоби)
//   #stai      → моите стаи
//   #ABCD      → стая с код ABCD
//   #klasaciya → класация
//   #profil    → профил

import { openStore } from './net/store.js';
import { createApi, normalizeCode } from './net/api.js';
import { h, mount, toast, avatarEl, storageGet, storageSet } from './ui/dom.js';
import { sound } from './ui/sound.js';
import { renderProfile } from './ui/profile.js';
import { renderLobby } from './ui/lobby.js';
import { renderRoom } from './ui/room.js';
import { renderRooms } from './ui/rooms.js';
import { renderLeaderboard } from './ui/leaderboard.js';
import { createTurnWatcher } from './ui/turns.js';
import { injectGameCss } from './games/index.js';
import { sweepRooms, sweepMySecrets } from './net/cleanup.js';

const NO_WRITE = 'Нямаш права да играеш тук. Помоли собственика да те покани с право „Can edit“.';
const appEl = document.getElementById('app');
const main = h('main', { class: 'main', id: 'main' });
let api = null;
let profile = null;
let cleanup = null;
let turns = null;
let currentRoom = null;
let myTurnCount = 0;

const NAV = [
  { id: 'igri', hash: '', label: 'Игри', icon: '🎲' },
  { id: 'stai', hash: 'stai', label: 'Стаи', icon: '🚪' },
  { id: 'klasaciya', hash: 'klasaciya', label: 'Класация', icon: '🏆' },
  { id: 'profil', hash: 'profil', label: 'Профил', icon: null },
];
const navEls = []; // { item, el, badge, avatarSlot }

const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; else route(); };

function navSection(hash) {
  if (hash === 'profil') return 'profil';
  if (hash === 'klasaciya') return 'klasaciya';
  if (hash === 'stai' || normalizeCode(hash).length === 4) return 'stai';
  return 'igri';
}

function paintNav() {
  const section = navSection(decodeURIComponent(location.hash.slice(1)));
  for (const n of navEls) {
    if (n.item.id === section) n.el.setAttribute('aria-current', 'page'); else n.el.removeAttribute('aria-current');
    if (n.badge) { n.badge.hidden = !myTurnCount; n.badge.textContent = String(myTurnCount); }
    if (n.avatarSlot) mount(n.avatarSlot, avatarEl(profile, 'xs'));
  }
}

function navItem(item, cls) {
  const badge = item.id === 'stai' ? h('span', { class: 'nav-badge', hidden: true, 'aria-label': 'стаи, в които си на ход' }) : null;
  const avatarSlot = item.icon ? null : h('span', { class: 'nav-icon' });
  const el = h('a', { class: cls, href: `#${item.hash}`, onClick: (e) => { e.preventDefault(); go(item.hash); } },
    avatarSlot ?? h('span', { class: 'nav-icon', 'aria-hidden': 'true', text: item.icon }),
    h('span', { class: 'nav-label', text: item.label }),
    badge,
  );
  navEls.push({ item, el, badge, avatarSlot });
  return el;
}

function topbar() {
  const muteBtn = h('button', { class: 'btn btn-icon btn-quiet', type: 'button' });
  const paintMute = () => {
    muteBtn.textContent = sound.isMuted() ? '🔇' : '🔊';
    muteBtn.setAttribute('aria-label', sound.isMuted() ? 'Пусни звука' : 'Спри звука');
    muteBtn.setAttribute('aria-pressed', String(sound.isMuted()));
  };
  muteBtn.addEventListener('click', () => sound.setMuted(!sound.isMuted()));
  sound.onChange(paintMute);
  paintMute();

  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      h('a', { class: 'brand', href: '#', 'aria-label': 'Мегдан, към игрите', onClick: (e) => { e.preventDefault(); go(''); } },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'brand-word', text: 'мегдан' }),
      ),
      h('nav', { class: 'nav-top', 'aria-label': 'Основно меню' }, NAV.map((n) => navItem(n, 'nav-top-item'))),
      h('div', { class: 'spacer' }),
      muteBtn,
    ),
    h('div', { class: 'stitch', 'aria-hidden': 'true' }),
  );
}

function bottomNav() {
  return h('nav', { class: 'nav-bottom', 'aria-label': 'Основно меню' }, NAV.map((n) => navItem(n, 'nav-bottom-item')));
}

async function route() {
  cleanup?.();
  cleanup = null;
  currentRoom = null;
  const hash = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);
  paintNav();
  document.body.classList.toggle('in-room', normalizeCode(hash).length === 4 && hash.length === 4);

  if (!profile || hash === 'profil') {
    const firstTime = !profile;
    document.body.classList.toggle('first-run', firstTime);
    renderProfile(main, {
      initial: profile, firstTime,
      onSave: async (p) => {
        profile = p;
        storageSet(`profile:${api.me}`, p);
        document.body.classList.remove('first-run');
        paintNav();
        api.saveProfile(p).catch(() => toast('Профилът е запазен само на това устройство.'));
        sound.tap();
        go(firstTime && hash.length === 4 && normalizeCode(hash).length === 4 ? hash : '');
      },
      onCancel: () => (history.length > 1 ? history.back() : go('')),
    });
    return;
  }

  if (hash === 'klasaciya') { cleanup = renderLeaderboard(main, { api }); return; }
  if (hash === 'stai') { cleanup = renderRooms(main, { api, turns, go }); return; }

  const code = normalizeCode(hash);
  if (hash && code.length === 4) {
    mount(main, h('p', { class: 'muted', text: `Влизам в стая ${code}...` }));
    const res = await api.joinRoom(code, profile).catch((e) => ({ ok: false, reason: e?.code === 'invalid_argument' ? 'no-write' : 'error' }));
    if (!res.ok) {
      toast({
        'not-found': `Няма стая с код ${code}.`,
        full: 'Стаята е пълна (6 души).',
        'no-write': NO_WRITE,
      }[res.reason] ?? 'Не успях да вляза. Опитай пак.', 4000);
      go('');
      return;
    }
    currentRoom = code;
    cleanup = renderRoom(main, { api, code, onLeave: () => go('stai') });
    return;
  }

  renderLobby(main, {
    profile,
    myTurnCount,
    onRooms: () => go('stai'),
    onJoin: async (c) => {
      const res = await api.joinRoom(c, profile);
      if (res.ok) go(c);
      return res;
    },
    onCreate: async (gameId, timerSec = 0) => {
      try {
        const c = await api.createRoom({ gameId, timerSec, profile });
        go(c);
      } catch (e) {
        toast(e?.code === 'invalid_argument' ? NO_WRITE : 'Не успях да създам стая. Опитай пак.', 4000);
      }
    },
  });
}

async function boot() {
  injectGameCss();
  mount(appEl, h('main', { class: 'main' }, h('p', { class: 'muted', text: 'Зареждам мегдана...' })));
  const store = await openStore();
  if (!store) {
    mount(appEl, h('main', { class: 'main' },
      h('div', { class: 'empty' },
        h('h1', { text: 'Мегдан' }),
        h('p', { text: 'За да играеш, трябва да си влязъл в claude.ai и да имаш покана за тази страница.' }),
        h('p', { class: 'muted', text: 'Помоли този, който ти прати линка, да те покани с право „Can edit“.' }),
      ),
    ));
    return;
  }
  api = createApi(store);
  profile = (await api.getProfile().catch(() => null)) ?? storageGet(`profile:${api.me}`);
  if (profile && !storageGet(`profile:${api.me}`)) storageSet(`profile:${api.me}`, profile);
  if (store.canWrite === false) toast('Можеш само да гледаш. За да играеш, трябва покана с право „Can edit“.', 5000);

  turns = createTurnWatcher(api);
  turns.subscribe((list) => {
    myTurnCount = list.filter((s) => s.myTurn).length;
    paintNav();
  });
  turns.onTurn((s) => {
    if (s.code === currentRoom) return; // стаята сама известява
    sound.turn();
    try { navigator.vibrate?.(80); } catch { /* няма вибрация */ }
    toast(`Твой ход: ${s.game?.name ?? 'стая'} ${s.code}`, 4000);
  });

  // Почистване веднъж на ден, след като страницата се е заредила.
  const DAY = 24 * 3600 * 1000;
  if (Date.now() - (storageGet('lastSweep') ?? 0) > DAY && store.canWrite !== false) {
    setTimeout(() => {
      storageSet('lastSweep', Date.now());
      sweepRooms(store).catch(() => {});
      sweepMySecrets(store, api.me).catch(() => {});
    }, 15000 + Math.random() * 15000);
  }

  mount(appEl, topbar(), main, bottomNav());
  window.addEventListener('hashchange', route);
  route();
}

boot();
