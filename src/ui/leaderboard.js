// Класация: ELO рейтинг и победи/загуби по игра.

import { h, mount, avatarEl } from './dom.js';
import { GAMES } from '../games/index.js';

export function renderLeaderboard(root, { api }) {
  let alive = true;
  let filter = 'all';
  let rows = null;

  const draw = () => {
    if (!alive) return;
    const tabs = h('div', { class: 'actions', role: 'group', 'aria-label': 'Игра' },
      [{ id: 'all', name: 'Общо' }, ...GAMES].map((g) => h('button', {
        type: 'button', class: 'btn btn-small', 'aria-pressed': String(filter === g.id),
        style: filter === g.id ? { background: 'var(--ink)', color: 'var(--bg)' } : null,
        text: g.name, onClick: () => { filter = g.id; draw(); },
      })),
    );

    let body;
    if (!rows) body = h('p', { class: 'muted', text: 'Зареждам...' });
    else {
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
              h('td', {}, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px' } },
                avatarEl(r.profile, 'sm'),
                h('span', { text: (r.id === api.me ? `${r.profile?.nick ?? 'Ти'} (ти)` : r.profile?.nick) || 'Играч' }),
              )),
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
      h('p', { class: 'muted', text: 'Всеки започва с 1000 точки. Победа над по-силен носи повече.' }),
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
