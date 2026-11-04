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

export function calculateCellSize(zoomLevel) {
  const baseSizeDeg = 0.01;
  const size = baseSizeDeg * Math.pow(2, 10 - zoomLevel);
  return Math.max(0.005, Math.min(10, size));
}

// k-anonymity floor, scaled to how much real-world area a cell covers.
// A continent-sized cell (zoomed-out world view) carries no re-identification
// risk even from a single point — that view HAS to look alive with sparse,
// early data. A neighborhood-sized cell (zoomed in) is where "someone
// pinned 'stressed' outside this address" becomes plausible, so it needs
// a real sample-size floor.
export function minSampleForCellSize(cellSizeDeg) {
  const approxKm = cellSizeDeg * 111; // rough degrees→km, good enough for a threshold
  if (approxKm >= 50) return 1;
  if (approxKm >= 5) return 2;
  return 3;
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
      intensity: Math.min(1, total / 20),
      size: cellSizeDeg,
      key,
    });
  }
  return result;
}
