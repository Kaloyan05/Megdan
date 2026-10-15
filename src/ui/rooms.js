// „Моите стаи“: партидите ти, първо тези, в които си на ход.

import { h, mount, avatarEl, toast } from './dom.js';

function statusOf(s, nickOf) {
  if (s.gone) return { label: 'Стаята я няма', kind: '' };
  if (!s.playing) return { label: 'Чака старт', kind: '' };
  if (s.over) {
    if (s.winner === 'draw') return { label: 'Равенство', kind: '' };
    return { label: s.winner && s.inGame && s.winner === s.me ? 'Ти печелиш' : `Печели ${nickOf(s.winner)}`, kind: '' };
  }
  if (s.myTurn) return { label: 'Твой ход', kind: 'hot' };
  return { label: `Ход на ${nickOf(s.current)}`, kind: '' };
}

export function renderRooms(root, { api, turns, go }) {
  const membersCache = new Map(); // code → members (за имената)
  let alive = true;

  const draw = (list, ready) => {
    if (!alive) return;
    const sorted = list.slice().sort((a, b) => Number(Boolean(b.myTurn)) - Number(Boolean(a.myTurn)));
    let body;
    if (!ready) body = h('p', { class: 'muted', text: 'Зареждам стаите...' });
    else if (!sorted.length) {
      body = h('div', { class: 'empty' },
        h('p', { text: 'Още нямаш стаи.' }),
        h('p', { class: 'muted', text: 'Създай стая от „Игри“ или влез с код от приятел.' }),
        h('button', { class: 'btn btn-primary', type: 'button', text: 'Към игрите', onClick: () => go('') }),
      );
    } else {
      body = h('ul', { class: 'room-list' }, sorted.map((s) => {
        const members = membersCache.get(s.code) ?? [];
        const nickOf = (id) => (id === api.me ? 'Ти' : members.find((m) => m.id === id)?.data.nick || 'Играч');
        const st = statusOf({ ...s, me: api.me }, nickOf);
        const people = (s.room?.players?.length ? s.room.players : members.filter((m) => !m.data.left).map((m) => m.id)).slice(0, 6);
        return h('li', {},
          h('button', {
            class: `room-card${s.myTurn ? ' hot' : ''}`, type: 'button', disabled: Boolean(s.gone),
            'aria-label': `${s.game?.name ?? 'Стая'}, код ${s.code}, ${st.label}`,
            onClick: () => go(s.code),
          },
            h('div', { class: 'room-card-art' }, s.game?.art ? s.game.art() : ''),
            h('div', { class: 'room-card-info' },
              h('div', { class: 'room-card-top' },
                h('span', { class: 'room-card-name', text: s.game?.name ?? 'Стая' }),
                h('span', { class: 'room-card-code', text: s.code }),
              ),
              h('div', { class: 'room-card-people' }, people.map((id) => {
                const m = members.find((x) => x.id === id)?.data;
                return avatarEl(m ?? { avatar: '🙂', color: 2 }, 'xs');
              })),
              h('span', { class: `chip ${st.kind}`, text: st.label }),
            ),
          ),
          h('button', {
            class: 'btn btn-icon btn-quiet room-card-x', type: 'button', 'aria-label': `Махни стая ${s.code} от списъка`, text: '✕',
            onClick: () => api.removeMyRoom(s.code).then(() => toast(`Стая ${s.code} е махната от списъка`)).catch(() => {}),
          }),
        );
      }));
    }
    mount(root,
      h('h1', { text: 'Моите стаи' }),
      h('p', { class: 'muted', text: 'Партидите се пазят. Влез когато искаш и продължи.' }),
      body,
    );
  };

  let last = [[], false];
  const off = turns.subscribe((list, ready) => {
    last = [list, ready];
    draw(list, ready);
    // Имената на играчите: по едно четене на стая.
    for (const s of list) {
      if (membersCache.has(s.code) || s.gone) continue;
      membersCache.set(s.code, []);
      api.store.list(`rooms/${s.code}/members`).then((m) => { membersCache.set(s.code, m); draw(...last); }).catch(() => {});
    }
  });
  return () => { alive = false; off(); };
}
