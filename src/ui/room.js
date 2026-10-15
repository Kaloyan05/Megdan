// Стая: играчи, готовност, старт, игра, таймер, реванш, чат, присъствие.

import { h, mount, toast, avatarEl, storageSet } from './dom.js';
import { sound } from './sound.js';
import { GAMES, gameById, playersLabel } from '../games/index.js';
import { replay } from '../core/engine.js';
import { activeMembers } from '../net/api.js';
import { ARTIFACT_URL } from '../config.js';

const TIMERS = [
  { sec: 0, label: 'Без таймер' },
  { sec: 120, label: '2 мин' },
  { sec: 45, label: '45 сек' },
];
const REACTIONS = ['👍', '😂', '😮', '😡', '🎉', '❤️'];
const HOST_GRACE_MS = 20000;
const TIMEOUT_GRACE_MS = 3000;

const REASONS = {
  'not-your-turn': 'Не е твой ред.',
  'column-full': 'Колоната е пълна.',
  over: 'Партидата свърши.',
};

export function renderRoom(root, { api, code, onLeave }) {
  const me = api.me;
  let view = null; // { room, members, log, chat, chatDocs }
  let online = null; // Set от id-та или null (не знаем)
  let presenceSince = 0;
  let result = null;
  let stageKey = '';
  let pending = false;
  let pendingTimer = null;
  let lastAccepted = -1;
  let lastOver = false;
  let seenChat = -1;
  let hostMissingSince = 0;
  let timeoutSentFor = -1;
  let recordedRound = 0;
  let resignArmed = false;
  let destroyed = false;

  // ---- постоянни области ----
  const seatsEl = h('div', { class: 'seats', 'aria-label': 'Играчи' });
  const stageEl = h('div', { class: 'stage', 'aria-live': 'polite' });
  const timerEl = h('span', { class: 'timer', hidden: true });
  const chatLog = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Чат' });
  const chatInput = h('input', { class: 'input', id: 'chat-text', maxLength: 200, autocomplete: 'off', placeholder: 'Напиши нещо' });
  const inviteFallback = h('p', { class: 'hint', hidden: true });

  const inviteText = () => {
    const g = gameById(view?.room?.gameId);
    const link = ARTIFACT_URL ? ` ${ARTIFACT_URL}#${code}` : '';
    return `Ела да играем${g ? ` ${g.name}` : ''} в Мегдан! Код на стаята: ${code}.${link}`;
  };

  const copyInvite = () => {
    const text = inviteText();
    const done = () => { toast('Поканата е копирана'); sound.tap(); };
    try {
      navigator.clipboard.writeText(text).then(done, () => showFallback(text));
    } catch { showFallback(text); }
  };
  const showFallback = (text) => {
    inviteFallback.textContent = text;
    inviteFallback.hidden = false;
    const r = document.createRange();
    r.selectNodeContents(inviteFallback);
    getSelection()?.removeAllRanges();
    getSelection()?.addRange(r);
    toast('Копирай текста ръчно');
  };

  const leave = async () => {
    if (view?.room) await api.leaveRoom(code, view.room, view.members).catch(() => {});
    onLeave();
  };

  const chatForm = h('form', {
    class: 'chat-form',
    onSubmit: async (e) => {
      e.preventDefault();
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = '';
      await api.sendChat(code, view?.chatDocs ?? [], { text }).catch(() => toast('Съобщението не тръгна. Опитай пак.'));
    },
  },
    h('label', { class: 'sr-only', for: 'chat-text', text: 'Съобщение' }),
    chatInput,
    h('button', { class: 'btn btn-small', type: 'submit', text: 'Прати' }),
  );

  const reactions = h('div', { class: 'reactions', role: 'group', 'aria-label': 'Бързи реакции' },
    REACTIONS.map((e) => h('button', {
      type: 'button', 'aria-label': `Реакция ${e}`, text: e,
      onClick: () => api.sendChat(code, view?.chatDocs ?? [], { emoji: e }).catch(() => {}),
    })),
  );

  mount(root,
    h('div', { class: 'room-head' },
      h('div', {},
        h('p', { class: 'muted', text: 'Стая' }),
        h('p', { class: 'room-code', 'aria-label': `Код ${code.split('').join(' ')}`, text: code }),
      ),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-small btn-sun', type: 'button', text: 'Копирай покана', onClick: copyInvite }),
      h('button', { class: 'btn btn-small', type: 'button', text: 'Излез', onClick: leave }),
    ),
    inviteFallback,
    seatsEl,
    h('div', { class: 'room' },
      stageEl,
      h('aside', { class: 'panel chat', 'aria-label': 'Чат на стаята' },
        h('h3', { text: 'Чат' }),
        chatLog,
        reactions,
        chatForm,
      ),
    ),
  );

  // ---- помощни ----
  const memberInfo = (id) => view?.members.find((m) => m.id === id)?.data ?? { nick: 'Играч', avatar: '🙂', color: 2 };
  const nickOf = (id) => (id === me ? 'Ти' : memberInfo(id).nick || 'Играч');
  // Първите секунди не знаем кой е тук: другите още не са се обадили.
  const isOnline = (id) => !online || Date.now() - presenceSince < 5000 || online.has(id);

  function computeResult() {
    const room = view.room;
    const game = gameById(room.gameId);
    if (!game || room.status !== 'playing' || !room.round) return null;
    return {
      game,
      ...replay(game, {
        seed: room.seed, players: room.players, log: view.log,
        startedAt: room.startedAt, turnLimitMs: (room.timerSec || 0) * 1000,
      }),
    };
  }

  // ---- места ----
  function renderSeats() {
    const room = view.room;
    const playing = room.status === 'playing' && result && !result.over;
    const ids = playing
      ? [...room.players, ...activeMembers(view.members).map((m) => m.id).filter((id) => !room.players.includes(id))]
      : activeMembers(view.members).map((m) => m.id);
    mount(seatsEl, ids.map((id) => {
      const info = memberInfo(id);
      const seatIdx = room.players.indexOf(id);
      const inGame = room.status === 'playing' && seatIdx !== -1;
      const ready = id === room.hostId || info.readyFor === room.round + 1;
      let sub = '';
      if (id === room.hostId) sub = 'домакин';
      if (playing && !inGame) sub = 'гледа';
      if (!isOnline(id)) sub = 'не е тук';
      return h('div', { class: `seat${result?.current === id ? ' turn' : ''}${isOnline(id) ? '' : ' away'}` },
        avatarEl(info, 'sm'),
        h('div', { style: { minWidth: 0 } },
          h('div', { class: 'name', text: nickOf(id) }),
          sub && h('div', { class: 'sub', text: sub }),
        ),
        inGame && playing && h('span', { class: 'disc-dot', '--disc': `var(--seat-${seatIdx + 1})`, 'aria-label': `цвят ${seatIdx + 1}` }),
        !playing && ready && h('span', { class: 'badge ok', text: 'готов' }),
      );
    }));
  }

  // ---- сцена ----
  function setupPanel(isRematch) {
    const room = view.room;
    const game = gameById(room.gameId) ?? GAMES[0];
    const amHost = room.hostId === me;
    const members = activeMembers(view.members);
    const mine = members.find((m) => m.id === me);
    const iAmReady = amHost || mine?.data.readyFor === room.round + 1;
    const going = members.filter((m) => m.id === room.hostId || m.data.readyFor === room.round + 1);
    const n = going.length;
    let hint = `Ще играят: ${going.map((m) => nickOf(m.id)).join(', ')}.`;
    let canStart = n >= game.minPlayers && n <= game.maxPlayers;
    if (n < game.minPlayers) hint = members.length < game.minPlayers ? 'Чакаме още играчи. Прати кода на приятел.' : 'Чакаме някой да натисне „Готов“.';
    if (n > game.maxPlayers) hint = `${game.name} е за ${playersLabel(game)}. Готови са ${n}.`;

    const gamePicker = amHost
      ? h('div', { class: 'actions', role: 'group', 'aria-label': 'Игра' },
        GAMES.map((g) => h('button', {
          type: 'button', class: 'btn btn-small', 'aria-pressed': String(g.id === game.id),
          style: g.id === game.id ? { background: 'var(--ink)', color: 'var(--bg)' } : null,
          text: g.name, onClick: () => g.id !== game.id && api.setGame(code, g.id).catch(() => toast('Не успях да сменя играта.')),
        })))
      : h('p', { class: 'muted', text: `Играта е ${game.name} (${playersLabel(game)}).` });

    const timerPicker = amHost
      ? h('div', { class: 'actions', role: 'group', 'aria-label': 'Таймер за ход' },
        TIMERS.map((t) => h('button', {
          type: 'button', class: 'btn btn-small', 'aria-pressed': String((room.timerSec || 0) === t.sec),
          style: (room.timerSec || 0) === t.sec ? { background: 'var(--ink)', color: 'var(--bg)' } : null,
          text: t.label, onClick: () => api.setTimer(code, t.sec).catch(() => {}),
        })))
      : h('p', { class: 'muted', text: `Таймер: ${TIMERS.find((t) => t.sec === (room.timerSec || 0))?.label ?? 'без'}.` });

    return h('section', { class: 'panel', 'aria-label': isRematch ? 'Реванш' : 'Подготовка' },
      h('h2', { text: isRematch ? 'Реванш?' : game.name }),
      gamePicker,
      timerPicker,
      h('p', { class: 'hint', text: hint }),
      h('div', { class: 'actions' },
        amHost
          ? h('button', {
            class: 'btn btn-primary', type: 'button', disabled: !canStart, text: isRematch ? 'Нова партида' : 'Старт',
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              const res = await api.startGame(code, room, view.members, game).catch(() => ({ ok: false }));
              if (!res.ok) toast('Не успях да стартирам. Опитай пак.');
            },
          })
          : h('button', {
            class: `btn ${iAmReady ? '' : 'btn-primary'}`, type: 'button', text: iAmReady ? 'Не съм готов' : 'Готов',
            onClick: () => { sound.tap(); api.setReady(code, room, view.members, !iAmReady).catch(() => {}); },
          }),
      ),
    );
  }

  function resultBanner() {
    const r = result;
    let title, line;
    if (r.winner === 'draw') { title = 'Равенство'; line = 'Никой не би.'; }
    else if (r.winner === me) { title = 'Победа!'; line = r.resigned ? `${nickOf(r.resigned)} се предаде.` : 'Браво!'; }
    else {
      title = view.room.players.includes(me) ? 'Загуба' : 'Край';
      line = `Печели ${nickOf(r.winner)}.${r.resigned && r.resigned !== r.winner ? ` ${nickOf(r.resigned)} се предаде.` : ''}`;
    }
    if (r.winner === 'draw' && r.resigned) line = `${nickOf(r.resigned)} се предаде.`;
    return h('div', { class: 'result-banner', role: 'status' },
      h('div', {}, h('h2', { text: title }), h('p', { text: line })),
    );
  }

  function renderStage() {
    const room = view.room;
    const game = gameById(room.gameId);
    if (room.status !== 'playing' || !result) {
      mount(stageEl, setupPanel(false));
      return;
    }

    const boardEl = h('div', { class: 'board-wrap' });
    const myTurn = result.current === me;
    const status = h('div', { class: 'status-line' },
      result.over
        ? null
        : h('span', {
          class: 'disc-dot', '--disc': `var(--seat-${room.players.indexOf(result.current) + 1})`, 'aria-hidden': 'true',
        }),
      h('span', { text: result.over ? game.name : myTurn ? 'Твой ход' : `Ход на ${nickOf(result.current)}` }),
      timerEl,
    );

    game.render(boardEl, result.state, {
      me, over: result.over || pending, players: room.players, nickOf, sound,
      onMove: (move) => sendMove(move),
    });

    const parts = [result.over ? resultBanner() : status, boardEl];
    if (!result.over && room.players.includes(me)) {
      parts.push(h('div', { class: 'actions' },
        h('button', {
          class: 'btn btn-small btn-quiet', type: 'button', text: resignArmed ? 'Да, предавам се' : 'Предай се',
          onClick: () => {
            if (!resignArmed) {
              resignArmed = true; stageKey = ''; update();
              setTimeout(() => { resignArmed = false; stageKey = ''; if (!destroyed) update(); }, 4000);
              return;
            }
            resignArmed = false;
            api.sendMove(code, room.round, { type: 'resign' }, result.nextIndex).catch(() => toast('Не успях. Опитай пак.'));
          },
        }),
      ));
    }
    if (result.over) parts.push(setupPanel(true));
    mount(stageEl, parts);
  }

  async function sendMove(move) {
    const room = view.room;
    if (pending || !result || result.over) return;
    const check = result.game.validateMove(result.state, move, me);
    if (!check.ok) { sound.bad(); toast(REASONS[check.reason] ?? 'Този ход не е позволен.'); return; }
    pending = true;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => { pending = false; stageKey = ''; update(); }, 5000);
    try {
      await api.sendMove(code, room.round, move, result.nextIndex);
    } catch (e) {
      pending = false;
      toast(e?.code === 'invalid_argument' ? 'Нямаш права да играеш тук. Помоли собственика да те покани като Editor.' : 'Ходът не тръгна. Опитай пак.');
      stageKey = ''; update();
    }
  }

  // ---- чат ----
  function renderChat() {
    const msgs = view.chat;
    const fresh = seenChat >= 0 ? msgs.slice(seenChat) : [];
    seenChat = msgs.length;
    mount(chatLog, msgs.length
      ? msgs.map((m) => {
        const info = memberInfo(m.p);
        return h('div', { class: `msg${m.emoji ? ' big' : ''}` },
          avatarEl(info, 'sm'),
          h('div', { style: { minWidth: 0 } },
            h('div', { class: 'who', text: nickOf(m.p) }),
            h('div', { class: 'bubble', text: m.text ?? m.emoji }),
          ),
        );
      })
      : h('p', { class: 'muted', text: 'Тук е тихо. Поздрави останалите.' }));
    chatLog.scrollTop = chatLog.scrollHeight;
    for (const m of fresh) {
      if (m.emoji) floatEmoji(m.emoji);
      if (m.p !== me) sound.msg();
    }
  }

  function floatEmoji(e) {
    const el = h('span', { class: 'float-emoji', 'aria-hidden': 'true', text: e });
    el.style.left = `${10 + Math.random() * 80}vw`;
    el.style.bottom = '12vh';
    document.body.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  // ---- обновяване ----
  function update() {
    if (destroyed || !view?.room) return;
    const room = view.room;
    result = computeResult();

    // звуци и нулиране на изчакването
    const acc = result?.accepted.length ?? -1;
    if (acc !== lastAccepted) {
      if (lastAccepted >= 0 && acc > lastAccepted && result) {
        const lastMove = result.accepted.at(-1);
        if (lastMove?.applied?.type !== 'resign') (sound[result.game.moveSound] ?? sound.tap)();
        if (!result.over && result.current === me && lastMove?.actor !== me) setTimeout(sound.turn, 250);
      }
      lastAccepted = acc;
      pending = false;
      clearTimeout(pendingTimer);
    }
    if (result?.over && !lastOver && acc > 0) {
      if (result.winner === me) sound.win();
      else if (room.players.includes(me) && result.winner !== 'draw') sound.lose();
    }
    lastOver = Boolean(result?.over);

    // статистика: всеки записва своята, веднъж на рунд
    if (result?.over && room.players.includes(me) && recordedRound !== room.round) {
      recordedRound = room.round;
      api.recordResult(code, room, result, room.gameId).then((r) => {
        if (r) toast(`Рейтинг ${r.delta >= 0 ? '+' : ''}${r.delta}`);
      }).catch(() => { recordedRound = 0; });
    }
    if (room.status === 'playing') storageSet('lastGame', room.gameId);

    renderSeats();

    const key = JSON.stringify([
      room.status, room.round, room.gameId, room.timerSec, room.hostId, acc, result?.over, pending, resignArmed,
      activeMembers(view.members).map((m) => [m.id, m.data.readyFor, m.data.nick, m.data.avatar]),
    ]);
    if (key !== stageKey) {
      stageKey = key;
      renderStage();
    }
    tickTimer();
  }

  // ---- таймер ----
  function tickTimer() {
    const room = view?.room;
    if (!room || !result || result.over || !room.timerSec) { timerEl.hidden = true; return; }
    const left = result.turnStartedAt + room.timerSec * 1000 - Date.now();
    const sec = Math.max(0, Math.ceil(left / 1000));
    timerEl.hidden = false;
    timerEl.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('low', sec <= 10);
    const isCurrent = result.current === me;
    const due = isCurrent ? left <= 0 : left <= -TIMEOUT_GRACE_MS;
    if (due && room.players.includes(me) && timeoutSentFor !== result.nextIndex) {
      timeoutSentFor = result.nextIndex;
      api.sendMove(code, room.round, { type: 'timeout' }, result.nextIndex).catch(() => {});
    }
  }

  // ---- домакин, който го няма ----
  function checkHost() {
    const room = view?.room;
    if (!room || isOnline(room.hostId)) { hostMissingSince = 0; return; }
    if (!hostMissingSince) { hostMissingSince = Date.now(); return; }
    if (Date.now() - hostMissingSince < HOST_GRACE_MS) return;
    const first = activeMembers(view.members).find((m) => isOnline(m.id));
    if (first?.id === me) { hostMissingSince = 0; api.claimHost(code).then(() => toast('Ти си домакин сега.')).catch(() => {}); }
  }

  // ---- абонаменти ----
  const unwatch = api.watchRoom(code, (v) => {
    view = v;
    if (!v.room) { toast('Стаята вече не съществува.'); onLeave(); return; }
    update();
    renderChat();
  });

  let presence = { leave() {} };
  api.store.joinPresence(`megdan-${code.toLowerCase()}`, (ids) => {
    if (!presenceSince) {
      presenceSince = Date.now();
      setTimeout(() => { if (!destroyed && view?.room) renderSeats(); }, 5100);
    }
    online = ids;
    if (view?.room) { renderSeats(); }
  }).then((p) => { if (destroyed) p.leave(); else presence = p; });

  const clock = setInterval(() => { if (view?.room) { tickTimer(); checkHost(); } }, 500);

  return () => {
    destroyed = true;
    unwatch();
    presence.leave();
    clearInterval(clock);
    clearTimeout(pendingTimer);
  };
}
