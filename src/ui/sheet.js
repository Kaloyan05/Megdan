// Лист (диалог): отдолу на телефон, в средата на десктоп. Затваря се с ✕, Esc или докосване отвън.

import { h } from './dom.js';
import { GAMES, playersLabel } from '../games/index.js';
import { BOT_LEVELS } from '../core/bots.js';
import { optionsFor } from '../core/engine.js';

// Вариации на правилата като групи бутони. onChange получава целия обект.
export function optionsControls(game, current, onChange) {
  const opts = { ...optionsFor(game, current) };
  return (game.options ?? []).map((o) => h('div', { class: 'field' },
    h('span', { class: 'field-label', text: o.label }),
    pillGroup(o.label, o.choices, opts[o.id], (v) => { opts[o.id] = v; onChange({ ...opts }); }),
  ));
}

export function optionsSummary(game, current) {
  const opts = optionsFor(game, current);
  return (game.options ?? []).map((o) => `${o.label}: ${o.choices.find((c) => c.value === opts[o.id])?.label ?? ''}`).join('; ');
}

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
export function openGameSheet(game, { onCreate, onSolo }) {
  let timerSec = 0;
  let level = 'medium';
  let count = 1;
  let options = optionsFor(game, {});
  const maxBots = Math.min(game.maxPlayers - 1, 3);
  const solo = h('button', {
    class: 'btn btn-sun', type: 'button', text: 'Играй с компютъра',
    onClick: async (e) => { e.currentTarget.disabled = true; sheet.close(); await onSolo?.(game, { timerSec, level, count, options }); },
  });
  const create = h('button', {
    class: 'btn btn-primary', type: 'button', text: 'Създай стая',
    onClick: async (e) => { e.currentTarget.disabled = true; sheet.close(); await onCreate(game.id, timerSec, options); },
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
      game.options?.length && h('h3', { text: 'Правила' }),
      ...(game.options?.length ? optionsControls(game, options, (o) => { options = o; }) : []),
      h('h3', { text: 'Таймер за ход' }),
      pillGroup('Таймер за ход', TIMERS.map((t) => ({ value: t.sec, label: t.label })), 0, (v) => { timerSec = v; }),
      h('p', { class: 'hint', text: 'Без таймер можете да играете бавно, през деня. Партидата се пази.' }),
      onSolo && h('h3', { text: 'Срещу компютъра' }),
      onSolo && pillGroup('Ниво на бота', BOT_LEVELS.map((l) => ({ value: l.value, label: l.label })), level, (v) => { level = v; }),
      onSolo && maxBots > 1 && pillGroup('Брой ботове', [...Array(maxBots).keys()].map((k) => ({ value: k + 1, label: k ? `${k + 1} бота` : '1 бот' })), count, (v) => { count = v; }),
      onSolo && h('p', { class: 'hint', text: 'Партиите с бот не влизат в класацията.' }),
    ],
    actions: [create, onSolo && solo].filter(Boolean),
  });
  create.focus();
  return sheet;
}

// Вечер на игрите: изненада или избрани игри.
export function openSeriesSheet({ onCreate }) {
  let count = 3;
  let mode = 'surprise';
  const picked = [];
  const pickWrap = h('div', { class: 'series-pick', hidden: true });
  const counter = h('p', { class: 'hint' });
  const surpriseHint = h('p', { class: 'hint', text: 'При „Изненада“ игрите се теглят при старта, според броя играчи.' });
  const paintPicked = () => {
    pickWrap.querySelectorAll('button').forEach((b) => {
      const n = picked.indexOf(b.dataset.id);
      b.setAttribute('aria-pressed', String(n >= 0));
      b.querySelector('.series-n').textContent = n >= 0 ? String(n + 1) : '';
    });
    counter.textContent = picked.length ? `Избрани: ${picked.length}. Ще се играят в този ред.` : 'Докосни игрите в реда, в който искаш да се играят.';
    create.disabled = mode === 'pick' && picked.length < 2;
  };
  pickWrap.append(...GAMES.filter((g) => !g.realtime).map((g) => h('button', {
    type: 'button', class: 'pill series-game', 'data-id': g.id, 'aria-pressed': 'false',
    onClick: () => {
      const i = picked.indexOf(g.id);
      if (i >= 0) picked.splice(i, 1); else if (picked.length < 7) picked.push(g.id);
      paintPicked();
    },
  }, h('span', { class: 'series-n' }), g.name)));
  const countGroup = pillGroup('Брой игри', [3, 5].map((v) => ({ value: v, label: `${v} игри` })), count, (v) => { count = v; });
  const create = h('button', {
    class: 'btn btn-primary', type: 'button', text: 'Създай стая',
    onClick: async (e) => {
      e.currentTarget.disabled = true;
      sheet.close();
      await onCreate(mode === 'pick' ? { games: picked.slice(), index: 0, results: [] } : { count, games: null, index: 0, results: [] });
    },
  });
  const sheet = openSheet({
    title: 'Вечер на игрите',
    body: [
      h('p', { class: 'muted', text: 'Няколко игри една след друга. След всяка: победа 3 т., второ място 1 т. (при 3+ играчи), реми 1 т. Накрая има шампион на вечерта.' }),
      pillGroup('Как да изберем игрите', [{ value: 'surprise', label: 'Изненада' }, { value: 'pick', label: 'Избирам сам' }], mode, (v) => {
        mode = v;
        pickWrap.hidden = v !== 'pick';
        countGroup.hidden = v === 'pick';
        counter.hidden = v !== 'pick';
        surpriseHint.hidden = v === 'pick';
        paintPicked();
      }),
      countGroup,
      pickWrap,
      counter,
      surpriseHint,
    ],
    actions: [create],
  });
  counter.hidden = true;
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
