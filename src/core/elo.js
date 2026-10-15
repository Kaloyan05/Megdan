// ELO за 2–6 играчи: всяка двойка се сравнява по място, K се дели на (n - 1).

export const START_RATING = 1000;
const K = 32;

export function expected(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

// ratings: { id: рейтинг }, placements: { id: място }
// → { id: промяна (цяло число) }
export function eloDeltas(ratings, placements) {
  const ids = Object.keys(placements);
  const n = ids.length;
  const deltas = Object.fromEntries(ids.map((id) => [id, 0]));
  if (n < 2) return deltas;
  const k = K / (n - 1);
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const ra = ratings[a] ?? START_RATING;
      const rb = ratings[b] ?? START_RATING;
      const score = placements[a] < placements[b] ? 1 : placements[a] === placements[b] ? 0.5 : 0;
      deltas[a] += k * (score - expected(ra, rb));
    }
  }
  for (const id of ids) deltas[id] = Math.round(deltas[id]);
  return deltas;
}
