// Преглед на една игра в произволно състояние (за снимки при разработка).
// ?game=golf&opts={"_v":2}&patch=<js тяло, което получава s и връща s>
import { GAMES, injectGameCss } from '../../src/games/index.js';
import { sound } from '../../src/ui/sound.js';

const q = new URLSearchParams(location.search);
const game = GAMES.find((g) => g.id === q.get('game'));
let s = game.init('seed', JSON.parse(q.get('players') ?? '["me","bot-1"]'), JSON.parse(q.get('opts') ?? '{}'));
const patch = q.get('patch');
if (patch) s = new Function('s', patch)(s) ?? s;
injectGameCss();
document.body.innerHTML = '<main style="padding:16px;max-width:560px;margin:auto"><div class="board-wrap"></div></main>';
game.render(document.querySelector('.board-wrap'), s, {
  me: 'me', over: false, players: s.players, nickOf: (x) => (x === 'me' ? 'Ти' : 'Бобо'), sound, toast() {}, scratch: {},
  onMove() {}, last: null, myTurn: true, secret: { data: null, loaded: true, load: async () => null, save: async () => {} }, reveals: {},
});
