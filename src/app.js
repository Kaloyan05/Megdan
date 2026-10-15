// Входна точка: избира store, зарежда профила и превключва екраните по #хеш.
//   (празно)  → лоби
//   #ABCD     → стая с код ABCD
//   #profil   → профил
//   #klasaciya → класация

import { openStore } from './net/store.js';
import { createApi, normalizeCode } from './net/api.js';
import { h, mount, toast, avatarEl, storageGet, storageSet } from './ui/dom.js';
import { sound } from './ui/sound.js';
import { renderProfile } from './ui/profile.js';
import { renderLobby } from './ui/lobby.js';
import { renderRoom } from './ui/room.js';
import { renderLeaderboard } from './ui/leaderboard.js';
import { injectGameCss } from './games/index.js';

const appEl = document.getElementById('app');
const main = h('main', { class: 'main', id: 'main' });
let api = null;
let profile = null;
let cleanup = null;

const go = (hash) => { if (location.hash.slice(1) !== hash) location.hash = hash; else route(); };

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

  const me = h('button', { class: 'btn btn-icon btn-quiet', type: 'button', 'aria-label': 'Профил', onClick: () => go('profil') });
  const paintMe = () => mount(me, avatarEl(profile, 'sm'));
  paintMe();
  topbar.paintMe = paintMe;

  return h('header', { class: 'topbar' },
    h('div', { class: 'topbar-row' },
      h('button', { class: 'brand', type: 'button', 'aria-label': 'Мегдан, към лобито', onClick: () => go('') },
        h('span', { class: 'brand-mark', 'aria-hidden': 'true' }),
        h('span', { class: 'brand-word', text: 'мегдан' }),
      ),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-small btn-quiet', type: 'button', text: 'Класация', onClick: () => go('klasaciya') }),
      muteBtn,
      me,
    ),
    h('div', { class: 'stitch', 'aria-hidden': 'true' }),
  );
}

async function route() {
  cleanup?.();
  cleanup = null;
  const hash = decodeURIComponent(location.hash.slice(1));
  window.scrollTo(0, 0);

  if (!profile || hash === 'profil') {
    const firstTime = !profile;
    renderProfile(main, {
      initial: profile, firstTime,
      onSave: async (p) => {
        profile = p;
        storageSet(`profile:${api.me}`, p);
        topbar.paintMe?.();
        api.saveProfile(p).catch(() => toast('Профилът е запазен само на това устройство.'));
        sound.tap();
        go(firstTime && /^[A-Z]{4}$/.test(normalizeCode(hash)) && hash.length === 4 ? hash : '');
      },
      onCancel: () => history.length > 1 ? history.back() : go(''),
    });
    return;
  }

  if (hash === 'klasaciya') {
    cleanup = renderLeaderboard(main, { api });
    return;
  }

  const code = normalizeCode(hash);
  if (hash && code.length === 4) {
    mount(main, h('p', { class: 'muted', text: `Влизам в стая ${code}...` }));
    const res = await api.joinRoom(code, profile).catch((e) => ({ ok: false, reason: e?.code === 'invalid_argument' ? 'no-write' : 'error' }));
    if (!res.ok) {
      toast({
        'not-found': `Няма стая с код ${code}.`,
        full: 'Стаята е пълна (6 души).',
        'no-write': 'Нямаш права да играеш тук. Помоли собственика да те покани като Editor.',
      }[res.reason] ?? 'Не успях да вляза. Опитай пак.', 4000);
      go('');
      return;
    }
    cleanup = renderRoom(main, { api, code, onLeave: () => go('') });
    return;
  }

  renderLobby(main, {
    profile,
    onJoin: async (c) => {
      const res = await api.joinRoom(c, profile);
      if (res.ok) go(c);
      return res;
    },
    onCreate: async (gameId) => {
      try {
        const c = await api.createRoom({ gameId, profile });
        go(c);
      } catch (e) {
        toast(e?.code === 'invalid_argument'
          ? 'Нямаш права да създаваш стаи. Помоли собственика да те покани като Editor.'
          : 'Не успях да създам стая. Опитай пак.', 4000);
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
        h('p', { class: 'muted', text: 'Помоли този, който ти прати линка, да те добави като Editor.' }),
      ),
    ));
    return;
  }
  api = createApi(store);
  profile = (await api.getProfile().catch(() => null)) ?? storageGet(`profile:${api.me}`);
  if (profile && !storageGet(`profile:${api.me}`)) storageSet(`profile:${api.me}`, profile);
  if (store.canWrite === false) toast('Можеш само да гледаш. За да играеш, трябва покана като Editor.', 5000);

  mount(appEl, topbar(), main);
  window.addEventListener('hashchange', route);
  route();
}

boot();
