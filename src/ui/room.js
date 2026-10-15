// Стая: дъската на първо място. Играчи, готовност, старт, игра, таймер, реванш с един бутон,
// чат (на телефон като плъзгащ се панел), присъствие, правила.

import { h, mount, toast, avatarEl, storageSet } from './dom.js';
import { sound } from './sound.js';
import { gameById, playersLabel } from '../games/index.js';
import { replay } from '../core/engine.js';
import { activeMembers } from '../net/api.js';
import { ARTIFACT_URL } from '../config.js';
import { TIMERS, pillGroup, openRulesSheet, openGamePicker } from './sheet.js';

const REACTIONS = ['👍', '😂', '😮', '😡', '🎉', '❤️'];
const HOST_GRACE_MS = 20000;
const TIMEOUT_GRACE_MS = 3000;
const NO_WRITE = 'Нямаш права да играеш тук. Помоли собственика да те покани с право „Can edit“.';

export const REASONS = {
  'not-your-turn': 'Не е твой ред.',
  'column-full': 'Колоната е пълна.',
  'no-flip': 'Този ход не обръща нищо.',
  'line-taken': 'Тази линия вече е теглена.',
  'no-match': 'Картата не пасва по цвят или стойност.',
  'only-drawn': 'Можеш да изиграеш само изтеглената карта.',
  'draw-first': 'Първо изтегли карта.',
  'cell-taken': 'Полето е заето.',
  'wrong-board': 'Трябва да играеш в маркираното поле.',
  'board-closed': 'Тази малка дъска вече е решена.',
  'roll-first': 'Първо хвърли заровете.',
  'cat-used': 'Тази графа вече е попълнена.',
  'no-rolls': 'Нямаш повече хвърляния. Избери графа.',
  'card-open': 'Тази карта вече е обърната.',
  over: 'Партидата свърши.',
};

const vibrate = (ms) => { try { navigator.vibrate?.(ms); } catch { /* не се поддържа */ } };

export function renderRoom(root, { api, code, onLeave, onRoomSeen }) {
  const me = api.me;
  let view = null; // { room, members, log, chat, chatDocs }
  let online = null;
  let presenceSince = 0;
  let result = null;
  let stageKey = '';
  let pending = false;
  let pendingTimer = null;
  let lastAccepted = -1;
  let lastOver = false;
  let seenChat = -1;
  let unread = 0;
  let hostMissingSince = 0;
  let timeoutSentFor = -1;
  let recordedRound = 0;
  let autoStartFor = -1;
  let resignArmed = false;
  let destroyed = false;
  const narrow = window.matchMedia('(max-width: 899px)');

  // ---- постоянни области ----
  const seatsEl = h('div', { class: 'seats seats-row', 'aria-label': 'Играчи' });
  const stageEl = h('div', { class: 'stage' });
  const timerEl = h('span', { class: 'timer', hidden: true });
  const gameLabel = h('span', { class: 'room-game' });
  const chatLog = h('div', { class: 'chat-log', role: 'log', 'aria-label': 'Чат' });
  const chatInput = h('input', { class: 'input', id: 'chat-text', maxLength: 200, autocomplete: 'off', placeholder: 'Напиши нещо' });
  const inviteFallback = h('p', { class: 'hint invite-fallback', hidden: true });
  const announcer = h('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  let lastAnnounce = '';
  const announce = (text) => { if (text && text !== lastAnnounce) { lastAnnounce = text; announcer.textContent = text; } };

  const inviteText = () => {
    const g = gameById(view?.room?.gameId);
    const link = ARTIFACT_URL ? ` ${ARTIFACT_URL}#${code}` : '';
    return `Ела да играем${g ? ` ${g.name}` : ''} в Мегдан! Код на стаята: ${code}.${link}`;
  };
  const copyInvite = () => {
    const text = inviteText();
    try {
      navigator.clipboard.writeText(text).then(() => { toast('Поканата е копирана'); sound.tap(); }, () => showFallback(text));
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

  // ---- чат ----
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
  const react = (e) => api.sendChat(code, view?.chatDocs ?? [], { emoji: e }).catch(() => {});
  const reactions = h('div', { class: 'reactions', role: 'group', 'aria-label': 'Бързи реакции' },
    REACTIONS.map((e) => h('button', { type: 'button', 'aria-label': `Реакция ${e}`, text: e, onClick: () => react(e) })),
  );
  const chatClose = h('button', { class: 'btn btn-icon btn-quiet chat-close', type: 'button', 'aria-label': 'Скрий чата', text: '✕' });
  const chatPanel = h('aside', { class: 'panel chat chat-sheet', id: 'room-chat', 'aria-label': 'Чат на стаята' },
    h('div', { class: 'chat-head' }, h('h3', { text: 'Чат' }), chatClose),
    chatLog, reactions, chatForm,
  );
  const fabCount = h('span', { class: 'fab-count', hidden: true });
  const chatFab = h('button', {
    class: 'chat-fab', type: 'button', 'aria-controls': 'room-chat', 'aria-expanded': 'false', 'aria-label': 'Отвори чата',
  }, h('span', { 'aria-hidden': 'true', text: '💬' }), h('span', { text: 'Чат' }), fabCount);
  const setChatOpen = (open) => {
    chatPanel.classList.toggle('open', open);
    chatFab.setAttribute('aria-expanded', String(open));
    if (open) { unread = 0; paintUnread(); chatLog.scrollTop = chatLog.scrollHeight; setTimeout(() => chatInput.focus(), 50); }
  };
  chatFab.addEventListener('click', () => setChatOpen(!chatPanel.classList.contains('open')));
  chatClose.addEventListener('click', () => { setChatOpen(false); chatFab.focus(); });
  const paintUnread = () => { fabCount.hidden = !unread; fabCount.textContent = String(unread); };

  // ---- рамка ----
  mount(root,
    h('div', { class: 'room-bar' },
      h('button', { class: 'code-chip', type: 'button', 'aria-label': `Код ${code.split('').join(' ')}. Копирай поканата`, onClick: copyInvite },
        h('span', { class: 'code-chip-label', text: 'Покани' }),
        h('span', { class: 'code-chip-code', text: code }),
      ),
      gameLabel,
      h('button', {
        class: 'btn btn-small btn-quiet', type: 'button', text: 'Правила',
        onClick: () => { const g = gameById(view?.room?.gameId); if (g) openRulesSheet(g); },
      }),
      h('button', { class: 'btn btn-small btn-quiet', type: 'button', text: 'Излез', onClick: leave }),
    ),
    inviteFallback,
    announcer,
    seatsEl,
    h('div', { class: 'room' }, stageEl, chatPanel),
    chatFab,
  );

  // ---- помощни ----
  const memberInfo = (id) => view?.members.find((m) => m.id === id)?.data ?? { nick: 'Играч', avatar: '🙂', color: 2 };
  const nickOf = (id) => (id === me ? 'Ти' : memberInfo(id).nick || 'Играч');
  const isOnline = (id) => !online || Date.now() - presenceSince < 5000 || online.has(id);
  const readyIds = () => activeMembers(view.members).filter((m) => m.data.readyFor === view.room.round + 1).map((m) => m.id);

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
    const ids = room.status === 'playing'
      ? [...room.players, ...activeMembers(view.members).map((m) => m.id).filter((id) => !room.players.includes(id))]
      : activeMembers(view.members).map((m) => m.id);
    const ready = new Set(readyIds());
    mount(seatsEl, ids.map((id) => {
      const info = memberInfo(id);
      const seatIdx = room.players.indexOf(id);
      const inGame = room.status === 'playing' && seatIdx !== -1;
      const left = !activeMembers(view.members).some((m) => m.id === id);
      let sub = '';
      if (id === room.hostId) sub = 'домакин';
      if (room.status === 'playing' && !inGame) sub = 'гледа';
      if (left) sub = 'излезе';
      else if (!isOnline(id)) sub = 'не е тук';
      const showReady = (!playing && (room.status === 'lobby' ? (id === room.hostId || ready.has(id)) : ready.has(id)));
      return h('div', { class: `seat${result?.current === id && playing ? ' turn' : ''}${isOnline(id) && !left ? '' : ' away'}` },
        avatarEl(info, 'sm'),
        h('div', { style: { minWidth: 0 } },
          h('div', { class: 'name', text: nickOf(id) }),
          sub && h('div', { class: 'sub', text: sub }),
        ),
        inGame && h('span', { class: 'disc-dot', '--disc': `var(--seat-${seatIdx + 1})`, 'aria-hidden': 'true' }),
        showReady && h('span', { class: 'badge ok', text: 'готов' }),
      );
    }));
  }

  // ---- сцена ----
  function lobbyPanel() {
    const room = view.room;
    const game = gameById(room.gameId);
    const amHost = room.hostId === me;
    const members = activeMembers(view.members);
    const mine = members.find((m) => m.id === me);
    const iAmReady = amHost || mine?.data.readyFor === room.round + 1;
    const going = members.filter((m) => m.id === room.hostId || m.data.readyFor === room.round + 1);
    const n = going.length;
    let hint = `Ще играят: ${going.map((m) => nickOf(m.id)).join(', ')}.`;
    const canStart = n >= game.minPlayers && n <= game.maxPlayers;
    if (n < game.minPlayers) {
      hint = members.length < game.minPlayers ? 'Чакаме още играчи. Натисни „Покани“ горе и прати кода на приятел.' : 'Чакаме някой да натисне „Готов“.';
    }
    if (n > game.maxPlayers) hint = `${game.name} е за ${playersLabel(game)}. Готови са ${n}.`;

    return h('section', { class: 'panel setup', 'aria-label': 'Подготовка' },
      h('div', { class: 'setup-game' },
        h('div', { class: 'game-art setup-art' }, game.art ? game.art() : game.icon),
        h('div', {},
          h('h2', { text: game.name }),
          h('p', { class: 'muted', text: playersLabel(game) }),
          amHost && h('button', {
            class: 'btn btn-small btn-quiet', type: 'button', text: 'Смени играта',
            onClick: () => openGamePicker(room.gameId, (id) => api.setGame(code, id).catch(() => toast('Не успях да сменя играта.'))),
          }),
        ),
      ),
      amHost
        ? h('div', { class: 'field' },
          h('span', { class: 'field-label', text: 'Таймер за ход' }),
          pillGroup('Таймер за ход', TIMERS.map((t) => ({ value: t.sec, label: t.label })), room.timerSec || 0,
            (v) => api.setTimer(code, v).catch(() => {})),
        )
        : h('p', { class: 'muted', text: `Таймер: ${TIMERS.find((t) => t.sec === (room.timerSec || 0))?.label ?? 'без'}.` }),
      h('p', { class: 'hint', text: hint }),
      h('div', { class: 'actions' },
        amHost
          ? h('button', {
            class: 'btn btn-primary', type: 'button', disabled: !canStart, text: 'Старт',
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              const res = await api.startGame(code, room, view.members, game).catch(() => ({ ok: false }));
              if (!res.ok) toast('Не успях да стартирам. Опитай пак.');
            },
          })
          : h('button', {
            class: `btn ${iAmReady ? '' : 'btn-primary'}`, type: 'button', text: iAmReady ? 'Не съм готов' : 'Готов',
            onClick: () => { sound.tap(); api.setReady(code, room, view.members, !iAmReady).catch(() => toast(NO_WRITE)); },
          }),
      ),
    );
  }

  // Реванш: всеки натиска един бутон; домакинът стартира сам, когато всички от партидата са готови.
  function rematchState() {
    const room = view.room;
    const game = gameById(room.gameId);
    const activeIds = new Set(activeMembers(view.members).map((m) => m.id));
    const ready = readyIds();
    const lastPlayers = room.players.filter((id) => activeIds.has(id));
    const waiting = lastPlayers.filter((id) => !ready.includes(id));
    const fits = ready.length >= game.minPlayers && ready.length <= game.maxPlayers;
    return { game, ready, waiting, fits };
  }

  function rematchPanel() {
    const room = view.room;
    const amHost = room.hostId === me;
    const { game, ready, waiting, fits } = rematchState();
    const iReady = ready.includes(me);
    let hint;
    if (!waiting.length && fits) hint = 'Всички са готови. Започваме...';
    else if (!waiting.length) hint = `${game.name} е за ${playersLabel(game)}. Готови са ${ready.length}.`;
    else hint = `Чакаме: ${waiting.map((id) => (id === me ? 'теб' : nickOf(id))).join(', ')}.`;
    return h('section', { class: 'panel rematch', 'aria-label': 'Реванш' },
      h('div', { class: 'actions' },
        h('button', {
          class: `btn ${iReady ? '' : 'btn-primary'}`, type: 'button', text: iReady ? 'Отказвам' : 'Реванш',
          onClick: () => { sound.tap(); api.setReady(code, room, view.members, !iReady).catch(() => toast(NO_WRITE)); },
        }),
        amHost && waiting.length > 0 && fits && h('button', {
          class: 'btn btn-small', type: 'button', text: 'Започни с готовите',
          onClick: () => api.startGame(code, room, view.members, game, ready).catch(() => toast('Не успях да стартирам.')),
        }),
        amHost && h('button', {
          class: 'btn btn-small btn-quiet', type: 'button', text: 'Смени играта',
          onClick: () => openGamePicker(room.gameId, (id) => api.setGame(code, id).catch(() => {})),
        }),
      ),
      h('p', { class: 'hint', text: `${hint} Следваща игра: ${game.name}.` }),
    );
  }

  function resultBanner() {
    const r = result;
    let title, line;
    if (r.winner === 'draw') { title = 'Равенство'; line = r.resigned ? `${nickOf(r.resigned)} се предаде.` : 'Никой не би.'; }
    else if (r.winner === me) { title = 'Победа!'; line = r.resigned ? `${nickOf(r.resigned)} се предаде.` : 'Браво!'; }
    else {
      title = view.room.players.includes(me) ? 'Загуба' : 'Край';
      line = `Печели ${nickOf(r.winner)}.${r.resigned && r.resigned !== r.winner ? ` ${nickOf(r.resigned)} се предаде.` : ''}`;
    }
    return h('div', { class: 'result-banner', role: 'status' }, h('div', {}, h('h2', { text: title }), h('p', { text: line })));
  }

  function renderStage() {
    const room = view.room;
    const game = gameById(room.gameId);
    gameLabel.textContent = game?.name ?? '';
    if (room.status !== 'playing' || !result) {
      mount(stageEl, lobbyPanel());
      return;
    }
    const playedGame = result.game;
    const boardEl = h('div', { class: 'board-wrap' });
    const myTurn = result.current === me;
    const status = h('div', { class: `status-line${myTurn ? ' mine' : ''}` },
      h('span', { class: 'disc-dot', '--disc': `var(--seat-${room.players.indexOf(result.current) + 1})`, 'aria-hidden': 'true' }),
      h('span', { text: myTurn ? 'Твой ход' : `Ход на ${nickOf(result.current)}` }),
      timerEl,
    );
    playedGame.render(boardEl, result.state, {
      me, over: result.over || pending, players: room.players, nickOf, sound,
      onMove: (move) => sendMove(move),
    });
    const parts = [result.over ? resultBanner() : status, boardEl];
    if (!result.over && room.players.includes(me)) {
      parts.push(h('div', { class: 'actions board-actions' },
        h('button', {
          class: `btn btn-small ${resignArmed ? 'btn-primary' : 'btn-quiet'}`, type: 'button', text: resignArmed ? 'Да, предавам се' : 'Предай се',
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
    if (result.over) parts.splice(1, 0, rematchPanel());
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
      toast(e?.code === 'invalid_argument' ? NO_WRITE : 'Ходът не тръгна. Опитай пак.');
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
      if (m.p !== me) {
        sound.msg();
        if (narrow.matches && !chatPanel.classList.contains('open') && m.text) unread += 1;
      }
    }
    paintUnread();
  }

  function floatEmoji(e) {
    const el = h('span', { class: 'float-emoji', 'aria-hidden': 'true', text: e });
    el.style.left = `${10 + Math.random() * 80}vw`;
    el.style.bottom = '18vh';
    document.body.append(el);
    setTimeout(() => el.remove(), 1700);
  }

  // ---- обновяване ----
  function update() {
    if (destroyed || !view?.room) return;
    const room = view.room;
    result = computeResult();

    const acc = result?.accepted.length ?? -1;
    if (acc !== lastAccepted) {
      if (lastAccepted >= 0 && acc > lastAccepted && result) {
        const lastMove = result.accepted.at(-1);
        if (lastMove?.applied?.type !== 'resign') (sound[result.game.moveSound] ?? sound.tap)();
        if (!result.over && result.current === me && lastMove?.actor !== me) { setTimeout(sound.turn, 250); vibrate(60); }
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

    if (result?.over && room.players.includes(me) && recordedRound !== room.round) {
      recordedRound = room.round;
      api.recordResult(code, room, result, room.gameId).then((r) => {
        if (r) toast(`Рейтинг ${r.delta >= 0 ? '+' : ''}${r.delta}`);
      }).catch(() => { recordedRound = 0; });
    }
    if (room.status === 'playing') storageSet('lastGame', room.gameId);

    // Реванш: домакинът стартира, когато всички от последната партида са готови.
    if (result?.over && room.hostId === me && autoStartFor !== room.round) {
      const { game, ready, waiting, fits } = rematchState();
      if (!waiting.length && fits) {
        autoStartFor = room.round;
        api.startGame(code, room, view.members, game, ready).catch(() => { autoStartFor = -1; });
      }
    }

    renderSeats();
    const key = JSON.stringify([
      room.status, room.round, room.gameId, room.timerSec, room.hostId, acc, result?.over, pending, resignArmed,
      activeMembers(view.members).map((m) => [m.id, m.data.readyFor, m.data.nick, m.data.avatar]),
    ]);
    if (key !== stageKey) { stageKey = key; renderStage(); }
    if (result) {
      announce(result.over
        ? (result.winner === me ? 'Победа!' : result.winner === 'draw' ? 'Равенство.' : `Печели ${nickOf(result.winner)}.`)
        : (result.current === me ? 'Твой ход.' : `Ход на ${nickOf(result.current)}.`));
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
    onRoomSeen?.(code);
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
    if (view?.room) renderSeats();
  }).then((p) => { if (destroyed) p.leave(); else presence = p; });

  const clock = setInterval(() => { if (view?.room) { tickTimer(); checkHost(); } }, 500);
  const onKey = (e) => { if (e.key === 'Escape' && chatPanel.classList.contains('open')) setChatOpen(false); };
  document.addEventListener('keydown', onKey);

  return () => {
    destroyed = true;
    unwatch();
    presence.leave();
    clearInterval(clock);
    clearTimeout(pendingTimer);
    document.removeEventListener('keydown', onKey);
    chatFab.remove();
  };
}
