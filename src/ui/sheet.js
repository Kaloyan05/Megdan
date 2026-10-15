// Лист (диалог): отдолу на телефон, в средата на десктоп. Затваря се с ✕, Esc или докосване отвън.

import { h } from './dom.js';
import { GAMES, playersLabel } from '../games/index.js';

let open = null;

export function openSheet({ title, body, actions = [] }) {
  open?.close();
  const dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'sheet-title' });
  const close = () => { if (dlg.open) dlg.close(); };
  dlg.append(h('div', { class: 'sheet-inner' },
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'sheet-title', text: title }),
      h('button', { class: 'btn btn-icon btn-quiet', type: 'button', 'aria-label': 'Затвори', text: '✕', onClick: close }),
    ),
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('div', { class: 'actions sheet-actions' }, actions) : null,
  ));
  dlg.addEventListener('close', () => { dlg.remove(); if (open?.el === dlg) open = null; });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.body.append(dlg);
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  open = { el: dlg, close };
  return open;
}

export const TIMERS = [
  { sec: 0, label: 'Без таймер' },
  { sec: 120, label: '2 мин' },
  { sec: 45, label: '45 сек' },
];

export function pillGroup(label, options, value, onPick) {
  const group = h('div', { class: 'pills', role: 'group', 'aria-label': label });
  const paint = (v) => group.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  options.forEach((o) => group.append(h('button', {
    type: 'button', class: 'pill', text: o.label, 'aria-pressed': String(o.value === value),
    onClick: () => { paint(o.value); onPick(o.value); },
  })));
  return group;
}

function rulesList(game) {
  return h('ul', { class: 'rules' }, (game.rules ?? [game.blurb]).map((r) => h('li', { text: r })));
}

// Лист за игра от лобито: правила, таймер, „Създай стая“.
export function openGameSheet(game, { onCreate }) {
  let timerSec = 0;
  const create = h('button', {
    class: 'btn btn-primary', type: 'button', text: 'Създай стая',
    onClick: async (e) => { e.currentTarget.disabled = true; sheet.close(); await onCreate(game.id, timerSec); },
  });
  const sheet = openSheet({
    title: game.name,
    body: [
      h('div', { class: 'sheet-game' },
        h('div', { class: 'game-art sheet-art' }, game.art ? game.art() : game.icon),
        h('p', { class: 'muted', text: `${playersLabel(game)}. ${game.blurb}` }),
      ),
      h('h3', { text: 'Как се играе' }),
      rulesList(game),
      h('h3', { text: 'Таймер за ход' }),
      pillGroup('Таймер за ход', TIMERS.map((t) => ({ value: t.sec, label: t.label })), 0, (v) => { timerSec = v; }),
      h('p', { class: 'hint', text: 'Без таймер можете да играете бавно, през деня. Партидата се пази.' }),
    ],
    actions: [create],
  });
  create.focus();
  return sheet;
}

export function openRulesSheet(game) {
  return openSheet({ title: game.name, body: [h('p', { class: 'muted', text: playersLabel(game) }), rulesList(game)] });
}

// Избор на друга игра в стаята (за домакина).
export function openGamePicker(currentId, onPick) {
  const sheet = openSheet({
    title: 'Смени играта',
    body: h('div', { class: 'picker-list' }, GAMES.map((g) => h('button', {
      type: 'button', class: 'picker-item', 'aria-pressed': String(g.id === currentId),
      onClick: () => { sheet.close(); if (g.id !== currentId) onPick(g.id); },
    },
      h('span', { class: 'picker-name', text: g.name }),
      h('span', { class: 'muted', text: playersLabel(g) }),
    ))),
  });
  return sheet;
}
