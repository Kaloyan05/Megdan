// Стая: дъската на първо място. Играчи, готовност, старт, игра, таймер, реванш с един бутон,
// чат (на телефон като плъзгащ се панел), присъствие, правила.

import { h, mount, toast, avatarEl, storageSet } from './dom.js';
import { sound } from './sound.js';
import { gameById, playersLabel } from '../games/index.js';
import { replay } from '../core/engine.js';
import { activeMembers } from '../net/api.js';
import { ARTIFACT_URL } from '../config.js';
import { TIMERS, pillGroup, openRulesSheet, openGamePicker, openSheet, optionsControls, optionsSummary } from './sheet.js';
import { isBot, botMove, BOT_LEVELS } from '../core/bots.js';
import { seriesTotals, seriesDone, pickSeriesGames } from '../core/series.js';
import { GAMES } from '../games/index.js';
import { playFx, reducedMotion } from './fx.js';

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
  'move-first': 'Първо премести фигура.',
  'piece-blocked': 'Тази фигура не може да се мести с това хвърляне.',
  'bad-step': 'Този ход не е позволен с тези зарове.',
  'shot-twice': 'Вече си стрелял там.',
  'must-capture': 'Вземането е задължително.',
  'continue-capture': 'Продължи вземането със същата фигура.',
  'must-stack': 'Сложи +2 или +4, или тегли.',
  answered: 'Вече отговори.',
  'old-question': 'Този въпрос мина.',
  'old-round': 'Този рунд мина.',
  'bad-shot': 'Ударът е твърде слаб или посоката е невалидна.',
  'wait-answer': 'Изчакай отговора за предишния изстрел.',
  'wait-place': 'Изчакай и двамата да разположат корабите.',
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
  let freshAcc = -1;
  let animatedAcc = -1;
  let wasMine = null;
  let seatTurnKey = '';
  let destroyed = false;
  // Лични данни на играта за рунда (напр. скрития флот) и памет за чернови.
  const secret = { round: 0, data: null, loaded: false, loading: null };
  let scratch = { round: 0 };
  let reveals = {};
  let revealedRound = 0;
  let onTurnFor = '';
  let botKey = '';
  let botTimer = null;
  let botRevealRound = 0;
  let myStats = null;
  const loadMyStats = () => api.getStats().then((st) => { myStats = st; stageKey = ''; if (view?.room) update(); }).catch(() => {});
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
  }, h('span', { 'aria-hidden': 'true', text: '💬' }), h('span', { class: 'fab-label', text: 'Чат' }), fabCount);
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
  const botsOf = () => view?.room?.bots ?? [];
  const memberInfo = (id) => (isBot(id) ? botsOf().find((b) => b.id === id) : null)
    ?? view?.members.find((m) => m.id === id)?.data ?? { nick: isBot(id) ? 'Бот' : 'Играч', avatar: isBot(id) ? '🤖' : '🙂', color: 2 };
  const nickOf = (id) => (id === me ? 'Ти' : memberInfo(id).nick || 'Играч');
  const isOnline = (id) => isBot(id) || !online || Date.now() - presenceSince < 5000 || online.has(id);
  // Готови за следващия рунд: хората, натиснали „Готов“/„Реванш“, плюс ботовете.
  const readyIds = () => [
    ...activeMembers(view.members).filter((m) => m.data.readyFor === view.room.round + 1).map((m) => m.id),
    ...botsOf().map((b) => b.id),
  ];
  // Кой пише ходовете на ботовете: домакинът, ако е тук, иначе първият присъстващ човек.
  const amBotDriver = () => {
    const room = view.room;
    if (room.hostId === me) return true;
    if (isOnline(room.hostId) && activeMembers(view.members).some((m) => m.id === room.hostId)) return false;
    return activeMembers(view.members).find((m) => isOnline(m.id))?.id === me;
  };

  function computeResult() {
    const room = view.room;
    // Изиграната игра (gameId може вече да сочи следващата).
    const game = gameById(room.playGameId ?? room.gameId);
    if (!game || room.status !== 'playing' || !room.round) return null;
    return {
      game,
      ...replay(game, {
        seed: room.seed, players: room.players, log: view.log, options: room.gameOptions,
        startedAt: room.startedAt, turnLimitMs: game.realtime ? 0 : (room.timerSec || 0) * 1000,
      }),
    };
  }

  // Кои играчи са на ход сега (при някои игри са няколко едновременно).
  function turnIds() {
    if (!result || result.over || result.game.realtime) return [];
    const g = result.game;
    if (g.waitingFor) return g.waitingFor(result.state);
    return result.current != null ? [result.current] : [];
  }
  const seatColor = (id) => `var(--seat-${view.room.players.indexOf(id) + 1})`;

  // ---- места ----
  function renderSeats() {
    const room = view.room;
    const playing = room.status === 'playing' && result && !result.over;
    const humans = activeMembers(view.members).map((m) => m.id);
    const ids = room.status === 'playing'
      ? [...new Set([...room.players, ...humans, ...botsOf().map((b) => b.id)])]
      : [...humans, ...botsOf().map((b) => b.id)];
    const amHostHere = room.hostId === me && !playing;
    const ready = new Set(readyIds());
    const turning = playing ? turnIds() : [];
    mount(seatsEl, ids.map((id) => {
      const info = memberInfo(id);
      const seatIdx = room.players.indexOf(id);
      const inGame = room.status === 'playing' && seatIdx !== -1;
      const bot = isBot(id);
      const left = bot ? !botsOf().some((b) => b.id === id) : !activeMembers(view.members).some((m) => m.id === id);
      let sub = '';
      if (bot) sub = `бот, ${BOT_LEVELS.find((l) => l.value === info.level)?.label.toLowerCase() ?? 'среден'}`;
      if (id === room.hostId) sub = 'домакин';
      if (room.status === 'playing' && !inGame) sub = 'гледа';
      if (left) sub = 'излезе';
      else if (!isOnline(id)) sub = 'не е тук';
      const showReady = (!playing && (room.status === 'lobby' ? (id === room.hostId || ready.has(id)) : ready.has(id)));
      const onTurn = playing && turning.includes(id);
      return h('div', { class: `seat${onTurn ? ' turn' : ''}${isOnline(id) && !left ? '' : ' away'}`, '--disc': inGame ? `var(--seat-${seatIdx + 1})` : null, 'data-seat': id },
        avatarEl(info, 'sm'),
        h('div', { style: { minWidth: 0 } },
          h('div', { class: 'name', text: nickOf(id) }),
          onTurn
            ? h('div', { class: 'sub turn-sub' }, h('span', { text: id === me ? 'твой ход' : 'на ход' }), h('span', { class: 'think', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')))
            : sub && h('div', { class: 'sub', text: sub }),
        ),
        inGame && h('span', { class: 'disc-dot', '--disc': `var(--seat-${seatIdx + 1})`, 'aria-hidden': 'true' }),
        showReady && !bot && h('span', { class: 'badge ok', text: 'готов' }),
        bot && amHostHere && !left && h('button', {
          class: 'btn btn-icon btn-quiet seat-x', type: 'button', 'aria-label': `Махни ${info.nick}`, text: '✕',
          onClick: () => api.removeBot(code, room, id).catch(() => toast('Не успях да махна бота.')),
        }),
      );
    }));
    // Мястото на играча на ход да се вижда, когато местата не се събират на екрана.
    const tk = turning.join(',');
    if (tk && tk !== seatTurnKey && seatsEl.scrollWidth > seatsEl.clientWidth + 4) {
      const el = seatsEl.querySelector('.seat.turn');
      if (el) seatsEl.scrollTo({ left: el.offsetLeft - seatsEl.offsetLeft - (seatsEl.clientWidth - el.offsetWidth) / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
    seatTurnKey = tk;
  }

  // ---- сцена ----
  // „Ти срещу …“: резултатът ми срещу всеки човек в стаята, в тази игра и общо.
  function h2hRow(gameId) {
    const others = activeMembers(view.members).map((m) => m.id).filter((id) => id !== me);
    const rec = myStats?.h2h ?? {};
    const chips = others.filter((id) => rec[id]).map((id) => {
      const g = rec[id][gameId] ?? { w: 0, l: 0, d: 0 };
      const all = rec[id].all ?? { w: 0, l: 0, d: 0 };
      return h('span', {
        class: 'h2h-chip',
        'aria-label': `Срещу ${nickOf(id)} в тази игра: ${g.w} на ${g.l}${g.d ? `, ${g.d} равни` : ''}. Общо: ${all.w} на ${all.l}.`,
      },
        h('span', { class: 'h2h-name', text: nickOf(id) }),
        h('span', { class: 'h2h-score num', text: `${g.w}:${g.l}` }),
        h('span', { class: 'h2h-all num', text: `общо ${all.w}:${all.l}` }),
      );
    });
    return chips.length ? h('div', { class: 'h2h' }, h('span', { class: 'h2h-label', text: 'Ти срещу' }), chips) : null;
  }

  // Вечер на игрите: списък с игрите и точките досега.
  function seriesBox() {
    const sr = view.room.series;
    if (!sr) return null;
    const totals = seriesTotals(sr);
    const ids = [...new Set([...Object.keys(totals), ...view.room.players, ...activeMembers(view.members).map((m) => m.id)])];
    const rows = ids.filter((id) => totals[id] !== undefined).sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0));
    const list = sr.games
      ? h('ol', { class: 'series-list' }, sr.games.map((id, i) => h('li', {
        class: i < (sr.index ?? 0) ? 'done' : i === (sr.index ?? 0) ? 'now' : '',
        text: gameById(id)?.name ?? id,
      })))
      : h('p', { class: 'muted', text: `Изненада: ${sr.count} игри се теглят при старта, според броя играчи.` });
    return h('div', { class: 'series-box' },
      h('h3', { text: 'Вечер на игрите' }),
      list,
      rows.length > 0 && h('div', { class: 'series-table' }, rows.map((id, i) => h('div', { class: `series-row${i === 0 ? ' lead' : ''}` },
        avatarEl(memberInfo(id), 'xs'),
        h('span', { class: 'series-name', text: nickOf(id) }),
        h('span', { class: 'series-pts num', text: `${totals[id]} т.` }),
      ))),
    );
  }

  function lobbyPanel() {
    const room = view.room;
    const game = gameById(room.gameId);
    const amHost = room.hostId === me;
    const members = activeMembers(view.members);
    const mine = members.find((m) => m.id === me);
    const iAmReady = amHost || mine?.data.readyFor === room.round + 1;
    const going = [...members.filter((m) => m.id === room.hostId || m.data.readyFor === room.round + 1).map((m) => m.id), ...botsOf().map((b) => b.id)];
    const n = going.length;
    let hint = `Ще играят: ${going.map(nickOf).join(', ')}.`;
    const surprise = room.series && !room.series.games;
    const canStart = surprise ? n >= 2 : n >= game.minPlayers && n <= game.maxPlayers;
    if (n < game.minPlayers) {
      hint = members.length + botsOf().length < game.minPlayers
        ? 'Чакаме още играчи. Натисни „Покани“ горе или добави бот.'
        : 'Чакаме някой да натисне „Готов“.';
    }
    const canAddBot = amHost && members.length + botsOf().length < Math.min(game.maxPlayers, 6);
    if (n > game.maxPlayers && !surprise) hint = `${game.name} е за ${playersLabel(game)}. Готови са ${n}.`;

    return h('section', { class: 'panel setup', 'aria-label': 'Подготовка' },
      h('div', { class: 'setup-game' },
        h('div', { class: 'game-art setup-art' }, game.art ? game.art() : game.icon),
        h('div', {},
          h('h2', { text: game.name }),
          h('p', { class: 'muted', text: playersLabel(game) }),
          amHost && !room.series && h('button', {
            class: 'btn btn-small btn-quiet', type: 'button', text: 'Смени играта',
            onClick: () => openGamePicker(room.gameId, (id) => api.setGame(code, id).catch(() => toast('Не успях да сменя играта.'))),
          }),
        ),
      ),
      seriesBox(),
      game.realtime
        ? h('p', { class: 'muted', text: 'На живо: без таймер за ход. Двамата трябва да сте в стаята едновременно.' })
        : amHost
        ? h('div', { class: 'field' },
          h('span', { class: 'field-label', text: 'Таймер за ход' }),
          pillGroup('Таймер за ход', TIMERS.map((t) => ({ value: t.sec, label: t.label })), room.timerSec || 0,
            (v) => api.setTimer(code, v).catch(() => {})),
        )
        : h('p', { class: 'muted', text: `Таймер: ${TIMERS.find((t) => t.sec === (room.timerSec || 0))?.label ?? 'без'}.` }),
      game.options?.length && (amHost
        ? optionsControls(game, room.options?.[game.id], (o) => api.setOptions(code, room, game.id, o).catch(() => toast('Не успях да сменя правилата.')))
        : h('p', { class: 'muted', text: `Правила: ${optionsSummary(game, room.options?.[game.id])}.` })),
      h('p', { class: 'hint', text: hint }),
      h2hRow(game.id),
      h('div', { class: 'actions' },
        amHost
          ? h('button', {
            class: 'btn btn-primary', type: 'button', disabled: !canStart, text: 'Старт',
            onClick: async (e) => {
              e.currentTarget.disabled = true;
              let g = game;
              if (surprise) {
                const games = pickSeriesGames(GAMES, room.series.count ?? 3, n);
                if (!games.length) { toast('Няма игри за толкова играчи.'); return; }
                await api.seriesPick(code, room, games).catch(() => {});
                g = gameById(games[0]);
              }
              const res = await api.startGame(code, room, view.members, g).catch(() => ({ ok: false }));
              if (!res.ok) toast('Не успях да стартирам. Опитай пак.');
            },
          })
          : h('button', {
            class: `btn ${iAmReady ? '' : 'btn-primary'}`, type: 'button', text: iAmReady ? 'Не съм готов' : 'Готов',
            onClick: () => { sound.tap(); api.setReady(code, room, view.members, !iAmReady).catch(() => toast(NO_WRITE)); },
          }),
        canAddBot && h('button', { class: 'btn btn-small', type: 'button', text: 'Добави бот', onClick: () => openBotSheet() }),
      ),
    );
  }

  function openBotSheet() {
    const sheet = openSheet({
      title: 'Добави бот',
      body: [
        h('p', { class: 'muted', text: 'Ботът заема свободно място и играе сам. Партиите с бот не влизат в класацията.' }),
        h('div', { class: 'picker-list' }, BOT_LEVELS.map((l) => h('button', {
          type: 'button', class: 'picker-item',
          onClick: async () => {
            sheet.close();
            const r = await api.addBot(code, view.room, view.members, l.value).catch(() => ({ ok: false }));
            if (!r.ok) toast(r.reason === 'full' ? 'Стаята е пълна.' : 'Не успях да добавя бот.');
          },
        },
          h('span', { class: 'picker-name', text: `${l.label} бот` }),
          h('span', { class: 'muted', text: l.hint }),
        ))),
      ],
    });
  }

  // Реванш: всеки натиска един бутон; домакинът стартира сам, когато всички от партидата са готови.
  function rematchState() {
    const room = view.room;
    const game = gameById(room.gameId);
    const activeIds = new Set([...activeMembers(view.members).map((m) => m.id), ...botsOf().map((b) => b.id)]);
    const ready = readyIds();
    const lastPlayers = room.players.filter((id) => activeIds.has(id));
    const waiting = lastPlayers.filter((id) => !ready.includes(id));
    const fits = ready.length >= game.minPlayers && ready.length <= game.maxPlayers;
    return { game, ready, waiting, fits };
  }

  function seriesFinalPanel() {
    const room = view.room;
    const totals = seriesTotals(room.series);
    const top = Math.max(...Object.values(totals));
    const champs = Object.keys(totals).filter((id) => totals[id] === top);
    const amHost = room.hostId === me;
    return h('section', { class: 'panel rematch', 'aria-label': 'Край на вечерта' },
      h('div', { class: 'result-banner champ' }, h('div', {},
        h('h2', { text: champs.length > 1 ? 'Шампиони на вечерта' : 'Шампион на вечерта' }),
        h('p', { text: `${champs.map(nickOf).join(' и ')}, ${top} т.` }),
      )),
      seriesBox(),
      amHost
        ? h('div', { class: 'actions' },
          h('button', { class: 'btn btn-primary', type: 'button', text: 'Нова вечер', onClick: () => api.seriesRestart(code, room).catch(() => toast('Не успях.')) }),
          h('button', { class: 'btn', type: 'button', text: 'Край на вечерта', onClick: () => api.seriesEnd(code).catch(() => toast('Не успях.')) }),
        )
        : h('p', { class: 'hint', text: 'Домакинът решава дали да започне нова вечер.' }),
    );
  }

  function rematchPanel() {
    const room = view.room;
    if (room.series && seriesDone(room.series)) return seriesFinalPanel();
    if (room.series && room.series.recorded !== room.round) return h('p', { class: 'hint', text: 'Записвам точките...' });
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
          class: `btn ${iReady ? '' : 'btn-primary'}`, type: 'button', text: iReady ? 'Отказвам' : room.series ? 'Следваща игра' : 'Реванш',
          onClick: () => { sound.tap(); api.setReady(code, room, view.members, !iReady).catch(() => toast(NO_WRITE)); },
        }),
        amHost && waiting.length > 0 && fits && h('button', {
          class: 'btn btn-small', type: 'button', text: 'Започни с готовите',
          onClick: () => api.startGame(code, room, view.members, game, ready).catch(() => toast('Не успях да стартирам.')),
        }),
        amHost && !room.series && h('button', {
          class: 'btn btn-small btn-quiet', type: 'button', text: 'Смени играта',
          onClick: () => openGamePicker(room.gameId, (id) => api.setGame(code, id).catch(() => {})),
        }),
        amHost && room.series && !fits && h('button', {
          class: 'btn btn-small', type: 'button', text: 'Пропусни играта',
          onClick: () => api.seriesSkip(code, room).catch(() => {}),
        }),
      ),
      seriesBox(),
      h('p', { class: 'hint', text: `${hint} ${room.series ? `Игра ${(room.series.index ?? 0) + 1} от ${room.series.games.length}` : 'Следваща игра'}: ${game.name}.${game.options?.length ? ` Правила: ${optionsSummary(game, room.options?.[game.id])}.` : ''}` }),
      h2hRow(game.id),
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
    const shown = gameById(room.status === 'playing' && result && !result.over ? room.playGameId ?? room.gameId : room.gameId);
    const sr = room.series;
    gameLabel.textContent = `${shown?.name ?? ''}${sr?.games && !seriesDone(sr) ? `, игра ${Math.min((sr.index ?? 0) + 1, sr.games.length)} от ${sr.games.length}` : ''}`;
    if (room.status !== 'playing' || !result) {
      mount(stageEl, lobbyPanel());
      return;
    }
    const playedGame = result.game;
    const turning = turnIds();
    const myTurn = turning.includes(me) && room.players.includes(me);
    const turnColor = myTurn ? seatColor(me) : turning.length === 1 ? seatColor(turning[0]) : 'var(--ink-2)';
    const boardEl = h('div', { class: `board-wrap${myTurn ? ' my-turn' : ''}`, '--turn': turnColor });
    const who = turning.length === 1 ? turning[0] : null;
    const acc = result.accepted.length;
    const fresh = acc === freshAcc && animatedAcc !== acc;
    const status = h('div', { class: `status-line${myTurn ? ' mine' : ''}${myTurn && (fresh || acc === 0) ? ' pop' : ''}${turning.length ? ' has-turn' : ''}`, '--turn': turnColor, 'aria-live': 'off' },
      who && avatarEl(memberInfo(who), 'xs'),
      h('span', { class: 'status-text', text: playedGame.status?.(result.state, me, nickOf) ?? (myTurn ? 'Твой ход' : result.current ? `Ход на ${nickOf(result.current)}` : '') }),
      timerEl,
    );
    animatedAcc = acc;
    const lastRec = result.accepted.at(-1);
    if (scratch.round !== room.round) { scratch.dispose?.(); scratch = { round: room.round }; }
    playedGame.render(boardEl, result.state, {
      me, over: result.over || pending, players: room.players, nickOf, sound, toast, scratch,
      onMove: (move) => sendMove(move),
      joinLive: () => api.store.joinRealtime(`rt-${code.toLowerCase()}-${room.round}`),
      botLevel: (id) => botsOf().find((b) => b.id === id)?.level ?? 'medium',
      secret: secretApi(room.round),
      reveals: Object.fromEntries(Object.entries(reveals).filter(([, v]) => v.round === room.round)),
      last: lastRec ? { move: lastRec.applied, actor: lastRec.actor, fresh, index: acc } : null,
      myTurn,
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
    if (fresh) playFx(boardEl);
  }

  // Голямо „Твой ход!“ за миг, когато ходът стане мой.
  function turnPop(text) {
    stageEl.querySelector('.turn-pop')?.remove();
    const el = h('div', { class: 'turn-pop', '--turn': seatColor(me), 'aria-hidden': 'true', text });
    stageEl.append(el);
    setTimeout(() => el.remove(), reducedMotion() ? 900 : 1900);
  }

  function secretApi(round) {
    const path = `data/users/${me}/secret-${code}-r${round}`;
    if (secret.round !== round) Object.assign(secret, { round, data: null, loaded: false, loading: null });
    return {
      get data() { return secret.data; },
      get loaded() { return secret.loaded; },
      load() {
        if (secret.loaded) return Promise.resolve(secret.data);
        secret.loading ??= api.store.get(path).then((d) => {
          if (secret.round === round) { secret.data = d; secret.loaded = true; stageKey = ''; update(); }
          return d;
        }).catch(() => null);
        return secret.loading;
      },
      async save(d) { await api.store.set(path, d); secret.data = d; secret.loaded = true; },
    };
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
        freshAcc = acc;
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
      api.recordResult(code, room, result, room.playGameId ?? room.gameId).then((r) => {
        loadMyStats();
        if (r) toast(`Рейтинг ${r.delta >= 0 ? '+' : ''}${r.delta}`);
      }).catch(() => { recordedRound = 0; });
    }
    if (room.status === 'playing') storageSet('lastGame', room.gameId);

    // Автоматични действия на играта (отговор от скрит флот, подготовка на въпроси) и разкриване накрая.
    if (result && room.players.includes(me)) {
      const sec = result.game.usesSecret ? secretApi(room.round) : null;
      if (sec && !sec.loaded) sec.load();
      const key = `${room.round}:${result.nextIndex}`;
      if (!result.over && result.game.onTurn && onTurnFor !== key) {
        onTurnFor = key;
        const at = result.nextIndex;
        result.game.onTurn(result.state, { me, secret: sec, sample: api.store.sample ?? null, toast, startedAt: room.startedAt }).then((move) => {
          if (move && !destroyed) api.sendMove(code, room.round, move, at).catch(() => { onTurnFor = ''; });
        }).catch(() => { onTurnFor = ''; });
      }
      if (sec && result.over && revealedRound !== room.round) {
        revealedRound = room.round;
        sec.load().then((d) => {
          if (d) api.store.set(`rooms/${code}/reveal/${me}`, { round: room.round, ...d }).catch(() => { revealedRound = 0; });
        });
      }
    }

    // Ботове: ако аз пиша вместо тях, правя хода им след кратка пауза.
    if (result && room.players.some(isBot) && amBotDriver()) {
      if (!result.over) scheduleBots();
      else if (result.game.botSecret && botRevealRound !== room.round) {
        botRevealRound = room.round;
        for (const id of room.players.filter(isBot)) {
          api.store.set(`rooms/${code}/reveal/${id}`, { round: room.round, ...result.game.botSecret(room.seed, id) }).catch(() => {});
        }
      }
    }

    // Вечер на игрите: домакинът записва точките и минава към следващата игра.
    const sr = room.series;
    if (sr?.games && result?.over && room.hostId === me && sr.recorded !== room.round && sr.games[sr.index ?? 0] === room.playGameId) {
      api.seriesRecord(code, room, result.placements).catch(() => {});
    }
    const seriesWaits = sr && (seriesDone(sr) || sr.recorded !== room.round);
    // Реванш: домакинът стартира, когато всички от последната партида са готови.
    if (result?.over && room.hostId === me && autoStartFor !== room.round && !seriesWaits) {
      const { game, ready, waiting, fits } = rematchState();
      if (!waiting.length && fits) {
        autoStartFor = room.round;
        api.startGame(code, room, view.members, game, ready).catch(() => { autoStartFor = -1; });
      }
    }

    renderSeats();
    const key = JSON.stringify([
      room.status, room.round, room.gameId, room.timerSec, room.hostId, acc, result?.over, pending, resignArmed, JSON.stringify(room.options ?? {}),
      JSON.stringify(room.series ?? null),
      secret.loaded, Object.keys(reveals).length,
      activeMembers(view.members).map((m) => [m.id, m.data.readyFor, m.data.nick, m.data.avatar]),
    ]);
    if (key !== stageKey) { stageKey = key; renderStage(); }
    // „Твой ход!“ при смяна (не при първото зареждане и не при игри, в които всички играят наведнъж).
    const mineNow = Boolean(result && !result.over && room.status === 'playing' && room.players.includes(me) && !result.game.waitingFor && turnIds().includes(me));
    if (mineNow && wasMine === false) turnPop(result.accepted.length === 0 ? 'Ти започваш!' : 'Твой ход!');
    if (view?.room) wasMine = mineNow;
    if (result) {
      announce(result.over
        ? (result.winner === me ? 'Победа!' : result.winner === 'draw' ? 'Равенство.' : `Печели ${nickOf(result.winner)}.`)
        : (result.current === me ? 'Твой ход.' : `Ход на ${nickOf(result.current)}.`));
    }
    tickTimer();
  }

  function scheduleBots() {
    const room = view.room;
    const key = `${room.round}:${result.nextIndex}`;
    if (botKey === key) return;
    botKey = key;
    clearTimeout(botTimer);
    botTimer = setTimeout(async () => {
      const r = result;
      const rm = view?.room;
      if (destroyed || !r || r.over || !rm || `${rm.round}:${r.nextIndex}` !== key) return;
      for (const id of rm.players.filter(isBot)) {
        const level = botsOf().find((b) => b.id === id)?.level ?? 'medium';
        const move = await botMove(r.game, r.state, id, { seed: rm.seed, index: r.nextIndex, level }).catch(() => null);
        if (!move || !r.game.validateMove(r.state, move, id).ok) continue;
        await api.sendBotMove(code, rm.round, id, view.log, move, r.nextIndex).catch(() => { botKey = ''; });
        return;
      }
    }, 650 + Math.floor(Math.random() * 450));
  }

  // ---- таймер ----
  function tickTimer() {
    const room = view?.room;
    if (!room || !result || result.over || !room.timerSec || result.game.realtime) { timerEl.hidden = true; return; }
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

  const unwatchReveals = api.store.watchCol(`rooms/${code}/reveal`, (docs) => {
    reveals = Object.fromEntries(docs.filter((d) => d.data).map((d) => [d.id, d.data]));
    if (view?.room) { stageKey = ''; update(); }
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

  loadMyStats();
  const clock = setInterval(() => { if (view?.room) { tickTimer(); checkHost(); } }, 500);
  const onKey = (e) => { if (e.key === 'Escape' && chatPanel.classList.contains('open')) setChatOpen(false); };
  document.addEventListener('keydown', onKey);

  return () => {
    destroyed = true;
    scratch.dispose?.();
    unwatch();
    unwatchReveals();
    presence.leave();
    clearInterval(clock);
    clearTimeout(pendingTimer);
    clearTimeout(botTimer);
    document.removeEventListener('keydown', onKey);
    chatFab.remove();
  };
}
