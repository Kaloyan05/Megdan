// Екран за профил: ник, емоджи аватар и цвят.

import { h, mount, avatarEl } from './dom.js';
import { sound } from './sound.js';

export const AVATARS = ['🦊', '🐸', '🐻', '🐼', '🦉', '🐙', '🦁', '🐯', '🐨', '🐧', '🦄', '🐝', '🐢', '🐰', '🐶', '🐱', '🦔', '🐳'];
export const COLORS = [1, 2, 3, 4, 5, 6];
const COLOR_NAMES = ['червено', 'синьо', 'жълто', 'зелено', 'лилаво', 'оранжево'];

export function cleanNick(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function renderProfile(root, { initial, firstTime, onSave, onCancel, joining = null }) {
  const draft = {
    nick: initial?.nick ?? '',
    avatar: initial?.avatar ?? AVATARS[Math.floor(Math.random() * AVATARS.length)],
    color: initial?.color ?? 1 + Math.floor(Math.random() * 6),
  };

  const preview = h('div', { class: 'profile-preview' });
  const err = h('p', { class: 'error', id: 'nick-error', hidden: true });
  const nickInput = h('input', {
    class: 'input', id: 'nick', maxLength: 16, autocomplete: 'nickname', value: draft.nick,
    'aria-describedby': 'nick-hint nick-error',
    onInput: (e) => { draft.nick = e.target.value; err.hidden = true; paintPreview(); },
  });

  const paintPreview = () => mount(preview,
    avatarEl(draft, 'lg'),
    h('div', {},
      h('p', { class: 'muted', text: 'Така те виждат другите' }),
      h('p', { style: { fontWeight: 700, fontSize: '1.25rem' }, text: cleanNick(draft.nick) || 'Без име' }),
    ),
  );

  const avatarGrid = h('div', { class: 'choice-grid', role: 'group', 'aria-label': 'Аватар' },
    AVATARS.map((a) => h('button', {
      type: 'button', class: 'choice', 'aria-pressed': String(a === draft.avatar), 'aria-label': `Аватар ${a}`, text: a,
      onClick: (e) => {
        draft.avatar = a; sound.tap();
        avatarGrid.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        paintPreview();
      },
    })),
  );

  const colorGrid = h('div', { class: 'choice-grid', role: 'group', 'aria-label': 'Цвят' },
    COLORS.map((c, i) => h('button', {
      type: 'button', class: 'choice swatch', '--sw': `var(--seat-${c})`, 'aria-pressed': String(c === draft.color),
      'aria-label': `Цвят ${COLOR_NAMES[i]}`,
      onClick: (e) => {
        draft.color = c; sound.tap();
        colorGrid.querySelectorAll('.choice').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget)));
        paintPreview();
      },
    })),
  );

  const form = h('form', {
    class: 'profile-card', novalidate: true,
    onSubmit: (e) => {
      e.preventDefault();
      const nick = cleanNick(draft.nick);
      if (nick.length < 2) {
        err.textContent = 'Името трябва да е поне 2 знака.';
        err.hidden = false;
        nickInput.focus();
        sound.bad();
        return;
      }
      onSave({ nick, avatar: draft.avatar, color: draft.color });
    },
  },
    joining && h('p', { class: 'join-banner', text: `Канят те в стая ${joining}. Само си напиши името.` }),
    h('h1', { text: firstTime ? 'Как да те наричаме?' : 'Твоят профил' }),
    firstTime && h('p', { class: 'muted', text: 'Избери име и аватар. Приятелите ти ще ги виждат в стаите.' }),
    preview,
    h('div', { class: 'field' },
      h('label', { for: 'nick', text: 'Име' }),
      nickInput,
      h('p', { class: 'hint', id: 'nick-hint', text: 'От 2 до 16 знака.' }),
      err,
    ),
    h('div', { class: 'field' }, h('span', { class: 'field-label', style: { fontWeight: 700, fontSize: 'var(--step--1)' }, text: 'Аватар' }), avatarGrid),
    h('div', { class: 'field' }, h('span', { style: { fontWeight: 700, fontSize: 'var(--step--1)' }, text: 'Цвят' }), colorGrid),
    h('div', { class: 'actions' },
      h('button', { class: 'btn btn-primary', type: 'submit', text: joining ? 'Влез в играта' : firstTime ? 'Към мегдана' : 'Запази' }),
      !firstTime && h('button', { class: 'btn', type: 'button', text: 'Отказ', onClick: onCancel }),
    ),
  );

  paintPreview();
  mount(root, form);
  if (firstTime) nickInput.focus();
}
