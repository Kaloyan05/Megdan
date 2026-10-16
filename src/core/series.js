// Вечер на игрите: поредица от игри с точки след всяка.
// results е масив [{ round, placements }]: базата слива вложени обекти при update, а масивите ги заменя.
// Точки: 1-во място 3 т., 2-ро място 1 т. (само при 3+ играчи), реми на всички 1 т.

export function seriesPoints(placements) {
  const ids = Object.keys(placements);
  const places = Object.values(placements);
  const out = Object.fromEntries(ids.map((id) => [id, 0]));
  if (places.every((p) => p === places[0])) { ids.forEach((id) => { out[id] = 1; }); return out; }
  for (const id of ids) {
    if (placements[id] === 1) out[id] = 3;
    else if (placements[id] === 2 && ids.length >= 3) out[id] = 1;
  }
  return out;
}

export function seriesTotals(series) {
  const totals = {};
  for (const { placements } of series?.results ?? []) {
    for (const [id, pts] of Object.entries(seriesPoints(placements))) totals[id] = (totals[id] ?? 0) + pts;
  }
  return totals;
}

export const seriesDone = (series) => Boolean(series?.games) && (series.index ?? 0) >= series.games.length;

// Избира count различни игри, подходящи за n играчи.
export function pickSeriesGames(games, count, n, rand = Math.random) {
  const fit = games.filter((g) => n >= g.minPlayers && n <= g.maxPlayers && !g.realtime).map((g) => g.id);
  for (let i = fit.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [fit[i], fit[j]] = [fit[j], fit[i]];
  }
  return fit.slice(0, count);
}
