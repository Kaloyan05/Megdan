// Лоби: влизане с код, бърза игра, избор на игра (създава стая).

import { h, mount, storageGet } from './dom.js';
import { sound } from './sound.js';
import { GAMES, playersLabel } from '../games/index.js';
import { normalizeCode } from '../net/api.js';
import { openGameSheet, openSeriesSheet } from './sheet.js';

export function renderLobby(root, { profile, myTurnCount = 0, onRooms, onJoin, onCreate, onSolo, onSeries }) {
  const err = h('p', { class: 'error', id: 'code-error', hidden: true });
  const codeInput = h('input', {
    class: 'input code-input', id: 'code', inputMode: 'text', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, maxLength: 6, placeholder: 'ABCD', 'aria-describedby': 'code-hint code-error',
    onInput: (e) => {
      const v = normalizeCode(e.target.value);
      if (e.target.value !== v) e.target.value = v;
      err.hidden = true;
      joinBtn.disabled = v.length !== 4;
    },
  });
  const joinBtn = h('button', { class: 'btn btn-primary', type: 'submit', disabled: true, text: 'Влез' });

  const showError = (msg) => { err.textContent = msg; err.hidden = false; sound.bad(); };

  const joinForm = h('form', {
    class: 'panel', novalidate: true,
    onSubmit: async (e) => {
      e.preventDefault();
      const code = normalizeCode(codeInput.value);
      if (code.length !== 4) return showError('Кодът е от 4 букви.');
      joinBtn.disabled = true;
      const res = await onJoin(code).catch((e2) => ({ ok: false, reason: e2?.code === 'invalid_argument' ? 'no-write' : 'error' }));
      joinBtn.disabled = false;
      if (!res.ok) {
        showError({
          'not-found': `Няма стая с код ${code}. Провери буквите.`,
          full: 'Стаята е пълна (6 души).',
          'no-write': 'Нямаш права да играеш тук. Помоли собственика да те покани с право „Can edit“.',
        }[res.reason] ?? 'Не успях да вляза. Опитай пак.');
      }
    },
  },
    h('h2', { text: 'Имаш код?' }),
    h('label', { class: 'sr-only', for: 'code', text: 'Код на стаята' }),
    h('div', { class: 'join-row' }, codeInput, joinBtn),
    h('p', { class: 'hint', id: 'code-hint', text: 'Четири букви от поканата. Може и на кирилица.' }),
    err,
  );

  const last = storageGet('lastGame');
  const quick = () => {
    const pool = GAMES.length > 1 ? GAMES.filter((g) => g.id !== last) : GAMES;
    onCreate(pool[Math.floor(Math.random() * pool.length)].id);
  };

  const tiles = GAMES.map((g, i) => h('button', {
    class: 'game-tile', type: 'button', '--tile-bg': `color-mix(in srgb, var(--seat-${(i % 6) + 1}) 18%, var(--surface))`,
    onClick: () => { sound.tap(); openGameSheet(g, { onCreate, onSolo }); },
    'aria-label': `${g.name}, ${playersLabel(g)}. Правила и нова стая`,
  },
    h('div', { class: 'game-art' }, g.art ? g.art() : g.icon),
    h('div', { class: 'game-info' },
      h('h3', { text: g.name }),
      h('p', { class: 'muted', text: g.blurb }),
      h('p', { class: 'game-meta', text: playersLabel(g) }),
    ),
  ));

  mount(root,
    h('section', { class: 'lobby-hero' },
      h('h1', { text: `Здравей, ${profile.nick}!` }),
      myTurnCount > 0 && h('button', { class: 'turn-banner', type: 'button', onClick: onRooms },
        h('span', { class: 'turn-banner-count num', text: String(myTurnCount) }),
        h('span', { text: myTurnCount === 1 ? 'Чакат те в една стая. Твой ход е.' : `Твой ход е в ${myTurnCount} стаи.` }),
        h('span', { class: 'turn-banner-go', text: 'Към стаите' }),
      ),
      h('div', { class: 'room', style: { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' } },
        joinForm,
        h('div', { class: 'panel' },
          h('h2', { text: 'Нова игра' }),
          h('p', { class: 'muted', text: 'Направи стая, прати кода на приятел и започвайте.' }),
          h('div', { class: 'actions' },
            h('button', { class: 'btn btn-sun', type: 'button', text: 'Бърза игра', onClick: quick }),
            onSeries && h('button', { class: 'btn', type: 'button', text: 'Вечер на игрите', onClick: () => openSeriesSheet({ onCreate: onSeries }) }),
          ),
          h('p', { class: 'hint', text: 'Бърза игра избира игра вместо теб. Или избери долу, за да видиш правилата.' }),
        ),
      ),
    ),
    h('section', { class: 'stage', 'aria-labelledby': 'games-h' },
      h('h2', { id: 'games-h', text: 'Игри' }),
      h('div', { class: 'games' }, tiles),
    ),
  );
}
