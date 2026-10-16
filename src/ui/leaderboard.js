// Класация: ELO рейтинг и победи/загуби по игра.

import { h, mount, avatarEl } from './dom.js';
import { GAMES } from '../games/index.js';
import { openSheet } from './sheet.js';

const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// „Ти срещу …“: резултатите ми срещу един играч, общо и по игри.
function openVersus(name, rec) {
  const rows = GAMES.filter((g) => rec?.[g.id]).map((g) => ({ name: g.name, ...rec[g.id] }));
  const all = rec?.all ?? { w: 0, l: 0, d: 0 };
  openSheet({
    title: `Ти срещу ${name}`,
    body: rows.length
      ? [
        h('p', { class: 'versus-total num', text: `${all.w} : ${all.l}` }),
        h('p', { class: 'muted', text: `${pl(all.w, 'победа', 'победи')}, ${pl(all.l, 'загуба', 'загуби')}${all.d ? `, ${pl(all.d, 'равна', 'равни')}` : ''}.` }),
        h('div', { class: 'table-wrap' }, h('table', { class: 'board-table' },
          h('thead', {}, h('tr', {}, h('th', { text: 'Игра' }), h('th', { class: 'r', text: 'Победи' }), h('th', { class: 'r', text: 'Загуби' }), h('th', { class: 'r', text: 'Равни' }))),
          h('tbody', {}, rows.map((r) => h('tr', {},
            h('td', { text: r.name }), h('td', { class: 'r num', text: String(r.w) }), h('td', { class: 'r num', text: String(r.l) }), h('td', { class: 'r num', text: String(r.d) }),
          ))),
        )),
      ]
      : h('p', { class: 'muted', text: 'Още не сте играли един срещу друг.' }),
  });
}

export function renderLeaderboard(root, { api }) {
  let alive = true;
  let filter = 'all';
  let rows = null;

  const draw = () => {
    if (!alive) return;
    const tabs = h('div', { class: 'actions lb-tabs', role: 'group', 'aria-label': 'Игра' },
      [{ id: 'all', name: 'Общо' }, ...GAMES].map((g) => h('button', {
        type: 'button', class: 'btn btn-small', 'aria-pressed': String(filter === g.id),
        style: filter === g.id ? { background: 'var(--ink)', color: 'var(--bg)' } : null,
        text: g.name, onClick: () => { filter = g.id; draw(); },
      })),
    );

    let body;
    if (!rows) body = h('p', { class: 'muted', text: 'Зареждам...' });
    else {
      const mine = rows.find((r) => r.id === api.me)?.stats.h2h ?? {};
      const list = rows
        .map((r) => {
          const g = filter === 'all' ? r.stats : (r.stats.games?.[filter] ?? { w: 0, l: 0, d: 0 });
          return { ...r, w: g.w ?? 0, l: g.l ?? 0, d: g.d ?? 0 };
        })
        .filter((r) => r.w + r.l + r.d > 0)
        .sort((a, b) => (filter === 'all' ? b.stats.rating - a.stats.rating : b.w - a.w || a.l - b.l));
      body = list.length
        ? h('div', { class: 'table-wrap' },
          h('table', { class: 'board-table' },
            h('thead', {}, h('tr', {},
              h('th', { text: '#' }), h('th', { text: 'Играч' }),
              filter === 'all' && h('th', { class: 'r', text: 'Рейтинг' }),
              h('th', { class: 'r', text: 'Победи' }), h('th', { class: 'r', text: 'Загуби' }), h('th', { class: 'r', text: 'Равни' }),
            )),
            h('tbody', {}, list.map((r, i) => h('tr', {},
              h('td', { class: 'num', text: String(i + 1) }),
              h('td', {}, r.id === api.me
                ? h('span', { class: 'lb-name' }, avatarEl(r.profile, 'sm'), h('span', { text: `${r.profile?.nick ?? 'Ти'} (ти)` }))
                : h('button', {
                  class: 'lb-name lb-link', type: 'button', 'aria-label': `${r.profile?.nick || 'Играч'}: ти срещу него`,
                  onClick: () => openVersus(r.profile?.nick || 'Играч', mine[r.id]),
                }, avatarEl(r.profile, 'sm'), h('span', { text: r.profile?.nick || 'Играч' }),
                mine[r.id] && h('span', { class: 'chip', text: `${mine[r.id].all?.w ?? 0}:${mine[r.id].all?.l ?? 0}` }))),
              filter === 'all' && h('td', { class: 'r num', style: { fontWeight: 700 }, text: String(r.stats.rating) }),
              h('td', { class: 'r num', text: String(r.w) }),
              h('td', { class: 'r num', text: String(r.l) }),
              h('td', { class: 'r num', text: String(r.d) }),
            ))),
          ))
        : h('div', { class: 'empty' },
          h('p', { text: 'Още няма изиграни партиди.' }),
          h('p', { class: 'muted', text: 'Изиграй една и името ти ще се появи тук.' }),
        );
    }

    mount(root,
      h('h1', { text: 'Класация' }),
      h('p', { class: 'muted', text: 'Всеки започва с 1000 точки. Победа над по-силен носи повече. Докосни играч, за да видиш как си срещу него.' }),
      tabs,
      h('section', { class: 'panel' }, body),
    );
  };

  draw();
  Promise.all([api.listStats(), api.listProfiles()]).then(([stats, profiles]) => {
    const byId = Object.fromEntries(profiles.map((p) => [p.id, p.data]));
    rows = stats.filter((s) => s.data).map((s) => ({ id: s.id, stats: s.data, profile: byId[s.id] }));
    draw();
  }).catch(() => { rows = []; draw(); });

  return () => { alive = false; };
}
