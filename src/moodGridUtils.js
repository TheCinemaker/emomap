// src/moodGridUtils.js
// Shared grid-bucketing + color-blend logic used by both the live mood grid
// (useMoodGrid) and the 24h replay (useReplayData), so the two don't drift.
export const EMOTION_RGB = {
  happy:     [52, 199, 89],
  bored:     [142, 142, 147],
  stressed:  [255, 59, 48],
  tired:     [255, 204, 0],
  motivated: [10, 132, 255],
  love:      [255, 45, 85],
  hype:      [191, 90, 242],
};

// Hard safety ceiling on rendered cells, independent of how much underlying
// data exists. Each cell becomes a real DOM node with a blur() filter and a
// running animation — that doesn't scale by itself, no matter how few grid
// cells geography would otherwise produce. If we ever exceed this, keep the
// most-active cells (the ones that actually matter visually) and drop the rest
// rather than degrading every device for everyone simultaneously voting.
export const MAX_RENDERED_CELLS = 400;

// A single live vote must already read as clearly visible — "I voted and
// nothing happened" is the worst first impression this app can give,
// especially with few users around (exactly the case most of the time at
// launch). Old formula (total/20) gave a lone vote 5% intensity — invisible
// in practice. Floor is now 0.45; it still climbs toward 1 as a cell fills
// up with more simultaneous (distinct-user) votes.
export function cellIntensity(total) {
  return Math.min(1, 0.45 + 0.55 * Math.min(1, (total - 1) / 9));
}

export function calculateCellSize(zoomLevel) {
  const baseSizeDeg = 0.01;
  const size = baseSizeDeg * Math.pow(2, 10 - zoomLevel);
  return Math.max(0.005, Math.min(10, size));
}

// Formerly a k-anonymity floor requiring >=3 votes in a small cell before
// rendering anything — removed per explicit user direction (2026-11-05):
// each user now has exactly one live vote (see cast_vote in
// supabase_single_active_vote.sql) and stays jittered ~10m with no identity
// ever attached to a marker, so the floor's only remaining effect was
// hiding a lone early user's own vote from themselves. Kept as a no-op
// function (rather than deleted) so both call sites below don't need their
// own "is this still a thing" comment.
export function minSampleForCellSize() {
  return 1;
}

/**
 * Bucket raw {emotion, lat, lng} rows into colored grid cells.
 * Returns the same cell shape useMoodGrid has always returned.
 */
export function buildGridCells(rows, cellSizeDeg) {
  const grid = new Map();
  for (const row of rows) {
    const lat = typeof row.lat === 'number' ? row.lat : Number(row.lat);
    const lng = typeof row.lng === 'number' ? row.lng : Number(row.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;

    const gx = Math.floor(lat / cellSizeDeg);
    const gy = Math.floor(lng / cellSizeDeg);
    const key = `${gx}_${gy}`;

    let cell = grid.get(key);
    if (!cell) {
      cell = { latSum: 0, lngSum: 0, count: 0, emotionCounts: {} };
      grid.set(key, cell);
    }
    cell.latSum += lat;
    cell.lngSum += lng;
    cell.count += 1;
    cell.emotionCounts[row.emotion] = (cell.emotionCounts[row.emotion] || 0) + 1;
  }

  const minSample = minSampleForCellSize(cellSizeDeg);
  const result = [];
  for (const [key, cell] of grid.entries()) {
    if (cell.count < minSample) continue;
    const lat = cell.latSum / cell.count;
    const lng = cell.lngSum / cell.count;
    const total = cell.count;

    let rSum = 0, gSum = 0, bSum = 0;
    for (const [emotion, count] of Object.entries(cell.emotionCounts)) {
      const rgb = EMOTION_RGB[emotion];
      if (!rgb) continue;
      const weight = count / total;
      rSum += rgb[0] * weight;
      gSum += rgb[1] * weight;
      bSum += rgb[2] * weight;
    }

    result.push({
      lat,
      lng,
      color: `rgb(${Math.round(rSum)}, ${Math.round(gSum)}, ${Math.round(bSum)})`,
      total,
      intensity: cellIntensity(total),
      size: cellSizeDeg,
      key,
    });
  }

  if (result.length > MAX_RENDERED_CELLS) {
    result.sort((a, b) => b.total - a.total);
    return result.slice(0, MAX_RENDERED_CELLS);
  }
  return result;
}
